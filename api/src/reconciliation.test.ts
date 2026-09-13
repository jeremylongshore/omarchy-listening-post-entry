import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type PerceptionDatabase } from "./database.js";
import { entitlementForEmail, type LemonSqueezyConfig } from "./entitlements.js";
import { BillingReconciler } from "./reconciliation.js";

const catalog:LemonSqueezyConfig = { webhookSecret:"unused-for-reconciliation", storeId:10, variantIds:new Set([30]), allowTestMode:true };

describe("Lemon Squeezy reconciliation", () => {
  let database:PerceptionDatabase;
  beforeEach(() => { database = openDatabase(":memory:"); });
  afterEach(() => database.close());

  it("paginates the configured store and idempotently restores entitlement state", async () => {
    const requests:string[] = [];
    const fetcher = async (input:string | URL) => {
      const url = new URL(input);
      requests.push(url.toString());
      if (url.pathname === "/v1/subscription-invoices") return Response.json({ data:[refundedInvoiceResource()], links:{ next:null } });
      const page = url.searchParams.get("page[number]");
      return Response.json(page === "2"
        ? { data:[subscriptionResource("502", "expired", "2026-09-12T00:00:00.000Z")], links:{ next:null } }
        : { data:[subscriptionResource("501", "active", "2026-09-11T00:00:00.000Z")], links:{ next:"https://api.lemonsqueezy.com/v1/subscriptions?filter%5Bstore_id%5D=10&page%5Bnumber%5D=2" } });
    };
    const reconciler = new BillingReconciler(database, "provider-api-key-with-entropy", catalog, fetcher);
    expect(await reconciler.run("startup")).toMatchObject({ subscriptionsSeen:2, refundsSeen:1, eventsApplied:3 });
    expect(await reconciler.run("manual")).toMatchObject({ subscriptionsSeen:2, refundsSeen:1, eventsApplied:0 });
    expect(requests[0]).toContain("filter%5Bstore_id%5D=10");
    expect(requests.some((url) => url.includes("subscription-invoices") && url.includes("filter%5Brefunded%5D=true"))).toBe(true);
    expect(entitlementForEmail(database, "buyer@example.com")?.entitled).toBe(false);
    expect(entitlementForEmail(database, "ended@example.com")?.entitled).toBe(false);
    expect(database.prepare("SELECT status,COUNT(*) AS count FROM billing_reconciliation_runs GROUP BY status").all())
      .toEqual([{ status:"success", count:2 }]);
  });

  it("bounds a provider timeout, records a safe failure, and recovers on restart", async () => {
    const stuck = async (_input:string | URL, init?:RequestInit):Promise<Response> => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("secret provider detail")), { once:true });
    });
    const first = new BillingReconciler(database, "provider-api-key-with-entropy", catalog, stuck, 10);
    await expect(first.run("startup")).rejects.toThrow("provider_timeout");
    expect(database.prepare("SELECT status,error_code FROM billing_reconciliation_runs").get())
      .toEqual({ status:"failed", error_code:"provider_timeout" });

    const recovered = new BillingReconciler(database, "provider-api-key-with-entropy", catalog, async () => Response.json({ data:[], links:{ next:null } }));
    await expect(recovered.run("startup")).resolves.toMatchObject({ subscriptionsSeen:0, refundsSeen:0 });
    expect(database.prepare("SELECT status FROM billing_reconciliation_runs ORDER BY finished_at,id").all()).toContainEqual({ status:"success" });
  });

  it("rejects pagination that leaves the Lemon Squeezy API origin", async () => {
    const reconciler = new BillingReconciler(database, "provider-api-key-with-entropy", catalog, async () => Response.json({ data:[], links:{ next:"https://attacker.example/subscriptions" } }));
    await expect(reconciler.run("manual")).rejects.toThrow("invalid_provider_pagination");
  });
});

function subscriptionResource(id:string, status:"active" | "expired", updatedAt:string) {
  return { type:"subscriptions", id, attributes:{
    store_id:10, customer_id:Number(id) + 100, order_id:Number(id) + 200, product_id:20, variant_id:30,
    user_email:status === "active" ? "buyer@example.com" : "ended@example.com", user_name:"Test Buyer", status,
    renews_at:status === "active" ? "2026-10-01T00:00:00.000Z" : null,
    ends_at:status === "expired" ? "2026-09-12T00:00:00.000Z" : null,
    urls:{ customer_portal:"https://example.lemonsqueezy.com/billing" },
    updated_at:updatedAt, test_mode:true,
  } };
}

function refundedInvoiceResource() {
  return { type:"subscription-invoices", id:"invoice-601", attributes:{
    store_id:10, subscription_id:501, customer_id:601, user_email:"buyer@example.com",
    status:"refunded", refunded:true, refunded_amount:1000,
    refunded_at:"2026-09-13T00:00:00.000Z", updated_at:"2026-09-13T00:00:00.000Z", test_mode:true,
  } };
}
