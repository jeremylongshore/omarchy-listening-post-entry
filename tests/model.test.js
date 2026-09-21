const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const Model = require("../Model.js")
const snapshotFixture = require("../packages/perception-contract/fixtures/snapshot-v1.json")

// Fixtures are real feed bodies captured live 2026-08-20 from every curated
// source, trimmed to their first six items. Tests run against captured
// bytes, never the network. Recapture procedure: docs/FIXTURES.md.
const fixture = (name) =>
  fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8")

const NOW_MS = Date.parse("2026-08-20T23:00:00Z")

const sourceById = (id) => {
  const src = Model.SOURCES.find((s) => s.id === id)
  assert.ok(src, "unknown source id " + id)
  return src
}

// ---- clean ----

test("clean strips angle brackets so AutoText can never promote to StyledText", () => {
  assert.equal(Model.clean('<img src="http://x/y.png">GPT'), 'img src="http://x/y.png"GPT')
})

test("clean strips controls, bidi marks, and Unicode tag characters", () => {
  assert.equal(Model.clean("a\x00b\x1fc\x7fd"), "abcd")
  assert.equal(Model.clean("a‮b⁦c​d"), "abcd")
  assert.equal(Model.clean("a󠁁b"), "ab")
})

test("clean caps length and tolerates null and undefined", () => {
  assert.equal(Model.clean("x".repeat(500), 64).length, 64)
  assert.equal(Model.clean(null), "")
  assert.equal(Model.clean(undefined), "")
})

// ---- text plumbing ----

test("decodeEntities handles named and numeric entities", () => {
  assert.equal(Model.decodeEntities("a &amp; b &lt;c&gt; &#39;d&#x27;"), "a & b <c> 'd'")
})

test("feedText strips CDATA, decodes, strips tags, then sanitizes", () => {
  assert.equal(Model.feedText("<![CDATA[Introducing <b>GPT-6</b>]]>", 64), "Introducing GPT-6")
  // Entity-encoded markup decodes, then the tags are stripped like direct
  // markup; the inert text content stays, the angle brackets never survive.
  const decoded = Model.feedText("&lt;script&gt;alert(1)&lt;/script&gt;Hello", 64)
  assert.equal(decoded, "alert(1) Hello")
  assert.equal(decoded.indexOf("<"), -1)
})

test("safeUrl accepts only https and refuses option-shaped values", () => {
  assert.equal(Model.safeUrl("https://openai.com/news"), "https://openai.com/news")
  assert.equal(Model.safeUrl("https://github.com/anthropics/claude-code/releases/tag/v2.1.0"),
    "https://github.com/anthropics/claude-code/releases/tag/v2.1.0")
  assert.equal(Model.safeUrl("https://x.test/a?b=c&d=e#frag"), "https://x.test/a?b=c&d=e#frag")
  assert.equal(Model.safeUrl("http://openai.com/news"), "")
  assert.equal(Model.safeUrl("file:///etc/passwd"), "")
  assert.equal(Model.safeUrl("javascript:alert(1)"), "")
  assert.equal(Model.safeUrl("-K https://x"), "")
  assert.equal(Model.safeUrl("https://x/" + "a".repeat(600)), "")
  assert.equal(Model.safeUrl("https://trusted.example@evil.example/feed"), "")
  assert.equal(Model.safeUrl("https://user:pass@example.test/feed"), "")
})

test("safeUrl rejects every shell metacharacter that reaches bash -lc via --exec", () => {
  // The notification click action is dispatched as `bash -lc "xdg-open <url>"`,
  // so a URL carrying a shell-active byte would be command injection.
  var bad = [
    "https://evil.test/a;curl${IFS}x|sh",
    "https://evil.test/a`id`",
    "https://evil.test/a$(id)",
    "https://evil.test/a'b",
    'https://evil.test/a"b',
    "https://evil.test/a|b",
    "https://evil.test/a&b;c",
    "https://evil.test/a b",
    "https://evil.test/a<b>"
  ]
  for (const u of bad) assert.equal(Model.safeUrl(u), "", "must reject " + u)
})

