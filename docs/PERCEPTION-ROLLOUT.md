# Perception rollout gate

This is the live execution checklist for Perception. A production item is
checked only when its receipt proves the real service. Local tests, simulated
events, and a public pre-launch bundle are identified separately.

## Verified baseline, 2026-09-13 UTC

- [x] Canonical web route is `https://oma.intentsolutions.io/perception/`.
- [x] The retired `perception.intentsolutions.io` hostname was removed from
  product, plugin, email, campaign, architecture, and deployment references.
- [x] The real React application replaced the coming-soon page through
  portfolio PR 20, squash revision `883f0225dcd0051d53456d044f72f5a9ec7649a7`,
  and GitHub Pages deployment run 34733436768. Policy-boundary hardening was
  published through PR 22. The final strict-contract bundle and relative
  contract boundary was published through PR 24. The final fingerprinted
  subpath favicon was published through PR 25 at revision
  `d77d73b25555d5a26e4d5ffa82aa782105384b48` in deployment run 34736344176.
- [x] Public HTML, JS, CSS, favicon, canonical metadata, support route, desktop
  layout, mobile layout, and direct `/perception/` navigation were verified.
- [x] The verified operator is `IntentSolutions.io LLC`, a Delaware LLC. The
  verified support route is `support@intentsolutions.io`.
- [x] MXroute SMTP authentication and transport negotiation pass, and SPF,
  DKIM, DMARC, and MX records exist for `intentsolutions.io`.
- [x] The code-level customer journey covers authentication, signed webhook
  entitlement, one-time pairing, ingestion, ranked brief display, cancellation,
  full-refund revocation, duplicate delivery, replay denial, provider timeout,
  and restart recovery.
- [x] Product tests, builds, dependency audits, secret scan, database migration,
  and audit-harness gates pass. Exact commands and counts are in
  `VERIFICATION.md`.
- [x] Set repository web inputs `PERCEPTION_DEMO_MODE=false` and
  `PERCEPTION_API_URL=https://api.perception.intentsolutions.io`; provider and
  approved-commercial inputs remain intentionally absent.

## 1. Commercial and legal authority

- [x] Establish the legal operator and support mailbox from company and mail
  configuration evidence.
- [x] Make price, billing, refund, and policy copy configuration-driven and make
  production builds fail closed while approval is absent.
- [ ] Approve the exact values in the table below.
- [ ] Replace rollout-draft qualifiers only after the approved values are
  recorded in `PRODUCT.md` and the web production validator passes.

### Consolidated approval table

| Decision | Resolved evidence or launch-safe recommendation | State | Consequence if unchanged |
| --- | --- | --- | --- |
| Legal operator | `IntentSolutions.io LLC`, Delaware LLC | evidenced | none |
| Support | `support@intentsolutions.io`; MXroute forwarder and authenticated domain | evidenced | a controlled delivery is still required |
| Price | USD 9.00 per month | owner approval required | no production variant or checkout |
| Currency | USD | owner approval required | no production variant or checkout |
| Billing interval | Monthly | owner approval required | no production variant or checkout |
| Trial | No trial | owner approval required | checkout cannot state trial behavior |
| Refund | First payment refundable within 14 days through Lemon Squeezy; later payments handled as required by law or merchant-of-record policy | owner/counsel approval required | terms remain a rollout draft |
| Cancellation | Stop renewal; retain access through the paid-through `ends_at` date | implemented, owner approval required | terms remain a rollout draft |
| Governing law | Alabama recommended because the company is principally operated there; counsel must resolve Alabama versus Delaware | counsel/owner approval required | terms remain a rollout draft |

