const test = require("node:test")
const assert = require("node:assert/strict")
const Model = require("../Model.js")

const NOW = Date.parse("2026-08-29T18:00:00Z")
const item = over => Object.assign({
  guid: "s:g", sourceId: "s", vendor: "openai", vendorName: "OpenAI",
  product: "", lane: "engineering", quiet: false, title: "title",
  url: "https://example.test/a", timeMs: NOW, resolved: true, read: false, used: false
}, over)

test("entity and feed field fallbacks cover invalid, truncated, and missing values", () => {
  assert.equal(Model.decodeEntities("&#0; &#99999999; &#x0; &#xFFFFFFF;"), "   ")
  const atom = `<?xml version="1.0"?><feed>
    <entry><title>First</title><link href="https://example.test/first"/>
      <published>bad-date</published></entry>
    <entry><title>Second</title><id>id-2</id><link rel="self"/><link href="https://example.test/fallback"/>
      <published>2026-08-29T17:00:00Z</published></entry>
    <entry><title>${"x".repeat(70000)}</title><id>oversized</id></entry>
  </feed>`
  const parsedAtom = Model.parseFeed(atom)
  assert.equal(parsedAtom[0].guid, "https://example.test/first")
  assert.equal(parsedAtom[0].timeMs, 0)
  assert.equal(parsedAtom[1].url, "https://example.test/fallback")
  const rss = `<?xml version="1.0"?><rss><channel>
    <item><title>Fallback guid</title><link><![CDATA[https://example.test/rss]]></link>
      <dc:date>2026-08-29T16:00:00Z</dc:date></item>
    <item><title>No identity</title></item>
  </channel></rss>`
  const parsedRss = Model.parseFeed(rss)
  assert.equal(parsedRss.length, 1)
  assert.equal(parsedRss[0].guid, "https://example.test/rss")
  assert.equal(parsedRss[0].timeMs, Date.parse("2026-08-29T16:00:00Z"))
})

test("normalization, merge, notification, and personalization accept empty defaults", () => {
  assert.deepEqual(Model.normalizeItems(null, Model.SOURCES[0], NOW), [])
  const normalized = Model.normalizeItems([{ guid: "g", title: "x", url: "", timeMs: 0 }], Model.SOURCES[0], NOW)
  assert.equal(normalized[0].timeMs, NOW)
  assert.deepEqual(Model.mergeItems(null, null, NOW), [])
  const old = item({ product: "old", timeMs: NOW - 100 })
  const fresh = item({ product: "new", timeMs: NOW + 100 })
  const merged = Model.mergeItems([old], [fresh], NOW)
  assert.equal(merged[0].product, "new")
  assert.equal(merged[0].timeMs, NOW + 100)
  assert.deepEqual(Model.newNotifiables({}, null, false), [])
  assert.deepEqual(Model.usedVendorsFromAgentFiles(null), {})
  assert.deepEqual(Model.markUsed(null, null), [])
})

test("row, count, pill, tooltip, and age boundaries cover quiet and active states", () => {
  assert.deepEqual(Model.laneRows(null, "release"), [])
  const quiet = Model.laneRows([item({ lane: "release", quiet: true, product: "Tool" })], "release")
  assert.equal(quiet[0].title, "changelog · 1 commit this week")
  const active = item({ lane: "incident", resolved: false, vendorName: "OpenAI" })
  const resolved = item({ guid: "s:r", lane: "incident", resolved: true, used: true, timeMs: NOW + 1 })
  assert.deepEqual(Model.laneRows([resolved, active], "incident").map(row => row.guid), ["s:g", "s:r"])
  assert.deepEqual(Model.counts(null), { incidents: 0, unread: 0, firstIncidentVendor: "" })
  const counts = Model.counts([active, item({ guid: "s:p", lane: "pricing" })])
  assert.deepEqual(counts, { incidents: 1, unread: 1, firstIncidentVendor: "OpenAI" })
  assert.equal(Model.pillText(null), "")
  assert.equal(Model.tooltipText(null, 0, NOW), "Listening Post")
  assert.equal(Model.tooltipText({ incidents: 0, unread: 0 }, NOW, NOW), "Listening Post: all quiet (checked just now)")
  assert.match(Model.tooltipText({ incidents: 2, unread: 1 }, NOW - 3600000, NOW), /2 active incidents, 1 unread/)
})

test("state and OPML readers cover invalid source rows, missing titles, and empty exports", () => {
  const state = Model.parseState(JSON.stringify({
    generatedAt: "bad", sources: [null, {}, { id: "ok", ok: false, title: null, error: "down" }],
    items: [item({ guid: "", title: "drop" }), item({ guid: "drop", title: null }),
      item({ guid: "keep", title: "kept", timeMs: "bad" })]
  }))
  assert.equal(state.valid, true)
  assert.equal(state.sources.length, 1)
  assert.equal(state.items.length, 1)
  assert.equal(state.generatedAt, 0)
  assert.deepEqual(Model.parseOpml(null), [])
  assert.deepEqual(Model.parseOpml("<opml><body></body></opml>"), [])
  assert.deepEqual(Model.parseOpml("x".repeat(Model.MAX_BODY_CHARS + 1)), [])
  const opml = '<opml><body><outline/><outline xmlUrl="http://bad"/><outline xmlUrl="https://example.test/feed"/></body></opml>'
  assert.deepEqual(Model.parseOpml(opml), [{ title: "https://example.test/feed", url: "https://example.test/feed" }])
  const empty = Model.toOpml(null, null)
  assert.match(empty, /<opml version="2.0">/)
  const escaped = Model.toOpml([{ title: '<A & "B">', url: 'https://example.test/a?x=1&y=2' }], null)
  assert.match(escaped, /&lt;A &amp; &quot;B&quot;>/)
  assert.match(escaped, /x=1&amp;y=2/)
})
