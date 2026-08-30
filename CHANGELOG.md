# Changelog

Notable changes to Listening Post.

Entries are derived from this repository's commit history, so every line
corresponds to a real change. The format follows Keep a Changelog and the
project uses Semantic Versioning.

Regenerate with `scripts/gen-changelog.sh`.

## [Unreleased]

Nothing yet.

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
