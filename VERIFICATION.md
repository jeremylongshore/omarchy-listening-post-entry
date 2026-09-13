# Verification record

What has actually been proven, how, and what remains.

## Unit suite (dev box + CI)

**104 plugin tests and 7 shared-contract tests, all passing** (`npm test`), offline. The whole `Model.js` data
layer: the RSS and Atom parsers against captured bodies from all twenty-nine
live sources, format detection anchored to the document root, lane
classification, ISO-week clustering by source with product labels, the
quiet-changelog collapse, merge and unconditional retention cap, read-state,
notification gating, personalization mapping, the state
record, strict Perception contract parsing, and native deep links. Security regressions are pinned: `safeUrl` rejecting every shell
metacharacter, and `parseFeed` returning in under a second on a 2 MB
unterminated-CDATA body, arbitrary API origins failing closed, and device tokens
remaining outside argv and `state.json`. The API suite separately proves
the full purchase-email account and entitled-device lifecycle.

## Integrated Perception product (2026-09-13)

The final local tree passes `npm run test:product` and
`npm run build:product`:

- **104 plugin tests** pass with 100% statement, line, and function coverage
  and 95.56% branch coverage for `Model.js`.
- **7 shared-contract tests** pass, including strict native-safe signal IDs,
  HTTPS links, unknown-field rejection, exact resource bounds, ordered time
  windows, and brief-reference integrity.
- **8 web tests and 65 API tests** pass, for **184 tests across the complete
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
- The real application is live at `https://oma.intentsolutions.io/perception/`
  through portfolio PRs 20, 21, 22, 24, and 25. The final published revision is
  `d77d73b25555d5a26e4d5ffa82aa782105384b48` from GitHub Pages run
  `34736344176`. Final desktop and 390 px browser probes returned HTTP 200 for
  the root and support query route, one page heading, no horizontal overflow,
  and zero console errors; versioned `index-k8OO506T.js`, CSS, and
  `favicon-B3SB3wD4.svg` assets return 200.
  Illustrative content and pending checkout are explicitly labeled.
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
  `sha256:5776a08d4b45f29d45811ffc14cadd22bc923699531a92b5a5dd8c79c6be3f0e`
  (265,599,860 bytes). A disposable development-shaped smoke container ran as
  the non-root `node` user, returned HTTP 200 from `/healthz` and the
  database-backed `/readyz`, reported SQLite integrity `ok`, exposed all 22
  application tables, and contained the `refunds_seen` migration. A separate
  production-start attempt with intentionally absent provider configuration
  exited 1 before listen and named only missing field names.
- An online SQLite backup of that exact image, SHA-256
  `24a69eb6134924629b4a6df273f01e81d5f16e3945aa3a0375603d5114abc012`,
  preserved a controlled account marker, restored into a separate empty named
  volume, passed `/readyz`, retained the marker and all 22 tables, and reported
  integrity `ok`. The two explicitly named temporary containers, volumes, and
  backup file were removed after verification. A prior rehearsal also proved a
  populated 29-source ingestion backup/restore; production ingestion itself is
  still blocked on deployment.
- A production-mode browser journey proved the purchase-email login screen,
  non-enumerating magic-link response, checkout route, desktop layout, and
  responsive mobile layout. A separate integrated snapshot journey proved
  signal deep-link focus, ranked rows, the five-item brief cap, and Omarchy
  pairing UI without browser console errors.
- The prior Buzz rig accepted the package with the real
  `omarchy-plugin-validate` command and Qt 6 `qmllint` found no QML syntax
  errors. `qmllint` is not installed in the present environment; current QML
  behavior is therefore covered by the contract/static suite, not represented
  as a fresh rig run.
- `npm audit --omit=dev` is clean in the root, web, and API packages; gitleaks
  found no secret; actionlint accepted every workflow; three repeated
  concurrent plugin-suite runs passed.
- `npm run test:mutation` evaluated 1,636 mutants: 1,479 killed, 6 timed out,
  151 survived, none were uncovered or errored, and the 90.77% score passed the
  unchanged 90% breaking threshold.
- A fresh document-consistency pass found no deterministic domain, license,
  version, runtime, or relative-link contradiction. It aligned the README's
  root validation commands with CI, documented the optional Perl pairing
  helper, preserved independent package version lines, and kept incomplete
  production claims explicitly marked. The default authority registry was not
  present, but no conflicting unowned fact required adjudication.

The account boundary is deliberate: Lemon Squeezy subscription webhooks are
the entitlement authority, and the normalized purchase email is the account
identity. Browser access is passwordless and cookie-based. Omarchy gets a
separate high-entropy, revocable device token whose hash alone is stored by the
API. Firebase and GitHub OAuth are not authentication dependencies.

Fixtures were captured 2026-08-20 from all twenty-nine live sources; the two
URLs that had moved that day (Google AI blog, Anthropic status → status.claude.com)
were re-pointed before capture. Recapture procedure: `docs/FIXTURES.md`.

## No Node/Python polling proof (historical rig)

The graphical poller ships no Node or Python daemon. This matters because a
stock Omarchy graphical session does not expose mise's Node shim. The optional
one-time pairing command added after this rig receipt uses shell, curl, and a
Perl credential helper, then exits; it is not part of the polling process.

Proven on the Omarchy rig by installing the plugin and then **shadowing `node`
with a stub that exits 127** before launching the shell:

- [x] `omarchy plugin add <github-url> --enable` clones and enables cleanly
- [x] the then-current installed tree contained no runtime daemon
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
  now unconditional), and symlink-follow in the atomic write (`wx` flag).
  The custom-feed and OPML surface was subsequently removed entirely, closing
  the extras-growth and private-host request-forgery path instead of screening
  user-supplied hosts.
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

The current QML package is statically proven by 104 plugin tests and strict
contract fixtures. The earlier package passed the real Omarchy validator and
Qt lint; those tools were not available for a fresh run here. Its earlier local-feed
mode was also proven by a live rig render. A live compositor journey against a
deployed Perception account-including offline recovery-is not yet proven.

The exact-tree Docker build, disposable runtime, fail-closed production start,
and isolated backup/restore are proven. Shared Docker cache was left intact
because it may belong to other projects. GitHub-backed install, upgrade,
application-revision rollback, and an exact-revision source publication remain
unproven because this repository explicitly states `Git authority: no git
operations`. The real React customer surface is deployed at
`https://oma.intentsolutions.io/perception/` through the portfolio repository;
the production API, Lemon Squeezy catalog/webhook, delivered transactional
email, production ingestion, and live pairing are not deployed or proven. The
remaining gates are tracked in Beads and `docs/PERCEPTION-ROLLOUT.md`.
