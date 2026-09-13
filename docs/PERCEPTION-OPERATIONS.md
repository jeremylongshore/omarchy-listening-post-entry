# Perception production operations

This runbook covers the paid Perception web application and API. Listening Post
is a free client: it receives only an account-scoped snapshot after the customer
pairs a revocable device credential.

## Production prerequisites

- `https://oma.intentsolutions.io/perception/` serves the `web/` artifact from
  the shared `intent-solutions-io/omarchy-plugins` GitHub Pages site.
- `api.perception.intentsolutions.io` terminates TLS at Caddy and proxies to
  `127.0.0.1:8790` on the Intent Solutions VPS.
- `/srv/perception-src/.env` exists on the VPS with mode `0600` and contains the
  values named by `api/.env.example`. Product secrets remain on the VPS; they do
  not pass through GitHub Actions.
- Repository variables set `PERCEPTION_API_URL`, `PERCEPTION_DEMO_MODE=false`,
  and `PERCEPTION_PRODUCTION_BUNDLE_ENABLED=false` until approved billing and
  legal inputs are complete;
  `PERCEPTION_CHECKOUT_URL`, approved price/billing/refund labels, and
  `PERCEPTION_TERMS_APPROVED=true` for the validated static build. The resulting
  artifact is copied to `site/perception/` in the shared portfolio repository;
  this repository does not own the shared custom-domain CNAME.
- The Lemon Squeezy product sends `subscription_created`,
  `subscription_updated`, `order_refunded`, and
  `subscription_payment_refunded` to
  `https://api.perception.intentsolutions.io/v1/billing/webhook` using the same
  signing secret as the API. The configured store and variant IDs must match the
  paid Perception product.
- SMTP credentials authenticate with the approved MXroute mailbox and deliver
  from `Perception <support@intentsolutions.io>`; SPF, DKIM,
  and DMARC should be healthy before inviting customers.

Do not enable `LEMONSQUEEZY_ALLOW_TEST_MODE` in production. Use a separate
non-production instance when testing Lemon Squeezy test-mode events.
The API validates this entire production boundary before opening the database or
listening; missing paid-product configuration is a startup failure, not a
degraded service that can pass `/healthz`.

## Release and smoke check

The API workflow builds and tests the image before calling the governed VPS
deployment workflow. The web workflow validates and uploads the product bundle;
the shared portfolio workflow publishes the copy under `site/perception/`.
Record the approved source revision, portfolio merge revision, and workflow run
URLs in the release record.

After deployment, verify:

1. `GET https://api.perception.intentsolutions.io/healthz` returns HTTP 200 with
   `status: "ok"` and `contractVersion: "1.0"`.
2. `GET https://api.perception.intentsolutions.io/readyz` returns HTTP 200 and
   reports database readiness.
3. The web app loads over HTTPS with demo mode off and an unauthenticated visit
   shows purchase-email login.
4. A controlled entitled account receives and consumes one magic link, sees its
   billing state, saves a topic, and receives a populated snapshot.
5. A disposable device can fetch that snapshot, mark a signal read, and loses
   access immediately after browser-side revocation.
6. Caddy and API logs contain no token, magic-link value, session cookie, or
   unexpected error. Never paste those values into an issue or run log.

The emailed magic token belongs in the `#magic=` fragment on the web origin.
Neither the Pages request nor the API exchange may put it in a URL path or query
string; consumption is an origin-checked JSON POST.

## Data and privacy boundary

Perception stores the purchase email and display name, Lemon Squeezy subscription
identifiers and lifecycle state, customer topics, per-signal scores and read
state, device labels, and operational timestamps. Session, magic-link, device,
webhook, and ingestion credentials are stored only as hashes or remain in the
VPS environment. The API stores sanitized feed metadata and HTTPS links, not
article bodies. Listening Post sends no telemetry.

Signals are bounded to 45 days and ingestion receipts to the newest 100 runs.
Expired sessions and consumed or expired magic links are pruned during normal
authentication activity. Account and billing records are retained until an
operator handles a verified deletion request; there is currently no public
self-service account-deletion endpoint. Treat the SQLite volume and every backup
as confidential customer data.

