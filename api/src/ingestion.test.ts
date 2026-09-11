import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { openDatabase, type PerceptionDatabase } from "./database.js";
import { classifyLane, MAX_FEED_BYTES, parseFeed, safeFeedUrl, type SignalLane } from "./feed.js";
import { IngestionService, scoreAccountSignals, startIngestionScheduler } from "./ingestion.js";
import { buildSnapshot } from "./snapshot.js";
import { CURATED_SOURCES, type CuratedSource } from "./sources.js";

const NOW = new Date("2026-09-11T12:00:00.000Z");
const sources:CuratedSource[] = [
  { id:"status", vendor:"vendor", name:"Vendor", title:"Vendor Status", kind:"status", url:"https://status.example.test/feed" },
  { id:"news", vendor:"vendor", name:"Vendor", title:"Vendor News", kind:"blog", url:"https://news.example.test/feed" },
  { id:"failed", vendor:"failed", name:"Failed", title:"Failed Source", kind:"blog", url:"https://failed.example.test/feed" },
];

describe("curated ingestion", () => {
  let database:PerceptionDatabase | undefined; let app:FastifyInstance | undefined;
  afterEach(async () => { if (app) await app.close(); if (database?.open) database.close(); app = undefined; database = undefined; });

  it("keeps a fixed unique HTTPS source catalog", () => {
    expect(CURATED_SOURCES).toHaveLength(29);
    expect(new Set(CURATED_SOURCES.map(source => source.id)).size).toBe(29);
    expect(new Set(CURATED_SOURCES.map(source => source.url)).size).toBe(29);
    expect(CURATED_SOURCES.every(source => safeFeedUrl(source.url) === new URL(source.url).toString())).toBe(true);
    const pluginSources = (createRequire(import.meta.url)("../../Model.js") as { SOURCES:Array<Record<string,string>> }).SOURCES;
    expect(CURATED_SOURCES.map(source => ({ id:source.id, vendor:source.vendor, name:source.name, title:source.title, kind:source.kind, url:source.url, product:source.product ?? "" })))
      .toEqual(pluginSources.map(source => ({ id:source.id, vendor:source.vendor, name:source.vendorName, title:source.title, kind:source.kind, url:source.url, product:source.product ?? "" })));
  });

  it("parses bounded RSS and Atom input and classifies deterministic lanes", () => {
    const rss = feed([{ title:"New API pricing for Agent A+B", url:"https://example.test/pricing", date:"2026-09-11T11:00:00.000Z" }]);
    expect(parseFeed(rss)).toMatchObject([{ title:"New API pricing for Agent A+B", url:"https://example.test/pricing", publishedAt:"2026-09-11T11:00:00.000Z" }]);
    expect(parseFeed("x".repeat(MAX_FEED_BYTES + 1))).toEqual([]);
    expect(parseFeed("<html>not a feed</html>")).toEqual([]);
    expect(classifyLane("anything", "status")).toBe("incident");
    expect(classifyLane("v2.0", "releases")).toBe("release");
    expect(classifyLane("New API pricing", "blog")).toBe("pricing");
    expect(classifyLane("How we scaled inference", "blog")).toBe("engineering");
    expect(safeFeedUrl("https://trusted.example@evil.example/feed")).toBe("");
    expect(safeFeedUrl("https://evil.test/a;whoami")).toBe("");
  });

  it("parses the captured production fixture for every curated source", () => {
    for (const source of CURATED_SOURCES) {
      const body = readFileSync(new URL(`../../tests/fixtures/${source.id}.xml`, import.meta.url), "utf8");
      const items = parseFeed(body);
      expect(items.length, source.id).toBeGreaterThan(0);
      expect(items.every(item => item.title.length <= 240 && item.url.startsWith("https://")), source.id).toBe(true);
    }
  });

  it("deduplicates runs, ranks incidents first, matches literal topics, and builds linked briefs", async () => {
    database = openDatabase(":memory:"); seedAccount(database);
    let failAll = false;
    const service = new IngestionService(database, async url => {
      if (failAll || url.includes("failed")) throw new Error("offline");
      if (url.includes("status")) return response(feed([{ title:"Elevated API errors", url:"https://status.example.test/incidents/1", date:"2026-09-11T10:30:00.000Z" }]));
      return response(feed([
        { title:"New API pricing for Agent A+B", url:"https://news.example.test/pricing", date:"2026-09-11T11:00:00.000Z" },
        { title:"How we scaled inference", url:"https://news.example.test/engineering", date:"2026-09-11T09:00:00.000Z" },
      ]));
    }, sources);
    const first = await service.run("manual", NOW); const second = await service.run("manual", NOW);
    expect(first).toMatchObject({ sourcesAttempted:3, sourcesHealthy:2, sourcesFailed:1, itemsParsed:3, signalsStored:3 });
    expect(second.signalsStored).toBe(3);
    const snapshot = buildSnapshot(database, "acct_test", NOW);
    expect(snapshot.signals).toHaveLength(3); expect(snapshot.signals[0]).toMatchObject({ lane:"incident", relevance:100 });
    const matched = snapshot.signals.find(signal => signal.title.includes("A+B"));
    expect(matched?.matchedTopicIds).toEqual(["topic_agent"]); expect(matched?.relevance).toBeGreaterThan(68);
    expect(snapshot.brief.highlights).toHaveLength(3);
    expect(snapshot.brief.highlights.every(highlight => snapshot.signals.some(signal => signal.id === highlight.signalId && signal.url.startsWith("https://")))).toBe(true);
    expect(buildSnapshot(database, "acct_test", NOW, 1).brief.highlights).toHaveLength(1);

    const lastSuccess = (database.prepare("SELECT last_success_at FROM ingestion_state").get() as { last_success_at:string }).last_success_at;
    failAll = true; await service.run("scheduled", new Date("2026-09-11T12:15:00.000Z"));
    expect((database.prepare("SELECT count(*) AS count FROM signals").get() as { count:number }).count).toBe(3);
    expect((database.prepare("SELECT status FROM source_health WHERE id='news'").get() as { status:string }).status).toBe("unavailable");
    expect((database.prepare("SELECT last_success_at FROM ingestion_state").get() as { last_success_at:string }).last_success_at).toBe(lastSuccess);
    expect((database.prepare("SELECT status FROM ingestion_runs ORDER BY finished_at DESC,id DESC LIMIT 1").get() as { status:string }).status).toBe("failed");
  });

  it("re-scores existing signals when a literal topic changes", () => {
    database = openDatabase(":memory:"); seedAccount(database);
    database.prepare("INSERT INTO signals VALUES (?,?,?,?,?,?,?,?)").run("signal_literal", "C++ and a+b agents", "https://example.test/a", "Example", "engineering", 48, NOW.toISOString(), NOW.toISOString());
    scoreAccountSignals(database, "acct_test");
    expect((database.prepare("SELECT relevance,reason FROM account_signal_scores").get() as { relevance:number; reason:string })).toMatchObject({ relevance:58 });
    expect((database.prepare("SELECT reason FROM account_signal_scores").get() as { reason:string }).reason).toContain("a+b");
  });

  it("places active incidents first while demoting quiet and resolved history", () => {
    database = openDatabase(":memory:"); seedAccount(database);
    const insertSignal = database.prepare("INSERT INTO signals VALUES (?,?,?,?,?,?,?,?)");
    const insertMetadata = database.prepare("INSERT INTO signal_metadata VALUES (?,?,?)");
    const rows:Array<[string,string,SignalLane,number,number,string]> = [
      ["active", "Active outage", "incident", 0, 0, "2026-09-11T08:00:00.000Z"],
      ["release", "Model release", "release", 1, 0, "2026-09-11T11:00:00.000Z"],
      ["pricing", "Pricing changed", "pricing", 1, 0, "2026-09-11T11:30:00.000Z"],
      ["engineering", "Engineering note", "engineering", 1, 0, "2026-09-11T11:45:00.000Z"],
      ["quiet", "Changelog commit", "release", 1, 1, "2026-09-11T11:50:00.000Z"],
      ["resolved-1", "Resolved one", "incident", 1, 0, "2026-09-11T10:00:00.000Z"],
      ["resolved-2", "Resolved two", "incident", 1, 0, "2026-09-11T09:00:00.000Z"],
      ["resolved-3", "Resolved three", "incident", 1, 0, "2026-09-11T07:00:00.000Z"],
    ];
    for (const [id,title,lane,resolved,quiet,date] of rows) {
      insertSignal.run(id, title, `https://example.test/${id}`, "Example", lane, 50, date, date);
      insertMetadata.run(id, resolved, quiet);
    }
    scoreAccountSignals(database, "acct_test");
    const signals = buildSnapshot(database, "acct_test", NOW).signals;
    expect(signals.map(signal => signal.id)).toEqual(["active", "release", "pricing", "engineering", "quiet", "resolved-1", "resolved-2"]);
    expect(signals[0]).toMatchObject({ resolved:false, quiet:false, relevance:100 });
    expect(signals.find(signal => signal.id === "quiet")).toMatchObject({ quiet:true });
  });

  it("protects on-demand ingestion with a timing-safe operator key", async () => {
    database = openDatabase(":memory:"); seedAccount(database);
    const service = new IngestionService(database, async () => response(feed([{ title:"Release Agent", url:"https://example.test/release", date:"2026-09-11T11:00:00.000Z" }])), [sources[1]]);
    app = await createApp(database, { webOrigin:"https://perception.intentsolutions.io", ingestionService:service, ingestionKey:"operator-key-with-entropy" });
    expect((await app.inject({ method:"POST", url:"/v1/ingestion" })).statusCode).toBe(401);
    expect((await app.inject({ method:"POST", url:"/v1/ingestion", headers:{ "x-ingestion-key":"wrong" } })).statusCode).toBe(401);
    const allowed = await app.inject({ method:"POST", url:"/v1/ingestion", headers:{ "x-ingestion-key":"operator-key-with-entropy" } });
    expect(allowed.statusCode).toBe(200); expect(allowed.json()).toMatchObject({ trigger:"manual", sourcesAttempted:1, sourcesHealthy:1 });
  });

  it("starts an immediate scheduled run and exposes a stop handle", async () => {
    database = openDatabase(":memory:"); let calls = 0;
    const service = new IngestionService(database, async () => { calls += 1; return response(feed([{ title:"Signal", url:"https://example.test/signal", date:"2026-09-11T11:00:00.000Z" }])); }, [sources[1]]);
    const stop = startIngestionScheduler(service); await new Promise(resolve => setTimeout(resolve, 10)); await stop();
    expect(calls).toBe(1);
  });
});

function seedAccount(database:PerceptionDatabase) {
  database.prepare("INSERT INTO accounts VALUES (?,?,?)").run("acct_test", "Test Operator", NOW.toISOString());
  database.prepare("INSERT INTO topics VALUES (?,?,?,?,?)").run("topic_agent", "acct_test", "Agent watch", JSON.stringify(["a+b"]), 1);
}
function response(body:string) { return Promise.resolve(new Response(body, { status:200, headers:{ "content-type":"application/rss+xml", "content-length":String(Buffer.byteLength(body)) } })); }
function feed(items:Array<{ title:string; url:string; date:string }>):string {
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items.map((item, index) => `<item><title><![CDATA[${item.title}]]></title><link>${item.url}</link><guid>guid-${index}</guid><pubDate>${item.date}</pubDate></item>`).join("")}</channel></rss>`;
}
