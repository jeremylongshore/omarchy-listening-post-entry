import type { LemonSqueezyConfig } from "./entitlements.js";

const PRODUCTION_WEB_ORIGIN = "https://oma.intentsolutions.io";
const PRODUCTION_WEB_APP_URL = "https://oma.intentsolutions.io/perception/";
const PRODUCTION_API_ORIGIN = "https://api.perception.intentsolutions.io";

export type SmtpConfig = {
  host:string; port:number; secure:boolean; user:string; password:string; from:string;
};

export type RuntimeConfig = {
  production:boolean;
  port:number;
  databasePath:string;
  webOrigin:string;
  webAppUrl:string;
  apiOrigin:string;
  logLevel:string;
  checkoutUrl:string | undefined;
  lemonSqueezy:LemonSqueezyConfig | undefined;
  lemonSqueezyApiKey:string | undefined;
  billingReconciliationIntervalMs:number;
  smtp:SmtpConfig | undefined;
  ingestionEnabled:boolean;
  ingestionIntervalMs:number;
  ingestionKey:string | undefined;
};

export function loadRuntimeConfig(env:Record<string, string | undefined>):RuntimeConfig {
  const production = env.NODE_ENV === "production";
  const errors:string[] = [];
  const port = integer(env.PORT ?? "8790", "PORT", 1, 65_535, errors);
  const databasePath = env.DATABASE_PATH?.trim() || "./data/perception.db";
  const webOrigin = origin(env.WEB_ORIGIN ?? "http://127.0.0.1:4173", "WEB_ORIGIN", errors);
  const webAppUrl = appUrl(env.WEB_APP_URL ?? `${webOrigin}/`, "WEB_APP_URL", errors);
  const apiOrigin = origin(env.API_ORIGIN ?? "http://127.0.0.1:8790", "API_ORIGIN", errors);
  const checkoutUrl = optionalHttps(env.LEMONSQUEEZY_CHECKOUT_URL, "LEMONSQUEEZY_CHECKOUT_URL", errors);
  const ingestionIntervalMs = integer(env.INGESTION_INTERVAL_MS ?? "900000", "INGESTION_INTERVAL_MS", 60_000, 86_400_000, errors);
  const billingReconciliationIntervalMs = integer(env.BILLING_RECONCILIATION_INTERVAL_MS ?? "21600000", "BILLING_RECONCILIATION_INTERVAL_MS", 300_000, 86_400_000, errors);
  const ingestionEnabled = booleanValue(env.INGESTION_ENABLED ?? "true", "INGESTION_ENABLED", errors);
  const smtpPort = integer(env.SMTP_PORT ?? "465", "SMTP_PORT", 1, 65_535, errors);
  const smtpSecure = booleanValue(env.SMTP_SECURE ?? "true", "SMTP_SECURE", errors);

  const lemonValues = [env.LEMONSQUEEZY_WEBHOOK_SECRET, env.LEMONSQUEEZY_STORE_ID, env.LEMONSQUEEZY_VARIANT_IDS];
  const wantsLemon = lemonValues.some(present);
  let lemonSqueezy:LemonSqueezyConfig | undefined;
  if (wantsLemon || production) {
    const webhookSecret = required(env.LEMONSQUEEZY_WEBHOOK_SECRET, "LEMONSQUEEZY_WEBHOOK_SECRET", errors, 16);
    const storeId = integer(env.LEMONSQUEEZY_STORE_ID, "LEMONSQUEEZY_STORE_ID", 1, Number.MAX_SAFE_INTEGER, errors);
    const variantIds = positiveIntegerSet(env.LEMONSQUEEZY_VARIANT_IDS, "LEMONSQUEEZY_VARIANT_IDS", errors);
    const allowTestMode = booleanValue(env.LEMONSQUEEZY_ALLOW_TEST_MODE ?? "false", "LEMONSQUEEZY_ALLOW_TEST_MODE", errors);
    if (production && allowTestMode) errors.push("LEMONSQUEEZY_ALLOW_TEST_MODE must be false in production");
    if (webhookSecret && storeId && variantIds.size) lemonSqueezy = { webhookSecret, storeId, variantIds, allowTestMode };
  }

  const smtpValues = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASSWORD, env.SMTP_FROM];
  const wantsSmtp = smtpValues.some(present);
  let smtp:SmtpConfig | undefined;
  if (wantsSmtp || production) {
    const host = required(env.SMTP_HOST, "SMTP_HOST", errors);
    const user = required(env.SMTP_USER, "SMTP_USER", errors);
    const password = required(env.SMTP_PASSWORD, "SMTP_PASSWORD", errors);
    const from = required(env.SMTP_FROM, "SMTP_FROM", errors);
    if (host && /\s/.test(host)) errors.push("SMTP_HOST must not contain whitespace");
    if (from && (/[\r\n]/.test(from) || !from.includes("@"))) errors.push("SMTP_FROM must be a single email mailbox value");
    if (host && user && password && from) smtp = { host, port:smtpPort, secure:smtpSecure, user, password, from };
  }

  const ingestionKey = env.INGESTION_KEY?.trim() || undefined;
  const lemonSqueezyApiKey = env.LEMONSQUEEZY_API_KEY?.trim() || undefined;
  if (production) {
    if (webOrigin !== PRODUCTION_WEB_ORIGIN) errors.push(`WEB_ORIGIN must be ${PRODUCTION_WEB_ORIGIN} in production`);
    if (webAppUrl !== PRODUCTION_WEB_APP_URL) errors.push(`WEB_APP_URL must be ${PRODUCTION_WEB_APP_URL} in production`);
    if (apiOrigin !== PRODUCTION_API_ORIGIN) errors.push(`API_ORIGIN must be ${PRODUCTION_API_ORIGIN} in production`);
    if (!databasePath.startsWith("/")) errors.push("DATABASE_PATH must be absolute in production");
    if (!checkoutUrl) errors.push("LEMONSQUEEZY_CHECKOUT_URL is required in production");
    if (!lemonSqueezyApiKey || lemonSqueezyApiKey.length < 20) errors.push("LEMONSQUEEZY_API_KEY is required and must contain at least 20 characters in production");
    if (!ingestionEnabled) errors.push("INGESTION_ENABLED must be true in production");
    if (!ingestionKey || ingestionKey.length < 32) errors.push("INGESTION_KEY must contain at least 32 characters in production");
    if (smtp?.from !== "Perception <support@intentsolutions.io>") errors.push("SMTP_FROM must be Perception <support@intentsolutions.io> in production");
  } else if (ingestionKey && ingestionKey.length < 16) {
    errors.push("INGESTION_KEY must contain at least 16 characters when configured");
  }

  if (errors.length) throw new Error(`Invalid Perception configuration: ${errors.join("; ")}`);
  return {
    production, port, databasePath, webOrigin, webAppUrl, apiOrigin,
    logLevel:env.LOG_LEVEL?.trim() || "info", checkoutUrl, lemonSqueezy, lemonSqueezyApiKey, billingReconciliationIntervalMs, smtp,
    ingestionEnabled, ingestionIntervalMs, ingestionKey,
  };
}

function present(value:string | undefined):boolean { return Boolean(value?.trim()); }

function required(value:string | undefined, name:string, errors:string[], minimum = 1):string {
  const normalized = value?.trim() || "";
  if (normalized.length < minimum) errors.push(`${name} is required${minimum > 1 ? ` and must contain at least ${minimum} characters` : ""}`);
  return normalized;
}

function integer(value:string | undefined, name:string, minimum:number, maximum:number, errors:string[]):number {
  const parsed = value && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    errors.push(`${name} must be an integer between ${minimum} and ${maximum}`);
    return minimum;
  }
  return parsed;
}

function booleanValue(value:string, name:string, errors:string[]):boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  errors.push(`${name} must be true or false`);
  return false;
}

function origin(value:string, name:string, errors:string[]):string {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error();
    return parsed.origin;
  } catch {
    errors.push(`${name} must be an HTTP(S) origin without credentials, path, query, or fragment`);
    return "";
  }
}

function optionalHttps(value:string | undefined, name:string, errors:string[]):string | undefined {
  if (!present(value)) return undefined;
  try {
    const parsed = new URL(value!);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error();
    return parsed.toString();
  } catch {
    errors.push(`${name} must be an HTTPS URL without embedded credentials`);
    return undefined;
  }
}

function appUrl(value:string, name:string, errors:string[]):string {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || !parsed.pathname.endsWith("/")) throw new Error();
    return parsed.toString();
  } catch {
    errors.push(`${name} must be an HTTP(S) URL without credentials, query, or fragment and with a trailing slash`);
    return "";
  }
}

function positiveIntegerSet(value:string | undefined, name:string, errors:string[]):Set<number> {
  const parts = value?.split(",").map(item => item.trim()).filter(Boolean) ?? [];
  const parsed = parts.map(item => /^\d+$/.test(item) ? Number(item) : Number.NaN);
  if (!parts.length || parsed.some(item => !Number.isSafeInteger(item) || item <= 0)) {
    errors.push(`${name} must be a comma-separated list of positive integers`);
    return new Set();
  }
  return new Set(parsed);
}
