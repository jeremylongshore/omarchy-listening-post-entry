const required = [
  "VITE_LEMONSQUEEZY_CHECKOUT_URL",
  "VITE_PERCEPTION_PRICE_LABEL",
  "VITE_PERCEPTION_BILLING_SUMMARY",
  "VITE_PERCEPTION_REFUND_SUMMARY",
];

const errors = required.filter((name) => !process.env[name]?.trim()).map((name) => `${name} is required`);
if (process.env.VITE_PERCEPTION_API_URL !== "https://api.perception.intentsolutions.io") errors.push("VITE_PERCEPTION_API_URL must be the canonical production API");
if (process.env.VITE_PERCEPTION_DEMO !== "false") errors.push("VITE_PERCEPTION_DEMO must be false");
if (process.env.VITE_PERCEPTION_LEGAL_OPERATOR !== "IntentSolutions.io LLC") errors.push("VITE_PERCEPTION_LEGAL_OPERATOR must name the verified operator");
if (process.env.VITE_PERCEPTION_SUPPORT_EMAIL !== "support@intentsolutions.io") errors.push("VITE_PERCEPTION_SUPPORT_EMAIL must use the verified support route");
if (process.env.VITE_PERCEPTION_TERMS_APPROVED !== "true") errors.push("VITE_PERCEPTION_TERMS_APPROVED must be true after approval");
if (process.env.VITE_PERCEPTION_GOVERNING_LAW !== "Alabama, United States") errors.push("VITE_PERCEPTION_GOVERNING_LAW must match the owner-approved jurisdiction");
if (process.env.VITE_PERCEPTION_TERMS_EFFECTIVE_DATE !== "September 14, 2026") errors.push("VITE_PERCEPTION_TERMS_EFFECTIVE_DATE must match the owner-approved effective date");
try {
  const checkout = new URL(process.env.VITE_LEMONSQUEEZY_CHECKOUT_URL || "");
  if (checkout.protocol !== "https:" || checkout.username || checkout.password) throw new Error();
} catch { errors.push("VITE_LEMONSQUEEZY_CHECKOUT_URL must be an HTTPS URL without credentials"); }

if (errors.length) {
  console.error(`Production web configuration is incomplete: ${errors.join("; ")}`);
  process.exit(1);
}
