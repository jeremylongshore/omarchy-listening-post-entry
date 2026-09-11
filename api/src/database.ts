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
    CREATE TABLE IF NOT EXISTS github_identities (
      github_user_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
      login TEXT NOT NULL CHECK(length(login) BETWEEN 1 AND 80),
      avatar_url TEXT,
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
    CREATE TABLE IF NOT EXISTS oauth_states (
      state_hash TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL
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
    CREATE INDEX IF NOT EXISTS idx_devices_hash ON device_tokens(token_hash) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_sessions_hash ON browser_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON browser_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_topics_account ON topics(account_id);
    CREATE INDEX IF NOT EXISTS idx_signals_published ON signals(published_at DESC);
  `);
  return database;
}
