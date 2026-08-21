// Listening Post data layer: pure parse/classify/merge functions over RSS and
// Atom feed bodies plus the on-disk state record the poller CLI writes. No QML
// and no network access here. The same file loads in Quickshell (via
// `import "Model.js" as Model`), in node for the unit suite, and in the poller
// CLI (bin/listening-post-poll) via require.

// The curated source set is the product. Anthropic, xAI, Mistral, and Meta
// publish no blog feed, so their lanes ride GitHub release/commit Atom feeds
// instead; those keep working when marketing sites drop RSS. Every URL here
// was fetched live before shipping and the fixtures under tests/fixtures are
// the captured bodies.
// A community RSS mirror (github.com/Olshansk/rss-feeds) supplies real news
// feeds for the vendors that publish none first-party (Anthropic, xAI,
// Mistral, Meta, and others). It is third-party, so it is labeled honestly in
// the source table; each source is independent, so if the mirror lags, only
// those rows go quiet.
var MIRROR = "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/"

var SOURCES = [
  // ---- Vendor news (first-party blog feeds) ----
  { id: "openai-news", vendor: "openai", vendorName: "OpenAI",
    title: "OpenAI News", kind: "blog",
    url: "https://openai.com/news/rss.xml" },
  { id: "google-ai", vendor: "google", vendorName: "Google",
    title: "Google AI Blog", kind: "blog",
    url: "https://blog.google/innovation-and-ai/technology/ai/rss/" },
  { id: "deepmind", vendor: "google", vendorName: "Google DeepMind",
    title: "Google DeepMind Blog", kind: "blog",
    url: "https://deepmind.google/blog/rss.xml" },
  { id: "huggingface", vendor: "huggingface", vendorName: "Hugging Face",
    title: "Hugging Face Blog", kind: "blog",
    url: "https://huggingface.co/blog/feed.xml" },
  { id: "together", vendor: "together", vendorName: "Together AI",
    title: "Together AI Blog", kind: "blog",
    url: "https://www.together.ai/blog/rss.xml" },

  // ---- Vendor news (community RSS mirror; no first-party feed) ----
  { id: "anthropic-news", vendor: "anthropic", vendorName: "Anthropic",
    title: "Anthropic News", kind: "blog", url: MIRROR + "feed_anthropic_news.xml" },
  { id: "anthropic-engineering", vendor: "anthropic", vendorName: "Anthropic",
    title: "Anthropic Engineering", kind: "blog", url: MIRROR + "feed_anthropic_engineering.xml" },
  { id: "anthropic-research", vendor: "anthropic", vendorName: "Anthropic",
    title: "Anthropic Research", kind: "blog", url: MIRROR + "feed_anthropic_research.xml" },
  { id: "xai-news", vendor: "xai", vendorName: "xAI",
    title: "xAI News", kind: "blog", url: MIRROR + "feed_xainews.xml" },
  { id: "mistral-news", vendor: "mistral", vendorName: "Mistral",
    title: "Mistral News", kind: "blog", url: MIRROR + "feed_mistral.xml" },
  { id: "meta-ai", vendor: "meta", vendorName: "Meta",
    title: "Meta AI Blog", kind: "blog", url: MIRROR + "feed_meta_ai.xml" },
  { id: "cohere", vendor: "cohere", vendorName: "Cohere",
    title: "Cohere Blog", kind: "blog", url: MIRROR + "feed_cohere.xml" },
  { id: "groq", vendor: "groq", vendorName: "Groq",
    title: "Groq Blog", kind: "blog", url: MIRROR + "feed_groq.xml" },
  { id: "perplexity", vendor: "perplexity", vendorName: "Perplexity",
    title: "Perplexity Hub", kind: "blog", url: MIRROR + "feed_perplexity_hub.xml" },

  // ---- AI commentary and research (fills the engineering lane) ----
  { id: "the-batch", vendor: "deeplearning", vendorName: "The Batch",
    title: "The Batch (DeepLearning.AI)", kind: "blog", url: MIRROR + "feed_the_batch.xml" },
  { id: "verge-ai", vendor: "verge", vendorName: "The Verge",
    title: "The Verge AI", kind: "blog",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { id: "chip-huyen", vendor: "chip-huyen", vendorName: "Chip Huyen",
    title: "Chip Huyen", kind: "blog", url: "https://huyenchip.com/feed.xml" },
  { id: "lilian-weng", vendor: "lilian-weng", vendorName: "Lilian Weng",
    title: "Lil'Log (Lilian Weng)", kind: "blog", url: "https://lilianweng.github.io/index.xml" },

  // ---- Status incidents ----
  { id: "anthropic-status", vendor: "anthropic", vendorName: "Anthropic",
    title: "Claude Status", kind: "status",
    url: "https://status.claude.com/history.rss" },
  { id: "openai-status", vendor: "openai", vendorName: "OpenAI",
    title: "OpenAI Status", kind: "status",
    url: "https://status.openai.com/history.rss" },

  // ---- Releases and changelogs ----
  { id: "claude-code-releases", vendor: "anthropic", vendorName: "Anthropic",
    title: "Claude Code Releases", product: "Claude Code", kind: "releases",
    url: "https://github.com/anthropics/claude-code/releases.atom" },
  { id: "claude-code-changelog", vendor: "anthropic", vendorName: "Anthropic",
    title: "Claude Code Changelog", product: "Claude Code", kind: "changelog",
    url: "https://code.claude.com/docs/en/changelog/rss.xml" },
  { id: "anthropic-sdk", vendor: "anthropic", vendorName: "Anthropic",
    title: "Anthropic SDK Releases", product: "Anthropic SDK", kind: "releases",
    url: "https://github.com/anthropics/anthropic-sdk-python/releases.atom" },
  { id: "xai-sdk", vendor: "xai", vendorName: "xAI",
    title: "xAI SDK Releases", product: "xAI SDK", kind: "releases",
    url: "https://github.com/xai-org/xai-sdk-python/releases.atom" },
  { id: "mistral-sdk", vendor: "mistral", vendorName: "Mistral",
    title: "Mistral SDK Releases", product: "Mistral SDK", kind: "releases",
    url: "https://github.com/mistralai/client-python/releases.atom" },
  { id: "ollama", vendor: "ollama", vendorName: "Ollama",
    title: "Ollama Releases", product: "Ollama", kind: "releases",
    url: "https://github.com/ollama/ollama/releases.atom" },
  { id: "vllm", vendor: "vllm", vendorName: "vLLM",
    title: "vLLM Releases", product: "vLLM", kind: "releases",
    url: "https://github.com/vllm-project/vllm/releases.atom" },
  { id: "mcp-servers", vendor: "mcp", vendorName: "MCP",
    title: "MCP Servers Releases", product: "MCP Servers", kind: "releases",
    url: "https://github.com/modelcontextprotocol/servers/releases.atom" },
  { id: "cursor", vendor: "cursor", vendorName: "Cursor",
    title: "Cursor Changelog", product: "Cursor", kind: "changelog",
    url: "https://cursor.com/changelog/rss.xml" }
]

// Which local agent usage records (the first-party agents plugin writes one
// JSON file per agent under ~/.local/state/omarchy/agents/usage/) imply which
// vendor's news the user actually cares about. Read-only personalization
// signal; unknown agents are simply ignored.
var AGENT_VENDORS = {
  claude: "anthropic",
  codex: "openai",
  openai: "openai",
  gemini: "google",
  grok: "xai",
  mistral: "mistral",
  ollama: "ollama"
}

// A response bigger than this is not a feed. The curl argv carries the same
// number as --max-filesize, but that flag only binds when the server sends
// Content-Length, so the real bound lives here, before any parse work runs.
var MAX_BODY_CHARS = 2000000

// Retention and size caps for the merged item store. Old read items age out;
// the cap keeps the state file and the panel Repeater bounded no matter what
// a feed does.
var RETENTION_DAYS = 45
var MAX_ITEMS = 400
var MAX_ITEMS_PER_SOURCE = 60

// Sanitize every string that comes from the network before it reaches a QML
// Text or a notification. Strips angle brackets (a bar label renders as Qt
// AutoText, which promotes an HTML-looking string to StyledText, and an
// img tag in a feed title would make the shell fetch a URL); ASCII controls;
// bidi override/isolate marks and Unicode tag characters (display spoofing,
// CVE-2021-42574 class; tag chars are written as the surrogate pair
// DB40 DC00-DC7F so the regex needs no /u flag from the QML engine). Then
// caps length.
function clean(value, max) {
  var s = String(value === undefined || value === null ? "" : value)
  s = s.replace(/[<>]/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\uDB40[\uDC00-\uDC7F]/g, "")
  var cap = max || 64
  return s.length > cap ? s.slice(0, cap) : s
}

function num(v) {
  var n = Number(v)
  return isNaN(n) ? 0 : n
}

// Minimal entity decode for feed text nodes. Runs BEFORE clean(), so any
// markup a decode reveals is stripped by the same pass that guards direct
// markup.
function decodeEntities(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, function(m, d) {
      var code = parseInt(d, 10)
      return code > 0 && code < 1114112 ? safeFromCode(code) : ""
    })
    .replace(/&#x([0-9a-fA-F]+);/g, function(m, h) {
      var code = parseInt(h, 16)
      return code > 0 && code < 1114112 ? safeFromCode(code) : ""
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
}

function safeFromCode(code) {
  try { return String.fromCodePoint(code) } catch (e) { return "" }
}

// The two lazy-scan regexes below (`[\s\S]*?` up to a delimiter) backtrack
// quadratically on a body full of unterminated open tags, so both bound
// their input first. A single feed field is never legitimately larger than
// this; capping here turns a 2 MB adversarial body from ~14 minutes of pinned
// CPU into a bounded scan.
var FIELD_SCAN_CAP = 65536

function stripCdata(s) {
  var str = String(s || "")
  if (str.length > FIELD_SCAN_CAP) str = str.slice(0, FIELD_SCAN_CAP)
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

// First <tag>inner</tag> inside a block, tolerant of attributes on the tag.
function textOf(block, tag) {
  var str = String(block || "")
  if (str.length > FIELD_SCAN_CAP) str = str.slice(0, FIELD_SCAN_CAP)
  var re = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "i")
  var m = re.exec(str)
  return m ? m[1] : ""
}

// Atom <link rel="alternate" href="..."/>, falling back to the first link
// carrying an href. GitHub Atom always marks the item page rel=alternate.
function atomLink(block) {
  var links = String(block || "").match(/<link\b[^>]*>/gi) || []
  var first = ""
  for (var i = 0; i < links.length; i++) {
    var href = /href="([^"]*)"/i.exec(links[i])
    if (!href) continue
    if (!first) first = href[1]
    if (/rel="alternate"/i.test(links[i])) return href[1]
  }
  return first
}

