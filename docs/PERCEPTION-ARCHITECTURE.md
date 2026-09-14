# Perception and Listening Post architecture

Perception is the primary web product. Listening Post is its compact Omarchy client. The old `perception/` repository is read-only reference; this repository owns both deliverables and their shared contract.

```text
oma.intentsolutions.io/perception/ (shared GitHub Pages site)
  └─ Perception React web app
       ├─ account, topics, signals, briefs, source health
       └─ browser session + device management
                         │ HTTPS
                         ▼
api.perception.intentsolutions.io (Intent Solutions VPS)
  └─ Caddy ── Fastify API ── SQLite mounted volume
       ├─ signed Lemon Squeezy subscription webhooks
       ├─ passwordless email delivery over Intent Solutions SMTP
       └─ bounded 15-minute curated-source ingestion
                         │
                         │ GET /v1/snapshot
                         │ Authorization: Bearer <device token>
                         ▼
Listening Post Omarchy plugin
  ├─ compact signal radar and brief
  ├─ safe source/deep links
  └─ last-good local cache for offline or failed requests
```

`packages/perception-contract` owns the platform-neutral v1 types, runtime validator, JSON Schema, and canonical fixture consumed by the web app, Fastify API, tests, and mirrored strictly by the ES5 QML client parser.

The repository versions its deliverables independently: the existing Omarchy
plugin retains its SemVer line, while the new web, API, and shared-contract
packages begin on their own `0.1.x` line. A differing package version is not an
indication that their contract versions differ; the shared snapshot declares
its contract version explicitly.

GitHub Pages serves only static browser assets. It is not a trusted compute or persistence boundary. The API is a separately deployed Docker workload, bound to loopback behind Caddy, and SQLite lives on a persistent host volume rather than in the container image. Firebase is not part of this architecture.

## Trust boundaries

- Lemon Squeezy subscription webhooks are the entitlement authority. The API verifies `X-Signature` against the exact raw body, requires the configured store and variant, rejects test-mode grants in production, records delivery idempotently, and ignores stale lifecycle updates.
- Browser authentication uses a passwordless link sent only when the normalized purchase email has an entitlement. Requests return the same accepted response for known, unknown, and malformed addresses. The token travels in a web URL fragment, is cleared by the client, and is exchanged through an origin-checked POST so mail-scanner GETs cannot consume it or place it in an HTTP request URL. Links expire after 15 minutes, work once, and are stored only as hashes.
- Browser sessions are opaque secure, HTTP-only, same-site cookies scoped to the API origin. Identity and current entitlement are checked on every account-scoped product operation. The account/billing endpoint remains available to a signed-in expired customer so they can reach the Lemon Squeezy portal.
- Omarchy devices use revocable, high-entropy bearer tokens created from an authenticated browser session. Only token hashes are stored server-side.
- Device authentication also rechecks the owning account's current entitlement, so expiring a subscription stops both web and plugin product access without rotating credentials.
- The plugin sends its token only to the configured Perception HTTPS origin and never includes it in logs, UI, links, or persisted snapshots.
- API responses contain bounded headlines, topic identifiers, reasons, source health, and HTTPS links-not article bodies.
- The QML client validates contract version, shape, bounds, and links before replacing its last-good cache.

## Interface direction

The web app is an editorial signal room rather than a generic analytics dashboard. Signal deep `#0c141b`, panel navy `#101a22`, rule slate `#26343d`, paper ink `#e8edf0`, signal amber `#efa84a`, and status cyan `#63c7c5` form the palette. Newsreader carries editorial headlines, Manrope carries interface copy, and DM Mono marks source/time/state data. The live signal ribbon is the signature device: it communicates source activity without becoming decorative dashboard noise.

## Intelligence pipeline

- The API owns the same 29 reviewed sources proven by Listening Post. Source URLs are compile-time constants; redirects are rejected and no user-controlled hostname enters the fetcher.
- Each source is fetched with a 12-second timeout and a streaming 2 MB ceiling. RSS and Atom parsing is capped at 60 entries per source and strips markup, controls, bidirectional overrides, and unsafe links before persistence. Article bodies are never stored.
- Stable source-and-guid hashes deduplicate repeated runs. Signals retain at most 45 days of history and the database retains the newest 100 ingestion receipts.
- Per-account ranking is deterministic: incidents always score 100 and sort first; release, pricing, and engineering lanes have explicit base scores; case-insensitive literal keyword matches add bounded topic weight and an explainable reason.
- Snapshot briefs accept a 1-168 hour window, default to 24 hours, and contain at most five ranked signals whose IDs and HTTPS links are present in the same response.
- Source failures update health without deleting previously stored signals. Snapshot freshness derives from the last run with at least one healthy source, so an all-source failure exposes the prior field as stale instead of pretending it was refreshed.
- The scheduler runs immediately at API startup and then every 15 minutes. Operators can run the same single-flight pipeline with `POST /v1/ingestion` and `X-Ingestion-Key`; the key is deployment-only.

## Delivery order

The durable execution graph lives in Beads under epic `lp-lt2`. Foundation and contract work precede the web and API features; both must exist before the native plugin integration; integrated verification and deployment close the graph.

## Deployment boundaries

- `web/` builds a static Vite artifact with base `/perception/`. The shared `intent-solutions-io/omarchy-plugins` portfolio owns the `oma.intentsolutions.io` CNAME and publishes the artifact under `site/perception/`; this repository must not claim that shared custom domain with its own CNAME.
- `api/` builds a Docker image from the repository root so the shared contract is included. Production data mounts at `/data/perception.db`.
- The API listens on loopback port `8790` (port `8787` is already allocated to the Mandy sidecar); production exposure is through the governed VPS/Caddy deployment lane at `api.perception.intentsolutions.io`.
- Repository variables select the public API URL, Lemon Squeezy checkout URL, and demo behavior. Webhook signing secrets, SMTP credentials, device tokens, VPS access, and DNS credentials are deployment secrets and never enter source control.
- The VPS operator provisions `LEMONSQUEEZY_WEBHOOK_SECRET`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_VARIANT_IDS`, `LEMONSQUEEZY_CHECKOUT_URL`, `SMTP_*`, and `INGESTION_KEY` in `/srv/perception-src/.env`; the reusable deploy workflow does not carry product credentials through GitHub Actions.
- Production configuration is fail-closed: the API refuses to listen when the canonical origins, paid catalog, webhook signing secret, checkout URL, SMTP delivery, persistent database path, or ingestion controls are missing or unsafe. A bare `/healthz` therefore cannot mask a product with broken login or billing configuration.
- Lemon Squeezy must send `subscription_created`, `subscription_updated`, `order_refunded`, and `subscription_payment_refunded` to `https://api.perception.intentsolutions.io/v1/billing/webhook`. Access follows a fail-closed lifecycle policy: `on_trial`, `active`, `paused`, and `past_due` remain entitled; `unpaid` and `expired` are denied; a cancelled subscription is denied once its recorded `ends_at` grace period passes. Full initial-order and renewal-invoice refunds create an explicit local revocation while partial refunds are recorded without revoking access.
- The API performs a store-scoped reconciliation at startup before listening and every six hours afterward. Reconciliation is paginated, bounded, timeout-protected, and uses the same idempotent entitlement processor as webhooks.

Production setup, privacy handling, backup and recovery, credential containment,
smoke checks, and rollback are defined in `docs/PERCEPTION-OPERATIONS.md`.