test("parseFeed on a 2MB unterminated-CDATA body returns fast, not in minutes", () => {
  var body = "<rss version=\"2.0\"><channel><item><title>"
    + "<![CDATA[".repeat(220000) // ~1.9 MB of unterminated CDATA opens
  var start = process.hrtime.bigint()
  var out = Model.parseFeed(body)
  var ms = Number(process.hrtime.bigint() - start) / 1e6
  assert.ok(Array.isArray(out))
  assert.ok(ms < 1000, "parseFeed took " + ms.toFixed(0) + "ms on a 2MB CDATA-bomb body")
})

test("parseFeed anchors format detection to the document root, not body text", () => {
  // A valid RSS body that quotes Atom syntax inside a description must parse
  // as RSS, not be mis-detected as Atom and yield zero items.
  var body = "<?xml version=\"1.0\"?><rss version=\"2.0\"><channel>"
    + "<item><title>On Atom feeds</title>"
    + "<description>we use &lt;feed&gt; and &lt;entry&gt; tags</description>"
    + "<guid>g1</guid><pubDate>Thu, 20 Aug 2026 10:00:00 GMT</pubDate></item>"
    + "</channel></rss>"
  var out = Model.parseFeed(body)
  assert.equal(out.length, 1)
  assert.equal(out[0].title, "On Atom feeds")
})

// ---- parseFeed against every captured source ----

for (const src of Model.SOURCES) {
  test("parseFeed extracts items from the live " + src.id + " capture", () => {
    const entries = Model.parseFeed(fixture(src.id + ".xml"))
    assert.ok(entries.length >= 1, src.id + " parsed no items")
    for (const e of entries) {
      assert.ok(e.guid.length > 0, "guid present")
      assert.ok(e.title.length > 0, "title present")
      assert.ok(e.url === "" || /^https:\/\//.test(e.url), "url https or empty")
      assert.ok(e.timeMs > Date.parse("2015-01-01"), src.id + " item time parsed")
    }
  })
}

test("parseFeed reads GitHub Atom rel=alternate links, not the self link", () => {
  const entries = Model.parseFeed(fixture("claude-code-releases.xml"))
  assert.ok(entries[0].url.indexOf("github.com/anthropics/claude-code/releases") > 0)
})

test("parseFeed keeps CDATA titles readable", () => {
  const entries = Model.parseFeed(fixture("openai-news.xml"))
  assert.ok(entries.some((e) => !/CDATA/.test(e.title)))
  assert.ok(entries.every((e) => e.title.indexOf("<") === -1))
})

test("parseFeed flags Resolved on closed status incidents", () => {
  const entries = Model.parseFeed(fixture("anthropic-status.xml"))
  assert.ok(entries.some((e) => e.blockResolved === true))
})

test("parseFeed returns [] on junk, html, empty, and oversized bodies", () => {
  assert.deepEqual(Model.parseFeed(""), [])
  assert.deepEqual(Model.parseFeed("not xml at all"), [])
  assert.deepEqual(Model.parseFeed("<html><body>404</body></html>"), [])
  assert.deepEqual(Model.parseFeed("<rss><channel><item>".padEnd(Model.MAX_BODY_CHARS + 10, "x")), [])
})

test("parseFeed caps items per source", () => {
  let body = "<rss version=\"2.0\"><channel>"
  for (let i = 0; i < 200; i++) {
    body += "<item><title>t" + i + "</title><guid>g" + i + "</guid>"
      + "<pubDate>Thu, 20 Aug 2026 10:00:00 GMT</pubDate></item>"
  }
  body += "</channel></rss>"
  assert.ok(Model.parseFeed(body).length <= 60)
})

// ---- classification lanes ----

test("status sources always classify incident, release feeds release", () => {
  assert.equal(Model.classifyLane("anything", "status"), "incident")
  assert.equal(Model.classifyLane("v1.2.3", "releases"), "release")
  assert.equal(Model.classifyLane("chore: bump", "changelog"), "release")
})

test("blog titles split into pricing, release, and engineering", () => {
  assert.equal(Model.classifyLane("New pricing for the API", "blog"), "pricing")
  assert.equal(Model.classifyLane("Updated rate limits for the free tier", "blog"), "pricing")
  assert.equal(Model.classifyLane("Introducing Claude Opus 5", "blog"), "release")
  assert.equal(Model.classifyLane("Gemini 3 Flash is now available", "blog"), "release")
  assert.equal(Model.classifyLane("How we scaled our training cluster", "blog"), "engineering")
  assert.equal(Model.classifyLane("A story about launch parties", "blog"), "engineering")
})

// ---- normalizeItems ----

test("normalizeItems namespaces guids by source and flags changelog quiet", () => {
  const src = sourceById("claude-code-changelog")
  const items = Model.normalizeItems(Model.parseFeed(fixture(src.id + ".xml")), src, NOW_MS)
  assert.ok(items.length > 0)
  for (const it of items) {
    assert.ok(it.guid.startsWith("claude-code-changelog:"))
    assert.equal(it.quiet, true)
    assert.equal(it.lane, "release")
    assert.equal(it.read, false)
  }
})

test("normalizeItems carries resolved only from status blocks", () => {
  const status = sourceById("anthropic-status")
  const items = Model.normalizeItems(Model.parseFeed(fixture(status.id + ".xml")), status, NOW_MS)
  assert.ok(items.every((it) => it.lane === "incident"))
  assert.ok(items.some((it) => it.resolved === true))
  const blog = sourceById("openai-news")
  const blogItems = Model.normalizeItems(Model.parseFeed(fixture(blog.id + ".xml")), blog, NOW_MS)
  assert.ok(blogItems.every((it) => it.resolved === true))
})

// ---- merge, retention, read-state ----

const mkItem = (over) => Object.assign({
  guid: "s:g1", sourceId: "s", vendor: "openai", vendorName: "OpenAI",
  product: "OpenAI SDK", lane: "release", quiet: false, title: "t",
  url: "https://x.test/a", timeMs: NOW_MS - 3600000, resolved: true,
  read: false, used: false
}, over)

test("mergeItems preserves the stored read flag and adopts fresh fields", () => {
  const prev = [mkItem({ read: true, title: "old title", resolved: false, lane: "incident" })]
  const fresh = [mkItem({ title: "new title", resolved: true, lane: "incident" })]
  const merged = Model.mergeItems(prev, fresh, NOW_MS)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].read, true)
  assert.equal(merged[0].title, "new title")
  assert.equal(merged[0].resolved, true)
})

