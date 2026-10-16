import { json } from "../_lib/json.js";

/** Serve content/* assets from R2 for the studio editor. */
export async function onRequestGet({ request, env }) {
  try {
    if (!env.FILES) return json({ ok: false, error: "FILES missing" }, 500);
    const u = new URL(request.url);
    let path = u.searchParams.get("path") || "";
    path = path.replace(/^staging\//, "");
    if (!path.startsWith("content/") || path.includes("..")) {
      return json({ ok: false, error: "bad path" }, 400);
    }
    const obj = await env.FILES.get(path);
    if (!obj) return json({ ok: false, error: "not found" }, 404);
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("cache-control", "private, max-age=60");
    headers.set("x-robots-tag", "noindex");
    return new Response(obj.body, { headers });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
