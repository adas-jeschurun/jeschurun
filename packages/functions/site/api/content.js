import { json, LANGS } from "../_lib/json.js";

function stripLang(kind, langs = {}) {
  const out = {};
  for (const l of LANGS) {
    const x = langs?.[l];
    if (!x) continue;
    if (kind === "article") out[l] = { title: x.title || "", summary: x.summary || "" };
    else if (kind === "answer")
      out[l] = { title: x.title || "", question: x.question || x.summary || "", summary: x.summary || "" };
    else if (kind === "bio") out[l] = { name: x.title || x.name || "", summary: x.summary || "" };
    else out[l] = x;
  }
  return out;
}

async function loadTranslations(db, kind, ids) {
  if (!ids.length) return new Map();
  const map = new Map();
  const placeholders = ids.map((_, i) => `?${i + 2}`).join(",");
  const rows = await db
    .prepare(
      `SELECT parent_id, lang, title, summary, extra_json FROM translations WHERE kind=?1 AND parent_id IN (${placeholders})`,
    )
    .bind(kind, ...ids)
    .all();
  for (const r of rows.results || []) {
    if (!map.has(r.parent_id)) map.set(r.parent_id, {});
    const extra = JSON.parse(r.extra_json || "{}");
    map.get(r.parent_id)[r.lang] = {
      title: r.title,
      summary: r.summary,
      name: r.title,
      question: extra.question || r.summary,
      ...extra,
    };
  }
  return map;
}

export async function onRequestGet({ env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "CONTENT_DB missing" }, 500);
    const db = env.CONTENT_DB;

    const issuesR = await db
      .prepare(
        `SELECT id, hebrew_year, slug, parasha_key, published_at, status, sort_order, meta_json FROM issues WHERE status='published' ORDER BY published_at DESC`,
      )
      .all();
    const issuesRaw = issuesR.results || [];
    const issueIds = issuesRaw.map((i) => i.id);
    const issueTr = await loadTranslations(db, "issue", issueIds);
    const issues = issuesRaw.map((i) => {
      const meta = JSON.parse(i.meta_json || "{}");
      return {
        ...meta,
        id: i.id,
        hebrew_year: i.hebrew_year,
        slug: i.slug,
        parasha_key: i.parasha_key,
        published_at: i.published_at,
        status: i.status,
        languages: issueTr.get(i.id) || meta.languages || {},
      };
    });

    async function materials(table, kind) {
      const r = await db
        .prepare(
          `SELECT * FROM ${table} WHERE status='published' OR status='draft' ORDER BY published_at DESC`,
        )
        .all();
      // published only for public
      const rows = (r.results || []).filter((x) => x.status === "published" || (kind === "bio" && x.status !== "hidden"));
      const pub =
        kind === "bio"
          ? (r.results || []).filter((x) => x.status !== "hidden")
          : (r.results || []).filter((x) => x.status === "published");
      const tr = await loadTranslations(
        db,
        kind,
        pub.map((x) => x.id),
      );
      return pub.map((row) => ({
        id: row.id,
        slug: row.slug,
        type: kind,
        status: row.status,
        source_issue: row.source_issue || "",
        published_at: row.published_at || "",
        updated_at: row.updated_at || "",
        years: row.years || "",
        lead_image: row.lead_image || "",
        languages: stripLang(kind, tr.get(row.id) || {}),
      }));
    }

    const articles = await materials("articles", "article");
    const answers = await materials("answers", "answer");
    const biographies = await materials("bios", "bio");

    const cur = await db
      .prepare(`SELECT value FROM site_config WHERE key='current_issue'`)
      .first();
    const key = cur?.value;
    let currentIssue =
      (key &&
        issues.find((i) => `${i.hebrew_year}/${i.slug}` === key)) ||
      issues[0] ||
      null;

    // tags map for articles
    const tagRows = await db
      .prepare(
        `SELECT at.article_id, at.tag_slug, t.labels_json FROM article_tags at JOIN tags t ON t.slug=at.tag_slug`,
      )
      .all();
    const tagsByArticle = {};
    const tagIndex = new Map();
    for (const r of tagRows.results || []) {
      const entry = {
        slug: r.tag_slug,
        labels: JSON.parse(r.labels_json || "{}"),
      };
      if (!tagsByArticle[r.article_id]) tagsByArticle[r.article_id] = [];
      tagsByArticle[r.article_id].push(entry);
      if (!tagIndex.has(r.tag_slug)) tagIndex.set(r.tag_slug, entry);
    }
    const tags = [...tagIndex.values()].sort((a, b) =>
      String(a.slug).localeCompare(String(b.slug)),
    );

    return json(
      {
        ok: true,
        issues,
        articles,
        answers,
        biographies,
        currentIssue,
        tags,
        tagsByArticle,
        customOrnaments: [],
      },
      200,
      { cache: "public, max-age=60" },
    );
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
