import { json } from "../_lib/json.js";

export async function onRequestGet({ request, env }) {
  try {
    const u = new URL(request.url);
    const limit = Math.min(20, Math.max(1, Number(u.searchParams.get("limit") || 12)));
    const language = String(u.searchParams.get("language") || "");
    if (!env.ANALYTICS_DB) return json({ ok: false, error: "analytics missing" }, 500);

    let sql = `
      SELECT content_type||':'||content_id AS key,
             SUM(count) AS views
      FROM content_events_daily
      WHERE event='view'
    `;
    const args = [];
    if (language) {
      sql += ` AND language=?1`;
      args.push(language);
    }
    sql += ` GROUP BY content_type, content_id ORDER BY views DESC LIMIT ?${args.length + 1}`;
    args.push(limit);
    const r = await env.ANALYTICS_DB.prepare(sql).bind(...args).all();
    return json(
      { ok: true, enabled: true, items: r.results || [] },
      200,
      { cache: "public, max-age=120" },
    );
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