test("mergeItems drops items past retention and sorts newest first", () => {
  const old = mkItem({ guid: "s:old", timeMs: NOW_MS - (Model.RETENTION_DAYS + 2) * 86400000 })
  const a = mkItem({ guid: "s:a", timeMs: NOW_MS - 7200000 })
  const b = mkItem({ guid: "s:b", timeMs: NOW_MS - 60000 })
  const merged = Model.mergeItems([old, a], [b], NOW_MS)
  assert.deepEqual(merged.map((i) => i.guid), ["s:b", "s:a"])
})

test("mergeItems caps the store hard, keeping the newest by recency", () => {
  const prev = []
  for (let i = 0; i < Model.MAX_ITEMS + 50; i++) {
    prev.push(mkItem({ guid: "s:" + i, timeMs: NOW_MS - i * 60000, read: i % 2 === 0 }))
  }
  const merged = Model.mergeItems(prev, [], NOW_MS)
  // The cap is unconditional: an unread-exempt cap let a hostile OPML grow the
  // store past MAX_BODY_CHARS and dark the plugin. Newest-first survives.
  assert.equal(merged.length, Model.MAX_ITEMS)
  const kept = new Set(merged.map((i) => i.guid))
  assert.ok(kept.has("s:0"), "newest survives")
  assert.ok(!kept.has("s:" + (Model.MAX_ITEMS + 49)), "oldest is cut regardless of read state")
})

test("mergeItems does not mutate the caller's prev items in place", () => {
  const prev = [mkItem({ read: true, title: "old", resolved: false })]
  const fresh = [mkItem({ title: "new", resolved: true })]
  Model.mergeItems(prev, fresh, NOW_MS)
  assert.equal(prev[0].title, "old", "prev object left untouched")
  assert.equal(prev[0].resolved, false)
})

// ---- notification gating ----

test("newNotifiables is empty on the first run no matter what arrived", () => {
  const merged = [mkItem({}), mkItem({ guid: "s:g2", lane: "incident", resolved: false })]
  assert.deepEqual(Model.newNotifiables({}, merged, true), [])
})

test("newNotifiables passes new releases and unresolved incidents only", () => {
  const prev = { "s:seen": true }
  const merged = [
    mkItem({ guid: "s:seen" }),
    mkItem({ guid: "s:rel" }),
    mkItem({ guid: "s:quiet", quiet: true }),
    mkItem({ guid: "s:eng", lane: "engineering" }),
    mkItem({ guid: "s:hot", lane: "incident", resolved: false }),
    mkItem({ guid: "s:cold", lane: "incident", resolved: true })
  ]
  const out = Model.newNotifiables(prev, merged, false)
  assert.deepEqual(out.map((i) => i.guid).sort(), ["s:hot", "s:rel"])
})

