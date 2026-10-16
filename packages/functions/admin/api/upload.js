import { json } from "../_lib/json.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.FILES) return json({ ok: false, error: "FILES missing" }, 500);
    const form = await request.formData();
    const key = String(form.get("key") || "");
    const file = form.get("file");
    if (!key.startsWith("content/") || key.includes("..")) {
      return json({ ok: false, error: "bad key" }, 400);
    }
    if (!file || typeof file === "string") {
      return json({ ok: false, error: "file required" }, 400);
    }
    const buf = await file.arrayBuffer();
    await env.FILES.put(key, buf, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (env.CONTENT_DB) {
      await env.CONTENT_DB.prepare(
        `INSERT INTO files(key,sha256,size,content_type,source_path) VALUES(?1,?2,?3,?4,?5)
         ON CONFLICT(key) DO UPDATE SET sha256=excluded.sha256,size=excluded.size,content_type=excluded.content_type`,
      )
        .bind(key, sha, buf.byteLength, file.type || "", key)
        .run();
    }
    return json({ ok: true, key, sha256: sha, size: buf.byteLength });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
