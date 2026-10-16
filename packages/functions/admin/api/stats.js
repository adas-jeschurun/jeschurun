import { json } from "../_lib/json.js";

function where(days) {
  const n = Number(days || 0);
  return Number.isFinite(n) && n > 0
    ? ` AND event_date >= date('now','-${Math.floor(n - 1)} day')`
    : "";
}

/** Friend-compatible analytics read from jes-v2-analytics. */
export async function onRequestGet({ request, env }) {
  try {
    if (!env.ANALYTICS_DB) {
      return json({ ok: false, error: "ANALYTICS_DB is not configured" }, 503);
    }
    const u = new URL(request.url);
    const days = Math.max(0, Math.min(3650, Number(u.searchParams.get("days") || 7)));
    const w = where(days);
    const q = [
      `SELECT COALESCE(SUM(CASE WHEN event='view' THEN count ELSE 0 END),0) views,COUNT(DISTINCT CASE WHEN event='view' THEN content_type||':'||content_id END) materials,COALESCE(SUM(CASE WHEN event IN ('pdf_download','epub_download') THEN count ELSE 0 END),0) downloads,COALESCE(SUM(CASE WHEN event LIKE 'share_%' OR event='copy_link' THEN count ELSE 0 END),0) shares,COALESCE(SUM(CASE WHEN event='print_click' THEN count ELSE 0 END),0) prints FROM content_events_daily WHERE 1=1 ${w}`,
      `SELECT content_type,content_id,language,SUM(count) views FROM content_events_daily WHERE event='view' ${w} GROUP BY content_type,content_id,language ORDER BY views DESC,content_id ASC LIMIT 50`,
      `SELECT language,SUM(count) count FROM content_events_daily WHERE event='view' ${w} GROUP BY language ORDER BY count DESC`,
      `SELECT event,SUM(count) count FROM content_events_daily WHERE 1=1 ${w} GROUP BY event ORDER BY count DESC`,
      `SELECT source,SUM(count) count FROM content_events_daily WHERE event='view' ${w} GROUP BY source ORDER BY count DESC`,
      `SELECT event_date,SUM(count) count FROM content_events_daily WHERE event='view' ${w} GROUP BY event_date ORDER BY event_date ASC`,
    ];
    const r = await env.ANALYTICS_DB.batch(q.map((x) => env.ANALYTICS_DB.prepare(x)));
    return json({
      ok: true,
      days,
      overview: r[0]?.results?.[0] || {},
      top: r[1]?.results || [],
      languages: r[2]?.results || [],
      events: r[3]?.results || [],
      sources: r[4]?.results || [],
      daily: r[5]?.results || [],
    });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
