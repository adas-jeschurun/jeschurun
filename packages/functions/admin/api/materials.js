import { json, LANGS } from "../_lib/json.js";
import { day, folderFor, tableFor, toDbKind, toFriendKind } from "../_lib/kinds.js";

async function titlesFor(db, dbKind, id) {
  const rows =
    (
      await db
        .prepare(
          `SELECT lang, title, summary, body_md, extra_json FROM translations WHERE kind=?1 AND parent_id=?2`,
        )
        .bind(dbKind, id)
        .all()
    ).results || [];
  const titles = {};
  const available = [];
  for (const t of rows) {
    let label = t.title || "";
    if (dbKind === "answer") {
      const extra = JSON.parse(t.extra_json || "{}");
      label = t.title || extra.question || t.summary || "";
    }
    if (dbKind === "bio") label = t.title || "";
    titles[t.lang] = label || id;
    if (
      (t.body_md && t.body_md.trim()) ||
      (t.title && t.title.trim()) ||
      (t.summary && t.summary.trim())
    ) {
      available.push(t.lang);
    }
  }
  for (const l of LANGS) if (!(l in titles)) titles[l] = "";
  return { titles, available_languages: available.length ? available : LANGS.slice() };
}

async function listKind(db, dbKind) {
  const table = tableFor(dbKind);
  const rows =
    (await db.prepare(`SELECT * FROM ${table} ORDER BY published_at DESC`).all()).results ||
    [];
  const out = [];
  for (const row of rows) {
    const { titles, available_languages } = await titlesFor(db, dbKind, row.id);
    out.push({
      scope: row.status === "published" ? "live" : "test",
      kind: toFriendKind(dbKind),
      slug: row.slug,
      id: row.id,
      status: row.status || "draft",
      titles,
      available_languages,
      dateKey: day(row.updated_at) || day(row.published_at) || "",
      updated_at: row.updated_at || "",
      source_issue: row.source_issue || "",
      years: row.years || "",
    });
  }
  return out;
}

/** Friend-compatible materials catalog + legacy ?kind= list. */
export async function onRequestGet({ request, env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "no db" }, 500);
    const u = new URL(request.url);
    const kindParam = u.searchParams.get("kind");
    const q = (u.searchParams.get("q") || "").trim().toLowerCase();

    if (kindParam) {
      const dbKind = toDbKind(kindParam);
      const table = tableFor(dbKind);
      if (!table) return json({ ok: false, error: "bad kind" }, 400);
      const rows =
        (await env.CONTENT_DB.prepare(`SELECT * FROM ${table} ORDER BY published_at DESC`).all())
          .results || [];
      return json({ ok: true, kind: dbKind, items: rows });
    }

    let materials = [
      ...(await listKind(env.CONTENT_DB, "article")),
      ...(await listKind(env.CONTENT_DB, "answer")),
      ...(await listKind(env.CONTENT_DB, "bio")),
    ];
    if (q) {
      materials = materials.filter((m) => {
        const hay = [
          m.slug,
          m.source_issue,
          ...Object.values(m.titles || {}),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    materials.sort(
      (a, b) =>
        String(b.dateKey || "").localeCompare(String(a.dateKey || "")) ||
        a.kind.localeCompare(b.kind) ||
        a.slug.localeCompare(b.slug),
    );
    return json({ ok: true, materials, folderHint: folderFor("article") });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "no db" }, 500);
    const b = await request.json();
    const dbKind = toDbKind(b.kind || "article");
    const t = tableFor(dbKind);
    if (!t || dbKind === "issue") return json({ ok: false, error: "bad kind" }, 400);
    const id = b.id || b.slug || crypto.randomUUID();
    const slug = b.slug || id;
    const now = new Date().toISOString();
    if (dbKind === "article") {
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
          now,
          b.lead_image || "",
          JSON.stringify(b.meta || {}),
        )
        .run();
    } else if (dbKind === "answer") {
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
          now,
          JSON.stringify(b.meta || {}),
        )
        .run();
    } else if (dbKind === "bio") {
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
          now,
          JSON.stringify(b.meta || {}),
        )
        .run();
    }
    if (b.translations) {
      for (const l of LANGS) {
        const tr = b.translations[l];
        if (!tr) continue;
        const tid = `${dbKind}:${id}:${l}`;
        await env.CONTENT_DB.prepare(
          `INSERT INTO translations(id,kind,parent_id,lang,title,summary,body_md,body_text,extra_json)
           VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
           ON CONFLICT(id) DO UPDATE SET
             title=excluded.title,summary=excluded.summary,body_md=excluded.body_md,
             body_text=excluded.body_text,extra_json=excluded.extra_json`,
        )
          .bind(
            tid,
            dbKind,
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
    return json({ ok: true, id, slug, kind: toFriendKind(dbKind) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const u = new URL(request.url);
    const dbKind = toDbKind(u.searchParams.get("kind"));
    const id = u.searchParams.get("id");
    const slug = u.searchParams.get("slug");
    const t = tableFor(dbKind);
    if (!t || (!id && !slug)) return json({ ok: false, error: "bad params" }, 400);
    let rowId = id;
    if (!rowId && slug) {
      const row = await env.CONTENT_DB.prepare(`SELECT id FROM ${t} WHERE slug=?1`)
        .bind(slug)
        .first();
      rowId = row?.id;
    }
    if (!rowId) return json({ ok: false, error: "not found" }, 404);
    await env.CONTENT_DB.prepare(`DELETE FROM translations WHERE kind=?1 AND parent_id=?2`)
      .bind(dbKind, rowId)
      .run();
    if (dbKind === "article") {
      await env.CONTENT_DB.prepare(`DELETE FROM article_tags WHERE article_id=?1`)
        .bind(rowId)
        .run();
      await env.CONTENT_DB.prepare(
        `DELETE FROM related_articles WHERE article_id=?1 OR related_id=?1`,
      )
        .bind(rowId)
        .run();
    }
    await env.CONTENT_DB.prepare(`DELETE FROM ${t} WHERE id=?1`).bind(rowId).run();
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
