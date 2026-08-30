# Listening Post QML service contract

The service owns one fixed module ID and fetches exactly the 29 HTTPS URLs
compiled into `Model.SOURCES`. Every request uses the same no-redirect,
12-second, 2,000,000-byte curl boundary. No user-controlled host reaches the
request argv.

Before state is loaded or written, the service creates its private directory
with mode 0700. Persisted data always passes through `Model.parseState`; feed
bodies always pass through `Model.parseFeed`, normalization, retention, and
sanitization before the bar or panel can render them.

The bar resolves the service through the shell. The panel consumes only its
bounded store and exposes pointer, keyboard, and IPC paths. Offline contract
tests keep the manifest, entry points, module ID, network boundary, persistence
lifecycle, accessibility metadata, copy, banner, and render evidence aligned.
Buzz E2E proves those parts together in a real Omarchy shell.