## Backup and recovery

The authoritative database is the Docker volume mounted at
`/data/perception.db`; replacing a container must not replace that volume.
Before a deployment or recovery exercise:

1. Put the API into a controlled maintenance window. Use SQLite's online backup
   API while the process is running, or stop the service before a filesystem
   copy; never copy only the main file while its WAL can change.
2. Place the result in an encrypted, access-controlled backup location outside
   the Docker volume. Set mode 0600 and record the UTC timestamp, source
   revision, byte size, and a SHA-256 digest without recording customer rows.
3. Restart the current service and confirm `/healthz` before changing anything
   else.

To restore, stop the API, preserve the failed database separately, place the
selected verified backup at `/data/perception.db` with ownership readable and
writable by the container's `node` user, start the service, and run the release
smoke check. A database restore can roll back topics and read state; tell affected
customers if the recovery point loses customer-visible changes.

## Customer-message outbox

Billing webhooks commit entitlement changes and lifecycle messages in the same
database transaction. SMTP delivery happens from the durable
`customer_messages` outbox; a temporary SMTP failure does not lose the message.
The worker reclaims a stale delivery claim after five minutes, applies retry
backoff, and stops retrying after ten attempts so a poison message cannot create
an unbounded loop.

Inspect aggregate state without exposing email addresses or message bodies:

```sql
SELECT kind, sent_at IS NOT NULL AS sent, COUNT(*) AS total
FROM customer_messages
GROUP BY kind, sent_at IS NOT NULL;
```

Inspect exhausted or currently failing deliveries:

```sql
SELECT id, kind, attempts, last_error, updated_at
FROM customer_messages
WHERE sent_at IS NULL AND attempts >= 10
ORDER BY updated_at DESC;
```

Treat `last_error` as operationally sensitive. Correct the SMTP/configuration
cause before resetting attempts; never copy customer addresses or credentials
into Beads, logs, or chat.

### Email delivery troubleshooting

1. Check `/readyz`, then inspect only aggregate pending/exhausted counts with the
   queries above. Do not print recipients or message bodies.
2. Verify SMTP authentication and transport negotiation with the configured
   sender before retrying the outbox. A successful transport check is not proof
   that a message reached an inbox.
3. Confirm SPF, DKIM, DMARC, and MX records from an external resolver. Review the
   controlled test inbox and MXroute delivery logs for rejection or bounce
   evidence. MXroute has no application webhook in this design, so asynchronous
   bounces require mailbox/provider-log inspection.
4. Correct the cause, clear `claimed_at`, set `next_attempt_at` to the current
   UTC time, and reset attempts only for the exact failed message IDs. The
   deterministic Message-ID prevents an operator retry from silently creating
   a second logical lifecycle message.

Lemon Squeezy sends the payment receipt as merchant of record. Perception sends
the requested login link and entitlement lifecycle notices. Pairing confirmation
is visible in the authenticated device list and connector result, not email.

## Billing reconciliation

The API reconciles the configured Lemon Squeezy store before it begins listening
and then every six hours. Failure to complete startup reconciliation prevents a
production process from claiming readiness. Inspect redacted run state with:

```sql
SELECT trigger, status, subscriptions_seen, refunds_seen, events_applied, error_code,
       started_at, finished_at
FROM billing_reconciliation_runs
ORDER BY finished_at DESC
LIMIT 20;
```

For a manual incident reconciliation, stop promotional activity, retain the
database, restart the API to run the same bounded startup path, and compare
aggregate active/cancelled/expired totals to the store. Never paste customer
emails or subscription IDs into public issue records. Duplicate payloads are
safe because webhook/reconciliation processing is digest-idempotent. A full
refund writes a local revocation; partial refunds are recorded without changing
access.

## Plugin pairing troubleshooting

1. Confirm the browser account is entitled, then create a fresh code. Codes
   expire after ten minutes and are consumed atomically once.