// ---- clustering and rows ----

test("isoWeekKey buckets by ISO week across a year boundary", () => {
  assert.equal(Model.isoWeekKey(Date.parse("2026-01-01T12:00:00Z")), "2026-w01")
  assert.equal(Model.isoWeekKey(Date.parse("2025-12-29T12:00:00Z")), "2026-w01")
  assert.notEqual(
    Model.isoWeekKey(Date.parse("2026-08-16T12:00:00Z")),
    Model.isoWeekKey(Date.parse("2026-08-17T12:00:00Z")))
})

test("laneRows clusters one source's same-week release burst and prefixes the product", () => {
  const monday = Date.parse("2026-08-17T10:00:00Z")
  const items = [
    mkItem({ guid: "s:1", sourceId: "cc", product: "Claude Code", timeMs: monday, title: "v1.0.1" }),
    mkItem({ guid: "s:2", sourceId: "cc", product: "Claude Code", timeMs: monday + 86400000, title: "v1.0.2" }),
    mkItem({ guid: "s:3", sourceId: "cc", product: "Claude Code", timeMs: monday + 2 * 86400000, title: "v1.0.3", read: true })
  ]
  const rows = Model.laneRows(items, "release", 12)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].count, 3)
  // The product is the row label; the title is the tag alone (so a row never
  // doubles its own name against the label column).
  assert.equal(rows[0].label, "Claude Code")
  assert.ok(rows[0].title.startsWith("v1.0."), "title is the tag, not the product")
  assert.ok(rows[0].title.indexOf("(+2 more this week)") > 0)
  assert.equal(rows[0].read, false, "one unread member keeps the cluster unread")
  assert.equal(rows[0].guids.length, 3)
})

test("laneRows never merges two products of the same vendor into one cluster", () => {
  const monday = Date.parse("2026-08-17T10:00:00Z")
  const items = [
    mkItem({ guid: "s:cc", sourceId: "cc", vendor: "anthropic", vendorName: "Anthropic", product: "Claude Code", timeMs: monday, title: "v2.1.238" }),
    mkItem({ guid: "s:sdk", sourceId: "sdk", vendor: "anthropic", vendorName: "Anthropic", product: "Anthropic SDK", timeMs: monday, title: "v0.44.0" })
  ]
  const rows = Model.laneRows(items, "release", 12)
  assert.equal(rows.length, 2, "same vendor, different product = two rows")
  assert.ok(rows.some((r) => r.label === "Claude Code" && r.title === "v2.1.238"))
  assert.ok(rows.some((r) => r.label === "Anthropic SDK" && r.title === "v0.44.0"))
})

test("laneRows blog release falls back to vendor label with a bare title", () => {
  const items = [
    mkItem({ guid: "s:g", sourceId: "dm", vendor: "google", vendorName: "Google DeepMind", product: "", title: "Introducing Gemini 3.7 Flash", timeMs: NOW_MS })
  ]
  const rows = Model.laneRows(items, "release", 12)
  assert.equal(rows[0].label, "Google DeepMind")
  assert.equal(rows[0].title, "Introducing Gemini 3.7 Flash", "no product prefix baked into the title")
})

test("laneRows collapses a quiet changelog week to a fixed summary, never a commit subject", () => {
  const monday = Date.parse("2026-08-17T10:00:00Z")
  const items = [
    mkItem({ guid: "s:c1", sourceId: "ccl", product: "Claude Code", quiet: true, timeMs: monday, title: "chore: Update CHANGELOG.md" }),
    mkItem({ guid: "s:c2", sourceId: "ccl", product: "Claude Code", quiet: true, timeMs: monday + 3600000, title: "fix: typo" })
  ]
  const rows = Model.laneRows(items, "release", 12)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].label, "Claude Code")
  assert.equal(rows[0].title, "changelog · 2 commits this week")
  assert.ok(rows[0].title.indexOf("chore:") === -1, "raw commit subject never surfaces")
})

