const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawn, spawnSync } = require("node:child_process")
const { once } = require("node:events")

const helper = path.join(__dirname, "..", "bin", "listening-post-secure-state")
const token = "fixture_device_token_1234567890abcdef"

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "listening-post-config-"))
  return { root, dir: path.join(root, "config", "perception"),
    stateDir: path.join(root, "state", "omarchy", "listening-post"),
    settingsDir: path.join(root, "config", "omarchy"),
    env: { ...process.env, HOME: root, XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state") } }
}
function run(x, args = ["--write"], input = `${token}\n`) {
  return spawnSync(helper, args, { encoding: "utf8", env: x.env, input, timeout: 3000 })
}
function cleanup(x) { fs.rmSync(x.root, { recursive: true, force: true }) }
async function waitFor(file, timeout = 3000) {
  const deadline = Date.now() + timeout
  while (!fs.existsSync(file)) {
    if (Date.now() >= deadline) assert.fail(`timed out waiting for ${file}`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
async function stop(child) {
  if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit") }
}

test("credential helper publishes and validates a private curl config", () => {
  const x = setup(); const result = run(x)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.statSync(x.dir).mode & 0o777, 0o700)
  const final = path.join(x.dir, "listening-post.curlrc")
  assert.equal(fs.statSync(final).mode & 0o777, 0o600)
  assert.equal(fs.readFileSync(final, "utf8"), `header = "Authorization: Bearer ${token}"\n`)
  assert.equal(run(x, ["--check-credential"], "").status, 0)
  cleanup(x)
})

test("a symlinked final entry is replaced without touching its victim", () => {
  const x = setup(); fs.mkdirSync(x.dir, { recursive: true })
  const victim = path.join(x.root, "victim"); fs.writeFileSync(victim, "precious", { mode: 0o640 })
  fs.symlinkSync(victim, path.join(x.dir, "listening-post.curlrc"))
  const result = run(x); assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(victim, "utf8"), "precious")
  assert.equal(fs.lstatSync(path.join(x.dir, "listening-post.curlrc")).isSymbolicLink(), false)
  cleanup(x)
})

test("same-UID final and temporary entry swaps fail closed", async () => {
  const x = setup(); fs.mkdirSync(x.dir, { recursive: true })
  const victim = path.join(x.root, "victim-temp"); fs.writeFileSync(victim, "precious", { mode: 0o640 })
  const ready = path.join(x.root, "temp-ready")
  const racer = spawn(process.execPath,
    [path.join(__dirname, "fixtures", "credential-swap-racer.js"), x.dir, victim, ready],
    { stdio: "ignore" })
  await waitFor(ready)
  const attempts = []
  for (let i = 0; i < 60; i++) attempts.push(run(x))
  await waitFor(`${ready}.attacked`); await stop(racer)
  assert.equal(fs.readFileSync(victim, "utf8"), "precious")
  assert.equal(fs.statSync(victim).mode & 0o777, 0o640)
  assert.ok(attempts.some(result => result.status !== 0), "an identity race fails closed")
  for (const name of fs.readdirSync(x.dir)) {
    const entry = path.join(x.dir, name)
    if (fs.lstatSync(entry).isSymbolicLink()) fs.unlinkSync(entry)
  }
  assert.equal(run(x).status, 0)
  cleanup(x)
})

test("same-UID parent directory swaps cannot redirect publication", async () => {
  const x = setup(); fs.mkdirSync(x.dir, { recursive: true })
  const victim = path.join(x.root, "victim-parent"); fs.mkdirSync(victim)
  const ready = path.join(x.root, "parent-ready")
  const racer = spawn(process.execPath,
    [path.join(__dirname, "fixtures", "credential-parent-racer.js"), x.dir, victim, ready],
    { stdio: "ignore" })
  await waitFor(ready)
  for (let i = 0; i < 60; i++) run(x)
  await waitFor(`${ready}.attacked`); await stop(racer)
  assert.equal(fs.existsSync(path.join(victim, "listening-post.curlrc")), false)
  cleanup(x)
})

test("a FIFO final entry never blocks publication", () => {
  const x = setup(); fs.mkdirSync(x.dir, { recursive: true })
  const final = path.join(x.dir, "listening-post.curlrc")
  assert.equal(spawnSync("mkfifo", [final]).status, 0)
  const result = run(x); assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.lstatSync(final).isFile(), true)
  cleanup(x)
})

test("oversized or malformed credential input fails closed", () => {
  const x = setup()
  for (const input of ["x".repeat(512), "short\n", `${token}\nextra\n`])
    assert.notEqual(run(x, ["--write"], input).status, 0)
  assert.equal(fs.existsSync(path.join(x.dir, "listening-post.curlrc")), false)
  cleanup(x)
})

test("credential reads reject symlinks, FIFOs, oversized files, and public modes without hanging", () => {
  for (const attack of ["symlink", "fifo", "oversized", "mode"]) {
    const x = setup(); fs.mkdirSync(x.dir, { recursive: true })
    const final = path.join(x.dir, "listening-post.curlrc")
    if (attack === "symlink") {
      const victim = path.join(x.root, "credential-victim")
      fs.writeFileSync(victim, `header = "Authorization: Bearer ${token}"\n`, { mode: 0o600 })
      fs.symlinkSync(victim, final)
    } else if (attack === "fifo") {
      assert.equal(spawnSync("mkfifo", [final]).status, 0)
    } else {
      fs.writeFileSync(final, attack === "oversized" ? "x".repeat(1000)
        : `header = "Authorization: Bearer ${token}"\n`, { mode: attack === "mode" ? 0o644 : 0o600 })
    }
    const result = run(x, ["--check-credential"], "")
    assert.notEqual(result.status, 0, `${attack} unexpectedly passed`)
    assert.notEqual(result.error?.code, "ETIMEDOUT", `${attack} blocked on a pathname`)
    cleanup(x)
  }
})

test("state round trips as private validated JSON", () => {
  const x = setup(); const state = { generatedAt: 42, items: [{ guid: "one", read: false }] }
  const write = run(x, ["--write-state"], `${JSON.stringify(state)}\n`)
  assert.equal(write.status, 0, write.stderr)
  const final = path.join(x.stateDir, "state.json")
  assert.equal(fs.statSync(x.stateDir).mode & 0o777, 0o700)
  assert.equal(fs.statSync(final).mode & 0o777, 0o600)
  const read = run(x, ["--read-state"], "")
  assert.equal(read.status, 0, read.stderr)
  assert.deepEqual(JSON.parse(read.stdout), state)
  cleanup(x)
})

test("state publication replaces a symlink without touching its victim", () => {
  const x = setup(); fs.mkdirSync(x.stateDir, { recursive: true })
  const victim = path.join(x.root, "state-victim")
  fs.writeFileSync(victim, "precious", { mode: 0o640 })
  fs.symlinkSync(victim, path.join(x.stateDir, "state.json"))
  const result = run(x, ["--write-state"], '{"items":[]}\n')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(victim, "utf8"), "precious")
  assert.equal(fs.lstatSync(path.join(x.stateDir, "state.json")).isFile(), true)
  cleanup(x)
})

