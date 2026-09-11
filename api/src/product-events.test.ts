import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type PerceptionDatabase } from "./database.js";
import { isProductEventName, recordProductEvent } from "./product-events.js";
import { createApp } from "./app.js";

describe("privacy-conscious product events", () => {
  let database:PerceptionDatabase;
  beforeEach(() => { database = openDatabase(":memory:"); });
  afterEach(() => database.close());

  it("accepts only the closed event vocabulary", () => {
    expect(isProductEventName("landing_view")).toBe(true);
    expect(isProductEventName("email=buyer@example.com")).toBe(false);
    expect(isProductEventName({ name:"landing_view" })).toBe(false);
  });

  it("deletes events older than the 90-day retention boundary", () => {
    recordProductEvent(database, "landing_view", null, new Date("2026-01-01T00:00:00.000Z"));
    recordProductEvent(database, "checkout_opened", null, new Date("2026-06-01T00:00:00.000Z"));
    expect(database.prepare("SELECT event_name FROM product_events ORDER BY occurred_at").all()).toEqual([{ event_name:"checkout_opened" }]);
  });

  it("accepts only client-safe names and no arbitrary properties", async () => {
    const app = await createApp(database, { webOrigin:"https://perception.intentsolutions.io" });
    const accepted = await app.inject({ method:"POST", url:"/v1/events", headers:{ origin:"https://perception.intentsolutions.io" }, payload:{ name:"landing_view" } });
    const extra = await app.inject({ method:"POST", url:"/v1/events", headers:{ origin:"https://perception.intentsolutions.io" }, payload:{ name:"landing_view", email:"buyer@example.com" } });
    const serverOnly = await app.inject({ method:"POST", url:"/v1/events", headers:{ origin:"https://perception.intentsolutions.io" }, payload:{ name:"purchase_entitled" } });
    expect(accepted.statusCode).toBe(202);
    expect(extra.statusCode).toBe(400);
    expect(serverOnly.statusCode).toBe(400);
    expect(database.prepare("SELECT event_name,account_id FROM product_events").all()).toEqual([{ event_name:"landing_view", account_id:null }]);
    await app.close();
  });
});