// A URL is only a URL if it is https AND drawn from a conservative character
// set that contains no shell metacharacter. This is the load-bearing guard:
// a notification click action is dispatched by the shell as
// `bash -lc "xdg-open <url>"`, so a `;`, `$`, backtick, `|`, or `(` in a feed
// permalink would be command injection. The set below keeps everything a real
// http URL needs (path, query, fragment, percent-escapes) and drops every
// shell-active byte, whitespace, and quote. Anything outside it becomes "",
// and the row is simply not openable.
function safeUrl(u) {
  var s = decodeEntities(String(u || "").trim())
  if (!/^https:\/\/[A-Za-z0-9._~:\/?#@%=&+,-]+$/.test(s)) return ""
  return s.length > 500 ? "" : s
}

// One text field, feed to display: CDATA off, entities decoded, tags
// stripped, then the standard sanitize.
function feedText(rawText, max) {
  return clean(stripTags(decodeEntities(stripCdata(String(rawText || "")))), max)
}

// Parse an RSS 2.0 or Atom body into raw entries:
//   [{ guid, title, url, timeMs, blockResolved }]
// Format is detected from the body, not the source, so a source that migrates
// RSS -> Atom keeps parsing. Malformed or oversized input returns [].
// blockResolved is true when the item block carries a "Resolved" marker, the
// convention both Statuspage and incident.io history feeds use; it only means
// something for status sources.
function parseFeed(raw) {
  var s = String(raw || "")
  if (!s || s.length > MAX_BODY_CHARS) return []
  // Detect the format from the DOCUMENT ROOT, not a body-wide substring
  // search: an RSS blog post that quotes Atom XML in its body must not be
  // mis-parsed as Atom (which would split on a tag that never appears as a
  // real element and silently yield zero items). The first real element after
  // any XML declaration is <rss>/<rdf> or <feed>.
  var rootMatch = /<\s*(feed|rss|rdf:rdf|rdf)\b/i.exec(s.slice(0, 4000))
  var isAtom = rootMatch && /^feed$/i.test(rootMatch[1])
  var isRss = rootMatch && !isAtom
  if (!isAtom && !isRss) return []
  var splitTag = isAtom ? "entry" : "item"
  var blocks = s.split(new RegExp("<" + splitTag + "(?:\\s[^>]*)?>", "i"))
  var out = []
  // blocks[0] is the channel header; every later block ends at (or past) the
  // closing tag, and trailing junk after it is harmless to the field regexes.
  for (var i = 1; i < blocks.length && out.length < MAX_ITEMS_PER_SOURCE; i++) {
    var b = blocks[i]
    var end = b.search(new RegExp("</" + splitTag + ">", "i"))
    if (end >= 0) b = b.slice(0, end)
    // Bound each block unconditionally (the unterminated case, end < 0, is
    // exactly the quadratic-blowup input) before any field regex runs on it.
    if (b.length > FIELD_SCAN_CAP) b = b.slice(0, FIELD_SCAN_CAP)
    var title = feedText(textOf(b, "title"), 140)
    var url
    var guid
    var timeStr
    if (isAtom) {
      url = safeUrl(atomLink(b))
      guid = clean(stripCdata(textOf(b, "id")), 200) || url
      timeStr = textOf(b, "updated") || textOf(b, "published")
    } else {
      url = safeUrl(stripCdata(textOf(b, "link")))
      guid = clean(stripCdata(textOf(b, "guid")), 200) || url
      timeStr = textOf(b, "pubDate") || textOf(b, "dc:date")
    }
    if (!guid || !title) continue
    var timeMs = Date.parse(String(timeStr || "").trim())
    out.push({
      guid: guid,
      title: title,
      url: url,
      timeMs: isNaN(timeMs) ? 0 : timeMs,
      blockResolved: /(>|\b)Resolved(<|\b)/.test(b)
    })
  }
  return out
}

// ---- Classification lanes. Folders say where a post came from; lanes say
//      what it means: a model shipped, the bill changed, someone blogged, or
//      something is on fire.

var PRICING_RE = /\bpricing\b|\bprice (cut|drop|increase|change)|\brate limits?\b|\bfree tier\b|\bper[- ]token\b|\busage limits?\b|\bcost[s]? (of|per)\b|\$\d/i
var RELEASE_VERB_RE = /\bintroducing\b|\bannouncing\b|\blaunch(es|ing|ed)?\b|\bnow available\b|\bgenerally available\b|\brelease[sd]?\b|\bpreview of\b|\bnew model\b|\bunveil(s|ing|ed)?\b/i
var MODEL_HINT_RE = /\bgpt[- ]?[0-9o]|\bo[0-9]+\b|\bclaude\b|\bgemini\b|\bgemma\b|\bllama\b|\bgrok\b|\bmistral\b|\bmixtral\b|\bcodestral\b|\bdeepseek\b|\bqwen\b|\bkimi\b|\bsora\b|\bveo\b|\bimagen\b|\bwhisper\b|\bdall[- ]?e\b|\bapi\b|\bmodel\b|\bopus\b|\bsonnet\b|\bhaiku\b|\bflash\b|\bcodex\b/i

function classifyLane(title, sourceKind) {
  if (sourceKind === "status") return "incident"
  if (sourceKind === "releases" || sourceKind === "changelog") return "release"
  var t = String(title || "")
  if (PRICING_RE.test(t)) return "pricing"
  if (RELEASE_VERB_RE.test(t) && MODEL_HINT_RE.test(t)) return "release"
  return "engineering"
}

// Raw entries from one source -> full item records. Changelog sources are
// "quiet": their commits belong in the release lane but never notify and
// never count on the pill, because a commit feed ticks daily and attention
// is the budget this widget defends.
function normalizeItems(rawEntries, source, nowMs) {
  var out = []
  var entries = rawEntries || []
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i]
    out.push({
      guid: String(source.id) + ":" + e.guid,
      sourceId: source.id,
      vendor: source.vendor,
      vendorName: source.vendorName,
      product: source.product || "",
      lane: classifyLane(e.title, source.kind),
      quiet: source.kind === "changelog",
      title: e.title,
      url: e.url,
      timeMs: e.timeMs || num(nowMs),
      resolved: source.kind === "status" ? e.blockResolved === true : true,
      read: false,
      used: false
    })
  }
  return out
}

