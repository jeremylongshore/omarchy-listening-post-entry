# Security

## Threat model

Listening Post renders strings that originate from twenty-nine public web
feeds plus any feed the user adds themselves. Feed bodies are
attacker-influenceable content (a compromised blog, a malicious feed
list); the shell process must never fetch, execute, or mis-render
anything a feed says.

## Architecture control

The plugin has no external runtime: no node, no python, no helper binary
beyond `curl`, `find`, `xdg-open`, and `omarchy-notification-send`, all of
which a stock Omarchy install already ships. All I/O lives in one auditable
QML file, `Service.qml`:

- **Fetch**: one `curl -fsS --proto =https --max-time 20 --max-filesize
  2000000 -- <url>` GET per source. `--proto =https` pins the scheme,
  `--` closes option parsing before the URL, and every URL that can reach
  the argv has already passed `Model.safeUrl` (https-only, no whitespace,
  no quotes, length-capped, never dash-prefixed).
- **State**: one JSON file under `~/.local/state/omarchy/listening-post/`,
  written through Quickshell's `FileView` with `atomicWrites: true`, so a
  reader can never observe a torn document. The service singleton is the
  single owner and single writer of the item store.
- **Mark-read and refresh** are direct in-process calls into that single
  owner, so there is no cross-process write race that could lose a keystroke.

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
   and space is rejected). The service re-tests that exact pattern
   immediately before building the `--exec` action, and single-quotes the
   URL inside it. The `xdg-open` path from the panel passes an argv list
   (no shell) with the same check at the point of use. URLs are validated
   at parse into state and again at every point of use.
5. Notification argv safety: the service puts every flag first and passes
   the two feed-derived positionals (headline, body) last behind `--`,
   with a defensive leading-dash strip, so an option-shaped feed title
   can never be parsed as an option by `notify-send`.
6. Bounded parsing and rendering: 64 KB per field-scan (the two lazy
   regexes are the ReDoS surface, so their input is capped before they
   run, a 2 MB CDATA-bomb body parses in well under a second, tested),
   60 items per source, an unconditional 400-item store cap (an earlier
   unread-exempt cap let a hostile feed list grow the state file past the
   parse bound and dark the plugin), and hard per-lane row caps in the
   panel.
7. Notifications go through `omarchy-notification-send` with sanitized
   text; more than three new items collapse into one summary, so a feed
   cannot storm the notification daemon.
8. User-added feeds are bounded and host-screened: at most 50 extra
   sources, and a feed whose host is a literal IP or a private-network
   suffix (`.local`, `.internal`, `localhost`) is refused, so an
   attacker-authored source list cannot turn the service into an
   internal-endpoint prober.
9. Writes go through `FileView`'s atomic-write path, so the plugin inherits
   the shell's own write discipline rather than reimplementing it.
10. There is exactly one owner of the item store (the service singleton), so
    the cross-process read-modify-write race a separate poller CLI creates
    cannot happen: a mark-read is never reverted by a concurrent poll.

## What this plugin reads and writes

- Reads: the twenty-nine curated feed URLs (GET), optional user-added
  feeds from `extra-sources.json` (https only, public hosts only),
  `~/.config/omarchy/shell.json` (its own settings entry), and the file *names* under
  `~/.local/state/omarchy/agents/usage/` for personalization (never file
  contents).
- Writes: only `~/.local/state/omarchy/listening-post/`. Safe to delete at
  any time.
- No account, no token, no cookies, no telemetry. Nothing is ever sent
  anywhere; every network call is a GET for a public document.

## Reporting

Open an issue on this repository or email jeremy@intentsolutions.io.