test("laneRows orders unresolved incidents first, then used vendors", () => {
  const items = [
    mkItem({ guid: "s:cold", lane: "incident", resolved: true, timeMs: NOW_MS }),
    mkItem({ guid: "s:hot", lane: "incident", resolved: false, timeMs: NOW_MS - 9999000 })
  ]
  const rows = Model.laneRows(items, "incident", 12)
  assert.deepEqual(rows.map((r) => r.guid), ["s:hot", "s:cold"])

  const eng = [
    mkItem({ guid: "s:new", lane: "engineering", timeMs: NOW_MS }),
    mkItem({ guid: "s:used", lane: "engineering", timeMs: NOW_MS - 9999000, used: true })
  ]
  const engRows = Model.laneRows(eng, "engineering", 12)
  assert.deepEqual(engRows.map((r) => r.guid), ["s:used", "s:new"])
})

test("laneRows respects the row cap", () => {
  const items = []
  for (let i = 0; i < 30; i++) {
    items.push(mkItem({ guid: "s:" + i, lane: "engineering", timeMs: NOW_MS - i }))
  }
  assert.equal(Model.laneRows(items, "engineering", 6).length, 6)
})

test("laneRows caps resolved incidents at 2 when nothing is active, lifts when one is", () => {
  const calm = []
  for (let i = 0; i < 6; i++) {
    calm.push(mkItem({ guid: "s:" + i, lane: "incident", resolved: true, timeMs: NOW_MS - i * 1000 }))
  }
  assert.equal(Model.laneRows(calm, "incident", 6).length, 2, "calm day shows 2 resolved rows")

  const active = calm.concat([mkItem({ guid: "s:hot", lane: "incident", resolved: false, timeMs: NOW_MS })])
  assert.ok(Model.laneRows(active, "incident", 6).length > 2, "an active incident lifts the cap")
})

// ---- personalization ----

test("usedVendorsFromAgentFiles maps agent records to vendors and ignores strangers", () => {
  const used = Model.usedVendorsFromAgentFiles(["claude.json", "codex.json", "mystery.json"])
  assert.deepEqual(used, { anthropic: true, openai: true })
})

test("markUsed stamps items whose vendor the user runs", () => {
  const items = [mkItem({ vendor: "anthropic" }), mkItem({ guid: "s:2", vendor: "meta" })]
  Model.markUsed(items, { anthropic: true })
  assert.equal(items[0].used, true)
  assert.equal(items[1].used, false)
})

// ---- pill discipline ----

test("counts ignores engineering unread and quiet items", () => {
  const items = [
    mkItem({ guid: "s:1" }),
    mkItem({ guid: "s:2", lane: "pricing" }),
    mkItem({ guid: "s:3", lane: "engineering" }),
    mkItem({ guid: "s:4", quiet: true }),
    mkItem({ guid: "s:5", read: true })
  ]
  const c = Model.counts(items)
  assert.equal(c.unread, 2)
  assert.equal(c.incidents, 0)
})

test("pillText: incidents beat releases, quiet means empty", () => {
  assert.equal(Model.pillText({ incidents: 1, unread: 5, firstIncidentVendor: "OpenAI" }), "OpenAI incident")
  assert.equal(Model.pillText({ incidents: 2, unread: 0, firstIncidentVendor: "OpenAI" }), "2 incidents")
  assert.equal(Model.pillText({ incidents: 0, unread: 1, firstIncidentVendor: "" }), "AI: 1 new")
  assert.equal(Model.pillText({ incidents: 0, unread: 3, firstIncidentVendor: "" }), "AI: 3 new")
  assert.equal(Model.pillText({ incidents: 0, unread: 0, firstIncidentVendor: "" }), "")
})

test("ageText compresses to the natural unit", () => {
  assert.equal(Model.ageText(NOW_MS - 30000, NOW_MS), "just now")
  assert.equal(Model.ageText(NOW_MS - 5 * 60000, NOW_MS), "5m ago")
  assert.equal(Model.ageText(NOW_MS - 3 * 3600000, NOW_MS), "3h ago")
  assert.equal(Model.ageText(NOW_MS - 5 * 86400000, NOW_MS), "5d ago")
  assert.equal(Model.ageText(0, NOW_MS), "")
})

// ---- state record ----