// Merge freshly fetched items into the stored set. Keyed by guid; the stored
// copy keeps its read flag but adopts fresh title/url/resolved (a status item
// updates in place as an incident progresses). Pruning: hard age cutoff, then
// an UNCONDITIONAL newest-first cap. The cap must be unconditional: an earlier
// version exempted unread items, which let a hostile OPML import grow the
// store past MAX_BODY_CHARS so parseState returned empty on both readers and
// the plugin (including all incident alerts) went permanently dark. Because
// the list is sorted newest-first before the cut, recent unread items survive
// by recency, which is the property that actually matters.
// Stored objects are never mutated in place: a fresh update produces a new
// object, so a caller that retains prevItems sees no surprise write-through.
function mergeItems(prevItems, freshItems, nowMs) {
  var byGuid = {}
  var order = []
  var prev = prevItems || []
  var fresh = freshItems || []
  for (var i = 0; i < prev.length; i++) {
    byGuid[prev[i].guid] = prev[i]
    order.push(prev[i].guid)
  }
  for (var j = 0; j < fresh.length; j++) {
    var f = fresh[j]
    var old = byGuid[f.guid]
    if (old) {
      var updated = {}
      for (var key in old) updated[key] = old[key]
      updated.title = f.title
      updated.url = f.url
      updated.resolved = f.resolved
      updated.lane = f.lane
      if (f.product) updated.product = f.product
      if (f.timeMs > old.timeMs) updated.timeMs = f.timeMs
      byGuid[f.guid] = updated
    } else {
      byGuid[f.guid] = f
      order.push(f.guid)
    }
  }
  var cutoff = num(nowMs) - RETENTION_DAYS * 86400000
  var merged = []
  for (var k = 0; k < order.length; k++) {
    var it = byGuid[order[k]]
    if (it.timeMs < cutoff) continue
    merged.push(it)
  }
  merged.sort(function(a, b) { return b.timeMs - a.timeMs })
  return merged.length > MAX_ITEMS ? merged.slice(0, MAX_ITEMS) : merged
}

