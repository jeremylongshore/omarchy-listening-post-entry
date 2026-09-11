import { validateSnapshot, type PerceptionSnapshot, type PerceptionTopic } from "@listening-post/perception-contract";
import demoSnapshot from "../../packages/perception-contract/fixtures/snapshot-v1.json";

export type Device = { id:string; label:string; createdAt:string; lastSeenAt:string | null };
export type CreatedDevice = { device:Device; token:string };
export type Account = {
  id:string; displayName:string; email:string;
  entitlement:{ status:string; entitled:boolean; customerPortalUrl:string | null; renewsAt:string | null; endsAt:string | null } | null;
};

export class ApiError extends Error {
  constructor(public status:number, message:string, public code?:string, public checkoutUrl?:string | null) { super(message); }
}

export function isDemoMode() {
  return import.meta.env.DEV || import.meta.env.VITE_PERCEPTION_DEMO === "true";
}

export function apiOrigin() {
  const value = import.meta.env.VITE_PERCEPTION_API_URL;
  return value ? value.replace(/\/$/, "") : "";
}

export async function loadSnapshot(signal?:AbortSignal):Promise<PerceptionSnapshot> {
  if (isDemoMode()) return validate(demoSnapshot);
  return validate(await request("/v1/snapshot", { signal }));
}

export async function requestMagicLink(email:string):Promise<{ status:string; checkoutUrl:string | null }> {
  return request("/v1/auth/magic-link", { method:"POST", body:JSON.stringify({ email }) }) as Promise<{ status:string; checkoutUrl:string | null }>;
}

export async function consumeMagicLink(token:string):Promise<void> {
  await request("/v1/auth/magic-link/consume", { method:"POST", body:JSON.stringify({ token }) });
}

export function magicTokenFromHash(hash:string):string | null {
  if (!hash.startsWith("#")) return null;
  const token = new URLSearchParams(hash.slice(1)).get("magic");
  return token && /^[A-Za-z0-9_-]{32,256}$/.test(token) ? token : null;
}

export async function loadAccount():Promise<Account> {
  return request("/v1/account") as Promise<Account>;
}

export async function logout():Promise<void> {
  await request("/v1/auth/logout", { method:"POST" });
}

export async function loadDevices():Promise<Device[]> {
  const body = await request("/v1/devices") as { devices:Device[] };
  return body.devices;
}

export async function createDevice(label:string):Promise<CreatedDevice> {
  return request("/v1/devices", { method:"POST", body:JSON.stringify({ label }) }) as Promise<CreatedDevice>;
}

export async function revokeDevice(deviceId:string):Promise<void> {
  await request(`/v1/devices/${encodeURIComponent(deviceId)}`, { method:"DELETE" });
}

export async function saveTopics(topics:PerceptionTopic[]):Promise<PerceptionTopic[]> {
  const body = await request("/v1/topics", { method:"PUT", body:JSON.stringify({ topics }) }) as { topics:PerceptionTopic[] };
  return body.topics;
}

export async function markSignalRead(signalId:string):Promise<void> {
  await request(`/v1/signals/${encodeURIComponent(signalId)}/read`, { method:"PUT" });
}

async function request(path:string, init:RequestInit = {}):Promise<unknown> {
  const origin = apiOrigin();
  if (!origin) throw new Error("Perception API is not configured.");
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${origin}${path}`, { ...init, headers, credentials:"include" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?:string; checkoutUrl?:string | null };
    const message = response.status === 401 ? "Sign in to open your signal room."
      : response.status === 402 ? "Your Perception access needs attention."
      : `Perception API returned ${response.status}.`;
    throw new ApiError(response.status, message, body.error, body.checkoutUrl);
  }
  if (response.status === 204) return undefined;
  return response.json();
}

function validate(value:unknown):PerceptionSnapshot {
  const result = validateSnapshot(value);
  if (!result.valid) throw new Error(`Perception response is invalid: ${result.errors.join("; ")}`);
  return value as PerceptionSnapshot;
}
