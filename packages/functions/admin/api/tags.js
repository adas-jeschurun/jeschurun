import { json } from "../_lib/json.js";

export async function onRequestGet({ env }) {
  try {
    const tags = await env.CONTENT_DB.prepare(
      `SELECT slug, labels_json FROM tags ORDER BY slug`,
    ).all();
    const links = await env.CONTENT_DB.prepare(
      `SELECT article_id, tag_slug FROM article_tags`,
    ).all();
    const arts = await env.CONTENT_DB.prepare(
      `SELECT id, slug FROM articles WHERE status='published' OR status='draft' ORDER BY slug`,
    ).all();
    return json({
      ok: true,
      tags: (tags.results || []).map((t) => ({
        slug: t.slug,
        labels: JSON.parse(t.labels_json || "{}"),
      })),
      article_tags: links.results || [],
      articles: (arts.results || []).map((a) => ({ id: a.id, slug: a.slug })),
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
      if (!article_id) return json({ ok: false, error: "article_id required" }, 400);
      await env.CONTENT_DB.prepare(`DELETE FROM article_tags WHERE article_id=?1`)
        .bind(article_id)
        .run();
      for (const slug of tags || []) {
        const s = String(slug || "").trim();
        if (!s) continue;
        await env.CONTENT_DB.prepare(
          `INSERT OR IGNORE INTO tags(slug,labels_json) VALUES(?1,?2)`,
        )
          .bind(s, JSON.stringify({ en: s, he: s, ru: s, de: s, fr: s }))
          .run();
        await env.CONTENT_DB.prepare(
          `INSERT OR IGNORE INTO article_tags(article_id,tag_slug) VALUES(?1,?2)`,
        )
          .bind(article_id, s)
          .run();
      }
      return json({ ok: true });
    }
    if (b.action === "delete-tag") {
      const slug = String(b.slug || "").trim();
      if (!slug) return json({ ok: false, error: "slug required" }, 400);
      await env.CONTENT_DB.prepare(`DELETE FROM article_tags WHERE tag_slug=?1`)
        .bind(slug)
        .run();
      await env.CONTENT_DB.prepare(`DELETE FROM tags WHERE slug=?1`).bind(slug).run();
      return json({ ok: true, deleted: slug });
    }
    if (b.slug) {
      const slug = String(b.slug).trim();
      const labels = b.labels || {};
      await env.CONTENT_DB.prepare(
        `INSERT INTO tags(slug,labels_json) VALUES(?1,?2)
         ON CONFLICT(slug) DO UPDATE SET labels_json=excluded.labels_json`,
      )
        .bind(slug, JSON.stringify(labels))
        .run();
      return json({ ok: true, slug });
    }
    return json({ ok: false, error: "bad body" }, 400);
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
