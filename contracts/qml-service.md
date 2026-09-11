# Listening Post QML service contract

The service owns one fixed module ID and has two explicit modes. Before pairing,
it fetches exactly the 29 HTTPS URLs compiled into `Model.SOURCES` as a migration
fallback. With a valid device token, it fetches a contract-v1 snapshot only from
`https://api.perception.intentsolutions.io`. Other configured origins fail closed.
Every request has a no-redirect, 12-second, 2,000,000-byte boundary.

Before state is loaded or written, the service creates its private directory
with mode 0700. Persisted data always passes through `Model.parseState`; feed
bodies always pass through `Model.parseFeed`, normalization, retention, and
sanitization before the bar or panel can render them.

The interactive `connect-perception.sh` helper reads the one-time token without
echo and writes `~/.config/perception/listening-post.curlrc` inside a mode-0700
directory with file mode 0600. QML never reads the credential contents. Curl
receives only the fixed config path in argv. The token never enters `shell.json`,
the QML object graph, `state.json`, links, notification copy, command arguments,
or logs. A successful snapshot activates sticky remote mode; later network,
authentication, entitlement, or validation failures retain the last-good remote
field and never blend local results into it.

Remote read actions update immediately in memory and enter a bounded durable
queue. Successful writes and signals already removed by server retention advance
the queue; transient and authentication failures remain queued for a later retry.

The bar resolves the service through the shell. The panel consumes only its
bounded store and exposes pointer, keyboard, and IPC paths. Offline contract
tests keep the manifest, entry points, module ID, network boundary, persistence
lifecycle, accessibility metadata, copy, banner, and render evidence aligned.
Buzz E2E proves those parts together in a real Omarchy shell.
