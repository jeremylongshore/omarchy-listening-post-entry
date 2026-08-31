# Marketplace contract

Listening Post ships one bar widget and one service whose listing copy and
runtime behavior tell the same product story.

- Root and bar-widget descriptions are identical and exactly 500 characters.
- Copy names the four lanes, panel actions, same-week clustering, optional
  filename-based ranking, fixed-source cadence, article-page boundary, and
  account/token/telemetry/custom-host exclusions.
- `assets/banner.svg` identifies Listening Post and depicts its release radar.
- `preview.png` is accepted only with current-tree Buzz provenance, exact
  1280x720 dimensions, a clean shell-log hash, and visual approval.
- The service fetches only the 29 compiled HTTPS feed URLs, without redirects,
  custom hosts, user-supplied URLs, or article-page requests.

`tests/contract.test.js`, `contracts/qml-service.md`, and gate C43 enforce the
machine-checkable portions.