test("parseState round-trips what the poller writes", () => {
  const state = {
    generatedAt: NOW_MS,
    sources: [{ id: "openai-news", title: "OpenAI News", ok: true, error: "" }],
    items: [mkItem({})]
  }
  const parsed = Model.parseState(JSON.stringify(state))
  assert.equal(parsed.valid, true)
  assert.equal(parsed.generatedAt, NOW_MS)
  assert.equal(parsed.items.length, 1)
  assert.equal(parsed.items[0].guid, "s:g1")
  assert.equal(parsed.sources[0].ok, true)
})

test("parseState returns the zero object on malformed input", () => {
  assert.equal(Model.parseState("").valid, false)
  assert.equal(Model.parseState("{not json").valid, false)
  assert.equal(Model.parseState("{\"items\":\"nope\"}").valid, false)
})

test("parseState sanitizes lane, url, and drops broken rows", () => {
  const state = {
    generatedAt: 1,
    sources: [],
    items: [
      mkItem({ lane: "evil-lane" }),
      mkItem({ guid: "s:2", url: "file:///etc/passwd" }),
      { title: "no guid" }
    ]
  }
  const parsed = Model.parseState(JSON.stringify(state))
  assert.equal(parsed.items.length, 2)
  assert.equal(parsed.items[0].lane, "engineering")
  assert.equal(parsed.items[1].url, "")
})

// ---- source table hygiene ----

