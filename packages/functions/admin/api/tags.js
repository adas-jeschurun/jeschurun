import { json } from "../_lib/json.js";

export async function onRequestGet({ env }) {
  try {
    const tags = await env.CONTENT_DB.prepare(`SELECT slug, labels_json FROM tags ORDER BY slug`).all();
    const links = await env.CONTENT_DB.prepare(`SELECT article_id, tag_slug FROM article_tags`).all();
    return json({
      ok: true,
      tags: (tags.results || []).map((t) => ({
        slug: t.slug,
        labels: JSON.parse(t.labels_json || "{}"),
      })),
      article_tags: links.results || [],
    });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const b = await request.json();
    if (b.action === "set-article-tags") {
      const { article_id, tags } = b;
      await env.CONTENT_DB.prepare(`DELETE FROM article_tags WHERE article_id=?1`)
        .bind(article_id)
        .run();
      for (const slug of tags || []) {
        await env.CONTENT_DB.prepare(
          `INSERT OR IGNORE INTO article_tags(article_id,tag_slug) VALUES(?1,?2)`,
        )
          .bind(article_id, slug)
          .run();
      }
      return json({ ok: true });
    }
    if (b.slug) {
      await env.CONTENT_DB.prepare(
        `INSERT INTO tags(slug,labels_json) VALUES(?1,?2)
         ON CONFLICT(slug) DO UPDATE SET labels_json=excluded.labels_json`,
      )
        .bind(b.slug, JSON.stringify(b.labels || {}))
        .run();
      return json({ ok: true, slug: b.slug });
    }
    return json({ ok: false, error: "bad body" }, 400);
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
