import Database from "better-sqlite3";

export type PerceptionDatabase = Database.Database;

export function openDatabase(path: string): PerceptionDatabase {
  const database = new Database(path);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 80),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS device_tokens (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      last_seen_at TEXT,
      revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS pairing_codes (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
      code_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      device_id TEXT REFERENCES device_tokens(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS email_identities (
      email TEXT PRIMARY KEY,
      account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS browser_sessions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS magic_links (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS billing_entitlements (
      subscription_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      order_id TEXT,
      store_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      variant_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('on_trial','active','paused','past_due','unpaid','cancelled','expired')),
      user_name TEXT,
      renews_at TEXT,
      ends_at TEXT,
      customer_portal_url TEXT,
      test_mode INTEGER NOT NULL CHECK(test_mode IN (0, 1)),
      upstream_updated_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS webhook_events (
      body_digest TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      resource_id TEXT,
      received_at TEXT NOT NULL,
      outcome TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS billing_revocations (
      subscription_id TEXT PRIMARY KEY REFERENCES billing_entitlements(subscription_id) ON DELETE CASCADE,
      reason TEXT NOT NULL CHECK(reason IN ('full_refund')),
      upstream_updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customer_messages (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('welcome','billing_attention','cancelled','access_ended')),
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      claimed_at TEXT,
      next_attempt_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
      last_error TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS product_events (
      id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL CHECK(event_name IN ('landing_view','checkout_opened','sign_in_opened','magic_link_requested','signal_room_opened','first_signal_opened','device_credential_created','listening_post_paired','purchase_entitled')),
      account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      occurred_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
      keywords_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
      UNIQUE(account_id, name)
    );
    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
      url TEXT NOT NULL CHECK(length(url) BETWEEN 1 AND 2048),
      source TEXT NOT NULL CHECK(length(source) BETWEEN 1 AND 80),
      lane TEXT NOT NULL CHECK(lane IN ('incident','release','pricing','engineering')),
      relevance INTEGER NOT NULL CHECK(relevance BETWEEN 0 AND 100),
      published_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS signal_topics (
      signal_id TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
      topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      PRIMARY KEY(signal_id, topic_id)
    );
    CREATE TABLE IF NOT EXISTS signal_origins (
      signal_id TEXT PRIMARY KEY REFERENCES signals(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS signal_metadata (
      signal_id TEXT PRIMARY KEY REFERENCES signals(id) ON DELETE CASCADE,
      resolved INTEGER NOT NULL CHECK(resolved IN (0, 1)),
      quiet INTEGER NOT NULL CHECK(quiet IN (0, 1))
    );
    CREATE TABLE IF NOT EXISTS account_signal_scores (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      signal_id TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
      relevance INTEGER NOT NULL CHECK(relevance BETWEEN 0 AND 100),
      reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 240),
      PRIMARY KEY(account_id, signal_id)
    );
    CREATE TABLE IF NOT EXISTS read_state (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      signal_id TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL,
      PRIMARY KEY(account_id, signal_id)
    );
    CREATE TABLE IF NOT EXISTS source_health (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
      status TEXT NOT NULL CHECK(status IN ('healthy','degraded','unavailable')),
      checked_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ingestion_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      last_attempt_at TEXT,
      last_success_at TEXT
    );
    CREATE TABLE IF NOT EXISTS ingestion_runs (
      id TEXT PRIMARY KEY,
      trigger TEXT NOT NULL CHECK(trigger IN ('scheduled','manual')),
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('success','partial','failed')),
      sources_attempted INTEGER NOT NULL,
      sources_healthy INTEGER NOT NULL,
      sources_failed INTEGER NOT NULL,
      items_parsed INTEGER NOT NULL,
      signals_stored INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS billing_reconciliation_runs (
      id TEXT PRIMARY KEY,
      trigger TEXT NOT NULL CHECK(trigger IN ('startup','scheduled','manual')),
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('success','failed')),
      subscriptions_seen INTEGER NOT NULL,
      refunds_seen INTEGER NOT NULL DEFAULT 0,
      events_applied INTEGER NOT NULL,
      error_code TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_devices_hash ON device_tokens(token_hash) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_pairing_codes_hash ON pairing_codes(code_hash);
    CREATE INDEX IF NOT EXISTS idx_pairing_codes_expiry ON pairing_codes(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_hash ON browser_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON browser_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_magic_links_hash ON magic_links(token_hash);
    CREATE INDEX IF NOT EXISTS idx_magic_links_expiry ON magic_links(expires_at);
    CREATE INDEX IF NOT EXISTS idx_entitlements_email ON billing_entitlements(email,status);
    CREATE INDEX IF NOT EXISTS idx_customer_messages_pending ON customer_messages(sent_at,claimed_at,created_at);
    CREATE INDEX IF NOT EXISTS idx_product_events_name_time ON product_events(event_name,occurred_at);
    CREATE INDEX IF NOT EXISTS idx_topics_account ON topics(account_id);
    CREATE INDEX IF NOT EXISTS idx_signals_published ON signals(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_scores_account ON account_signal_scores(account_id,relevance DESC);
    CREATE INDEX IF NOT EXISTS idx_ingestion_runs_finished ON ingestion_runs(finished_at DESC);
    CREATE INDEX IF NOT EXISTS idx_billing_reconciliation_finished ON billing_reconciliation_runs(finished_at DESC);
  `);
  ensureColumn(database, "customer_messages", "next_attempt_at", "TEXT");
  ensureColumn(database, "customer_messages", "updated_at", "TEXT");
  ensureColumn(database, "billing_entitlements", "order_id", "TEXT");
  ensureColumn(database, "billing_reconciliation_runs", "refunds_seen", "INTEGER NOT NULL DEFAULT 0");
  database.prepare("UPDATE customer_messages SET updated_at=COALESCE(updated_at,created_at)").run();
  return database;
}

function ensureColumn(database:PerceptionDatabase, table:string, column:string, definition:string):void {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name:string }>;
  if (!columns.some((item) => item.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
