# Perception and Listening Post architecture

Perception is the primary web product. Listening Post is its compact Omarchy client. The old `perception/` repository is read-only reference; this repository owns both deliverables and their shared contract.

```text
waitstate.intentsolutions.io (GitHub Pages)
  └─ Perception React web app
       ├─ account, topics, signals, briefs, source health
       └─ browser session + device management
                         │ HTTPS
                         ▼
api.waitstate.intentsolutions.io (Intent Solutions VPS)
  └─ Caddy ── Fastify API ── SQLite mounted volume
                         │
                         │ GET /v1/snapshot
                         │ Authorization: Bearer <device token>
                         ▼
Listening Post Omarchy plugin
  ├─ compact signal radar and brief
  ├─ safe source/deep links
  └─ last-good local cache for offline or failed requests
```

`packages/perception-contract` owns the platform-neutral v1 types, runtime validator, JSON Schema, and canonical fixture consumed by the web app, Fastify API, tests, and eventually the QML client.

GitHub Pages serves only static browser assets. It is not a trusted compute or persistence boundary. The API is a separately deployed Docker workload, bound to loopback behind Caddy, and SQLite lives on a persistent host volume rather than in the container image. Firebase is not part of this architecture.

## Trust boundaries

- Browser authentication uses GitHub OAuth mediated by the API; browser sessions are secure, HTTP-only, same-site cookies scoped to the API origin. Account ownership is checked on every account-scoped operation.
- Omarchy devices use revocable, high-entropy bearer tokens created from an authenticated browser session. Only token hashes are stored server-side.
- The plugin sends its token only to the configured Perception HTTPS origin and never includes it in logs, UI, links, or persisted snapshots.
- API responses contain bounded headlines, topic identifiers, reasons, source health, and HTTPS links—not article bodies.
- The QML client validates contract version, shape, bounds, and links before replacing its last-good cache.

## Interface direction

The web app is an editorial signal room rather than a generic analytics dashboard. Signal deep `#0c141b`, panel navy `#101a22`, rule slate `#26343d`, paper ink `#e8edf0`, signal amber `#efa84a`, and status cyan `#63c7c5` form the palette. Newsreader carries editorial headlines, Manrope carries interface copy, and DM Mono marks source/time/state data. The live signal ribbon is the signature device: it communicates source activity without becoming decorative dashboard noise.

## Delivery order

The durable execution graph lives in Beads under epic `lp-lt2`. Foundation and contract work precede the web and API features; both must exist before the native plugin integration; integrated verification and deployment close the graph.

## Deployment boundaries

- `web/` builds a static Vite artifact and preserves `web/public/CNAME` for `waitstate.intentsolutions.io`.
- `api/` builds a Docker image from the repository root so the shared contract is included. Production data mounts at `/data/perception.db`.
- The API listens on loopback port `8790` (port `8787` is already allocated to the Mandy sidecar); production exposure is through the governed VPS/Caddy deployment lane at `api.waitstate.intentsolutions.io`.
- Repository variables select the public API URL and demo behavior. OAuth credentials, cookie secrets, device tokens, VPS access, and DNS credentials are deployment secrets and never enter source control.
- The VPS operator provisions `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `/srv/perception-src/.env`; the reusable deploy workflow does not carry product credentials through GitHub Actions.
