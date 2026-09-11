# Perception production operations

This runbook covers the paid Perception web application and API. Listening Post
is a free client: it receives only an account-scoped snapshot after the customer
pairs a revocable device credential.

## Production prerequisites

- `perception.intentsolutions.io` serves the GitHub Pages artifact from `web/`.
- `api.perception.intentsolutions.io` terminates TLS at Caddy and proxies to
  `127.0.0.1:8790` on the Intent Solutions VPS.
- `/srv/perception-src/.env` exists on the VPS with mode `0600` and contains the
  values named by `api/.env.example`. Product secrets remain on the VPS; they do
  not pass through GitHub Actions.
- Repository variables set `PERCEPTION_API_URL`, `PERCEPTION_DEMO_MODE=false`,
  and `PERCEPTION_CHECKOUT_URL` for the static web build.
- The Lemon Squeezy product sends `subscription_created` and
  `subscription_updated` to
  `https://api.perception.intentsolutions.io/v1/billing/webhook` using the same
  signing secret as the API. The configured store and variant IDs must match the
  paid Perception product.
- SMTP credentials can deliver from `perception@intentsolutions.io`; SPF, DKIM,
  and DMARC should be healthy before inviting customers.

Do not enable `LEMONSQUEEZY_ALLOW_TEST_MODE` in production. Use a separate
non-production instance when testing Lemon Squeezy test-mode events.
The API validates this entire production boundary before opening the database or
listening; missing paid-product configuration is a startup failure, not a
degraded service that can pass `/healthz`.

## Release and smoke check

The API workflow builds and tests the image before calling the governed VPS
deployment workflow. The Pages workflow tests and builds the web artifact
before publishing it. Record the approved source revision and both workflow run
URLs in the release record.

After deployment, verify:

1. `GET https://api.perception.intentsolutions.io/healthz` returns HTTP 200 with
   `status: "ok"` and `contractVersion: "1.0"`.
2. The web app loads over HTTPS with demo mode off and an unauthenticated visit
   shows purchase-email login.
3. A controlled entitled account receives and consumes one magic link, sees its
   billing state, saves a topic, and receives a populated snapshot.
4. A disposable device can fetch that snapshot, mark a signal read, and loses
   access immediately after browser-side revocation.
5. Caddy and API logs contain no token, magic-link value, session cookie, or
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

1. Put the API into a controlled maintenance window or stop the service so the
   SQLite database and its WAL cannot change during the copy.
2. Copy the database to an encrypted, access-controlled backup location outside
   the Docker volume. Record the UTC timestamp, source revision, byte size, and a
   SHA-256 digest without recording customer rows.
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
exact-tree Docker image has also been built and smoke-tested with disposable
production-shaped configuration and storage. A stopped-database backup and
isolated-volume restore rehearsal passed on that image. Production deployment,
a live-email journey, and application-revision rollback must be recorded
separately when run; they are not implied by this document.

The authoritative go-live sequence and evidence receipt are in
`docs/PERCEPTION-ROLLOUT.md`.
