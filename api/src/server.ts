import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createApp } from "./app.js";
import { loadRuntimeConfig } from "./config.js";
import { openDatabase } from "./database.js";
import { createSmtpMailer } from "./mailer.js";
import { IngestionService, startIngestionScheduler } from "./ingestion.js";
import { startCustomerMessageWorker } from "./customer-messages.js";
import { BillingReconciler, startBillingReconciliationScheduler } from "./reconciliation.js";

const config = loadRuntimeConfig(process.env);
mkdirSync(dirname(config.databasePath), { recursive:true });
const database = openDatabase(config.databasePath);
const mailer = config.smtp ? createSmtpMailer(config.smtp, config.webAppUrl) : undefined;
if (mailer) await mailer.verify();
const ingestionService = new IngestionService(database);
const billingReconciler = config.lemonSqueezy && config.lemonSqueezyApiKey
  ? new BillingReconciler(database, config.lemonSqueezyApiKey, config.lemonSqueezy)
  : undefined;
if (billingReconciler) await billingReconciler.run("startup");
const app = await createApp(database, {
  webOrigin:config.webOrigin, webAppUrl:config.webAppUrl, apiOrigin:config.apiOrigin, secureCookies:config.production, logLevel:config.logLevel,
  checkoutUrl:config.checkoutUrl, lemonSqueezy:config.lemonSqueezy,
  magicLinkSender:mailer?.magicLinkSender, customerMessageSender:mailer?.customerMessageSender,
  ingestionService, ingestionKey:config.ingestionKey,
});
await app.listen({ host:"0.0.0.0", port:config.port });
const stopScheduler = config.ingestionEnabled
  ? startIngestionScheduler(ingestionService, config.ingestionIntervalMs)
  : async () => undefined;
const stopCustomerMessages = mailer
  ? startCustomerMessageWorker(database, mailer.customerMessageSender)
  : async () => undefined;
const stopBillingReconciliation = billingReconciler
  ? startBillingReconciliationScheduler(billingReconciler, config.billingReconciliationIntervalMs)
  : async () => undefined;
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return; shuttingDown = true;
  try { await app.close(); await stopScheduler(); await stopCustomerMessages(); await stopBillingReconciliation(); database.close(); }
  catch { process.exitCode = 1; }
}
process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });
