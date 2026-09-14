# Marketplace contract

Listening Post ships one bar widget and one service whose listing copy and
runtime behavior tell the same product story.

- Root and bar-widget descriptions are identical and stay within the 500-character
  allowance.
- Copy names Perception, the ranked field and brief, account read sync, private
  device-token transport, last-good behavior, local migration fallback, and the
  article-body and telemetry boundaries.
- `assets/banner.svg` identifies Listening Post and depicts its release radar.
- `preview.png` is accepted only with current-tree Buzz provenance, exact
  1280x720 dimensions, a clean shell-log hash, and visual approval.
- Paired mode fetches only the canonical Perception API. Unpaired migration mode
  fetches only the 29 compiled HTTPS feeds. Neither follows redirects, accepts a
  custom host, nor requests article pages.

`tests/contract.test.js`, `contracts/qml-service.md`, and gate C43 enforce the
machine-checkable portions.
