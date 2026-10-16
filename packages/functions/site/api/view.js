import { json } from "../_lib/json.js";

/** Compatibility shim — prefer /api/content-event */
export async function onRequestPost(ctx) {
  const mod = await import("./content-event.js");
  return mod.onRequestPost(ctx);
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}
