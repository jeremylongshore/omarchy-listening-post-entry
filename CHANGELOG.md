# Changelog

Notable changes to Perception and its Listening Post Omarchy companion.

Entries are derived from this repository's commit history, so every line
corresponds to a real change. The format follows Keep a Changelog and the
project uses Semantic Versioning.

Regenerate with `scripts/gen-changelog.sh`.

## [Unreleased]

### Added

- Build the Perception React signal room, Fastify API, SQLite persistence,
  shared contract-v1 package, curated ingestion, account topics, ranked signals,
  daily briefs, source health, and account/device management.
- Grant paid accounts from signed, catalog-scoped Lemon Squeezy subscription
  webhooks and authenticate the normalized purchase email with passwordless
  magic links and secure browser sessions. Firebase and GitHub OAuth are not
  authentication dependencies.
- Connect Listening Post to a paid Perception account with a revocable device
  token and render its ranked signals, source health, and five-item brief.
- Exchange ten-minute, single-use pairing codes for hash-only device tokens so
  the reusable credential never appears in browser copy, shell history, or
  process arguments.
- Reconcile the configured Lemon Squeezy store before production startup and
  every six hours, with bounded pagination, timeouts, run receipts, and the same
  idempotent processor used for signed webhooks.
- Open safe source links or a selected signal's canonical Perception deep link,
  and sync local read actions back to the account.

### Changed

- Treat Perception as the primary web product and Listening Post as its free,
  compact Omarchy interface. Wait State remains a separate plugin.
- Move the canonical product route to `https://oma.intentsolutions.io/perception/`
  under the shared OMA portfolio and retire the standalone web hostname.
- Publish the real React product experience at the canonical route while
  keeping checkout, demo state, and production analytics fail closed until the
  paid provider configuration is approved.
- Keep the original 29-source poller as unpaired migration behavior. After the
  first valid Perception response, retain only the last-good account field
  through offline, authentication, entitlement, and malformed-response states.

### Security

- Carry one-time magic-link tokens in a browser fragment, clear the fragment,
  and exchange through an origin-checked POST so mail-scanner GETs cannot consume
  a login or place its token in an HTTP request URL.
- Fail production startup before database open or listen when paid catalog,
  webhook signing, reconciliation authority, SMTP, checkout, persistent
  storage, canonical origins, or ingestion controls are missing or unsafe.
- Verify and idempotently apply initial-order and renewal-invoice full refunds,
  preserve access for partial refunds, and keep a separate valid subscription
  usable when another subscription for the same email has been refunded.
- Retain access during `past_due` payment retries but deny `unpaid` access once
  provider recovery attempts are exhausted, while preserving billing recovery.
- Redact authentication, webhook, cookie, and ingestion credentials from
  structured production logs; add database readiness and SMTP startup checks.
- Keep the bearer token out of `shell.json` and the QML object graph. An
  interactive no-echo connector writes a mode-0600 curl config inside a
  mode-0700 directory. A short-lived descriptor-bound helper reads it and sends
  the bearer header to curl on standard input, never argv or logs.
- Move runtime state and shell-settings reads behind the same descriptor-bound
  helper, with bounded no-follow reads, locked atomic state writes, identity
  checks, and hostile symlink, FIFO, size, mode, entry-race, and parent-race
  regression coverage.
- Accept only the canonical Perception API origin and strictly validate the
  shared bounded contract, including unknown-field rejection and exact resource
  limits, before replacing last-good data.

### Testing

- Add a continuous Lemon-purchase-to-device-revocation API journey, scanner-safe
  browser authentication coverage, production configuration validation, desktop
  and mobile browser checks, an exact-tree non-root Docker smoke test, and an
  isolated-volume database restore rehearsal.
- Add pre-launch schema migration, provider timeout/restart recovery, refund
  replay, single-use pairing, incorrect callback/hostname, and public OMA
  subpath refresh coverage.

## [1.2.0] - 2026-08-29

### Changed

- Widen the live panel so all four signal lanes remain legible in marketplace
  previews and on real Omarchy desktops.
- Replace generic marketplace copy with two exact 500-character descriptions
  that explain the product, its interaction model, and its privacy boundary.
- Start each bounded source fetch within the first refresh pass and cap every
  request at twelve seconds.

### Security

- Reject URLs containing userinfo before opening any feed link.
- Create the private state directory with mode 0700 before loading or persisting
  Listening Post state.
- Bound optional provider personalization to 64 local file names without reading
  their contents.

### Testing

- Add 91 offline tests with enforced 95% line, statement, and function coverage,
  90% branch coverage, three repeated concurrent race runs, and a 90% mutation
  score floor.
- Add the current C28-C43 fail-closed submission lane, ShellCheck, audit-harness
  integrity checks, and a real Buzz production-shell E2E render receipt.
- Require an exact hash-bound human approval of the marketplace preview before
  the presentation gate can pass.

## [1.1.0] - 2026-08-25

### Removed

- **Custom feed hosts.** `extra-sources.json`, `Service.extraSources()`, the
  `extrasFile` reader and `Model.isPublicHost()` are gone. This was the only path
  by which the plugin fetched a host it did not ship.

### Security

- Close the request-forgery surface reported on marketplace submission 1229 by
  removing the feature rather than by hardening the allowlist again. Three rounds
  of review established that a host policy can only validate the name: a userinfo
  bypass (`https://user@127.0.0.1/feed`), then the alternate IPv4 spellings
  `inet_aton` accepts (`127.1`, `0177.0.0.1`), and finally the finding that an
  attacker-controlled hostname resolves to whatever its owner points it at, with
  DNS rebinding defeating any separate lookup. The resolution belongs to `curl`,
  which the parse layer never runs, so no amount of parsing could reach it.
- Every fetched source is now a compile-time constant in `Model.SOURCES`. Two
  regression tests assert that `Model.isPublicHost` is `undefined` and that every
  source URL is a hardcoded https constant, so reintroducing a name-only allowlist
  fails the suite rather than shipping quietly.

## [1.0.0] - 2026-08-22

### Security

- Address four-reviewer panel findings (2 BLOCK security, 2 BLOCK correctness, taste, idiom)
- Bound every Text so the panel cannot clip its own content
- Reject URL userinfo in the imported-feed host filter
- Bound the hero subheader and regenerate the preview from a live render
- Reject every IPv4 form inet_aton accepts, not just the dotted quad

### Added

- Listening Post v1.0.0 - curated AI vendor release radar
- Expand curated sources 13 -> 29 from the monitor fleet; fix banner clip

### Fixed

- Remove the node runtime dependency, poll from QML instead
- Correct the source count and drop the removed OPML claim

### Internal

Tooling and repository changes with no effect on the shipped plugin.

- Add banner hero and correct the test count to 56
- Correct recapture flags, stale host comment, and test count after expansion
- Vendor the submission gate lane, CI and a pre-push hook
- Pin the vendored lane to a manifest and refuse to run it unverified
- Re-sync the vendored lane and add an advisory freshness check
- Vendor c40, the panel design gate, and repair the sync that dropped it
- Vendor rig-render, which loads the plugin into a real shell
- Add four-lane MiniMax review and backfill the changelog
