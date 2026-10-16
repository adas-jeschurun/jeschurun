import { json, LANGS } from "../_lib/json.js";

export async function onRequestGet({ env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "CONTENT_DB missing" }, 500);
    const db = env.CONTENT_DB;
    const out = { articles: [], answers: [], biographies: [] };

    async function load(kind, table, bucket) {
      const rows = await db
        .prepare(
          kind === "bio"
            ? `SELECT id, slug, status, source_issue, published_at FROM ${table} WHERE status!='hidden'`
            : `SELECT id, slug, status, source_issue, published_at FROM ${table} WHERE status='published'`,
        )
        .all();
      for (const row of rows.results || []) {
        const tr = await db
          .prepare(
            `SELECT lang, title, summary, body_text, extra_json FROM translations WHERE kind=?1 AND parent_id=?2`,
          )
          .bind(kind, row.id)
          .all();
        const languages = {};
        for (const t of tr.results || []) {
          const extra = JSON.parse(t.extra_json || "{}");
          const text = t.body_text || "";
          if (kind === "article") {
            languages[t.lang] = {
              title: t.title || "",
              summary: t.summary || "",
              body: [{ type: "p", text }],
            };
          } else if (kind === "answer") {
            languages[t.lang] = {
              title: t.title || "",
              question: extra.question || t.summary || "",
              body: [{ type: "p", text }],
            };
          } else {
            languages[t.lang] = {
              name: t.title || "",
              summary: t.summary || "",
              body: [{ type: "p", text }],
            };
          }
        }
        out[bucket].push({
          id: row.id,
          slug: row.slug,
          type: kind,
          status: row.status,
          source_issue: row.source_issue || "",
          published_at: row.published_at || "",
          languages,
        });
      }
    }

    await load("article", "articles", "articles");
    await load("answer", "answers", "answers");
    await load("bio", "bios", "biographies");
    return json({ ok: true, ...out }, 200, { cache: "public, max-age=120" });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
