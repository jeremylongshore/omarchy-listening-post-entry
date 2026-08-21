# Fixture capture procedure

The unit suite runs against captured feed bodies under `tests/fixtures/`,
one per curated source, trimmed to their first six items. Never point the
tests at the network.

## Recapture

From the repo root:

```bash
node - <<'EOF'
const { SOURCES } = require("./Model.js")
const { execFileSync } = require("child_process")
const fs = require("fs")
for (const src of SOURCES) {
  const body = execFileSync("curl", [
    "-fsS", "--proto", "=https", "--max-time", "20",
    "--max-filesize", "3000000", "--", src.url
  ], { encoding: "utf8", maxBuffer: 4000000 })
  fs.writeFileSync("tests/fixtures/" + src.id + ".xml", body)
  console.log(src.id, body.length)
}
EOF
```

Then trim each file to its first six `</item>` or `</entry>` closes and
re-append the closing tags (`</channel></rss>` for RSS, `</feed>` for
Atom). Keeping fixtures small keeps the repo small; keeping them real (a
byte-for-byte prefix of a live body, not a hand-written imitation) is what
makes the parser tests worth having.

Run `npm test` after recapture. Two classes of failure matter:

- A source parses zero items: the feed format changed or the URL moved.
  Fix `Model.js` or the `SOURCES` table, and note the change in the README
  source list.
- A source 301s: replace the URL with the redirect target. The poller does
  not follow redirects on purpose; a shipped URL should be the real one.

## Capture provenance

Current fixtures were captured 2026-08-20 from all twenty-nine live sources.
The two URLs that had moved that day (Google AI blog, Anthropic status,
which now lives at status.claude.com) were re-pointed to their final
locations before capture, which is exactly the drift this procedure
exists to catch.