// Which merged items deserve a desktop notification this run. Nothing on the
// first run (everything is "new" on an empty baseline, and forty
// notifications at install time is how a plugin gets uninstalled). After
// that: unseen release-lane items that are not quiet, and unseen UNRESOLVED
// incidents. Resolved incidents that arrive already closed just appear in
// the panel.
function newNotifiables(prevGuidSet, mergedItems, firstRun) {
  if (firstRun) return []
  var out = []
  var items = mergedItems || []
  for (var i = 0; i < items.length; i++) {
    var it = items[i]
    if (prevGuidSet[it.guid]) continue
    if (it.quiet) continue
    if (it.lane === "release") out.push(it)
    else if (it.lane === "incident" && it.resolved === false) out.push(it)
  }
  return out
}

// ISO-week bucket key used to cluster a vendor's same-week release burst
// into one row.
function isoWeekKey(ms) {
  var d = new Date(num(ms))
  var target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  var dayNum = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNum + 3)
  var firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  var firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  var week = 1 + Math.round((target - firstThursday) / (7 * 86400000))
  return target.getUTCFullYear() + "-w" + (week < 10 ? "0" : "") + week
}

function usedVendorsFromAgentFiles(fileNames) {
  var used = {}
  var names = fileNames || []
  for (var i = 0; i < names.length; i++) {
    var id = String(names[i]).replace(/\.json$/, "").toLowerCase()
    var vendor = AGENT_VENDORS[id]
    if (vendor) used[vendor] = true
  }
  return used
}

