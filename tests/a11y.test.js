const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8")

test("the bar control exposes a dynamic named button and pointer activation", () => {
  const qml = read("BarWidget.qml")
  assert.match(qml, /Accessible\.role:\s*Accessible\.Button/)
  assert.match(qml, /Accessible\.name:\s*root\.opened\s*\?\s*"Close Listening Post"\s*:\s*"Open Listening Post"/)
  assert.match(qml, /onPressed:\s*function\(b\)/)
})

test("the panel exposes focus, close, navigation, activation, deletion, and refresh", () => {
  const qml = read("Panel.qml")
  assert.match(qml, /KeyboardPanel\s*{/)
  assert.match(qml, /centerOnBar:\s*false/, "the panel must remain anchored under its bar pill")
  assert.match(qml, /focusTarget:\s*keyCatcher/)
  assert.match(qml, /PanelKeyCatcher\s*{/)
  assert.match(qml, /onCloseRequested:\s*root\.close\(\)/)
  assert.match(qml, /onTabRequested:/)
  assert.match(qml, /onMoveRequested:/)
  assert.match(qml, /onActivateRequested:\s*root\.openSelected\(\)/)
  assert.match(qml, /onDeleteRequested:\s*root\.markSelectedRead\(\)/)
  for (const key of ["r", "o", "a", "c"])
    assert.match(qml, new RegExp(`t === "${key}"`))
})

test("the queue stays clipped, scrollable, and plain-text only", () => {
  const qml = read("Panel.qml")
  assert.match(qml, /Flickable\s*{[\s\S]*clip:\s*true[\s\S]*interactive:\s*contentHeight\s*>\s*height/)
  assert.match(qml, /j\/k move · enter open · x read · c clear · r refresh/)
  assert.doesNotMatch(qml, /Text\.StyledText/)
})