The price recommendation was calibrated against official prices checked on
2026-09-12: [Readwise Reader](https://readwise.io/pricing/reader) at $12.99
monthly or $119.88 annually, [Inoreader Pro](https://us.inoreader.com/pricing)
at $9.99 monthly or $7.50 per month billed annually,
[Ground News Premium](https://ground.news/checkout/premium?t=Nw%3D%3D) at $39.99
annually, and [Feedly Market Intelligence](https://feedly.com/market-intelligence/pricing)
at $1,600 per month billed annually. Perception should enter below specialist
reader monthly pricing, without an unproven trial or enterprise promise.

## 2. Lemon Squeezy and production email

- [ ] Obtain a Lemon Squeezy API key with store/product/webhook authority.
- [ ] Create test and live Perception variants matching the approved table and
  record the store ID, allowed variant ID, and canonical checkout URL.
- [ ] Create the signed webhook at
  `https://api.perception.intentsolutions.io/v1/billing/webhook` for
  `subscription_created`, `subscription_updated`, `order_refunded`, and
  `subscription_payment_refunded`.
- [ ] Run Lemon Squeezy test-mode checkout, webhook retry/duplicate, simulated
  payment failure, cancellation, expiration, partial refund, and full refund;
  record only redacted delivery IDs and outcomes.
- [ ] Configure the production environment with test mode disabled and run the
  startup reconciliation receipt against the live store.
- [x] Verify the existing MXroute credential can authenticate and negotiate an
  SMTP session without sending a message.
- [x] Verify plain-text and HTML templates for login, activation, payment
  attention, cancellation, and access-ended events; Lemon Squeezy owns the
  payment receipt. Pairing is confirmed in the authenticated UI and connector,
  not by email.
- [x] Add SMTP timeouts, recipient rejection handling, deterministic lifecycle
  message IDs, a durable outbox, bounded exponential retry, and safe aggregate
  failure visibility.
- [ ] Send a magic-link and all lifecycle templates to one explicitly approved
  internal test recipient and verify rendered links and delivery timestamps.

## 3. Production API, ingestion, DNS, and recovery

- [x] Make production configuration reject missing or noncanonical origins,
  catalog values, API key, checkout URL, SMTP, persistent database path,
  ingestion key, and test-mode grants.
- [x] Add `/healthz`, database-backed `/readyz`, structured redacted logs,
  bounded ingestion, a single-flight scheduler, and store-scoped startup plus
  six-hour billing reconciliation.
- [x] Prove additive migration of the pre-launch database schema and SQLite
  integrity in an isolated file.
- [ ] Publish the exact repository source revision through the governed VPS
  workflow. The current source tree cannot be pushed because this repository's
  Beads policy explicitly says `Git authority: no git operations`.
- [ ] Create `/srv/perception-src/.env` mode 0600 and the persistent data volume,
  then deploy the non-root container on loopback port 8790.
- [ ] Add the Caddy route and DNS for `api.perception.intentsolutions.io` only
  after the service passes local readiness, then prove public TLS.
- [ ] Run production ingestion, inspect aggregate source/run/outbox state,
  create an encrypted backup, and restore it to an isolated volume.

## 4. Web publication

- [x] Publish the actual application, not the coming-soon page, at the canonical
  OMA subpath through the repository that owns the shared Pages domain.
- [x] Verify subpath assets, canonical metadata, direct refreshes, support and
  policy routes, responsive layout, and no horizontal overflow.
- [x] Keep the public artifact honest while checkout is absent: sample signals
  are labeled illustrative, checkout says configuration is pending, production
  analytics remain inactive, and no demo entitlement is enabled.
- [ ] After API and checkout exist, build with the production validator, publish
  the approved artifact, and verify login, checkout, account, entitlement,
  signal room, empty/loading/error/expired/unauthorized states, logout,
  analytics, and callbacks against the live services.

## 5. End-to-end production proof

- [ ] Complete a non-charging Lemon Squeezy test-mode purchase and observe one
  entitlement plus activation message.
- [ ] Consume the delivered magic link, select topics, run ingestion, and view a
  source-backed ranked brief as that authenticated account.
- [ ] Pair Listening Post with a one-time code and verify persistence, expiry,
  replay denial, snapshot/read access, revocation, and recovery against the live
  API.
- [ ] Cancel and fully refund controlled test subscriptions and prove browser
  plus plugin access are revoked at the correct boundary.
- [ ] Complete one real paid purchase only after explicit human confirmation.
- [ ] Name the first-cohort owner and on-call owner before inviting customers.

## 6. Stop and rollback conditions

Stop promotion for failed health/readiness, stale ingestion, entitlement drift,
repeated email failure, credential exposure, cross-account data, incorrect
checkout terms, or a customer-blocking UI regression. Preserve evidence, back
up the database, restore the last matching API and web revisions through their
governed workflows, retain the named volume, and rerun the full smoke check.
Commands and decision points are in `docs/PERCEPTION-OPERATIONS.md`.

## Current launch state

The public product experience is online. It is intentionally not labeled
customer-ready: checkout, production API, production ingestion, delivered test
email, live pairing, and a real end-to-end purchase remain unproven. The only
upstream blockers are the consolidated commercial approval, Lemon Squeezy
credentials/catalog authority, repository Git publication authority, and
explicit approval for an internal test-email recipient and any real charge.