function markUsed(items, usedMap) {
  var list = items || []
  var map = usedMap || {}
  for (var i = 0; i < list.length; i++) list[i].used = map[list[i].vendor] === true
  return list
}

// ---- Panel rows. The panel is a queue, not a feed: unresolved incidents
//      first, then the lanes, used vendors ahead of the rest inside each
//      lane, and same-week vendor release bursts collapsed into one cluster
//      row so five SDK point releases cost one line.

function laneRows(items, lane, maxRows) {
  var list = []
  var src = items || []
  for (var i = 0; i < src.length; i++) {
    if (src[i].lane === lane) list.push(src[i])
  }
  var rows = []
  if (lane === "release") {
    // Cluster by SOURCE + week, never by vendor: Claude Code releases and the
    // Anthropic SDK are the same vendor but different products, and merging
    // "Claude Code v2.1.238" with an SDK bump into one "(+N more)" row loses
    // the product identity a reader needs.
    var clusters = {}
    var orderKeys = []
    for (var j = 0; j < list.length; j++) {
      var it = list[j]
      var key = it.sourceId + ":" + isoWeekKey(it.timeMs)
      if (!clusters[key]) { clusters[key] = []; orderKeys.push(key) }
      clusters[key].push(it)
    }
    for (var k = 0; k < orderKeys.length; k++) {
      var group = clusters[orderKeys[k]]
      var newest = group[0]
      var unread = false
      var guids = []
      for (var g = 0; g < group.length; g++) {
        if (group[g].timeMs > newest.timeMs) newest = group[g]
        if (group[g].read === false) unread = true
        guids.push(group[g].guid)
      }
      // The row's label column carries the product for a GitHub source
      // ("Claude Code", "Anthropic SDK") and the vendor for a blog release
      // ("Google DeepMind"); the title carries only the tag or summary. That
      // split keeps the label out of the title so a row never doubles its
      // own name ("Anthropic Anthropic SDK").
      var label = newest.product || newest.vendorName
      var title
      if (newest.quiet) {
        // A changelog feed's items are commit subjects, not releases; a
        // janitorial "chore: update CHANGELOG.md" must never headline the
        // release lane. Collapse the whole week to one honest summary row.
        title = "changelog · " + group.length
          + (group.length === 1 ? " commit this week" : " commits this week")
      } else {
        title = newest.title
        if (group.length > 1) title += "  (+" + (group.length - 1) + " more this week)"
      }
      rows.push({
        guid: newest.guid,
        guids: guids,
        count: group.length,
        label: label,
        vendorName: newest.vendorName,
        vendor: newest.vendor,
        lane: lane,
        quiet: newest.quiet,
        title: title,
        url: newest.url,
        timeMs: newest.timeMs,
        resolved: true,
        read: !unread,
        used: newest.used
      })
    }
  } else {
    for (var r = 0; r < list.length; r++) {
      var one = list[r]
      rows.push({
        guid: one.guid,
        guids: [one.guid],
        count: 1,
        label: one.vendorName,
        vendorName: one.vendorName,
        vendor: one.vendor,
        lane: lane,
        quiet: one.quiet,
        title: one.title,
        url: one.url,
        timeMs: one.timeMs,
        resolved: one.resolved,
        read: one.read,
        used: one.used
      })
    }
  }
  rows.sort(function(a, b) {
    if (lane === "incident" && a.resolved !== b.resolved) return a.resolved ? 1 : -1
    if (a.used !== b.used) return a.used ? -1 : 1
    return b.timeMs - a.timeMs
  })
  // On a calm day the incident lane is all resolved history; two rows of "all
  // clear" is plenty, and it must not push actual releases below the fold. The
  // cap lifts to the full maxRows the moment anything is unresolved.
  if (lane === "incident") {
    var anyActive = false
    for (var s = 0; s < rows.length; s++) if (rows[s].resolved === false) { anyActive = true; break }
    if (!anyActive) return rows.slice(0, 2)
  }
  return rows.slice(0, maxRows || 12)
}

