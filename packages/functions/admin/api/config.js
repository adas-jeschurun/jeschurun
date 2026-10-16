import { json } from "../_lib/json.js";

/** site_config: current_issue and other keys. */
export async function onRequestGet({ env }) {
  try {
    const rows =
      (await env.CONTENT_DB.prepare(`SELECT key, value FROM site_config`).all()).results || [];
    const config = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    let currentIssue = null;
    if (config.current_issue) {
      currentIssue = await env.CONTENT_DB.prepare(`SELECT * FROM issues WHERE id=?1`)
        .bind(config.current_issue)
        .first();
    }
    const issues =
      (
        await env.CONTENT_DB.prepare(
          `SELECT id, hebrew_year, slug, status, published_at, parasha_key FROM issues ORDER BY published_at DESC`,
        ).all()
      ).results || [];
    return json({ ok: true, config, currentIssue, issues });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const b = await request.json();
    if (b.current_issue != null) {
      await env.CONTENT_DB.prepare(
        `INSERT INTO site_config(key,value) VALUES('current_issue',?1)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      )
        .bind(String(b.current_issue))
        .run();
    }
    if (b.key && b.value != null) {
      await env.CONTENT_DB.prepare(
        `INSERT INTO site_config(key,value) VALUES(?1,?2)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      )
        .bind(String(b.key), String(b.value))
        .run();
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
