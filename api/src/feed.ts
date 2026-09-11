import type { SourceKind } from "./sources.js";

export const MAX_FEED_BYTES = 2_000_000;
export const MAX_ITEMS_PER_SOURCE = 60;
const FIELD_SCAN_CAP = 65_536;
const PRICING_RE = /\bpricing\b|\bprice (cut|drop|increase|change)|\brate limits?\b|\bfree tier\b|\bper[- ]token\b|\busage limits?\b|\bcosts? (of|per)\b|\$\d/i;
const RELEASE_VERB_RE = /\bintroducing\b|\bannouncing\b|\blaunch(es|ing|ed)?\b|\bnow available\b|\bgenerally available\b|\breleases?\b|\breleased\b|\bpreview of\b|\bnew model\b|\bunveil(s|ing|ed)?\b/i;
const MODEL_HINT_RE = /\bgpt[- ]?[0-9o]|\bo[0-9]+\b|\bclaude\b|\bgemini\b|\bgemma\b|\bllama\b|\bgrok\b|\bmistral\b|\bmixtral\b|\bcodestral\b|\bdeepseek\b|\bqwen\b|\bkimi\b|\bsora\b|\bveo\b|\bimagen\b|\bwhisper\b|\bdall[- ]?e\b|\bapi\b|\bmodel\b|\bopus\b|\bsonnet\b|\bhaiku\b|\bflash\b|\bcodex\b/i;

export type ParsedFeedItem = { guid:string; title:string; url:string; publishedAt:string | null; resolved:boolean };
export type SignalLane = "incident" | "release" | "pricing" | "engineering";

export function parseFeed(raw:string):ParsedFeedItem[] {
  if (!raw || Buffer.byteLength(raw, "utf8") > MAX_FEED_BYTES) return [];
  const root = /<\s*(feed|rss|rdf:rdf|rdf)\b/i.exec(raw.slice(0, 4000));
  const atom = root?.[1]?.toLocaleLowerCase("en-US") === "feed";
  if (!root) return [];
  const splitTag = atom ? "entry" : "item";
  const blocks = raw.split(new RegExp(`<${splitTag}(?:\\s[^>]*)?>`, "i"));
  const items:ParsedFeedItem[] = [];
  for (let index = 1; index < blocks.length && items.length < MAX_ITEMS_PER_SOURCE; index += 1) {
    let block = blocks[index]; const end = block.search(new RegExp(`</${splitTag}>`, "i"));
    if (end >= 0) block = block.slice(0, end);
    block = block.slice(0, FIELD_SCAN_CAP);
    const title = feedText(textOf(block, "title"), 240);
    const rawUrl = atom ? atomLink(block) : stripCdata(textOf(block, "link"));
    const url = safeFeedUrl(rawUrl);
    const guid = clean(atom ? stripCdata(textOf(block, "id")) : stripCdata(textOf(block, "guid")), 512) || url;
    const dateText = atom ? textOf(block, "updated") || textOf(block, "published") : textOf(block, "pubDate") || textOf(block, "dc:date");
    const dateMs = Date.parse(stripTags(dateText));
    if (!guid || !title || !url) continue;
    items.push({ guid, title, url, publishedAt:Number.isFinite(dateMs) ? new Date(dateMs).toISOString() : null, resolved:/(>|\b)Resolved(<|\b)/.test(block) });
  }
  return items;
}

export function classifyLane(title:string, kind:SourceKind):SignalLane {
  if (kind === "status") return "incident";
  if (kind === "releases" || kind === "changelog") return "release";
  if (PRICING_RE.test(title)) return "pricing";
  if (RELEASE_VERB_RE.test(title) && MODEL_HINT_RE.test(title)) return "release";
  return "engineering";
}

export function safeFeedUrl(value:string):string {
  const decoded = decodeEntities(String(value || "").trim());
  if (!/^https:\/\/[A-Za-z0-9._~:/?#@%=&+,-]+$/.test(decoded) || decoded.length > 2048) return "";
  try {
    const parsed = new URL(decoded);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : "";
  } catch { return ""; }
}

function clean(value:string, maximum:number):string {
  return value.replace(/[<>]/g, "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\uDB40[\uDC00-\uDC7F]/g, "").trim().slice(0, maximum);
}
function stripCdata(value:string):string { return value.slice(0, FIELD_SCAN_CAP).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"); }
function stripTags(value:string):string { return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function feedText(value:string, maximum:number):string { return clean(stripTags(decodeEntities(stripCdata(value))), maximum); }
function textOf(block:string, tag:string):string { return new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(block.slice(0, FIELD_SCAN_CAP))?.[1] ?? ""; }
function atomLink(block:string):string {
  const links = block.match(/<link\b[^>]*>/gi) ?? []; let first = "";
  for (const link of links) { const href = /href="([^"]*)"/i.exec(link)?.[1]; if (!href) continue; first ||= href; if (/rel="alternate"/i.test(link)) return href; }
  return first;
}
function decodeEntities(value:string):string {
  return value.replace(/&#(\d+);/g, (_match, decimal:string) => safeCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex:string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
function safeCodePoint(value:number):string { try { return value > 0 && value < 1_114_112 ? String.fromCodePoint(value) : ""; } catch { return ""; } }
