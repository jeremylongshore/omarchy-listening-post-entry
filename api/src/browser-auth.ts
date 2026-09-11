import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { PerceptionDatabase } from "./database.js";

export const SESSION_COOKIE = "perception_session";
export const OAUTH_COOKIE = "perception_oauth_state";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_LIFETIME_MS = 10 * 60 * 1000;


export type GitHubIdentity = { id:string; login:string; name:string | null; avatarUrl:string | null };

export interface GitHubOAuthClient {
  authorizeUrl(state:string): string;
  exchange(code:string): Promise<GitHubIdentity>;
}

export function opaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashOpaqueToken(token:string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createOAuthState(database:PerceptionDatabase, now = new Date()): string {
  database.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").run(now.toISOString());
  const state = opaqueToken();
  database.prepare("INSERT INTO oauth_states VALUES (?, ?)").run(hashOpaqueToken(state), new Date(now.getTime() + OAUTH_LIFETIME_MS).toISOString());
  return state;
}

export function consumeOAuthState(database:PerceptionDatabase, state:string, cookieState:string | undefined, now = new Date()): boolean {
  if (!cookieState || !safeEqual(state, cookieState)) return false;
  const digest = hashOpaqueToken(state);
  const result = database.prepare("DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > ?").run(digest, now.toISOString());
  return result.changes === 1;
}

export function upsertGitHubAccount(database:PerceptionDatabase, identity:GitHubIdentity, now = new Date()): string {
  const existing = database.prepare("SELECT account_id FROM github_identities WHERE github_user_id = ?").get(identity.id) as { account_id:string } | undefined;
  const accountId = existing?.account_id ?? `acct_${randomUUID()}`;
  const displayName = (identity.name?.trim() || identity.login).slice(0, 80);
  const transaction = database.transaction(() => {
    if (!existing) database.prepare("INSERT INTO accounts VALUES (?, ?, ?)").run(accountId, displayName, now.toISOString());
    else database.prepare("UPDATE accounts SET display_name = ? WHERE id = ?").run(displayName, accountId);
    database.prepare(`INSERT INTO github_identities (github_user_id,account_id,login,avatar_url,updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(github_user_id) DO UPDATE SET login=excluded.login,avatar_url=excluded.avatar_url,updated_at=excluded.updated_at`).run(identity.id, accountId, identity.login, identity.avatarUrl, now.toISOString());
  });
  transaction();
  return accountId;
}

export function createBrowserSession(database:PerceptionDatabase, accountId:string, now = new Date()): string {
  database.prepare("DELETE FROM browser_sessions WHERE expires_at <= ?").run(now.toISOString());
  const token = opaqueToken();
  database.prepare("INSERT INTO browser_sessions VALUES (?, ?, ?, ?, ?, ?)").run(
    `session_${randomUUID()}`, accountId, hashOpaqueToken(token), now.toISOString(),
    new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString(), now.toISOString(),
  );
  return token;
}

export function authenticateBrowser(database:PerceptionDatabase, token:string | undefined, now = new Date()): { accountId:string } | null {
  if (!token || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) return null;
  const digest = hashOpaqueToken(token);
  const row = database.prepare("SELECT id,account_id,token_hash FROM browser_sessions WHERE token_hash = ? AND expires_at > ?").get(digest, now.toISOString()) as { id:string; account_id:string; token_hash:string } | undefined;
  if (!row || !safeEqual(row.token_hash, digest)) return null;
  database.prepare("UPDATE browser_sessions SET last_seen_at = ? WHERE id = ?").run(now.toISOString(), row.id);
  return { accountId:row.account_id };
}

export function revokeBrowserSession(database:PerceptionDatabase, token:string | undefined): void {
  if (token) database.prepare("DELETE FROM browser_sessions WHERE token_hash = ?").run(hashOpaqueToken(token));
}

function safeEqual(left:string, right:string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createGitHubOAuthClient(clientId:string, clientSecret:string, callbackUrl:string, fetcher:typeof fetch = fetch): GitHubOAuthClient {
  return {
    authorizeUrl(state) {
      const url = new URL("https://github.com/login/oauth/authorize");
      url.searchParams.set("client_id", clientId); url.searchParams.set("redirect_uri", callbackUrl); url.searchParams.set("state", state); url.searchParams.set("scope", "read:user");
      return url.toString();
    },
    async exchange(code) {
      const tokenResponse = await fetcher("https://github.com/login/oauth/access_token", {
        method:"POST", headers:{ Accept:"application/json", "Content-Type":"application/json" },
        body:JSON.stringify({ client_id:clientId, client_secret:clientSecret, code, redirect_uri:callbackUrl }),
      });
      if (!tokenResponse.ok) throw new Error("github_token_exchange_failed");
      const tokenBody = await tokenResponse.json() as { access_token?:string; error?:string };
      if (!tokenBody.access_token || tokenBody.error) throw new Error("github_token_exchange_failed");
      const userResponse = await fetcher("https://api.github.com/user", { headers:{ Accept:"application/vnd.github+json", Authorization:`Bearer ${tokenBody.access_token}`, "X-GitHub-Api-Version":"2022-11-28" } });
      if (!userResponse.ok) throw new Error("github_user_fetch_failed");
      const user = await userResponse.json() as { id?:number; login?:string; name?:string | null; avatar_url?:string | null };
      if (!user.id || !user.login) throw new Error("github_user_invalid");
      return { id:String(user.id), login:user.login, name:user.name ?? null, avatarUrl:user.avatar_url ?? null };
    },
  };
}
