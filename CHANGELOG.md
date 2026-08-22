# Changelog

Notable changes to Listening Post.

Entries are derived from this repository's commit history, so every line
corresponds to a real change. The format follows Keep a Changelog and the
project uses Semantic Versioning.

## [Unreleased]

Nothing yet.

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