test("state final and temporary entry swaps fail closed", async () => {
  const x = setup(); fs.mkdirSync(x.stateDir, { recursive: true })
  const victim = path.join(x.root, "state-temp-victim")
  fs.writeFileSync(victim, "precious", { mode: 0o640 })
  const ready = path.join(x.root, "state-temp-ready")
  const racer = spawn(process.execPath,
    [path.join(__dirname, "fixtures", "credential-swap-racer.js"),
      x.stateDir, victim, ready, "state.json", ".state."], { stdio: "ignore" })
  await waitFor(ready)
  const attempts = []
  for (let i = 0; i < 60; i++) attempts.push(run(x, ["--write-state"], '{"items":[]}\n'))
  await waitFor(`${ready}.attacked`); await stop(racer)
  assert.equal(fs.readFileSync(victim, "utf8"), "precious")
  assert.equal(fs.statSync(victim).mode & 0o777, 0o640)
  assert.ok(attempts.some(result => result.status !== 0), "an identity race fails closed")
  for (const name of fs.readdirSync(x.stateDir)) {
    const entry = path.join(x.stateDir, name)
    if (fs.lstatSync(entry).isSymbolicLink()) fs.unlinkSync(entry)
  }
  assert.equal(run(x, ["--write-state"], '{"items":[]}\n').status, 0)
  cleanup(x)
})

