import { json } from "../_lib/json.js";

/** Replaces friend GitHub status — reports D1/R2 bindings. */
export async function onRequestGet({ env }) {
  try {
    let contentCount = 0;
    if (env.CONTENT_DB) {
      const r = await env.CONTENT_DB.prepare(`SELECT COUNT(*) AS c FROM articles`).first();
      contentCount = r?.c || 0;
    }
    return json({
      ok: true,
      backend: "d1-r2",
      owner: "jes-v2",
      repo: "content-db",
      branch: "d1",
      content_db: !!env.CONTENT_DB,
      questions_db: !!env.QUESTIONS_DB,
      analytics_db: !!env.ANALYTICS_DB,
      files: !!env.FILES,
      articles: contentCount,
    });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
