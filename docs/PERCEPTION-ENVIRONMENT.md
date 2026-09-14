# Perception environment reference

This reference records names and purposes only. Secret values belong in the
provider or the mode-0600 VPS environment file, never Git, CI output, Beads, or
chat.

## API runtime

| Name | Secret | Purpose and production rule |
| --- | --- | --- |
| `NODE_ENV` | no | Must be `production` on the VPS; enables the fail-closed boundary. |
| `PORT` | no | Loopback application port; production convention is 8790. |
| `DATABASE_PATH` | sensitive path | Absolute path in the persistent `/data` volume. |
| `WEB_ORIGIN` | no | Browser CORS origin only; exactly `https://oma.intentsolutions.io`. |
| `WEB_APP_URL` | no | Full browser route for login/email links; exactly `https://oma.intentsolutions.io/perception/`. |
| `API_ORIGIN` | no | Public API authority; exactly `https://api.perception.intentsolutions.io`. |
| `LOG_LEVEL` | no | Structured API log threshold; request secrets are redacted. |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | yes | Verifies the exact raw webhook body. Minimum 16 characters. |
| `LEMONSQUEEZY_API_KEY` | yes | Reads subscriptions for startup/scheduled reconciliation. |
| `LEMONSQUEEZY_STORE_ID` | sensitive identifier | Restricts events and reconciliation to the Perception store. |
| `LEMONSQUEEZY_VARIANT_IDS` | sensitive identifiers | Comma-separated allowlist of paid Perception variants. |
| `LEMONSQUEEZY_CHECKOUT_URL` | no | Canonical HTTPS checkout/recovery route returned by the API. |
| `LEMONSQUEEZY_ALLOW_TEST_MODE` | no | Must be `false` in production; use a separate test instance. |
| `BILLING_RECONCILIATION_INTERVAL_MS` | no | Reconciliation cadence; default six hours, minimum five minutes. |
| `SMTP_HOST` | sensitive configuration | MXroute SMTP authority. |
| `SMTP_PORT` | no | SMTP port matching the secure-mode setting. |
| `SMTP_SECURE` | no | Whether TLS begins at connection establishment. |
| `SMTP_USER` | yes | MXroute authentication identity. |
| `SMTP_PASSWORD` | yes | MXroute authentication credential. |
| `SMTP_FROM` | no | Approved sender identity: `Perception <support@intentsolutions.io>`. |
| `INGESTION_ENABLED` | no | Must be `true` in production. |
| `INGESTION_INTERVAL_MS` | no | Feed polling cadence; default 15 minutes, minimum one minute. |
| `INGESTION_KEY` | yes | High-entropy key for the operator-only manual ingestion endpoint. |

The checked-in shape is `api/.env.example`; production values are entered only
at `/srv/perception-src/.env` with mode 0600.

## Web build

| Name | Secret | Purpose and production rule |
| --- | --- | --- |
| `VITE_PERCEPTION_API_URL` | no | Exact production API origin. |
| `VITE_PERCEPTION_DEMO` | no | Must be `false`; demo snapshots never ship as paid state. |
| `VITE_LEMONSQUEEZY_CHECKOUT_URL` | no | Approved HTTPS checkout URL. |
| `VITE_PERCEPTION_PRICE_LABEL` | no | Approved customer-facing price and currency. |
| `VITE_PERCEPTION_BILLING_SUMMARY` | no | Approved interval, renewal, tax, trial, and cancellation summary. |
| `VITE_PERCEPTION_REFUND_SUMMARY` | no | Approved refund summary matching checkout and terms. |
| `VITE_PERCEPTION_LEGAL_OPERATOR` | no | Must equal `IntentSolutions.io LLC`. |
| `VITE_PERCEPTION_SUPPORT_EMAIL` | no | Must equal `support@intentsolutions.io`. |
| `VITE_PERCEPTION_TERMS_APPROVED` | no | Must be `true` before `build:production` succeeds. |

Vite variables are public static-bundle input and must never contain secrets.
The production validator refuses an incomplete, demo, insecure, or inconsistent
bundle.

## Deployment workflow inputs

| Name | Secret | Purpose |
| --- | --- | --- |
| `PERCEPTION_PRODUCTION_BUNDLE_ENABLED` | no | Enables the production web artifact only after every approved public billing value is present. Pull requests always test and build the fail-closed application without publishing an artifact. |
| `PERCEPTION_API_DEPLOY_ENABLED` | no | Enables the governed API deployment job only after provider configuration exists. |
| `PERCEPTION_VPS_TAILNET_IP` | no | Private deployment target used by the shared workflow. |
| `PERCEPTION_VPS_PUBLIC_IP` | no | Public target used for post-deploy validation. |
| `TS_OIDC_CLIENT_ID` | yes | Tailscale OIDC credential for the deployment workflow. |
| `TS_AUDIENCE` | yes | Tailscale OIDC audience. |
| `VPS_DEPLOY_KEY` | yes | SSH deployment credential. |
| `VPS_HOST_KEY` | yes | Pinned SSH host identity. |

The web workflow uses the non-secret `PERCEPTION_*` build variables documented
in `.github/workflows/deploy-perception-pages.yml`. The API workflow does not
transport product secrets; the VPS owns them.
