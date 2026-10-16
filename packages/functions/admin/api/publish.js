import { json } from "../_lib/json.js";

export async function onRequestPost({ request, env }) {
  try {
    const b = await request.json();
    const { kind, id, status } = b;
    const table =
      kind === "article"
        ? "articles"
        : kind === "answer"
          ? "answers"
          : kind === "bio"
            ? "bios"
            : kind === "issue"
              ? "issues"
              : null;
    if (!table || !id || !["published", "draft", "hidden"].includes(status)) {
      return json({ ok: false, error: "bad params" }, 400);
    }
    await env.CONTENT_DB.prepare(`UPDATE ${table} SET status=?1 WHERE id=?2`)
      .bind(status, id)
      .run();
    return json({ ok: true, id, status });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
