## Last Updated
2026-09-11 by /start-here

# Marketing Stack

## Product Surface

- Product: Perception web signal room with Listening Post as its Omarchy companion.
- Launch goal: Ship the integrated product at `https://oma.intentsolutions.io/perception/`.
- Frontend host: GitHub Pages with a custom domain.
- Secure API host: Fastify in Docker on the Intent Solutions VPS, behind Caddy at `api.perception.intentsolutions.io`.
- Initial persistence: SQLite on a mounted VPS volume.
- Commerce and entitlement: Lemon Squeezy subscription webhooks, scoped to Perception's store variants.
- Browser identity: Passwordless purchase-email links delivered by the API over Intent Solutions SMTP; no Firebase or social-login dependency.

## Connected Marketing Tools

- Image/video generation: Not detected.
- Transactional email: Intent Solutions SMTP configuration is supported; production credentials are not present in source.
- Commerce: Lemon Squeezy integration is implemented; store, variant, and signing configuration remains deployment-owned.
- Product analytics: Not detected.
- Social scheduling: Not detected.

## Rollout Decisions Still Owned Outside Source

- Lemon Squeezy price, billing interval, product/variant identifiers, and checkout URL.
- Production SMTP credentials and final customer-facing sender/support mailbox.
- Legal entity wording and refund window.
- DNS and hosting changes for the web and API domains.
- GitHub publication and marketplace submission authority.

No `.env` integrations were present during the project scan. Secrets are never recorded here.
