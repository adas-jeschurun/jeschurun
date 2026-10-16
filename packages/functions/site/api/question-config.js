import { json } from "../_lib/json.js";

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    sitekey: env.TURNSTILE_SITEKEY || "",
  });
}
