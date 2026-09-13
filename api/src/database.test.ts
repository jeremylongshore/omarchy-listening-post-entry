import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./database.js";

describe("database migrations", () => {
  const paths:string[] = [];
  afterEach(async () => {
    for (const path of paths.splice(0)) await rm(path, { recursive:true, force:true });
  });

  it("adds reconciliation fields to the pre-launch schema without losing rows", async () => {
    const directory = await mkdtemp(join(tmpdir(), "perception-migration-"));
    paths.push(directory);
    const path = join(directory, "perception.db");
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE customer_messages (
        id TEXT PRIMARY KEY, email TEXT NOT NULL, kind TEXT NOT NULL,
        payload_json TEXT NOT NULL, created_at TEXT NOT NULL, sent_at TEXT,
        claimed_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
      );
      INSERT INTO customer_messages VALUES
        ('message-1','buyer@example.test','welcome','{}','2026-09-01T00:00:00.000Z',NULL,NULL,1,'temporary');
      CREATE TABLE billing_entitlements (
        subscription_id TEXT PRIMARY KEY, email TEXT NOT NULL, customer_id TEXT NOT NULL,
        store_id INTEGER NOT NULL, product_id INTEGER NOT NULL, variant_id INTEGER NOT NULL,
        status TEXT NOT NULL, user_name TEXT, renews_at TEXT, ends_at TEXT,
        customer_portal_url TEXT, test_mode INTEGER NOT NULL,
        upstream_updated_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO billing_entitlements VALUES
        ('subscription-1','buyer@example.test','customer-1',10,20,30,'active',NULL,NULL,NULL,NULL,0,
         '2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z');
    `);
    legacy.close();

    const migrated = openDatabase(path);
    expect(columnNames(migrated, "customer_messages")).toEqual(expect.arrayContaining(["next_attempt_at", "updated_at"]));
    expect(columnNames(migrated, "billing_entitlements")).toContain("order_id");
    expect(columnNames(migrated, "billing_reconciliation_runs")).toContain("refunds_seen");
    expect(migrated.prepare("SELECT id,attempts,updated_at FROM customer_messages").get()).toEqual({
      id:"message-1", attempts:1, updated_at:"2026-09-01T00:00:00.000Z",
    });
    expect(migrated.prepare("PRAGMA integrity_check").pluck().get()).toBe("ok");
    migrated.close();
  });
});

function columnNames(database:Database.Database, table:string):string[] {
  return (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name:string }>).map(({ name }) => name);
}
