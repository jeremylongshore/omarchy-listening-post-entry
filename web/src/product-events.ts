import { apiOrigin } from "./api";

export type ProductEventName =
  | "landing_view" | "checkout_opened" | "sign_in_opened" | "magic_link_requested"
  | "signal_room_opened" | "first_signal_opened" | "device_credential_created" | "listening_post_paired";

const emitted = new Set<ProductEventName>();

export function trackProductEvent(name:ProductEventName, once = false):void {
  if (once && emitted.has(name)) return;
  if (once) emitted.add(name);
  const origin = apiOrigin();
  if (!origin || import.meta.env.DEV) return;
  void fetch(`${origin}/v1/events`, {
    method:"POST", credentials:"include", keepalive:true,
    headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ name }),
  }).catch(() => undefined);
}
