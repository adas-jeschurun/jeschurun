import { json, LANGS } from "../_lib/json.js";

function table(kind) {
  return kind === "article"
    ? "articles"
    : kind === "answer"
      ? "answers"
      : kind === "bio"
        ? "bios"
        : kind === "issue"
          ? "issues"
          : null;
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "no db" }, 500);
    const u = new URL(request.url);
    const kind = u.searchParams.get("kind") || "article";
    const t = table(kind);
    if (!t) return json({ ok: false, error: "bad kind" }, 400);
    const rows = await env.CONTENT_DB.prepare(`SELECT * FROM ${t} ORDER BY published_at DESC`).all();
    return json({ ok: true, kind, items: rows.results || [] });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "no db" }, 500);
    const b = await request.json();
    const kind = b.kind || "article";
    const t = table(kind);
    if (!t) return json({ ok: false, error: "bad kind" }, 400);
    const id = b.id || b.slug || crypto.randomUUID();
    const slug = b.slug || id;
    if (kind === "article") {
      await env.CONTENT_DB.prepare(
        `INSERT INTO articles(id,slug,status,source_issue,published_at,updated_at,lead_image,meta_json)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
         ON CONFLICT(id) DO UPDATE SET
           slug=excluded.slug,status=excluded.status,source_issue=excluded.source_issue,
           published_at=excluded.published_at,updated_at=excluded.updated_at,
           lead_image=excluded.lead_image,meta_json=excluded.meta_json`,
      )
        .bind(
          id,
          slug,
          b.status || "draft",
          b.source_issue || "",
          b.published_at || "",
          new Date().toISOString(),
          b.lead_image || "",
          JSON.stringify(b.meta || {}),
        )
        .run();
    } else if (kind === "answer") {
      await env.CONTENT_DB.prepare(
        `INSERT INTO answers(id,slug,status,source_issue,published_at,updated_at,meta_json)
         VALUES(?1,?2,?3,?4,?5,?6,?7)
         ON CONFLICT(id) DO UPDATE SET
           slug=excluded.slug,status=excluded.status,source_issue=excluded.source_issue,
           published_at=excluded.published_at,updated_at=excluded.updated_at,meta_json=excluded.meta_json`,
      )
        .bind(
          id,
          slug,
          b.status || "draft",
          b.source_issue || "",
          b.published_at || "",
          new Date().toISOString(),
          JSON.stringify(b.meta || {}),
        )
        .run();
    } else if (kind === "bio") {
      await env.CONTENT_DB.prepare(
        `INSERT INTO bios(id,slug,status,years,published_at,updated_at,meta_json)
         VALUES(?1,?2,?3,?4,?5,?6,?7)
         ON CONFLICT(id) DO UPDATE SET
           slug=excluded.slug,status=excluded.status,years=excluded.years,
           published_at=excluded.published_at,updated_at=excluded.updated_at,meta_json=excluded.meta_json`,
      )
        .bind(
          id,
          slug,
          b.status || "draft",
          b.years || "",
          b.published_at || "",
          new Date().toISOString(),
          JSON.stringify(b.meta || {}),
        )
        .run();
    }
    if (b.translations) {
      for (const l of LANGS) {
        const tr = b.translations[l];
        if (!tr) continue;
        const tid = `${kind}:${id}:${l}`;
        await env.CONTENT_DB.prepare(
          `INSERT INTO translations(id,kind,parent_id,lang,title,summary,body_md,body_text,extra_json)
           VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
           ON CONFLICT(id) DO UPDATE SET
             title=excluded.title,summary=excluded.summary,body_md=excluded.body_md,
             body_text=excluded.body_text,extra_json=excluded.extra_json`,
        )
          .bind(
            tid,
            kind,
            id,
            l,
            tr.title || tr.name || "",
            tr.summary || "",
            tr.body_md || "",
            tr.body_text || tr.body_md || "",
            JSON.stringify(tr.extra || {}),
          )
          .run();
      }
    }
    return json({ ok: true, id, slug });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const u = new URL(request.url);
    const kind = u.searchParams.get("kind");
    const id = u.searchParams.get("id");
    const t = table(kind);
    if (!t || !id) return json({ ok: false, error: "bad params" }, 400);
    await env.CONTENT_DB.prepare(`DELETE FROM translations WHERE kind=?1 AND parent_id=?2`)
      .bind(kind, id)
      .run();
    if (kind === "article") {
      await env.CONTENT_DB.prepare(`DELETE FROM article_tags WHERE article_id=?1`).bind(id).run();
      await env.CONTENT_DB.prepare(`DELETE FROM related_articles WHERE article_id=?1 OR related_id=?1`)
        .bind(id)
        .run();
    }
    await env.CONTENT_DB.prepare(`DELETE FROM ${t} WHERE id=?1`).bind(id).run();
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
