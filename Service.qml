import QtQuick
import Quickshell
import Quickshell.Io

// Listening Post background service: the one job is running the poller CLI on
// the house cadence so feeds stay fresh and release/incident notifications
// arrive even when the bar widget is not mounted. All fetch, parse, state,
// and notification logic lives in bin/listening-post-poll; this file is a
// timer with a Process.
Item {
  id: root

  property var shell: null
  property var manifest: null

  // The poller sits next to this file inside the installed plugin folder.
  readonly property string pollerPath:
    Qt.resolvedUrl("bin/listening-post-poll").toString().replace(/^file:\/\//, "")

  // House rate: 900s matches the first-party agents refresh default. Feed
  // publishing cadence is hours, not minutes; polling harder buys nothing
  // and costs the publishers.
  readonly property int pollIntervalSec: 900

  function pollNow() {
    if (pollProc.running) return
    pollProc.command = [root.pollerPath]
    pollProc.running = true
  }

  Process {
    id: pollProc
  }

  Timer {
    interval: root.pollIntervalSec * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.pollNow()
  }
}
