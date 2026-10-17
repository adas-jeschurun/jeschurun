import { json } from "../_lib/json.js";
import { rebuildRelatedAndInline } from "../_lib/rebuild-related.js";

/** Rebuild related_articles from shared tags + inline body links. */
export async function onRequestPost({ env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "CONTENT_DB missing" }, 500);
    const report = await rebuildRelatedAndInline(env.CONTENT_DB, {
      applyInline: true,
      minEdges: 5,
    });
    if (report.error === "eligible pairs exist but edges=0") {
      return json(report, 500);
    }
    return json(report, report.ok ? 200 : 500);
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function onRequestGet({ env }) {
  try {
    const r = await env.CONTENT_DB.prepare(
      `SELECT COUNT(*) AS c FROM related_articles`,
    ).first();
    const tagged = await env.CONTENT_DB.prepare(
      `SELECT COUNT(DISTINCT article_id) AS c FROM article_tags`,
    ).first();
    return json({
      ok: true,
      directedRows: r?.c || 0,
      taggedArticles: tagged?.c || 0,
    });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
