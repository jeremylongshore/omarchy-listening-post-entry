import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// Listening Post background service: owns the entire poll cycle in QML, with
// NO external runtime. A stock Omarchy install has no node (Omarchy installs
// it through mise, whose shims are not on the graphical session PATH), so the
// only things this plugin may depend on are Quickshell itself and the
// coreutils/curl every Omarchy box already has. This mirrors the
// marketplace-proven MLB Booth and Pit Wall pattern: curl through a QML
// Process, parsing in Model.js on Quickshell's own JS engine, persistence
// through FileView (the same API the first-party clipboard and agents plugins
// use to write their state).
//
// Fetch is sequential and one source at a time: 29 concurrent curls would
// spike the shell process, and feed publishing cadence is hours, so there is
// nothing to gain from parallelism.
Item {
  id: root

  property var shell: null
  property var manifest: null

  readonly property string home: Quickshell.env("HOME") || ""
  readonly property string stateDir:
    (Quickshell.env("XDG_STATE_HOME") || home + "/.local/state") + "/omarchy/listening-post"
  readonly property string statePath: stateDir + "/state.json"
  readonly property string extrasPath: stateDir + "/extra-sources.json"
  readonly property string agentsUsageDir:
    (Quickshell.env("XDG_STATE_HOME") || home + "/.local/state") + "/omarchy/agents/usage"

  // House rate: 900s matches the first-party agents refresh default. Feed
  // publishing cadence is hours, not minutes; polling harder buys nothing and
  // costs the publishers.
  readonly property int pollIntervalSec: 900
  readonly property int fetchTimeoutSec: 20
  readonly property int notifyCap: 3

  // ---- Settings, read from this plugin's bar-layout entry in shell.json.
  //      The service is not a bar widget, so it reads the file directly the
  //      same way the poller CLI used to.
  property string notificationsMode: "On"
  property string personalizationMode: "On"

  // ---- Poll state.
  property var storedItems: []          // last-good merged items
  property var sourceStatus: []         // per-source ok/error for the panel
  property double generatedAt: 0
  property bool firstRun: true
  property bool stateLoaded: false

  property var allSources: []           // curated + OPML extras for this run
  property int fetchIndex: -1           // -1 idle; else index into allSources
  property var freshItems: []           // accumulated across this run
  property var prevGuids: ({})          // guids present before this run
  property bool polling: false

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

  function readSettings() {
    var conf
    try { conf = JSON.parse(shellConfigFile.text() || "") } catch (e) { return }
    if (!conf || !conf.bar || !conf.bar.layout) return
    var zones = ["left", "center", "right"]
    for (var z = 0; z < zones.length; z++) {
      var list = conf.bar.layout[zones[z]] || []
      for (var i = 0; i < list.length; i++) {
        var e = list[i]
        if (!e || e.id !== root.moduleId) continue
        root.notificationsMode = e.notifications === "Off" ? "Off" : "On"
        root.personalizationMode = e.personalization === "Off" ? "Off" : "On"
        return
      }
    }
  }

  readonly property string moduleId: "io.github.jeremylongshore.listening-post"

  // Host policy for imported feed URLs lives in Model.js so it is covered by
  // the offline suite. It shipped inside this file, untested, and a userinfo
  // bypass reached loopback. Reported on submission 1229.
  function isPublicHost(url) { return Model.isPublicHost(url) }


  function extraSources() {
    var extras
    try { extras = JSON.parse(extrasFile.text() || "[]") } catch (e) { return [] }
    if (!extras || !extras.length) return []
    var out = []
    for (var i = 0; i < extras.length && out.length < 50; i++) {
      var e = extras[i]
      if (!e || !e.url) continue
      var url = Model.safeUrl(e.url)
      if (!url || !isPublicHost(url)) continue
      out.push({
        id: "extra-" + i,
        vendor: "custom",
        vendorName: Model.clean(e.title || "Custom", 32),
        title: Model.clean(e.title || url, 60),
        kind: "blog",
        url: url
      })
    }
    return out
  }

  // ---------------------------------------------------------------- polling

  function poll() {
    if (root.polling) return
    if (!root.stateLoaded) return
    root.readSettings()
    root.polling = true
    root.freshItems = []
    root.sourceStatus = []
    var seen = ({})
    for (var i = 0; i < root.storedItems.length; i++) seen[root.storedItems[i].guid] = true
    root.prevGuids = seen
    root.allSources = Model.SOURCES.concat(root.extraSources())
    root.fetchIndex = 0
    root.fetchCurrent()
  }

  function fetchCurrent() {
    if (root.fetchIndex < 0 || root.fetchIndex >= root.allSources.length) {
      root.finishPoll()
      return
    }
    var src = root.allSources[root.fetchIndex]
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
    if (changed) root.persist()
  }

  function markAllRead() {
    var changed = false
    for (var i = 0; i < root.storedItems.length; i++) {
      if (!root.storedItems[i].read) { root.storedItems[i].read = true; changed = true }
    }
    if (changed) root.persist()
  }

  // ------------------------------------------------------------ persistence

  function persist() {
    stateFile.setText(JSON.stringify({
      generatedAt: root.generatedAt,
      firstRun: root.firstRun,
      sources: root.sourceStatus,
      items: root.storedItems
    }))
    root.feedStateChanged()
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
      waitForEnd: true
      onStreamFinished: root.onFetched(text, String(text || "").length > 0)
    }
    onExited: function(code) {
      // A non-zero curl exit with no stdout never reaches onStreamFinished
      // with a body, so treat this as the failure path when nothing collected.
      if (code !== 0 && root.polling && root.fetchIndex >= 0
          && root.sourceStatus.length === root.fetchIndex) {
        root.onFetched("", false)
      }
    }
  }

  Process {
    id: usageListProc
    command: ["find", root.agentsUsageDir, "-maxdepth", "1", "-name", "*.json", "-printf", "%f\n"]
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

  // ------------------------------------------------------------- file views

  FileView {
    id: stateFile
    path: root.statePath
    atomicWrites: true
    printErrors: false
    onLoaded: root.loadState(text())
    onLoadFailed: root.loadState("")
  }

  FileView {
    id: extrasFile
    path: root.extrasPath
    printErrors: false
  }

  FileView {
    id: shellConfigFile
    path: (Quickshell.env("XDG_CONFIG_HOME") || root.home + "/.config") + "/omarchy/shell.json"
    printErrors: false
  }

  Timer {
    interval: root.pollIntervalSec * 1000
    running: true
    repeat: true
    onTriggered: root.poll()
  }
}