test("state parent directory swaps cannot redirect publication", async () => {
  const x = setup(); fs.mkdirSync(x.stateDir, { recursive: true })
  const victim = path.join(x.root, "state-parent-victim"); fs.mkdirSync(victim)
  const ready = path.join(x.root, "state-parent-ready")
  const racer = spawn(process.execPath,
    [path.join(__dirname, "fixtures", "credential-parent-racer.js"), x.stateDir, victim, ready],
    { stdio: "ignore" })
  await waitFor(ready)
  for (let i = 0; i < 60; i++) run(x, ["--write-state"], '{"items":[]}\n')
  await waitFor(`${ready}.attacked`); await stop(racer)
  assert.equal(fs.existsSync(path.join(victim, "state.json")), false)
  cleanup(x)
})

test("state reads reject symlinks, FIFOs, oversized files, public modes, and malformed JSON", () => {
  for (const attack of ["symlink", "fifo", "oversized", "mode", "malformed"]) {
    const x = setup(); fs.mkdirSync(x.stateDir, { recursive: true })
    const final = path.join(x.stateDir, "state.json")
    if (attack === "symlink") {
      const victim = path.join(x.root, "state-read-victim")
      fs.writeFileSync(victim, '{}', { mode: 0o600 }); fs.symlinkSync(victim, final)
    } else if (attack === "fifo") {
      assert.equal(spawnSync("mkfifo", [final]).status, 0)
    } else {
      const body = attack === "oversized" ? "x".repeat(2_000_001)
        : attack === "malformed" ? "not-json" : "{}"
      fs.writeFileSync(final, body, { mode: attack === "mode" ? 0o644 : 0o600 })
    }
    const result = run(x, ["--read-state"], "")
    assert.notEqual(result.status, 0, `${attack} unexpectedly passed`)
    assert.notEqual(result.error?.code, "ETIMEDOUT", `${attack} blocked on a pathname`)
    cleanup(x)
  }
})

test("settings reader returns only the bounded Listening Post configuration", () => {
  const x = setup(); fs.mkdirSync(x.settingsDir, { recursive: true })
  fs.writeFileSync(path.join(x.settingsDir, "shell.json"), JSON.stringify({
    secretTopLevel: "must-not-leak",
    bar: { layout: { left: [{ id: "unrelated", secret: "no" }], right: [{
      id: "io.github.jeremylongshore.listening-post",
      notifications: "Off", personalization: "Off",
      perceptionEndpoint: "https://api.perception.intentsolutions.io",
      deviceTokenFile: "~/.config/perception/listening-post.curlrc",
      secret: "must-not-leak"
    }] } }
  }))
  const result = run(x, ["--read-settings"], "")
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), {
    notifications: "Off", personalization: "Off",
    perceptionEndpoint: "https://api.perception.intentsolutions.io",
    deviceTokenFile: "~/.config/perception/listening-post.curlrc"
  })
  assert.doesNotMatch(result.stdout, /secret|must-not-leak/)
  cleanup(x)
})

test("settings reads reject symlinks, FIFOs, oversized files, and malformed JSON without hanging", () => {
  for (const attack of ["symlink", "fifo", "oversized", "malformed"]) {
    const x = setup(); fs.mkdirSync(x.settingsDir, { recursive: true })
    const final = path.join(x.settingsDir, "shell.json")
    if (attack === "symlink") {
      const victim = path.join(x.root, "settings-victim")
      fs.writeFileSync(victim, '{}'); fs.symlinkSync(victim, final)
    } else if (attack === "fifo") {
      assert.equal(spawnSync("mkfifo", [final]).status, 0)
    } else {
      fs.writeFileSync(final, attack === "oversized" ? "x".repeat(256 * 1024 + 1) : "not-json")
    }
    const result = run(x, ["--read-settings"], "")
    assert.notEqual(result.status, 0, `${attack} unexpectedly passed`)
    assert.notEqual(result.error?.code, "ETIMEDOUT", `${attack} blocked on a pathname`)
    cleanup(x)
  }
})

test("a symlinked config parent is refused", () => {
  const x = setup(); const victim = path.join(x.root, "victim-config"); fs.mkdirSync(victim)
  fs.mkdirSync(path.dirname(x.env.XDG_CONFIG_HOME), { recursive: true })
  fs.symlinkSync(victim, x.env.XDG_CONFIG_HOME)
  assert.notEqual(run(x).status, 0)
  assert.deepEqual(fs.readdirSync(victim), [])
  cleanup(x)
})
