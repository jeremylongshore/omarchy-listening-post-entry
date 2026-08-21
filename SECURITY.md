# Security

## Threat model

Listening Post renders strings that originate from twenty-nine public web
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
4. URLs are validated by a strict allowlist charset. Omarchy dispatches a
   notification click action as `bash -lc "<value>"`, so a URL carrying a
   shell metacharacter (`;`, `$`, backtick, `|`, `(`) would be command
   injection. `Model.safeUrl` admits only
   `https://[A-Za-z0-9._~:/?#@%=&+,-]+` (every shell-active byte, quote,
   and space is rejected). The poller re-tests that exact pattern
   immediately before building the `--exec` action, and single-quotes the
   URL inside it. The `xdg-open` path from the panel passes an argv list
   (no shell) with the same check at the point of use. URLs are validated
   at parse into state and again at every point of use.
5. Notification argv safety: the poller puts every flag first and passes
   the two feed-derived positionals (headline, body) last behind `--`,
   with a defensive leading-dash strip, so an option-shaped feed title
   can never be parsed as an option by `notify-send`.
6. Bounded parsing and rendering: 64 KB per field-scan (the two lazy
   regexes are the ReDoS surface, so their input is capped before they
   run, a 2 MB CDATA-bomb body parses in well under a second, tested),
   60 items per source, an unconditional 400-item store cap (an earlier
   unread-exempt cap let a hostile OPML grow the state file past the
   parse bound and dark the plugin), and hard per-lane row caps in the
   panel.
7. Notifications go through `omarchy-notification-send` with sanitized
   text; more than three new items collapse into one summary, so a feed
   cannot storm the notification daemon.
8. OPML import is bounded and host-screened: at most 50 stored extra
   sources, and an imported feed whose host is a literal IP or a
   private-network suffix (`.local`, `.internal`, `localhost`) is
   refused, so an attacker-authored source list cannot turn the poller
   into an internal-endpoint prober.
9. Atomic writes refuse a pre-planted symlink: the tmp file is opened
   `wx` (`O_CREAT|O_EXCL`) at mode 0600, so a same-uid attacker cannot
   redirect the write through a symlink at the predictable path.
10. The poll re-reads the current on-disk read flags immediately before
    writing, so a mark-read the panel performed during the (up to a
    minute long) fetch loop is never reverted by the poll's stale
    snapshot.

## What this plugin reads and writes

- Reads: the twenty-nine curated feed URLs (GET), optional OPML-imported
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
