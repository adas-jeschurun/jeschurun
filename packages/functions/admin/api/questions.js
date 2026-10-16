import { json } from "../_lib/json.js";

export async function onRequestGet({ request, env }) {
  try {
    if (!env.QUESTIONS_DB) return json({ ok: false, error: "no questions db" }, 500);
    const u = new URL(request.url);
    const status = u.searchParams.get("status") || "new";
    const rows = await env.QUESTIONS_DB.prepare(
      `SELECT * FROM incoming_questions WHERE status=?1 ORDER BY created_at DESC LIMIT 200`,
    )
      .bind(status)
      .all();
    return json({ ok: true, items: rows.results || [] });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const b = await request.json();
    if (!b.id || !b.status) return json({ ok: false, error: "bad body" }, 400);
    await env.QUESTIONS_DB.prepare(
      `UPDATE incoming_questions SET status=?1 WHERE id=?2`,
    )
      .bind(b.status, b.id)
      .run();
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
