const fs = require("node:fs")
const [dir, victim, ready, finalName = "listening-post.curlrc", tempPrefix = ".listening-post."] = process.argv.slice(2)
fs.writeFileSync(ready, "ready")
for (;;) {
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name !== finalName && !name.startsWith(tempPrefix)) continue
      const target = `${dir}/${name}`
      try { fs.unlinkSync(target) } catch {}
      try { fs.symlinkSync(victim, target); fs.writeFileSync(`${ready}.attacked`, "yes") } catch {}
    }
  } catch {}
}
