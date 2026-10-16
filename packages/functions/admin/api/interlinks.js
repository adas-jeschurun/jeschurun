import { json } from "../_lib/json.js";

/** Rebuild related_articles from shared tags (in-worker). */
export async function onRequestPost({ env }) {
  try {
    const articles = (
      await env.CONTENT_DB.prepare(
        `SELECT id, source_issue FROM articles WHERE status='published'`,
      ).all()
    ).results || [];
    const tags =
      (
        await env.CONTENT_DB.prepare(`SELECT article_id, tag_slug FROM article_tags`).all()
      ).results || [];
    const by = new Map(articles.map((a) => [a.id, new Set()]));
    for (const t of tags) {
      if (!by.has(t.article_id)) by.set(t.article_id, new Set());
      by.get(t.article_id).add(t.tag_slug);
    }
    await env.CONTENT_DB.prepare(`DELETE FROM related_articles`).run();
    let undirected = 0;
    let cross = 0;
    const issue = new Map(articles.map((a) => [a.id, a.source_issue || ""]));
    for (let i = 0; i < articles.length; i++) {
      for (let j = i + 1; j < articles.length; j++) {
        const a = articles[i];
        const b = articles[j];
        let shared = 0;
        for (const t of by.get(a.id) || []) if ((by.get(b.id) || new Set()).has(t)) shared++;
        if (!shared) continue;
        undirected++;
        if (issue.get(a.id) !== issue.get(b.id)) cross++;
        await env.CONTENT_DB.prepare(
          `INSERT INTO related_articles(article_id,related_id,score) VALUES(?1,?2,?3)`,
        )
          .bind(a.id, b.id, shared)
          .run();
        await env.CONTENT_DB.prepare(
          `INSERT INTO related_articles(article_id,related_id,score) VALUES(?1,?2,?3)`,
        )
          .bind(b.id, a.id, shared)
          .run();
      }
    }
    return json({ ok: true, undirectedEdges: undirected, crossIssuePairs: cross });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function onRequestGet({ env }) {
  try {
    const r = await env.CONTENT_DB.prepare(
      `SELECT COUNT(*) AS c FROM related_articles`,
    ).first();
    return json({ ok: true, directedRows: r?.c || 0 });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