// Counts that drive the pill and the notification summary. Engineering-lane
// unread deliberately does not count: the pill only spends attention on
// releases, pricing, and incidents.
function counts(items) {
  var c = { incidents: 0, unread: 0, firstIncidentVendor: "" }
  var list = items || []
  for (var i = 0; i < list.length; i++) {
    var it = list[i]
    if (it.lane === "incident" && it.resolved === false) {
      c.incidents++
      if (!c.firstIncidentVendor) c.firstIncidentVendor = it.vendorName
    }
    if (it.read === false && it.quiet !== true
        && (it.lane === "release" || it.lane === "pricing")) c.unread++
  }
  return c
}

// Bar pill text. Empty when there is nothing new, which collapses the slot;
// a widget with nothing to say earns its place by saying nothing.
function pillText(c) {
  if (!c) return ""
  if (c.incidents === 1) return c.firstIncidentVendor + " incident"
  if (c.incidents > 1) return c.incidents + " incidents"
  if (c.unread === 1) return "AI: 1 new"
  if (c.unread > 1) return "AI: " + c.unread + " new"
  return ""
}

function tooltipText(c, generatedAtMs, nowMs) {
  if (!c) return "Listening Post"
  var parts = []
  if (c.incidents > 0) parts.push(c.incidents + " active incident" + (c.incidents > 1 ? "s" : ""))
  if (c.unread > 0) parts.push(c.unread + " unread release/pricing item" + (c.unread > 1 ? "s" : ""))
  if (parts.length === 0) parts.push("all quiet")
  var age = ageText(generatedAtMs, nowMs)
  return "Listening Post: " + parts.join(", ") + (age ? " (checked " + age + ")" : "")
}

