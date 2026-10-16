import { json } from "../_lib/json.js";
import { tableFor, toDbKind } from "../_lib/kinds.js";

/** Delete R2 keys and/or materials. Friend-compatible {paths:[]} or material params. */
export async function onRequestPost({ request, env }) {
  try {
    const b = await request.json();
    const deleted = [];

    if (Array.isArray(b.paths)) {
      for (const p of b.paths) {
        const key = String(p || "").replace(/^staging\//, "");
        if (!key.startsWith("content/") || key.includes("..")) continue;
        if (env.FILES) await env.FILES.delete(key);
        if (env.CONTENT_DB) {
          await env.CONTENT_DB.prepare(`DELETE FROM files WHERE key=?1`).bind(key).run();
        }
        deleted.push(key);
      }
      return json({ ok: true, deleted });
    }

    const dbKind = toDbKind(b.kind);
    const table = tableFor(dbKind);
    if (!table || (!b.id && !b.slug)) return json({ ok: false, error: "bad body" }, 400);
    let id = b.id;
    if (!id) {
      const row = await env.CONTENT_DB.prepare(`SELECT id FROM ${table} WHERE slug=?1`)
        .bind(b.slug)
        .first();
      id = row?.id;
    }
    if (!id) return json({ ok: false, error: "not found" }, 404);
    await env.CONTENT_DB.prepare(`DELETE FROM translations WHERE kind=?1 AND parent_id=?2`)
      .bind(dbKind, id)
      .run();
    if (dbKind === "article") {
      await env.CONTENT_DB.prepare(`DELETE FROM article_tags WHERE article_id=?1`)
        .bind(id)
        .run();
      await env.CONTENT_DB.prepare(
        `DELETE FROM related_articles WHERE article_id=?1 OR related_id=?1`,
      )
        .bind(id)
        .run();
    }
    await env.CONTENT_DB.prepare(`DELETE FROM ${table} WHERE id=?1`).bind(id).run();
    return json({ ok: true, deleted: [id] });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
