# Verification record

What has actually been proven, how, and what remains.

## Unit suite (dev box + CI)

**96 plugin tests and 5 shared-contract tests, all passing** (`npm test`), offline. The whole `Model.js` data
layer: the RSS and Atom parsers against captured bodies from all twenty-nine
live sources, format detection anchored to the document root, lane
classification, ISO-week clustering by source with product labels, the
quiet-changelog collapse, merge and unconditional retention cap, read-state,
notification gating, personalization mapping, OPML round-trip, the state
record, strict Perception contract parsing, and native deep links. Security regressions are pinned: `safeUrl` rejecting every shell
metacharacter, and `parseFeed` returning in under a second on a 2 MB
unterminated-CDATA body, arbitrary API origins failing closed, and device tokens
remaining outside argv and `state.json`. The API suite separately proves
the full purchase-email account and entitled-device lifecycle.

## Integrated Perception product (2026-09-11)

The final local tree passes `npm run test:product` and
`npm run build:product`:

- **96 plugin tests** pass with 100% statement, line, and function coverage
  and 92.95% branch coverage for `Model.js`.
- **5 shared-contract tests** pass, including strict native-safe signal IDs,
  HTTPS links, resource bounds, and brief-reference integrity.
- **7 web tests and 53 API tests** pass, for **161 tests across the complete
  product**. The API total includes one continuous
  customer journey: a signed Lemon Squeezy subscription webhook grants the
  purchase email, a one-time magic link creates the browser session, the
  customer saves a topic, ingestion creates a signal and brief, the browser
  creates a device, the device reads the same snapshot and marks a signal
  read, the browser observes that state, and revocation immediately rejects
  the device.
- The public customer surface, first-value activation guide, optional Listening
  Post pairing, account controls, and privacy/support/terms/acceptable-use routes were exercised
  from the production Vite artifact at 1440 px and 390 px. The final captures
  have no horizontal overflow or browser console errors. The one-pass
  Impeccable mechanical detector returned no findings. The final independent
  visual verdict scored all requested contrast, legal-draft signaling, and
  mobile policy-target fixes resolved and returned `ship`.
- Lifecycle messages are written to a durable SQLite outbox before delivery.
  Tests prove idempotent creation, single delivery, stale-claim recovery, retry
  backoff, accessible HTML plus plain text, and safe escaping of customer names.
  Funnel events use a closed vocabulary, reject extra fields and browser-forged
  purchase events, and are retained for 90 days.
- Purchase-email links carry their one-time token in a browser fragment, which
  is never sent in an HTTP request. The web app clears it before an
  origin-checked JSON POST exchange. Tests prove that a scanner-prefetched GET
  cannot consume the link, a missing origin is denied, and replay fails. A
  headless Chromium run against the production Vite artifact observed exactly
  one token-bearing POST body, no token in any request URL, immediate fragment
  removal, the authenticated snapshot/account/device requests, three rendered
  signal rows, and zero console errors.
- Production configuration tests prove the API refuses to listen with missing
  paid-login services, non-canonical origins, an unsafe catalog or checkout,
  test-mode billing, an ephemeral database path, disabled ingestion, weak keys,
  or malformed SMTP settings. Validation errors name fields without echoing
  secret values.
- The production TypeScript/Vite builds for the web application and API pass.
- The exact current API tree builds as Docker image
  `sha256:383e1e69ad172d7ec0c76f1c2272d6df571f387fc2f5ad1e0d5edec945f6104e`
  (265,555,030 bytes). A disposable production-configured container ran as the
  non-root `node` user, returned the contract-v1 health payload, reported SQLite
  integrity `ok`, contained the durable `customer_messages` and `product_events`
  tables, and stopped cleanly. Its anonymous data volume and container were
  removed automatically. The earlier full 29-source ingestion and recovery
  rehearsal below used the immediately preceding API image; the newly added
  schema is additive and separately covered by the current 53-test API suite.
- An isolated-volume recovery rehearsal gracefully stopped a populated source
  database (1 ingestion run, 29 source-health rows, 293 signals), copied it to
  a backup with SHA-256
  `1190f8e767a094179451f71fff6f89fdac06b23331b351d81f27bca674c34377`,
  restored that backup into a separate empty volume, and started the exact same
  image from it. The restored API returned the expected health response,
  SQLite integrity remained `ok`, the original run was retained, and a new
  scheduled ingestion completed. Both temporary volumes and the backup file
  were then removed.
- A production-mode browser journey proved the purchase-email login screen,
  non-enumerating magic-link response, checkout route, desktop layout, and
  responsive mobile layout. A separate integrated snapshot journey proved
  signal deep-link focus, ranked rows, the five-item brief cap, and Omarchy
  pairing UI without browser console errors.
- A fresh temporary Buzz rig accepted the package with the real
  `omarchy-plugin-validate` command. Qt 6 `qmllint` found no QML syntax errors;
  standalone lint emitted only the expected unresolved shell import warnings
  because the shell import path is supplied by the compositor.
- `npm audit --omit=dev` is clean in the root, web, and API packages; gitleaks
  found no secret; actionlint accepted every workflow; three repeated
  concurrent plugin-suite runs passed.
- A release consistency audit scanned 19 Markdown artifacts with no broken
  relative links, license/runtime conflict, stale authentication claim, or
  domain contradiction. It aligned the README command lane with CI, documented
  independent package version lines, and brought the root description and
  Unreleased changelog forward to the web-product architecture.

The account boundary is deliberate: Lemon Squeezy subscription webhooks are
the entitlement authority, and the normalized purchase email is the account
identity. Browser access is passwordless and cookie-based. Omarchy gets a
separate high-entropy, revocable device token whose hash alone is stored by the
API. Firebase and GitHub OAuth are not authentication dependencies.

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

The current QML package is statically proven by the real Omarchy validator,
Qt lint, 96 plugin tests, and strict contract fixtures. Its earlier local-feed
mode was also proven by a live rig render. A live compositor journey against a
deployed Perception account—including offline recovery—is not yet proven.

The exact-tree Docker build and disposable runtime are proven. The host still
has very little free disk space, and shared Docker cache was left intact because
it may belong to other projects. GitHub-backed install, upgrade,
application-revision rollback, and an exact-revision submission run remain
unproven because this workspace session explicitly forbids all Git operations.
Database backup and isolated restore are proven locally. The customer product is
rollout-ready as a local artifact, but no production DNS, Lemon Squeezy, SMTP,
database, or VPS deployment has been performed. The remaining operator-owned
gates are tracked in Beads and enumerated in `docs/PERCEPTION-ROLLOUT.md`.
