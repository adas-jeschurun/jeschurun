import { json } from "../_lib/json.js";

/** Read text/binary metadata from R2 for repo file viewer. */
export async function onRequestGet({ request, env }) {
  try {
    if (!env.FILES) return json({ ok: false, error: "FILES missing" }, 500);
    const u = new URL(request.url);
    let path = (u.searchParams.get("path") || "").replace(/^staging\//, "");
    if (!path.startsWith("content/") || path.includes("..")) {
      return json({ ok: false, error: "bad path" }, 400);
    }
    const obj = await env.FILES.get(path);
    if (!obj) return json({ ok: false, error: "not found" }, 404);
    const ct = obj.httpMetadata?.contentType || "";
    if (/^(text\/|application\/(json|javascript)|.*xml)/i.test(ct) || /\.(md|json|txt|svg|html?)$/i.test(path)) {
      const text = await obj.text();
      return json({ ok: true, path, content_type: ct, text });
    }
    return json({
      ok: true,
      path,
      content_type: ct,
      size: obj.size,
      preview_url: `/api/preview-asset?path=${encodeURIComponent(path)}`,
    });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
