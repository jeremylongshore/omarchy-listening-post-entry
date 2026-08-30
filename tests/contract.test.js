const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = path.join(__dirname, "..")
const read = name => fs.readFileSync(path.join(root, name), "utf8")
const Model = require("../Model.js")

test("every Model function called by production QML is exported", () => {
  const qml = ["BarWidget.qml", "Panel.qml", "Service.qml"].map(read).join("\n")
  const calls = [...qml.matchAll(/Model\.([A-Za-z][A-Za-z0-9_]*)\s*\(/g)].map(m => m[1])
  assert.ok(calls.length > 0)
  for (const name of new Set(calls)) assert.equal(typeof Model[name], "function", name)
})

test("manifest entry points exist and all module identities agree", () => {
  const manifest = JSON.parse(read("manifest.json"))
  const escaped = manifest.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  assert.match(read("Service.qml"), new RegExp(`moduleId: "${escaped}"`))
  for (const file of ["BarWidget.qml", "Panel.qml"])
    assert.match(read(file), new RegExp(`moduleName: "${escaped}"`))
  for (const entry of Object.values(manifest.entryPoints)) {
    const resolved = path.resolve(root, entry)
    assert.ok(resolved.startsWith(root + path.sep))
    assert.equal(fs.statSync(resolved).isFile(), true)
  }
})

test("both authored marketplace descriptions use the complete allowance", () => {
  const manifest = JSON.parse(read("manifest.json"))
  assert.equal(manifest.description.length, 500)
  assert.equal(manifest.barWidget.description.length, 500)
  assert.equal(manifest.barWidget.description, manifest.description)
  assert.match(manifest.description, /29 curated AI-vendor sources/)
  assert.match(manifest.description, /four keyboard-ready lanes/)
  assert.match(manifest.description, /fixed HTTPS sources refresh every 15 minutes/)
  assert.match(manifest.description, /No account, token, telemetry, article bodies, or custom hosts/)
})

test("the service creates private state before FileView loading and bounds every external reader", () => {
  const service = read("Service.qml")
  assert.match(service, /command:\s*\["install",\s*"-d",\s*"-m",\s*"700"/)
  assert.match(service, /path:\s*root\.stateDirReady\s*\?\s*root\.statePath\s*:\s*""/)
  assert.match(service, /if \(!root\.stateDirReady \|\| !root\.stateLoaded\) return/)
  assert.match(service, /--max-time", String\(root\.fetchTimeoutSec\)/)
  assert.match(service, /--max-filesize", String\(Model\.MAX_BODY_CHARS\)/)
  assert.ok(service.includes('count=$((count + 1));'))
  assert.ok(service.includes('[ \\"$count\\" -lt 64 ] || break'))
  assert.match(service, /-maxdepth 1 -type f -name '\*\.json'/)
})

test("each fetch advances from Process exit exactly once", () => {
  const service = read("Service.qml")
  const fetchBlock = service.match(/Process \{\s*id: fetchProc[\s\S]*?\n  \}/)?.[0] || ""

  assert.match(fetchBlock, /onStreamFinished:\s*root\.fetchOutput\s*=/)
  assert.doesNotMatch(fetchBlock, /onStreamFinished:\s*root\.onFetched/)
  assert.match(fetchBlock, /onExited:[\s\S]*root\.onFetched\(body, code === 0 && body\.length > 0\)/)
})

test("curated source fetches remain fixed, HTTPS-only, and redirect-free", () => {
  const service = read("Service.qml")
  assert.match(service, /root\.allSources = Model\.SOURCES/)
  assert.match(service, /"--proto", "=https"/)
  assert.doesNotMatch(service, /"-L"|"--location"/)
  assert.doesNotMatch(service, /root\.allSources\s*=.*extra|command\s*:.*extra-sources/)
  for (const source of Model.SOURCES) assert.match(source.url, /^https:\/\//)
})

test("the banner is authored for Listening Post and contains its radar story", () => {
  const banner = read("assets/banner.svg")
  assert.match(banner, /Listening Post/i)
  assert.match(banner, /MODEL RELEASES|STATUS INCIDENTS/)
  assert.match(banner, /<(?:path|circle|line|polyline|polygon|ellipse)\b/)
})

test("render tooling requires isolated real-shell provenance and exact visual approval", () => {
  const render = read("scripts/rig-render.sh")
  assert.match(render, /OMARCHY_RIG_RESOLUTION:-1280x720/)
  assert.match(render, /sourcePackageSha256/)
  assert.match(render, /rawShellLogSha256/)
  assert.match(render, /visualInspection:\{status:"pending"/)
  assert.match(render, /direct full-frame grim capture with no crop/)
  assert.doesNotMatch(render, /grim -g|pkill/)
  const approval = read("scripts/approve-preview.sh")
  assert.match(approval, /product value is visible without reading the README/)
})

test("canonical freshness compares a shallow clone and never executes a downloader", () => {
  const source = read("scripts/check-lane-freshness.sh")
  assert.match(source, /git clone --quiet --depth 1 --branch/)
  assert.doesNotMatch(source, /\bcurl\b|\bwget\b/)
})
