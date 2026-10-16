import { json } from "../_lib/json.js";

export async function onRequestGet() {
  return json({ ok: true, app: "jes-v2-admin" });
}
