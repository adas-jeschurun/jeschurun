import { json } from "../_lib/json.js";

async function ensureNotesColumn(db) {
  try {
    await db.prepare(`ALTER TABLE incoming_questions ADD COLUMN admin_notes TEXT DEFAULT ''`).run();
  } catch {
    /* already exists */
  }
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.QUESTIONS_DB) return json({ ok: false, error: "no questions db" }, 500);
    await ensureNotesColumn(env.QUESTIONS_DB);
    const u = new URL(request.url);
    const status = u.searchParams.get("status");
    const id = u.searchParams.get("id");
    if (id) {
      const row = await env.QUESTIONS_DB.prepare(
        `SELECT * FROM incoming_questions WHERE id=?1`,
      )
        .bind(id)
        .first();
      if (!row) return json({ ok: false, error: "not found" }, 404);
      return json({ ok: true, item: row });
    }
    let rows;
    if (status && status !== "all") {
      rows = await env.QUESTIONS_DB.prepare(
        `SELECT * FROM incoming_questions WHERE status=?1 ORDER BY created_at DESC LIMIT 200`,
      )
        .bind(status)
        .all();
    } else {
      rows = await env.QUESTIONS_DB.prepare(
        `SELECT * FROM incoming_questions ORDER BY created_at DESC LIMIT 200`,
      ).all();
    }
    return json({ ok: true, items: rows.results || [] });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    await ensureNotesColumn(env.QUESTIONS_DB);
    const b = await request.json();
    if (!b.id) return json({ ok: false, error: "bad body" }, 400);
    const allowed = ["new", "answered", "spam", "archived"];
    if (b.status && !allowed.includes(b.status)) {
      return json({ ok: false, error: "bad status" }, 400);
    }
    if (b.status != null && b.admin_notes != null) {
      await env.QUESTIONS_DB.prepare(
        `UPDATE incoming_questions SET status=?1, admin_notes=?2 WHERE id=?3`,
      )
        .bind(b.status, String(b.admin_notes || ""), b.id)
        .run();
    } else if (b.status != null) {
      await env.QUESTIONS_DB.prepare(`UPDATE incoming_questions SET status=?1 WHERE id=?2`)
        .bind(b.status, b.id)
        .run();
    } else if (b.admin_notes != null) {
      await env.QUESTIONS_DB.prepare(
        `UPDATE incoming_questions SET admin_notes=?1 WHERE id=?2`,
      )
        .bind(String(b.admin_notes || ""), b.id)
        .run();
    } else {
      return json({ ok: false, error: "nothing to update" }, 400);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
