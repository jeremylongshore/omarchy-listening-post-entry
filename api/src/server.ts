import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createApp } from "./app.js";
import { createGitHubOAuthClient } from "./browser-auth.js";
import { openDatabase } from "./database.js";

const port = Number(process.env.PORT || 8790);
const databasePath = process.env.DATABASE_PATH || "./data/perception.db";
const webOrigin = process.env.WEB_ORIGIN || "http://127.0.0.1:4173";
const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
const githubCallbackUrl = process.env.GITHUB_CALLBACK_URL || "http://127.0.0.1:8790/v1/auth/github/callback";
mkdirSync(dirname(databasePath), { recursive:true });
const database = openDatabase(databasePath);
const githubOAuth = githubClientId && githubClientSecret ? createGitHubOAuthClient(githubClientId, githubClientSecret, githubCallbackUrl) : undefined;
const app = await createApp(database, { webOrigin, secureCookies:process.env.NODE_ENV === "production", githubOAuth });
await app.listen({ host:"0.0.0.0", port });
