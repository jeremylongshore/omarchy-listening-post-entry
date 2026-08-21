import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Listening Post panel: renders the item store the Service owns and drives it
// with Herald-standard keys. This file never touches the network and never
// writes a file. There is NO node on a stock Omarchy install, so the whole
// plugin runs on Quickshell plus curl; Service.qml does the fetching and the
// persistence, and the panel calls straight into it, which means a mark-read
// keystroke takes effect synchronously instead of round-tripping through a
// CLI.
Panel {
  id: root
  moduleName: "io.github.jeremylongshore.listening-post"
  ipcTarget: "io.github.jeremylongshore.listening-post"
  manageIpc: false

  property var anchorItem: null

  // The bar identifies this plugin by the widget mounted in its slot, not by
  // this nested panel.
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  // Injected by the shell for a plugin that declares kind "service"; the
  // BarWidget host passes it down. Everything below degrades to an empty view
  // when it is missing rather than erroring.
  property var service: null

  // ---- Fixed behavior. Omakase constants, not knobs.
  readonly property int incidentRowsMax: 6
  readonly property int releaseRowsMax: 10
  readonly property int pricingRowsMax: 6
  readonly property int engineeringRowsMax: 6

  property double nowMs: Date.now()

  // Bumped by the service on every store change so the computed rows below
  // re-evaluate (a JS array mutated in place does not notify QML on its own).
  property int revision: 0

  readonly property var items: {
    root.revision   // dependency: re-read whenever the service signals a change
    return root.service ? root.service.storedItems : []
  }

  readonly property var sources: {
    root.revision
    return root.service ? root.service.sourceStatus : []
  }

  readonly property double generatedAt: {
    root.revision
    return root.service ? root.service.generatedAt : 0
  }

  readonly property bool stateReady: {
    root.revision
    return root.service ? root.service.stateLoaded : false
  }

  readonly property var laneCounts: Model.counts(items)
  readonly property bool isAlert: laneCounts.incidents > 0

  // Bar pill: empty when nothing needs attention, which collapses the slot.
  readonly property string label: Model.pillText(laneCounts)
  readonly property string tooltip: Model.tooltipText(laneCounts, generatedAt, nowMs)

  Connections {
    target: root.service
    ignoreUnknownSignals: true
    function onFeedStateChanged() { root.revision++ }
  }

  // ---- Rows. Four lanes flattened into one list the cursor walks; headers
  //      are inert, rows are selectable.
  readonly property var allRows: {
    var rows = []
    var lanes = [
      { lane: "incident", header: "STATUS INCIDENTS", max: incidentRowsMax },
      { lane: "release", header: "MODEL RELEASES", max: releaseRowsMax },
      { lane: "pricing", header: "PRICING AND LIMITS", max: pricingRowsMax },
      { lane: "engineering", header: "ENGINEERING POSTS", max: engineeringRowsMax }
    ]
    var sel = 0
    for (var l = 0; l < lanes.length; l++) {
      var laneRows = Model.laneRows(items, lanes[l].lane, lanes[l].max)
      if (laneRows.length === 0) continue
      rows.push({ type: "header", text: lanes[l].header, lane: lanes[l].lane,
        guid: "", guids: [], title: "", url: "", label: "", vendorName: "",
        timeMs: 0, read: true, resolved: true, used: false, count: 0, sel: -1 })
      for (var r = 0; r < laneRows.length; r++) {
        var row = laneRows[r]
        rows.push({ type: "row", text: "", lane: row.lane, guid: row.guid,
          guids: row.guids, title: row.title, url: row.url,
          label: row.label, vendorName: row.vendorName, timeMs: row.timeMs,
          read: row.read, resolved: row.resolved, used: row.used,
          count: row.count, sel: sel })
        sel++
      }
    }
    return rows
  }

  readonly property int selectableCount: {
    var n = 0
    for (var i = 0; i < allRows.length; i++) if (allRows[i].type === "row") n++
    return n
  }

  property int selIdx: 0

  onSelectableCountChanged: {
    if (selIdx >= selectableCount) selIdx = selectableCount > 0 ? selectableCount - 1 : 0
  }

  function selectedRow() {
    for (var i = 0; i < allRows.length; i++) {
      if (allRows[i].type === "row" && allRows[i].sel === selIdx) return allRows[i]
    }
    return null
  }

  function moveCursor(dy) {
    if (selectableCount === 0) return
    var next = selIdx + dy
    if (next < 0) next = 0
    if (next >= selectableCount) next = selectableCount - 1
    selIdx = next
  }

  function openSelected() {
    var row = selectedRow()
    if (!row || row.url === "") return
    // State URLs are already Model.safeUrl-validated; this is the same check
    // again at the point of use so a regression upstream cannot reach argv.
    if (!/^https:\/\/\S+$/.test(row.url)) return
    if (openProc.running) return
    openProc.command = ["xdg-open", row.url]
    openProc.running = true
    // Opening a cluster row opens only its newest item, so mark only that one
    // read. Draining the rest of a "(+N more this week)" cluster is an
    // explicit act (x), never a side effect of opening the top item.
    if (root.service) root.service.markRead([row.guid])
  }

  function markSelectedRead() {
    var row = selectedRow()
    if (row && root.service) root.service.markRead(row.guids)
  }

  function markAllRead() {
    if (root.service) root.service.markAllRead()
  }

  function refresh() {
    nowMs = Date.now()
    if (root.service) root.service.poll()
  }

  function open() {
    root.controller.show()
  }

  function openFromHotkey() {
    root.controller.show()
  }

  function close() {
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.openFromHotkey()
  }

  property bool popoutSwitchClosing: false
  function closeForPopoutSwitch() {
    root.close()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  Process {
    id: openProc
  }

  Timer {
    interval: 30000
    running: true
    repeat: true
    onTriggered: root.nowMs = Date.now()
  }

  IpcHandler {
    target: root.ipcTarget

    function open(): void { root.openFromHotkey() }
    function close(): void { root.close() }
    function show(): void { root.openFromHotkey() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): void {
      if (root.hostWidget && typeof root.hostWidget.broadcast === "function")
        root.hostWidget.broadcast("refresh")
      else root.refresh()
    }
  }

  // ---- Popup UI.
  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(430))
    contentHeight: panel.fittedContentHeight(contentColumn.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onMoveRequested: function(dx, dy) { root.moveCursor(dy) }
      // PanelKeyCatcher emits returnRequested THEN activateRequested on the
      // same Return press, so wiring both would fire openSelected twice; wire
      // only activate (Space maps to it too, matching the first-party agents
      // panel). `x` is consumed by the catcher as deleteRequested before
      // textKey fires, so it is handled there, not in onTextKey.
      onActivateRequested: root.openSelected()
      onDeleteRequested: root.markSelectedRead()
      onTextKey: function(t) {
        if (t === "r") root.refresh()
        else if (t === "o") root.openSelected()
        else if (t === "a") root.markSelectedRead()
        else if (t === "c") root.markAllRead()
      }

      Flickable {
        anchors.fill: parent
        contentWidth: width
        contentHeight: contentColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        Column {
          id: contentColumn
          width: parent.width
          spacing: Style.space(10)

          // ---- Hero.
          Item {
            width: parent.width
            height: heroCol.implicitHeight

            Column {
              id: heroCol
              anchors.left: parent.left
              anchors.leftMargin: Style.space(16)
              anchors.right: parent.right
              anchors.rightMargin: Style.space(16)
              spacing: Style.space(4)

              Text {
                text: "LISTENING POST"
                textFormat: Text.PlainText
                color: root.bar ? root.bar.foreground : Color.foreground
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.title
                font.bold: true
                font.letterSpacing: 1
              }

              Text {
                text: {
                  if (!root.stateReady) return "Waiting for the first poll. The service checks every 15 minutes."
                  var okCount = 0
                  var firstBad = ""
                  for (var i = 0; i < root.sources.length; i++) {
                    if (root.sources[i].ok) okCount++
                    else if (!firstBad) firstBad = root.sources[i].title
                  }
                  var age = Model.ageText(root.generatedAt, root.nowMs)
                  var total = root.sources.length
                  return okCount + "/" + total + " sources"
                    + (age ? " checked " + age : "")
                    + (okCount < total && firstBad ? " · " + firstBad + " failing" : "")
                }
                textFormat: Text.PlainText
                color: root.bar ? Qt.darker(root.bar.foreground, 1.4) : Color.muted
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
                font.letterSpacing: 1
              }
            }
          }

          // ---- All lanes in one keyboard-walkable list.
          Repeater {
            model: root.allRows

            Item {
              id: rowItem
              required property var modelData
              readonly property bool isHeader: modelData.type === "header"
              readonly property bool isSelected: !isHeader && modelData.sel === root.selIdx
              readonly property bool isHot: modelData.lane === "incident" && modelData.resolved === false
              width: contentColumn.width
              height: isHeader ? Style.space(26) : Style.space(24)

              PanelSectionHeader {
                visible: rowItem.isHeader
                anchors.bottom: parent.bottom
                text: rowItem.isHeader ? rowItem.modelData.text : ""
                leftPadding: Style.space(16)
                foreground: root.bar ? root.bar.foreground : Color.foreground
                fontFamily: root.bar ? root.bar.fontFamily : Style.font.family
              }

              Rectangle {
                visible: rowItem.isSelected
                anchors.fill: parent
                anchors.leftMargin: Style.space(8)
                anchors.rightMargin: Style.space(8)
                radius: Style.cornerRadius
                color: root.bar ? root.bar.foreground : Color.foreground
                opacity: 0.12
              }

              MouseArea {
                visible: !rowItem.isHeader
                anchors.fill: parent
                acceptedButtons: Qt.LeftButton | Qt.RightButton
                onClicked: function(mouse) {
                  root.selIdx = rowItem.modelData.sel
                  if (mouse.button === Qt.RightButton) root.markSelectedRead()
                  else root.openSelected()
                }
              }

              Row {
                visible: !rowItem.isHeader
                anchors.left: parent.left
                anchors.leftMargin: Style.space(16)
                anchors.right: ageLabel.left
                anchors.rightMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(8)

                Text {
                  visible: rowItem.isHot
                  text: "●"
                  textFormat: Text.PlainText
                  anchors.verticalCenter: parent.verticalCenter
                  color: root.bar ? root.bar.urgent : Color.urgent
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }

                Text {
                  text: rowItem.isHeader ? "" : rowItem.modelData.label
                  textFormat: Text.PlainText
                  width: Math.min(implicitWidth, contentColumn.width * 0.25)
                  elide: Text.ElideRight
                  anchors.verticalCenter: parent.verticalCenter
                  color: root.bar ? Qt.darker(root.bar.foreground, 1.35) : Color.muted
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.bodySmall
                  // The personalization dot of honor: vendors whose agents
                  // the user actually runs read bold.
                  font.bold: rowItem.modelData.used === true
                }

                Text {
                  text: rowItem.isHeader ? "" : rowItem.modelData.title
                  textFormat: Text.PlainText
                  anchors.verticalCenter: parent.verticalCenter
                  color: {
                    if (!root.bar) return Color.foreground
                    if (rowItem.isHot) return root.bar.foreground
                    return rowItem.modelData.read
                      ? Qt.darker(root.bar.foreground, 1.45)
                      : root.bar.foreground
                  }
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.body
                  font.bold: !rowItem.modelData.read
                  elide: Text.ElideRight
                  width: Math.max(0, contentColumn.width - Style.space(190))
                }
              }

              Text {
                id: ageLabel
                visible: !rowItem.isHeader
                anchors.right: parent.right
                anchors.rightMargin: Style.space(16)
                anchors.verticalCenter: parent.verticalCenter
                text: rowItem.isHeader ? "" : Model.ageText(rowItem.modelData.timeMs, root.nowMs)
                textFormat: Text.PlainText
                width: Math.min(implicitWidth, contentColumn.width * 0.15)
                elide: Text.ElideRight
                color: root.bar ? Qt.darker(root.bar.foreground, 1.45) : Color.muted
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
              }
            }
          }

          // ---- Empty state.
          Text {
            visible: root.stateReady && root.allRows.length === 0
            anchors.left: parent.left
            anchors.leftMargin: Style.space(16)
            text: "Nothing new in the last 45 days. Still listening."
            textFormat: Text.PlainText
            width: parent.width - Style.space(32)
            wrapMode: Text.WordWrap
            color: root.bar ? Qt.darker(root.bar.foreground, 1.35) : Color.muted
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.body
          }

          // ---- Footer: keys and the honesty line.
          Column {
            width: parent.width
            spacing: Style.space(2)

            PanelSeparator { foreground: root.bar ? root.bar.foreground : Color.foreground }

            Text {
              anchors.left: parent.left
              anchors.leftMargin: Style.space(16)
              text: "j/k move · enter open · x read · c clear · r refresh"
              textFormat: Text.PlainText
              width: parent.width - Style.space(32)
              wrapMode: Text.WordWrap
              color: root.bar ? Qt.darker(root.bar.foreground, 1.45) : Color.muted
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.caption
            }

            Text {
              anchors.left: parent.left
              anchors.leftMargin: Style.space(16)
              text: "Curated titles only. No article bodies, no engagement counts."
              textFormat: Text.PlainText
              width: parent.width - Style.space(32)
              wrapMode: Text.WordWrap
              color: root.bar ? Qt.darker(root.bar.foreground, 1.45) : Color.muted
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.caption
            }
          }

          Item { width: 1; height: Style.space(4) }
        }
      }
    }
  }
}
