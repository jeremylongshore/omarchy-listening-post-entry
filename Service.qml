import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// Listening Post background service: owns the entire poll cycle in QML, with
// no Node or Python daemon. A stock Omarchy install has no node (Omarchy installs
// it through mise, whose shims are not on the graphical session PATH), so the
// only things this background service may depend on are Quickshell itself and
// the stock curl, coreutils, and absolute-system-Perl boundary every Omarchy box
// provides. QML and Model.js still own polling and parsing. A short-lived Perl
// helper owns descriptor-bound state, settings, credentials, and authenticated
// curl execution; it is never a daemon and secrets never enter QML or argv.
//
// Fetch is sequential and one source at a time: 29 concurrent curls would
// spike the shell process, and feed publishing cadence is hours, so there is
// nothing to gain from parallelism.
Item {
  id: root

  property var shell: null
  property var manifest: null

  readonly property string home: Quickshell.env("HOME") || ""
  readonly property string secureStatePath:
    Qt.resolvedUrl("bin/listening-post-secure-state").toString().replace("file://", "")
  readonly property string agentsUsageDir:
    (Quickshell.env("XDG_STATE_HOME") || home + "/.local/state") + "/omarchy/agents/usage"

  // House rate: 900s matches the first-party agents refresh default. Feed
  // publishing cadence is hours, not minutes; polling harder buys nothing and
  // costs the publishers.
  readonly property int pollIntervalSec: 900
  readonly property int fetchTimeoutSec: 12
  readonly property int notifyCap: 3

  // ---- Settings, sanitized from this plugin's bar-layout entry in shell.json
  //      by the same descriptor-bound helper that owns runtime state.
  property string notificationsMode: "On"
  property string personalizationMode: "On"
  property string apiEndpointSetting: "https://api.perception.intentsolutions.io"
  property string deviceTokenFileSetting: "~/.config/perception/listening-post.curlrc"

  // ---- Poll state.
  property var storedItems: []          // last-good merged items
  property var sourceStatus: []         // per-source ok/error for the panel
  property double generatedAt: 0
  property bool firstRun: true
  property bool stateLoaded: false
  property string stateReadRaw: ""
  property string stateWriteRaw: ""
  property string queuedStateRaw: ""
  property string settingsRaw: ""

  property var allSources: []           // the curated SOURCES list for this run
  property int fetchIndex: -1           // -1 idle; else index into allSources
  property string fetchOutput: ""       // stdout for the current Process run
  property string readOutput: ""
  property var freshItems: []           // accumulated across this run
  property var prevGuids: ({})          // guids present before this run
  property bool polling: false
  property bool remoteActivated: false   // sticky after the first valid API field
  property string connectionState: "local"
  property double staleAfter: 0
  property string accountName: ""
  property var briefHighlights: []
  property var topics: []
  property var pendingReadGuids: []

  // Named feedStateChanged, not stateChanged: the root is an Item, which already
  // owns a `state` property and therefore a built-in stateChanged() signal.
  // Declaring stateChanged() here is an invalid override (qt.qml.invalidOverride)
  // and silently aliases our data-updated notification onto Item.state.
  signal feedStateChanged()

  // ---------------------------------------------------------------- helpers

  // Shared curl argv. No -L on purpose: a shipped URL must be the real one, so
  // a source that starts redirecting fails loudly instead of silently
  // following somewhere unvetted. --proto =https pins the scheme and -- closes
  // option parsing before the URL.
  function curlArgs(url) {
    return ["curl", "-fsS", "--proto", "=https",
      "--max-time", String(root.fetchTimeoutSec),
      "--max-filesize", String(Model.MAX_BODY_CHARS),
      "-A", "listening-post/1.0 (Omarchy bar widget)",
      "--", url]
  }

  function applySettings(raw) {
    var conf
    try { conf = JSON.parse(String(raw || "")) } catch (e) { return }
    if (!conf || typeof conf !== "object") return
    root.notificationsMode = conf.notifications === "Off" ? "Off" : "On"
    root.personalizationMode = conf.personalization === "Off" ? "Off" : "On"
    root.apiEndpointSetting = String(conf.perceptionEndpoint
      || "https://api.perception.intentsolutions.io")
    root.deviceTokenFileSetting = String(conf.deviceTokenFile
      || "~/.config/perception/listening-post.curlrc")
  }

  readonly property string moduleId: "io.github.jeremylongshore.listening-post"

  // Custom feed hosts were removed in 1.1.0. extraSources() read a user-written
  // extra-sources.json and merged those URLs into the fetch list, which is the
  // only place this plugin ever fetched a host it did not ship. See the note in
  // Model.js for why a host allowlist could not make that safe.

  // ---------------------------------------------------------------- polling

  function poll() {
    if (root.polling) return
    if (!root.stateLoaded) return
    if (settingsProc.running) return
    root.settingsRaw = ""
    settingsProc.running = true
  }

  function pollAfterSettings() {
    var endpoint = Model.perceptionEndpoint(root.apiEndpointSetting)
    if (!endpoint || !Model.validCredentialSetting(root.deviceTokenFileSetting)) {
      if (root.remoteActivated) {
        root.connectionState = "unpaired"
        root.feedStateChanged()
      } else root.pollLocal()
      return
    }
    root.polling = true
    root.connectionState = root.remoteActivated ? "refreshing" : "checking"
    root.fetchOutput = ""
    apiFetchProc.command = [root.secureStatePath, "--snapshot"]
    apiFetchProc.running = true
    root.feedStateChanged()
  }

  function pollLocal() {
    root.polling = true
    root.connectionState = "local"
    root.freshItems = []
    root.sourceStatus = []
    var seen = ({})
    for (var i = 0; i < root.storedItems.length; i++) seen[root.storedItems[i].guid] = true
    root.prevGuids = seen
    root.allSources = Model.SOURCES
    root.fetchIndex = 0
    root.fetchCurrent()
  }

  function onPerceptionFetched(output, processOk) {
    var text = String(output || "")
    var match = /\n([0-9]{3})$/.exec(text)
    var status = match ? Number(match[1]) : 0
    var body = match ? text.slice(0, match.index) : ""
    if (!processOk || status !== 200) {
      root.finishPerceptionFailure(status === 401 ? "unpaired"
        : status === 402 ? "entitlement" : "offline")
      return
    }
    var parsed = Model.parsePerceptionSnapshot(body)
    if (!parsed.valid) {
      root.finishPerceptionFailure("invalid")
      return
    }
    var wasRemote = root.remoteActivated
    var prior = ({})
    for (var i = 0; i < root.storedItems.length; i++) prior[root.storedItems[i].guid] = true
    var pending = ({})
    for (var p = 0; p < root.pendingReadGuids.length; p++) pending[root.pendingReadGuids[p]] = true
    for (var j = 0; j < parsed.items.length; j++) {
      if (pending[parsed.items[j].guid]) parsed.items[j].read = true
    }
    root.storedItems = parsed.items
    root.sourceStatus = parsed.sources
    root.generatedAt = parsed.generatedAt
    root.staleAfter = parsed.staleAfter
    root.accountName = parsed.accountName
    root.briefHighlights = parsed.highlights
    root.topics = parsed.topics
    root.remoteActivated = true
    root.connectionState = Date.now() > parsed.staleAfter ? "stale" : "connected"
    root.firstRun = false
    root.polling = false
    if (wasRemote && root.notificationsMode === "On")
      root.notifyNew(Model.newNotifiables(prior, root.storedItems, false))
    root.persist()
    root.syncNextRead()
  }

  function finishPerceptionFailure(state) {
    root.connectionState = state
    root.polling = false
    root.feedStateChanged()
  }

  function fetchCurrent() {
    if (root.fetchIndex < 0 || root.fetchIndex >= root.allSources.length) {
      root.finishPoll()
      return
    }
    var src = root.allSources[root.fetchIndex]
    root.fetchOutput = ""
    fetchProc.command = root.curlArgs(src.url)
    fetchProc.running = true
  }

  function onFetched(body, ok) {
    var src = root.allSources[root.fetchIndex]
    var status = { id: src.id, title: src.title, ok: false, error: "" }
    if (ok) {
      var entries = Model.parseFeed(body)
      if (entries.length > 0) {
        root.freshItems = root.freshItems.concat(
          Model.normalizeItems(entries, src, Date.now()))
        status.ok = true
      } else {
        status.error = "no items parsed"
      }
    } else {
      status.error = "fetch failed"
    }
    root.sourceStatus = root.sourceStatus.concat([status])
    root.fetchIndex++
    root.fetchCurrent()
  }

  function finishPoll() {
    var nowMs = Date.now()
    var merged = Model.mergeItems(root.storedItems, root.freshItems, nowMs)

    // Install baseline: everything present at the first poll is history, not
    // news, so the pill starts quiet and only counts what ships from now on.
    if (root.firstRun) {
      for (var b = 0; b < merged.length; b++) merged[b].read = true
    }

    root.storedItems = merged
    root.generatedAt = nowMs
    root.applyPersonalization()   // marks used vendors, then persists

    if (!root.firstRun && root.notificationsMode === "On") {
      root.notifyNew(Model.newNotifiables(root.prevGuids, merged, false))
    }
    root.firstRun = false
    root.polling = false
    root.fetchIndex = -1
  }

  // Personalization reads only the FILE NAMES under the first-party agents
  // plugin's usage dir (never their contents) and degrades to off when the
  // dir is absent.
  function applyPersonalization() {
    if (root.personalizationMode !== "On") {
      Model.markUsed(root.storedItems, {})
      root.persist()
      return
    }
    if (!usageListProc.running) usageListProc.running = true
    else root.persist()
  }

  function notifyNew(items) {
    if (!items || items.length === 0) return
    if (items.length > root.notifyCap) {
      var releases = 0
      var incidents = 0
      for (var n = 0; n < items.length; n++) {
        if (items[n].lane === "incident") incidents++
        else releases++
      }
      var parts = []
      if (releases > 0) parts.push(releases + " release" + (releases > 1 ? "s" : ""))
      if (incidents > 0) parts.push(incidents + " incident" + (incidents > 1 ? "s" : ""))
      root.sendNotification(["-u", "low", "--app-name", "Listening Post"],
        "Listening Post", parts.join(", ") + " are new")
      return
    }
    root.notifyQueue = items.slice(0)
    root.sendNextNotification()
  }

  property var notifyQueue: []

  function sendNextNotification() {
    if (root.notifyQueue.length === 0) return
    var it = root.notifyQueue[0]
    root.notifyQueue = root.notifyQueue.slice(1)
    var urgent = it.lane === "incident"
    var flags = ["-u", urgent ? "critical" : "low", "--app-name", "Listening Post"]
    // The --exec value is dispatched by the shell as `bash -lc "<value>"`, so
    // the URL is single-quoted. That is safe only because safeUrl already
    // rejected every quote and shell metacharacter; this re-test refuses to
    // build the action if that guarantee ever regresses.
    if (it.url && /^https:\/\/[A-Za-z0-9._~:\/?#@%=&+,-]+$/.test(it.url)) {
      flags.push("--exec", "xdg-open '" + it.url + "'")
    }
    root.sendNotification(flags,
      urgent ? it.vendorName + " incident" : it.vendorName + " release",
      it.title)
  }

  // Flags first, feed-derived positionals last behind "--", with a leading-dash
  // strip, so an option-shaped feed title can never be parsed as an option.
  function sendNotification(flags, headline, body) {
    var args = flags.concat(["--", root.stripLead(headline)])
    if (body !== undefined) args.push(root.stripLead(body))
    notifyProc.command = ["omarchy-notification-send"].concat(args)
    notifyProc.running = true
  }

  function stripLead(s) {
    return String(s === undefined ? "" : s).replace(/^[-\s]+/, "")
  }

  // ------------------------------------------------------------- mutations
  //
  // Mark-read is a synchronous in-memory mutation plus a persist. There is no
  // CLI round trip any more, so a keystroke can never be dropped or reverted
  // by a racing writer: this service is the single owner of the item store.

  function markRead(guids) {
    if (!guids || guids.length === 0) return
    var set = ({})
    for (var g = 0; g < guids.length; g++) set[guids[g]] = true
    var changed = false
    for (var i = 0; i < root.storedItems.length; i++) {
      if (set[root.storedItems[i].guid] && !root.storedItems[i].read) {
        root.storedItems[i].read = true
        changed = true
      }
    }
    if (root.remoteActivated) root.queueRemoteReads(guids)
    if (changed) root.persist()
  }

  function markAllRead() {
    var changed = false
    var guids = []
    for (var i = 0; i < root.storedItems.length; i++) {
      if (!root.storedItems[i].read) {
        root.storedItems[i].read = true
        guids.push(root.storedItems[i].guid)
        changed = true
      }
    }
    if (root.remoteActivated) root.queueRemoteReads(guids)
    if (changed) root.persist()
  }

  function queueRemoteReads(guids) {
    var queued = ({})
    for (var p = 0; p < root.pendingReadGuids.length; p++) queued[root.pendingReadGuids[p]] = true
    var next = root.pendingReadGuids.slice(0)
    for (var g = 0; g < guids.length; g++) {
      var id = String(guids[g] || "")
      if (/^[A-Za-z0-9_-]{1,160}$/.test(id) && !queued[id]) {
        queued[id] = true
        next.push(id)
      }
    }
    root.pendingReadGuids = next
    root.persist()
    root.syncNextRead()
  }

  function syncNextRead() {
    if (readProc.running || root.pendingReadGuids.length === 0) return
    var endpoint = Model.perceptionEndpoint(root.apiEndpointSetting)
    if (!endpoint || !Model.validCredentialSetting(root.deviceTokenFileSetting)) return
    var id = root.pendingReadGuids[0]
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) {
      root.pendingReadGuids = root.pendingReadGuids.slice(1)
      root.syncNextRead()
      return
    }
    readProc.command = [root.secureStatePath, "--mark-read", id]
    root.readOutput = ""
    readProc.running = true
  }

  // ------------------------------------------------------------ persistence

  function persist() {
    if (!root.stateLoaded) return
    var raw = JSON.stringify({
      generatedAt: root.generatedAt,
      firstRun: root.firstRun,
      mode: root.remoteActivated ? "perception" : "local",
      staleAfter: root.staleAfter,
      accountName: root.accountName,
      connectionState: root.connectionState,
      briefHighlights: root.briefHighlights,
      topics: root.topics,
      pendingReadGuids: root.pendingReadGuids,
      sources: root.sourceStatus,
      items: root.storedItems
    })
    if (stateWriter.running) root.queuedStateRaw = raw
    else root.startStateWrite(raw)
    root.feedStateChanged()
  }

  function startStateWrite(raw) {
    root.stateWriteRaw = String(raw || "")
    stateWriter.running = true
  }

  function loadState(raw) {
    var parsed = Model.parseState(raw)
    if (parsed.valid) {
      root.storedItems = parsed.items
      root.sourceStatus = parsed.sources
      root.generatedAt = parsed.generatedAt
      // A state file that already carries items means this is not a fresh
      // install, so the baseline has already been taken.
      var data
      try { data = JSON.parse(String(raw || "")) } catch (e) { data = null }
      root.firstRun = data && data.firstRun === true ? true : parsed.items.length === 0
      if (data && data.mode === "perception") {
        root.remoteActivated = true
        root.staleAfter = Number(data.staleAfter) || 0
        root.accountName = Model.clean(data.accountName, 80)
        root.connectionState = "last-good"
        root.topics = Array.isArray(data.topics) ? data.topics.slice(0, 8) : []
        var itemIds = ({})
        for (var q = 0; q < parsed.items.length; q++) itemIds[parsed.items[q].guid] = true
        var highlights = []
        var rawHighlights = Array.isArray(data.briefHighlights) ? data.briefHighlights : []
        for (var h = 0; h < rawHighlights.length && highlights.length < 5; h++) {
          var hi = rawHighlights[h]
          if (hi && itemIds[hi.signalId] && typeof hi.reason === "string" && hi.reason.trim())
            highlights.push({ signalId: String(hi.signalId), reason: Model.clean(hi.reason, 240) })
        }
        root.briefHighlights = highlights
        var pending = Array.isArray(data.pendingReadGuids) ? data.pendingReadGuids : []
        root.pendingReadGuids = pending.filter(function(id) {
          return /^[A-Za-z0-9_-]{1,160}$/.test(String(id || ""))
        }).slice(0, Model.MAX_ITEMS)
      }
    }
    root.stateLoaded = true
    root.feedStateChanged()
    // First poll only after the state is known, so the baseline decision is
    // made against real history rather than an empty store.
    root.poll()
  }

  // ------------------------------------------------------------------ procs

  Process {
    id: fetchProc
    stdout: StdioCollector {
      id: fetchStdout
      waitForEnd: true
      onStreamFinished: root.fetchOutput = String(text || "")
    }
    onExited: function(code) {
      // Finalize exactly once from Process.onExited. StdioCollector also emits
      // for empty failed commands; advancing from both signals races the reused
      // Process into the following source and can walk beyond allSources.
      if (!root.polling || root.fetchIndex < 0) return
      var body = String(fetchStdout.text || root.fetchOutput || "")
      root.onFetched(body, code === 0 && body.length > 0)
    }
  }

  Process {
    id: apiFetchProc
    stdout: StdioCollector {
      id: apiFetchStdout
      waitForEnd: true
      onStreamFinished: root.fetchOutput = String(text || "")
    }
    onExited: function(code) {
      if (code === 3 && !root.remoteActivated) {
        root.polling = false
        root.pollLocal()
        return
      }
      if (code === 3) {
        root.finishPerceptionFailure("unpaired")
        return
      }
      root.onPerceptionFetched(String(apiFetchStdout.text || root.fetchOutput || ""), code === 0)
    }
  }

  Process {
    id: settingsProc
    command: [root.secureStatePath, "--read-settings"]
    stdout: StdioCollector {
      id: settingsStdout
      waitForEnd: true
      onStreamFinished: root.settingsRaw = String(text || "")
    }
    onExited: function(code) {
      if (code === 0) root.applySettings(String(settingsStdout.text || root.settingsRaw || ""))
      root.pollAfterSettings()
    }
  }

  Process {
    id: readProc
    stdout: StdioCollector {
      id: readStdout
      waitForEnd: true
      onStreamFinished: root.readOutput = String(text || "")
    }
    onExited: function(code) {
      var status = Number(String(readStdout.text || root.readOutput || ""))
      // 204 synced; 404 means the bounded server retention already removed
      // the signal, so it is terminal rather than a head-of-line blocker.
      if (code === 0 && (status === 204 || status === 404)
          && root.pendingReadGuids.length > 0) {
        root.pendingReadGuids = root.pendingReadGuids.slice(1)
        root.persist()
        root.syncNextRead()
      }
    }
  }

  Process {
    id: usageListProc
    command: ["bash", "-c",
      "count=0; while IFS= read -r -d '' file; do "
      + "printf '%s\\n' \"${file##*/}\"; count=$((count + 1)); "
      + "[ \"$count\" -lt 64 ] || break; "
      + "done < <(find -- \"$1\" -maxdepth 1 -type f -name '*.json' -print0 2>/dev/null)",
      "listening-post-usage", root.agentsUsageDir]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var names = String(text || "").split("\n")
        Model.markUsed(root.storedItems, Model.usedVendorsFromAgentFiles(names))
        root.persist()
      }
    }
    onExited: function(code) {
      // No agents plugin installed: degrade to no personalization, still
      // persist so the poll's items land.
      if (code !== 0) {
        Model.markUsed(root.storedItems, {})
        root.persist()
      }
    }
  }

  Process {
    id: notifyProc
    onExited: root.sendNextNotification()
  }

  Process {
    id: stateReader
    command: [root.secureStatePath, "--read-state"]
    stdout: StdioCollector {
      id: stateReadStdout
      waitForEnd: true
      onStreamFinished: root.stateReadRaw = String(text || "")
    }
    onExited: function(code) {
      root.loadState(code === 0
        ? String(stateReadStdout.text || root.stateReadRaw || "") : "")
    }
  }

  Process {
    id: stateWriter
    command: [root.secureStatePath, "--write-state"]
    stdinEnabled: true
    onStarted: {
      write(root.stateWriteRaw + "\n")
      root.stateWriteRaw = ""
    }
    onExited: function(code) {
      if (root.queuedStateRaw.length > 0) {
        var next = root.queuedStateRaw
        root.queuedStateRaw = ""
        Qt.callLater(function() { root.startStateWrite(next) })
      }
    }
  }

  Timer {
    interval: root.pollIntervalSec * 1000
    running: true
    repeat: true
    onTriggered: root.poll()
  }

  Component.onCompleted: stateReader.running = true
}
