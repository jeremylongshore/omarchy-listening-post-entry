# Perception rollout gate

This is the operator checklist for taking the locally proven customer product
live. A checked item must have a real production receipt. Do not substitute a
local mock, test-mode event, screenshot, or intended configuration.

## 1. Commercial and legal authority

- [ ] Name the legal operator, support mailbox, governing law, refund policy,
  cancellation wording, and final price/billing interval.
- [ ] Have the public privacy, terms, and acceptable-use copy reviewed and replace every rollout
  draft qualifier with approved wording.
- [ ] Record those decisions in `PRODUCT.md`, then align the public page,
  checkout, and lifecycle email copy.

Receipt: reviewer/owner, UTC date, approved price and policy references. Never
record credentials or customer data.

## 2. Lemon Squeezy and email

- [ ] Create the production Perception product and variant in Lemon Squeezy.
- [ ] Put its canonical checkout URL into both
  `LEMONSQUEEZY_CHECKOUT_URL` and `VITE_LEMONSQUEEZY_CHECKOUT_URL`.
- [ ] Configure the signed production webhook at
  `https://api.perception.intentsolutions.io/v1/billing/webhook` for
  `subscription_created` and `subscription_updated`; align store ID, allowed
  variant IDs, and webhook secret on the API host.
- [ ] Keep `LEMONSQUEEZY_ALLOW_TEST_MODE=false` in production.
- [ ] Configure SMTP, verify the sender domain's SPF/DKIM/DMARC, and prove both a
  magic-link email and each lifecycle-message class reaches a controlled inbox
  with usable plain-text and HTML versions.

Receipt: Lemon product/variant identifiers, webhook delivery IDs and HTTP
status, and redacted email delivery timestamps. Do not record signatures,
tokens, cookies, passwords, or raw message bodies.

## 3. API, storage, DNS, and TLS

- [ ] Create the persistent database volume and mode-0600 production environment
  file on the VPS; run the container as the non-root `node` user.
- [ ] Deploy the approved image behind Caddy on `127.0.0.1:8790` without exposing
  the container port publicly.
- [ ] Point `api.perception.intentsolutions.io` to the authorized host and prove
  valid TLS plus the contract-v1 `/healthz` response.
- [ ] Run one production ingestion and verify source health, SQLite
  `PRAGMA integrity_check`, lifecycle-outbox health, and secret-free logs.
- [ ] Take an encrypted pre-launch backup and rehearse restoration in an isolated
  volume before admitting a customer.

Receipt: approved image digest/revision, deployment run, DNS/TLS check, health
response, aggregate ingestion/outbox counts, backup digest, and restore result.

## 4. Web publication

- [ ] Build with the canonical HTTPS API and Lemon Squeezy checkout origins,
  demo mode disabled, and no secrets in the static artifact.
- [ ] Publish the exact approved artifact to GitHub Pages (or the chosen static
  authority), point `perception.intentsolutions.io`, and prove TLS.
- [ ] Verify purchase, sign-in, support, privacy, terms, and acceptable-use routes on desktop and
  mobile; confirm no console errors, mixed content, or horizontal overflow.
- [ ] Verify Content Security Policy and canonical-origin behavior on the live
  domains.

Receipt: source revision, build/deploy run, artifact identifier, live URLs, UTC
smoke-test time, and browser/version.

## 5. First-customer controlled smoke

- [ ] Complete one real purchase with a controlled customer address and observe
  one idempotent entitlement plus welcome message.
- [ ] Consume the magic link, confirm topics, open one source-backed signal, and
  verify activation events appear only as aggregate first-party events.
- [ ] Pair Listening Post using the one-time token and private curl config,
  receive the same account snapshot, mark a signal read, and revoke the device.
- [ ] Exercise billing recovery/cancellation on a controlled subscription and
  prove account access remains available while paid snapshots fail closed when
  entitlement ends.
- [ ] Inspect API, Caddy, SMTP, Lemon Squeezy, outbox, and browser evidence for
  secrets or unexpected errors before inviting anyone else.

Receipt: redacted timestamps and identifiers only. Never paste the purchase
email, magic link, device token, session cookie, webhook signature, or SMTP
credential into the rollout record.

## 6. Observe, promote, and roll back

- [ ] Capture the baseline aggregate funnel using
  `docs/PERCEPTION-ANALYTICS.md`, then check health, ingestion age, failed outbox
  deliveries, webhook failures, and error rate during the controlled rollout.
- [ ] Release to the first cohort before scheduling the launch email and social
  assets under `campaigns/perception-customer-rollout/`.
- [ ] Define the on-call owner and stop conditions: health failure, stale
  ingestion, entitlement drift, repeated email failure, credential exposure,
  or a customer-blocking UI regression.
- [ ] If a stop condition fires, pause promotion, preserve evidence, back up the
  database, redeploy the last approved matching API/web revision, retain the
  named data volume, and rerun the full smoke check.

## Current status — 2026-09-11

The complete product, responsive customer experience, automated tests, Docker
runtime, local backup/restore rehearsal, launch copy, and operating procedures
are locally proven. Production remains gated on legal/commercial decisions,
Lemon Squeezy and SMTP authority, DNS/VPS/static-host access, and permission to
perform Git-backed deployment. Those gates remain open in Beads; this document
does not claim them complete.
