import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deliverPendingCustomerMessages, type CustomerMessageSender } from "./customer-messages.js";
import { openDatabase, type PerceptionDatabase } from "./database.js";
import { renderCustomerMessage } from "./mailer.js";

describe("customer message outbox", () => {
  let database:PerceptionDatabase;
  beforeEach(() => { database = openDatabase(":memory:"); });
  afterEach(() => database.close());

  it("delivers each queued message once", async () => {
    database.prepare("INSERT INTO customer_messages (id,email,kind,payload_json,created_at) VALUES (?,?,?,?,?)").run("message_1", "buyer@example.com", "welcome", JSON.stringify({ name:"Buyer" }), new Date().toISOString());
    const deliveries:string[] = [];
    const sender:CustomerMessageSender = { async sendCustomerMessage(message) { deliveries.push(message.id); } };
    expect(await deliverPendingCustomerMessages(database, sender)).toEqual({ sent:1, failed:0 });
    expect(await deliverPendingCustomerMessages(database, sender)).toEqual({ sent:0, failed:0 });
    expect(deliveries).toEqual(["message_1"]);
    expect((database.prepare("SELECT sent_at,attempts,last_error FROM customer_messages WHERE id='message_1'").get() as { sent_at:string; attempts:number; last_error:null })).toMatchObject({ attempts:1, last_error:null });
  });

  it("backs off a failed claim and retries it later without losing the error", async () => {
    database.prepare("INSERT INTO customer_messages (id,email,kind,payload_json,created_at) VALUES (?,?,?,?,?)").run("message_2", "buyer@example.com", "cancelled", "{}", new Date().toISOString());
    const failing:CustomerMessageSender = { async sendCustomerMessage() { throw new Error("smtp unavailable"); } };
    expect(await deliverPendingCustomerMessages(database, failing)).toEqual({ sent:0, failed:1 });
    const row = database.prepare("SELECT sent_at,claimed_at,attempts,last_error FROM customer_messages WHERE id='message_2'").get() as Record<string, unknown>;
    expect(row).toMatchObject({ sent_at:null, attempts:1, last_error:"smtp unavailable" });
    expect(row.claimed_at).toEqual(expect.any(String));
    const working:CustomerMessageSender = { async sendCustomerMessage() {} };
    expect(await deliverPendingCustomerMessages(database, working)).toEqual({ sent:0, failed:0 });
    expect(await deliverPendingCustomerMessages(database, working, new Date(Date.now() + 6 * 60_000))).toEqual({ sent:1, failed:0 });
  });

  it("renders accessible plain text and escaped HTML for every lifecycle state", () => {
    for (const kind of ["welcome", "billing_attention", "cancelled", "access_ended"] as const) {
      const rendered = renderCustomerMessage({ id:"id", email:"buyer@example.com", kind, name:"<Buyer>", portalUrl:"https://example.lemonsqueezy.com/billing", endsAt:"2026-10-01T00:00:00.000Z" }, "https://perception.intentsolutions.io");
      expect(rendered.subject).toBeTruthy();
      expect(rendered.text).toContain("Perception");
      expect(rendered.html).toContain("Support");
      expect(rendered.html).not.toContain("<Buyer>");
    }
  });
});
