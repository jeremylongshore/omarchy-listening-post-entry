const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const Model = require("../Model.js")

test("the complete public model surface has a deterministic behavioral signature", () => {
  const now = Date.parse("2026-08-29T18:00:00Z")
  const feed = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>New API pricing and limits</title><link>https://openai.com/pricing</link>
    <guid>pricing-1</guid><pubDate>Sat, 29 Aug 2026 17:00:00 GMT</pubDate></item>
    <item><title>Inside reliable agent loops</title><link>https://openai.com/research</link>
    <guid>eng-1</guid><pubDate>Fri, 28 Aug 2026 17:00:00 GMT</pubDate></item>
  </channel></rss>`
  const entries = Model.parseFeed(feed)
  const source = Model.SOURCES[0]
  const items = Model.normalizeItems(entries, source, now)
  const state = JSON.stringify({ generatedAt: now, sources: [{ id: source.id, title: source.title, ok: true }], items })
  const mk = over => Object.assign({
    guid: "s:g", sourceId: "s", vendor: "openai", vendorName: "OpenAI", product: "Tool",
    lane: "release", quiet: false, title: "v1", url: "https://x/a", timeMs: now,
    resolved: true, read: false, used: false
  }, over)
  const manyItems = Array.from({ length: Model.MAX_ITEMS + 101 }, (_, index) =>
    mk({ guid: "s:" + index, title: "item " + index, timeMs: now - index }))
  const manySources = Array.from({ length: 65 }, (_, index) =>
    ({ id: "source-" + index, ok: index % 2 === 0, title: "Source " + index, error: index % 2 ? "down" : "" }))
  const manyOutlines = '<opml><body>' + Array.from({ length: 51 }, (_, index) =>
    '<outline title="Feed ' + index + '" xmlUrl="https://example.test/' + index + '"/>').join("") + '</body></opml>'
  const cases = {
    constants: [Model.SOURCES, Model.AGENT_VENDORS, Model.MAX_BODY_CHARS, Model.RETENTION_DAYS, Model.MAX_ITEMS],
    clean: [null, "", "<b>x</b>", "a\u0000b\u202ec", "x".repeat(63), "x".repeat(64), "x".repeat(65)]
      .flatMap(v => [Model.clean(v), Model.clean(v, 12)]),
    entities: ["", "&amp;", "&quot;", "&apos;", "&nbsp;", "&#39;", "&#x27;", "&#0;", "&#99999999;", "&lt;x&gt;"].map(Model.decodeEntities),
    urls: ["", " http://x ", " https://x/a ", "https://user@x/a", "https://x/a;b",
      "https://x/" + "a".repeat(490), "https://x/" + "a".repeat(491)].map(Model.safeUrl),
    feeds: ["", "junk", feed, feed.repeat(100000)].map(Model.parseFeed),
    lanes: ["rate limit", "rate limits", "per-token", "per token", "usage limit", "usage limits",
      "cost of API", "costs per token", "$9 tier", "price cut", "price drop", "price increase", "price change",
      "launch GPT7", "launches GPT-7", "launching o12", "launched DALL E", "release Claude",
      "releases Gemini", "released Llama", "unveil Grok", "unveils Mistral", "unveiling Codex",
      "unveiled a new model", "Scaling inference"].map(title => Model.classifyLane(title, "blog"))
      .concat([["x", "status"], ["v1", "releases"]].map(x => Model.classifyLane(x[0], x[1]))),
    normalized: items,
    merged: [Model.mergeItems([], items, now),
      Model.mergeItems([mk({ product: "old", timeMs: now })], [mk({ product: "", timeMs: now - 1 })], now),
      Model.mergeItems([mk({ timeMs: now })], [mk({ timeMs: now })], now),
      Model.mergeItems([mk({ guid: "cutoff", timeMs: now - Model.RETENTION_DAYS * 86400000 })], [], now),
      Model.mergeItems(manyItems.slice(0, Model.MAX_ITEMS), [], now).length,
      Model.mergeItems(manyItems, [], now).length],
    notify: [true, false].map(first => Model.newNotifiables({}, items, first)),
    weeks: [now, now - 7 * 86400000, Date.parse("2026-01-01")].map(Model.isoWeekKey),
    used: Model.usedVendorsFromAgentFiles(["claude.json", "codex.json", "bad.json"]),
    rows: [Model.laneRows([
      mk({ guid: "old", timeMs: now - 2, read: true }),
      mk({ guid: "new", timeMs: now, read: true })], "release", 8),
      Model.laneRows([mk({ guid: "r", lane: "incident", resolved: true, used: true, timeMs: now + 2 }),
        mk({ guid: "a", lane: "incident", resolved: false, used: false, timeMs: now })], "incident", 8),
      Model.laneRows([mk({ guid: "u", lane: "engineering", used: true, timeMs: now - 2 }),
        mk({ guid: "n", lane: "engineering", used: false, timeMs: now })], "engineering", 8)],
    counts: [Model.counts(items), Model.counts([
      mk({ guid: "n", lane: "engineering", resolved: false }),
      mk({ guid: "i1", lane: "incident", resolved: false, vendorName: "First" }),
      mk({ guid: "i2", lane: "incident", resolved: false, vendorName: "Second" }),
      mk({ guid: "p", lane: "pricing" }), mk({ guid: "e", lane: "engineering" })])],
    pills: [{ incidents: 1, unread: 2, firstIncidentVendor: "OpenAI" }, { incidents: 1.5, unread: 0 },
      { incidents: 0, unread: 1.5 }, { incidents: 0, unread: 2 }, { incidents: 0, unread: 0 }].map(Model.pillText),
    tooltips: [null, { incidents: 0, unread: 0 }, { incidents: 1, unread: 1 },
      { incidents: 2, unread: 2 }].map(c => Model.tooltipText(c, now - 3600000, now)),
    ages: [now, now - 30000, now - 60000, now - 3 * 3600000, now - 48 * 3600000, 0].map(v => Model.ageText(v, now)),
    states: ["", "{", state, JSON.stringify({ generatedAt: now, items: manyItems, sources: manySources })].map(Model.parseState),
    stateFlags: Model.parseState(JSON.stringify({ generatedAt: now, sources: [], items: [
      mk({ guid: "flags", lane: "xrelease", quiet: true, resolved: false, read: true, used: true }),
      mk({ guid: "anchors", lane: "releasex", quiet: false, resolved: true, read: false, used: false })
    ] })),
    opmlText: Model.toOpml(Model.SOURCES.slice(0, 2), [{ title: '<X & "Y">', url: "https://x/a?b=1&c=2" }]),
    opmlEmpty: Model.toOpml(null, null),
    opmlMissing: Model.toOpml([{ title: null, url: null }], null),
    opml: [Model.parseOpml(Model.toOpml(Model.SOURCES.slice(0, 2), [])), Model.parseOpml(manyOutlines)]
  }
  const signature = crypto.createHash("sha256").update(JSON.stringify(cases)).digest("hex")
  assert.equal(signature, "76d7f0bea03c3b1a6192159fb15e9a27258a2468807edc1a13805cb4460c1e5a")
})