2. Run `connect-perception.sh`; it reads the code without echo, posts it on
   standard input so it is absent from process arguments, and writes only the
   returned device token to the mode-0600 curl configuration.
3. Confirm a device row exists and its `last_seen_at` advances after a snapshot
   request. Inspect identifiers and timestamps only, never token hashes.
4. An invalid, expired, replayed, revoked, or unentitled exchange must return a
   generic denial. Create a new code instead of trying to recover an old secret.
5. Recovery is revoke, remove the local curl configuration, create a fresh code,
   reconnect, and verify the old credential remains denied.

## Incident sequence

Declare a launch stop for failed readiness, stale all-source ingestion,
entitlement drift, ten-attempt email exhaustion, checkout-copy mismatch,
cross-account data, credential exposure, or a customer-blocking web regression.
Pause promotion, preserve redacted timestamps and workflow URLs, back up the
database, rotate any exposed credential, and choose application rollback or
database restore according to the failure. Keep the `perception-data` volume
unless a verified restore is the explicit recovery action. After containment,
rerun health, readiness, ingestion, reconciliation, email, browser, pairing, and
revocation smoke checks before reopening access.

## Funnel measurement

Perception records only the first-party, closed-vocabulary events documented in
`docs/PERCEPTION-ANALYTICS.md`. The browser sends an event name only; the API
derives account and time. There are no advertising identifiers, cross-site
trackers, free-form properties, or Listening Post telemetry. Product events are
pruned after 90 days.

Use the documented aggregate funnel queries for rollout decisions. Do not add
raw email, topic text, source URLs, tokens, user agent, or IP address to the
event payload.

Run a restore rehearsal against an isolated volume before calling the backup
procedure proven. A production backup alone is not recovery evidence.

## Application rollback

Rollback means redeploying a previously approved source revision through the
same governed VPS workflow and republishing its matching Pages artifact. Do not
delete or recreate the named `perception-data` volume. Take and verify a database
backup first; inspect database compatibility before rolling back across a schema
change. Then rerun the full smoke check and record the rolled-back revision and
reason.

The current schema initialization is additive, but that is not a promise that a
future release will be backward compatible. Any future destructive migration
must ship a tested down-migration or explicitly declare rollback as database
restore plus application rollback.

## Credential and account containment

- **Lost Omarchy device:** revoke it in the Perception Omarchy view. The next API
  call returns 401. Pair a replacement; tokens are shown only once.
- **Leaked device token:** revoke the device, delete
  `~/.config/perception/listening-post.curlrc` on the workstation, and inspect
  API access logs by device ID and time. Do not log or compare the raw token.
- **Leaked browser session:** sign out to delete the current server-side session.
  An operator can delete all `browser_sessions` rows for the account during a
  broader incident.
- **Leaked SMTP, webhook, ingestion, or VPS secret:** rotate it at its authority,
  update `/srv/perception-src/.env`, restart the API, and verify both the affected
  integration and `/healthz`.
- **Subscription expiry or charge issue:** Lemon Squeezy remains the entitlement
  authority. The account endpoint stays reachable for billing recovery, while
  product snapshots and every device are denied when entitlement ends.

## Current proof boundary

Local integrated tests prove the complete customer and revocation journey. The
real React application is publicly deployed at the canonical OMA route, with
checkout and live analytics intentionally inactive until production admission.
The current API image is locally built and proven non-root with health,
readiness, schema, fail-closed production startup, and an isolated-volume
backup/restore receipt. Production API deployment, live ingestion, a delivered
test email, provider checkout, live plugin pairing, and application-revision
rollback remain unproven and must be recorded separately.

Known limitations at this gate are: no self-service account deletion, SQLite is
a single-host persistence boundary, asynchronous email bounces are inspected in
MXroute rather than pushed to the API, and source publication latency remains
outside Perception's control. None permits the product to be called
customer-ready before the open rollout receipts pass.

The authoritative go-live sequence and evidence receipt are in
`docs/PERCEPTION-ROLLOUT.md`.
