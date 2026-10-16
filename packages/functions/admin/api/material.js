import { json, LANGS } from "../_lib/json.js";
import { folderFor, safeSlug, tableFor, toDbKind, toFriendKind } from "../_lib/kinds.js";

/** Friend-compatible single material with markdown per lang. */
export async function onRequestGet({ request, env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "no db" }, 500);
    const u = new URL(request.url);
    const dbKind = toDbKind(u.searchParams.get("kind"));
    const slug = u.searchParams.get("slug");
    const id = u.searchParams.get("id");
    const table = tableFor(dbKind);
    if (!table || dbKind === "issue") return json({ ok: false, error: "bad kind" }, 400);
    if (!id && !safeSlug(slug)) return json({ ok: false, error: "Недопустимый материал" }, 400);

    let row;
    if (id) {
      row = await env.CONTENT_DB.prepare(`SELECT * FROM ${table} WHERE id=?1`).bind(id).first();
    } else {
      row = await env.CONTENT_DB.prepare(`SELECT * FROM ${table} WHERE slug=?1`)
        .bind(slug)
        .first();
    }
    if (!row) return json({ ok: false, error: "Материал не найден" }, 404);

    const tr =
      (
        await env.CONTENT_DB.prepare(
          `SELECT lang, title, summary, body_md, extra_json FROM translations WHERE kind=?1 AND parent_id=?2`,
        )
          .bind(dbKind, row.id)
          .all()
      ).results || [];

    const languages = {};
    for (const l of LANGS) {
      const t = tr.find((x) => x.lang === l) || {};
      const extra = JSON.parse(t.extra_json || "{}");
      if (dbKind === "article") {
        languages[l] = {
          title: t.title || "",
          summary: t.summary || "",
          markdown: t.body_md || "",
          body: [],
        };
      } else if (dbKind === "answer") {
        languages[l] = {
          title: t.title || "",
          question: extra.question || t.summary || "",
          markdown: t.body_md || "",
          body: [],
        };
      } else {
        languages[l] = {
          name: t.title || "",
          summary: t.summary || "",
          markdown: t.body_md || "",
          body: [],
        };
      }
    }

    let tags = [];
    if (dbKind === "article") {
      tags =
        (
          await env.CONTENT_DB.prepare(
            `SELECT tag_slug FROM article_tags WHERE article_id=?1`,
          )
            .bind(row.id)
            .all()
        ).results?.map((x) => x.tag_slug) || [];
    }

    const folder = folderFor(dbKind);
    const material = {
      id: row.id,
      slug: row.slug,
      status: row.status || "draft",
      inIssue: !!row.source_issue,
      source_issue: row.source_issue || "",
      published_at: row.published_at || "",
      lead_image: row.lead_image || "",
      languages,
      tags,
    };
    if (dbKind === "bio") material.years = row.years || "";

    return json({
      ok: true,
      scope: row.status === "published" ? "live" : "test",
      kind: toFriendKind(dbKind),
      base: `content/${folder}/${row.slug}`,
      material,
    });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