test("every curated source is https, unique, and carries a known kind", () => {
  const seen = new Set()
  for (const src of Model.SOURCES) {
    assert.ok(/^https:\/\//.test(src.url), src.id + " url https")
    assert.ok(!seen.has(src.id), "duplicate id " + src.id)
    seen.add(src.id)
    assert.ok(["blog", "status", "releases", "changelog"].includes(src.kind))
    assert.ok(src.vendor.length > 0 && src.vendorName.length > 0 && src.title.length > 0)
  }
})

// ---------------------------------------------------------------------------
// Host policy for user-imported feeds.
//
// Reported by the marketplace reviewer on submission 1229: the filter treated
// URL userinfo as part of the hostname, so "https://user@127.0.0.1/feed"
// passed the private-host check and curl was then pointed at loopback. The
// check lived in Service.qml where no test could reach it, which is why it
// shipped. It lives in Model.js now and these cases pin it.

// The custom-feed host allowlist was removed in 1.1.0 along with the feature it
// guarded. These two assertions are the anti-regression: if someone reintroduces a
// user-supplied feed URL, the natural move is to bring isPublicHost back, and a
// name-only allowlist is exactly what the marketplace reviewer rejected on
// submission 1229. Fail loudly rather than let it return quietly.
test("the custom-feed host allowlist is gone and must not come back by name", () => {
  assert.equal(Model.isPublicHost, undefined)
})

test("every fetched source is a compile-time constant, none is user supplied", () => {
  assert.ok(Array.isArray(Model.SOURCES))
  assert.ok(Model.SOURCES.length > 0)
  for (const s of Model.SOURCES) {
    assert.ok(typeof s.url === "string" && s.url.startsWith("https://"), s.url)
  }
})

test("Perception snapshots normalize into the native queue and brief", () => {
  const parsed = Model.parsePerceptionSnapshot(JSON.stringify(snapshotFixture))
  assert.equal(parsed.valid, true)
  assert.equal(parsed.accountName, "Jeremy")
  assert.equal(parsed.items.length, 3)
  assert.deepEqual(parsed.items[0], {
    guid: "signal_claude_status", sourceId: "claude-status", vendor: "claude-status",
    vendorName: "Claude Status", product: "", lane: "incident", quiet: false,
    title: "Elevated API errors under investigation", url: "https://status.claude.com/",
    timeMs: Date.parse("2026-09-10T17:21:00.000Z"), resolved: false, read: false,
    used: true, relevance: 100
  })
  assert.deepEqual(parsed.highlights[0], {
    signalId: "signal_claude_status",
    reason: "Active provider incident; operational impact takes precedence."
  })
  assert.equal(parsed.sources[2].ok, false)
  assert.equal(parsed.sources[2].status, "degraded")
})

test("Perception parser rejects malformed fields instead of partially replacing last-good", () => {
  assert.deepEqual(Model.parsePerceptionSnapshot("not json"), { valid: false })
  assert.deepEqual(Model.parsePerceptionSnapshot("x".repeat(Model.MAX_BODY_CHARS + 1)), { valid: false })
  for (const mutate of [
    value => { value.schemaVersion = "2.0" },
    value => { value.signals[0].url = "http://127.0.0.1/private" },
    value => { value.signals[0].id = "bad/id" },
    value => { value.signals.push({ ...value.signals[0] }) },
    value => { value.brief.highlights[0].signalId = "missing" },
    value => { value.sourceHealth[0].status = "unknown" },
    value => { value.topics = Array.from({ length: 9 }, (_, i) => ({ id:String(i), name:"x", keywords:[], enabled:true })) }
  ]) {
    const value = JSON.parse(JSON.stringify(snapshotFixture))
    mutate(value)
    assert.equal(Model.parsePerceptionSnapshot(JSON.stringify(value)).valid, false)
  }
})

test("Perception native parser enforces every contract boundary", () => {
  const invalid = [
    value => { value.generatedAt = null }, value => { value.generatedAt = "not-a-date" },
    value => { value.staleAfter = null }, value => { value.staleAfter = "not-a-date" },
    value => { value.staleAfter = "2026-09-01T00:00:00.000Z" },
    value => { value.account = null }, value => { value.account.id = 1 },
    value => { value.account.id = "" }, value => { value.account.id = "x".repeat(129) },
    value => { value.account.displayName = 1 }, value => { value.account.displayName = " " },
    value => { value.account.displayName = "x".repeat(81) },
    value => { value.topics = null }, value => { value.signals = null },
    value => { value.signals = Array.from({ length:401 }, (_, index) => ({ ...value.signals[0], id:`signal_${index}` })) },
    value => { value.brief = null }, value => { value.brief.highlights = null },
    value => { value.brief.highlights = Array.from({ length:6 }, () => ({ ...value.brief.highlights[0] })) },
    value => { value.sourceHealth = null },
    value => { value.sourceHealth = Array.from({ length:65 }, (_, index) => ({ ...value.sourceHealth[0], id:`source_${index}` })) },
    value => { value.topics[0] = null }, value => { value.topics[0].id = 1 },
    value => { value.topics[0].id = "" }, value => { value.topics[0].id = "x".repeat(129) },
    value => { value.topics[0].name = 1 }, value => { value.topics[0].name = " " },
    value => { value.topics[0].name = "x".repeat(41) }, value => { value.topics[0].enabled = "true" },
    value => { value.topics[0].keywords = null },
    value => { value.topics[0].keywords = Array.from({ length:9 }, () => "x") },
    value => { value.topics[0].keywords[0] = 1 }, value => { value.topics[0].keywords[0] = " " },
    value => { value.topics[0].keywords[0] = "x".repeat(65) },
    value => { value.signals[0] = null }, value => { value.signals[0].id = 1 },
    value => { value.signals[0].id = "" }, value => { value.signals[0].id = "x".repeat(161) },
    value => { value.signals[0].title = 1 }, value => { value.signals[0].title = " " },
    value => { value.signals[0].title = "x".repeat(241) }, value => { value.signals[0].source = 1 },
    value => { value.signals[0].source = " " }, value => { value.signals[0].source = "x".repeat(81) },
    value => { value.signals[0].lane = "unknown" }, value => { value.signals[0].relevance = "100" },
    value => { value.signals[0].relevance = -1 }, value => { value.signals[0].relevance = 101 },
    value => { value.signals[0].resolved = 1 }, value => { value.signals[0].quiet = 0 },
    value => { value.signals[0].matchedTopicIds = null }, value => { value.signals[0].publishedAt = "not-a-date" },
    value => { value.signals[0].read = 0 }, value => { value.signals[0].matchedTopicIds[0] = 1 },
    value => { value.signals[0].matchedTopicIds[0] = "" },
    value => { value.signals[0].matchedTopicIds[0] = "x".repeat(129) },
    value => { value.brief.windowStart = null }, value => { value.brief.windowEnd = "not-a-date" },
    value => { value.brief.windowEnd = "2026-09-01T00:00:00.000Z" },
    value => { value.brief.highlights[0] = null }, value => { value.brief.highlights[0].signalId = 1 },
    value => { value.brief.highlights[0].reason = 1 }, value => { value.brief.highlights[0].reason = " " },
    value => { value.brief.highlights[0].reason = "x".repeat(241) },
    value => { value.sourceHealth[0] = null }, value => { value.sourceHealth[0].id = 1 },
    value => { value.sourceHealth[0].id = "" }, value => { value.sourceHealth[0].id = "x".repeat(129) },
    value => { value.sourceHealth[0].name = 1 }, value => { value.sourceHealth[0].name = " " },
    value => { value.sourceHealth[0].name = "x".repeat(81) }, value => { value.sourceHealth[0].checkedAt = null }
  ]
  for (const mutate of invalid) {
    const value = JSON.parse(JSON.stringify(snapshotFixture))
    mutate(value)
    assert.deepEqual(Model.parsePerceptionSnapshot(JSON.stringify(value)), { valid:false })
  }
})

test("Perception native parser rejects unknown fields at every strict object boundary", () => {
  const mutations = [
    value => { value.unknown = true }, value => { value.account.unknown = true },
    value => { value.topics[0].unknown = true }, value => { value.signals[0].unknown = true },
    value => { value.brief.unknown = true }, value => { value.brief.highlights[0].unknown = true },
    value => { value.sourceHealth[0].unknown = true }
  ]
  for (const mutate of mutations) {
    const value = JSON.parse(JSON.stringify(snapshotFixture))
    mutate(value)
    assert.deepEqual(Model.parsePerceptionSnapshot(JSON.stringify(value)), { valid:false })
  }
})

test("Perception native parser accepts exact resource and string limits", () => {
  const value = JSON.parse(JSON.stringify(snapshotFixture))
  value.account.id = "a".repeat(128)
  value.account.displayName = "a".repeat(80)
  value.topics = Array.from({ length:8 }, (_, index) => ({
    id:"t".repeat(124) + String(index).padStart(4, "0"), name:"n".repeat(40), enabled:true,
    keywords:Array.from({ length:8 }, () => "k".repeat(64))
  }))
  value.signals = Array.from({ length:Model.MAX_ITEMS }, (_, index) => ({
    ...value.signals[0], id:`signal_${index}`, title:"t".repeat(240), source:"s".repeat(80),
    relevance:index === 0 ? 0 : 100, matchedTopicIds:["m".repeat(128)]
  }))
  value.brief.highlights = Array.from({ length:5 }, (_, index) => ({
    signalId:`signal_${index}`, reason:"r".repeat(240)
  }))
  value.sourceHealth = Array.from({ length:64 }, (_, index) => ({
    ...value.sourceHealth[0], id:"s".repeat(124) + String(index).padStart(4, "0"), name:"n".repeat(80)
  }))
  assert.equal(Model.parsePerceptionSnapshot(JSON.stringify(value)).valid, true)
})

test("Perception endpoint and device token validation fail closed", () => {
  assert.equal(Model.perceptionEndpoint("https://api.perception.intentsolutions.io/"), "https://api.perception.intentsolutions.io")
  for (const endpoint of ["http://api.perception.intentsolutions.io", "https://evil.test", "https://api.perception.intentsolutions.io.evil.test"])
    assert.equal(Model.perceptionEndpoint(endpoint), "")
  assert.equal(Model.validDeviceToken("a".repeat(32)), true)
  assert.equal(Model.validDeviceToken("a".repeat(31)), false)
  assert.equal(Model.validDeviceToken("token with spaces"), false)
  assert.equal(Model.validCredentialSetting("~/.config/perception/listening-post.curlrc"), true)
  assert.equal(Model.validCredentialSetting("/tmp/stolen.curlrc"), false)
})

test("the Omarchy platform sources are fixed HTTPS feeds that land in the expected lanes", () => {
  const want = {
    "omarchy-releases": ["github.com", "release"],
    "hyprland-releases": ["github.com", "release"],
    "quickshell-releases": ["github.com", "release"],
    "dhh": ["world.hey.com", "engineering"]
  }
  for (const id of Object.keys(want)) {
    const src = Model.SOURCES.find((s) => s.id === id)
    assert.ok(src, id + " is in the curated list")
    const url = new URL(src.url)
    assert.equal(url.protocol, "https:")
    assert.equal(url.hostname, want[id][0])
    const items = Model.normalizeItems(Model.parseFeed(fixture(id + ".xml")), src, NOW_MS)
    assert.ok(items.length > 0, id + " fixture parses into items")
    for (const it of items) assert.equal(it.lane, want[id][1], id + " item lane")
  }
  assert.equal(Model.SOURCES.length, 33)
  assert.equal(new Set(Model.SOURCES.map((s) => s.id)).size, 33, "source ids are unique")
})

