# Verification record

What has actually been proven, how, and what remains.

## Unit suite (dev box + CI)

**72 tests, all passing** (`npm test`), offline. The whole `Model.js` data
layer: the RSS and Atom parsers against captured bodies from all twenty-nine
live sources, format detection anchored to the document root, lane
classification, ISO-week clustering by source with product labels, the
quiet-changelog collapse, merge and unconditional retention cap, read-state,
notification gating, personalization mapping, OPML round-trip, and the state
record. Security regressions are pinned: `safeUrl` rejecting every shell
metacharacter, and `parseFeed` returning in under a second on a 2 MB
unterminated-CDATA body.

Fixtures were captured 2026-08-20 from all twenty-nine live sources; the two
URLs that had moved that day (Google AI blog, Anthropic status → status.claude.com)
were re-pointed before capture. Recapture procedure: `docs/FIXTURES.md`.

## Node-free proof (the install-actually-works test)

The plugin ships **no external runtime**: no `bin/`, no node, no python. This
matters because a stock Omarchy install has no node on the graphical session
PATH (Omarchy installs node through mise, whose shims are not exported to the
session), so a plugin with a node poller would silently never populate for a
real user even though it works on a developer box.

Proven on the Omarchy rig by installing the plugin and then **shadowing `node`
with a stub that exits 127** before launching the shell:

- [x] `omarchy plugin add <github-url> --enable` clones and enables cleanly
- [x] the installed tree contains **no `bin/` directory** at all
- [x] with node shadowed out of PATH, the QML service still polled
      **29/29 sources, 324 items**, and wrote its state file
- [x] the panel rendered every lane from that store (status incidents, model
      releases with product labels and collapsed changelog rows, pricing,
      engineering posts)
- [x] no plugin-sourced errors in the shell log

## Live poll (real feeds)

The QML service run against the real feeds: **29/29 sources ok, 324 items**
classified across the four lanes; the first-run baseline leaves the pill
quiet; a second poll preserves read flags; mark-read and mark-all-read take
effect synchronously in the service's store and persist through `FileView`.
State file weighs ~100 KB, an order of magnitude under the 2 MB parse bound.

## Four-reviewer panel (2026-08-20, pre-submission)

Security, correctness, taste, and Omarchy-idiom reviews ran against the built
plugin. What they caught and this repo then fixed:

- **Security (BLOCK):** the confirmed RCE path, Omarchy dispatches a
  notification click action as `bash -lc "<value>"` (verified in
  `Commons/Util.qml` `execDetached`), and the `--exec 'xdg-open ' + url`
  string reached it with only a whitespace/quote filter on the URL. Fixed:
  `safeUrl` now admits a strict URL charset with no shell-active byte, the
  poller re-tests and single-quotes the URL in the action, and feed-derived
  notification positionals go behind `--` with a leading-dash strip so an
  option-shaped title cannot be parsed as an option. Also fixed: quadratic
  ReDoS in the two lazy-scan regexes (input now capped at 64 KB), the
  unread-exempt store cap that let a hostile OPML dark the plugin (cap is
  now unconditional), symlink-follow in the atomic write (`wx` flag), OPML
  extras growth and private-host SSRF (capped and host-screened).
- **Correctness (BLOCK):** the poll's stale-snapshot write reverted a
  concurrent mark-read (poll now re-reads on-disk read flags before
  writing), and the panel's busy-guard dropped a mark-read keystroke that
  arrived while a write was in flight (keystrokes now queue and flush in
  `markProc.onExited`). Also fixed: `mergeItems` mutating caller objects in
  place (now clones before update), and format detection content-sniffing
  the whole body (now anchored to the document root).
- **Taste:** the release lane conflated vendor with product (Claude Code
  releases merged with the Anthropic SDK), clustering is now by source with
  a product label column and a bare-tag title, so a row never doubles its
  own name; raw changelog commit subjects ("chore: update CHANGELOG.md")
  collapse to one honest "Claude Code changelog · N commits this week" row;
  resolved incidents are capped at two rows on a calm day; the empty-state
  and manifest copy were de-slopped; the README source arithmetic was
  corrected (six RSS + seven Atom).
- **Idiom:** the double-wired Enter (`returnRequested` + `activateRequested`
  fired `openSelected` twice) is now a single `activateRequested`; the dead
  `"x"` branch in `onTextKey` (the catcher consumes `x` as `deleteRequested`
  first) was removed. Every BarWidget/Panel/Service contract was confirmed
  byte-faithful to the marketplace-proven MLB Booth sibling and the
  first-party agents/battery conventions.

## Proven on the Omarchy rig (2026-08-20)

- [x] `omarchy-plugin-validate .` exit 0
- [x] `qmllint BarWidget.qml Panel.qml Service.qml` 0 errors
- [x] Installed as a `service` + `bar-widget`; the QML service polled the
      real feeds and wrote state with no external runtime
- [x] Panel opened: STATUS INCIDENTS (2 resolved rows), MODEL RELEASES with
      product-labelled rows ("Claude Code v2.1.238 (+4 more this week)",
      "Anthropic SDK v1.0.0", "Google DeepMind Introducing Gemini 3.7 Flash"),
      the collapsed changelog summary row, PRICING AND LIMITS, ENGINEERING
      POSTS, all from real feed data
- [x] `preview.png` captured from that live render
- [x] No plugin-sourced errors in the shell log (only the standard headless
      pipewire/UPower/hyprland-socket noise)

## Honest boundary

The QML layer is proven by the rig render, not by unit tests; the data layer
is proven by 72 offline tests. The notification click action and the BYOK
paths are exercised by code inspection and the security fixes above, not yet
by a live notification click on a real desktop. Nothing in CI touches the
network.
