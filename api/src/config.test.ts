import { describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "./config.js";

const production = {
  NODE_ENV:"production",
  PORT:"8790",
  DATABASE_PATH:"/data/perception.db",
  WEB_ORIGIN:"https://perception.intentsolutions.io",
  API_ORIGIN:"https://api.perception.intentsolutions.io",
  LEMONSQUEEZY_WEBHOOK_SECRET:"w".repeat(32),
  LEMONSQUEEZY_STORE_ID:"10",
  LEMONSQUEEZY_VARIANT_IDS:"30,31",
  LEMONSQUEEZY_CHECKOUT_URL:"https://store.example.test/buy/perception",
  LEMONSQUEEZY_ALLOW_TEST_MODE:"false",
  SMTP_HOST:"smtp.example.test",
  SMTP_PORT:"465",
  SMTP_SECURE:"true",
  SMTP_USER:"perception@example.test",
  SMTP_PASSWORD:"mail-secret",
  SMTP_FROM:"Perception <perception@example.test>",
  INGESTION_ENABLED:"true",
  INGESTION_INTERVAL_MS:"900000",
  INGESTION_KEY:"i".repeat(32),
};

describe("production configuration", () => {
  it("constructs a complete typed paid-product configuration", () => {
    const config = loadRuntimeConfig(production);
    expect(config).toMatchObject({
      production:true, port:8790, databasePath:"/data/perception.db",
      webOrigin:"https://perception.intentsolutions.io",
      apiOrigin:"https://api.perception.intentsolutions.io",
      checkoutUrl:"https://store.example.test/buy/perception",
      ingestionEnabled:true, ingestionIntervalMs:900000,
      smtp:{ host:"smtp.example.test", port:465, secure:true, user:"perception@example.test" },
    });
    expect(config.lemonSqueezy?.storeId).toBe(10);
    expect([...config.lemonSqueezy!.variantIds]).toEqual([30, 31]);
  });

  it("fails closed when paid login and ingestion configuration is absent", () => {
    expect(() => loadRuntimeConfig({ NODE_ENV:"production" })).toThrow(/LEMONSQUEEZY_WEBHOOK_SECRET/);
    expect(() => loadRuntimeConfig({ NODE_ENV:"production" })).toThrow(/SMTP_HOST/);
    expect(() => loadRuntimeConfig({ NODE_ENV:"production" })).toThrow(/INGESTION_KEY/);
  });

  it.each([
    ["WEB_ORIGIN", "https://attacker.example"],
    ["API_ORIGIN", "http://api.perception.intentsolutions.io"],
    ["DATABASE_PATH", "./relative.db"],
    ["LEMONSQUEEZY_WEBHOOK_SECRET", "short"],
    ["LEMONSQUEEZY_STORE_ID", "0"],
    ["LEMONSQUEEZY_VARIANT_IDS", "30,invalid"],
    ["LEMONSQUEEZY_CHECKOUT_URL", "http://store.example.test/buy"],
    ["LEMONSQUEEZY_ALLOW_TEST_MODE", "true"],
    ["INGESTION_ENABLED", "false"],
    ["INGESTION_KEY", "short"],
    ["INGESTION_INTERVAL_MS", "1000"],
    ["SMTP_PORT", "70000"],
    ["SMTP_FROM", "Perception\r\nBcc: victim@example.test"],
  ])("rejects unsafe production %s", (name, value) => {
    expect(() => loadRuntimeConfig({ ...production, [name]:value })).toThrow(name);
  });

  it("keeps local development usable without paid-service credentials", () => {
    expect(loadRuntimeConfig({})).toMatchObject({
      production:false, port:8790, webOrigin:"http://127.0.0.1:4173",
      apiOrigin:"http://127.0.0.1:8790", lemonSqueezy:undefined, smtp:undefined,
    });
  });

  it("does not echo secret values in validation errors", () => {
    const secret = "sensitive-value-that-must-not-appear";
    expect(() => loadRuntimeConfig({ ...production, LEMONSQUEEZY_WEBHOOK_SECRET:secret, SMTP_HOST:"bad host" }))
      .toThrowError(expect.not.stringContaining(secret));
  });
});
