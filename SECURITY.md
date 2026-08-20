# Security

## Threat model

Listening Post renders strings that originate from thirteen public web
feeds plus any feed the user imports via OPML. Feed bodies are
attacker-influenceable content (a compromised blog, a malicious OPML
import); the shell process must never fetch, execute, or mis-render
anything a feed says.

## Architecture control

The QML side never touches the network and never writes a file. All I/O
lives in one auditable script, `bin/listening-post-poll`:

- **Fetch**: one `curl -fsS --proto =https --max-time 20 --max-filesize
  2000000 -- <url>` GET per source. `--proto =https` pins the scheme,
  `--` closes option parsing before the URL, and every URL that can reach
  the argv has already passed `Model.safeUrl` (https-only, no whitespace,
  no quotes, length-capped, never dash-prefixed).
- **State**: one JSON file under `~/.local/state/omarchy/listening-post/`,
  written atomically (tmp+mv) with a single writer. The panel only ever
  reads it, so a reader can never observe a torn document.
- **Mark-read and refresh** from the panel are argv calls back into the
  CLI, never file writes from QML.

## Input containment

1. Feed bodies are bounded in-process (2 MB) before any parse work runs;
   `--max-filesize` on the curl argv is the outer layer, but that flag only
   binds when the server sends Content-Length, so the real bound is the
   in-process check. Oversized or malformed bodies parse to `[]` and the
   stored state keeps last-good.
2. Every string that can reach a QML `Text` or a notification goes through
   `Model.clean()`: angle brackets out (defuses Qt AutoText promotion to
   StyledText, which could otherwise make the shell fetch an `img` URL
   from a feed title), ASCII controls out, bidi override marks and Unicode
   tag characters out (CVE-2021-42574 class), length capped. Entity-encoded
   markup is decoded first and then stripped by the same pass.
3. `textFormat: Text.PlainText` on every data-bound `Text` in the panel as
   a second layer. The bar pill and tooltip render inside first-party shell
   components whose format this plugin does not set; on those paths the
   sanitizer is the only layer, which is why it runs on everything.
4. URLs are validated twice: once when parsed into state, and again in the
   panel immediately before the `xdg-open` argv, so a regression upstream
   cannot reach a spawn. Only `https://` survives either check.
5. Bounded rendering: 60 items per source at parse, 400 items in the
   store, hard per-lane row caps in the panel, so a hostile feed cannot
   turn a Repeater into a UI-thread stall.
6. Notifications go through `omarchy-notification-send` with sanitized
   title text and a validated https URL in the click action; more than
   three new items collapse into one summary, so a feed cannot storm the
   notification daemon.

## What this plugin reads and writes

- Reads: the thirteen curated feed URLs (GET), optional OPML-imported
  feeds (https only), `~/.config/omarchy/shell.json` (its own settings
  entry), and the file *names* under
  `~/.local/state/omarchy/agents/usage/` for personalization (never file
  contents).
- Writes: only `~/.local/state/omarchy/listening-post/`. Safe to delete at
  any time.
- No account, no token, no cookies, no telemetry. Nothing is ever sent
  anywhere; every network call is a GET for a public document.

## Reporting

Open an issue on this repository or email jeremy@intentsolutions.io.