function ageText(thenMs, nowMs) {
  var t = num(thenMs)
  if (t <= 0) return ""
  var mins = Math.floor((num(nowMs) - t) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return mins + "m ago"
  var hours = Math.floor(mins / 60)
  if (hours < 48) return hours + "h ago"
  return Math.floor(hours / 24) + "d ago"
}

// ---- State record. One writer (the poller CLI), atomic tmp+mv; the panel
//      only ever reads. parseState returns the zero object on anything
//      malformed so the panel keeps last-good state.

function emptyState() {
  return { valid: false, generatedAt: 0, sources: [], items: [] }
}

function parseState(raw) {
  var s = String(raw || "")
  if (!s || s.length > MAX_BODY_CHARS) return emptyState()
  var data
  try { data = JSON.parse(s) } catch (e) { return emptyState() }
  if (!data || !Array.isArray(data.items)) return emptyState()
  var items = []
  for (var i = 0; i < data.items.length && i < MAX_ITEMS + 100; i++) {
    var it = data.items[i]
    if (!it || !it.guid || !it.title) continue
    items.push({
      guid: clean(it.guid, 260),
      sourceId: clean(it.sourceId, 40),
      vendor: clean(it.vendor, 24),
      vendorName: clean(it.vendorName, 32),
      product: clean(it.product, 32),
      lane: /^(release|pricing|incident|engineering)$/.test(String(it.lane)) ? String(it.lane) : "engineering",
      quiet: it.quiet === true,
      title: clean(it.title, 160),
      url: safeUrl(it.url),
      timeMs: num(it.timeMs),
      resolved: it.resolved !== false,
      read: it.read === true,
      used: it.used === true
    })
  }
  var sources = []
  var srcList = Array.isArray(data.sources) ? data.sources : []
  for (var j = 0; j < srcList.length && j < 64; j++) {
    var sr = srcList[j]
    if (!sr || !sr.id) continue
    sources.push({
      id: clean(sr.id, 40),
      ok: sr.ok === true,
      title: clean(sr.title, 48),
      error: clean(sr.error, 80)
    })
  }
  return { valid: true, generatedAt: num(data.generatedAt), sources: sources, items: items }
}

// ---- OPML import/export for the user's extra sources. Import accepts any
//      OPML 1/2 body and returns the https xmlUrl outlines; export renders
//      the curated set plus the user's extras so a feed reader can take the
//      whole list.

function parseOpml(raw) {
  var s = String(raw || "")
  if (!s || s.length > MAX_BODY_CHARS) return []
  if (!/<opml[\s>]/i.test(s)) return []
  var outlines = s.match(/<outline\b[^>]*>/gi) || []
  var out = []
  for (var i = 0; i < outlines.length && out.length < 50; i++) {
    var o = outlines[i]
    var urlM = /xmlUrl="([^"]*)"/i.exec(o)
    if (!urlM) continue
    var url = safeUrl(urlM[1])
    if (!url) continue
    var titleM = /(?:title|text)="([^"]*)"/i.exec(o)
    out.push({
      title: feedText(titleM ? titleM[1] : url, 60),
      url: url
    })
  }
  return out
}

function toOpml(curated, extras) {
  var lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head><title>Listening Post sources</title></head>',
    "  <body>"
  ]
  var all = (curated || []).concat(extras || [])
  for (var i = 0; i < all.length; i++) {
    var t = String(all[i].title || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
    var u = String(all[i].url || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    lines.push('    <outline type="rss" text="' + t + '" title="' + t + '" xmlUrl="' + u + '"/>')
  }
  lines.push("  </body>", "</opml>", "")
  return lines.join("\n")
}

if (typeof module !== "undefined") {
  module.exports = {
    SOURCES: SOURCES,
    AGENT_VENDORS: AGENT_VENDORS,
    MAX_BODY_CHARS: MAX_BODY_CHARS,
    RETENTION_DAYS: RETENTION_DAYS,
    MAX_ITEMS: MAX_ITEMS,
    clean: clean,
    decodeEntities: decodeEntities,
    stripTags: stripTags,
    feedText: feedText,
    safeUrl: safeUrl,
    parseFeed: parseFeed,
    classifyLane: classifyLane,
    normalizeItems: normalizeItems,
    mergeItems: mergeItems,
    newNotifiables: newNotifiables,
    isoWeekKey: isoWeekKey,
    usedVendorsFromAgentFiles: usedVendorsFromAgentFiles,
    markUsed: markUsed,
    laneRows: laneRows,
    counts: counts,
    pillText: pillText,
    tooltipText: tooltipText,
    ageText: ageText,
    emptyState: emptyState,
    parseState: parseState,
    parseOpml: parseOpml,
    toOpml: toOpml
  }
}
