import { json, LANGS } from "./json.js";

export const CATALOG_CACHE_KEY = new Request(
  "https://jeschurun.internal/catalog-v3",
);
export const CATALOG_CACHE_CONTROL =
  "public, max-age=600, stale-while-revalidate=86400";

function stripLang(kind, langs = {}) {
  const out = {};
  for (const l of LANGS) {
    const x = langs?.[l];
    if (!x) continue;
    if (kind === "article") out[l] = { title: x.title || "", summary: x.summary || "" };
    else if (kind === "answer")
      out[l] = {
        title: x.title || "",
        question: x.question || x.summary || "",
        summary: x.summary || "",
      };
    else if (kind === "bio")
      out[l] = { name: x.title || x.name || "", summary: x.summary || "" };
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

export async function loadCatalog(db) {
  async function materials(table, kind) {
    const r = await db
      .prepare(
        `SELECT * FROM ${table} WHERE status='published' OR status='draft' ORDER BY published_at DESC`,
      )
      .all();
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

  async function loadIssues() {
    const issuesR = await db
      .prepare(
        `SELECT id, hebrew_year, slug, parasha_key, published_at, status, sort_order, meta_json FROM issues WHERE status='published' ORDER BY published_at DESC`,
      )
      .all();
    const issuesRaw = issuesR.results || [];
    const issueTr = await loadTranslations(
      db,
      "issue",
      issuesRaw.map((i) => i.id),
    );
    return issuesRaw.map((i) => {
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
  }

  const [issues, articles, answers, biographies, cur, tagRows] =
    await Promise.all([
      loadIssues(),
      materials("articles", "article"),
      materials("answers", "answer"),
      materials("bios", "bio"),
      db.prepare(`SELECT value FROM site_config WHERE key='current_issue'`).first(),
      db
        .prepare(
          `SELECT at.article_id, at.tag_slug, t.labels_json FROM article_tags at JOIN tags t ON t.slug=at.tag_slug`,
        )
        .all(),
    ]);

  const key = cur?.value;
  const currentIssue =
    (key && issues.find((i) => `${i.hebrew_year}/${i.slug}` === key)) ||
    issues[0] ||
    null;

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

  return {
    ok: true,
    issues,
    articles,
    answers,
    biographies,
    currentIssue,
    tags,
    tagsByArticle,
    customOrnaments: [],
  };
}

function catalogResponse(data, cacheStatus) {
  return json(data, 200, {
    cache: CATALOG_CACHE_CONTROL,
    headers: { "x-jes-catalog-cache": cacheStatus },
  });
}

/**
 * Cache API + D1 catalog. Shared by /api/content and HTML middleware bootstrap.
 * @returns {{ data: object, source: "HIT"|"MISS" } | null}
 */
export async function resolveCatalog(env, ctx) {
  if (!env?.CONTENT_DB) return null;
  const cache = caches.default;
  const hit = await cache.match(CATALOG_CACHE_KEY);
  if (hit) {
    try {
      const data = await hit.json();
      if (data?.ok) return { data, source: "HIT" };
    } catch {
      /* rebuild */
    }
  }

  const data = await loadCatalog(env.CONTENT_DB);
  const res = catalogResponse(data, "MISS");
  const put = cache.put(CATALOG_CACHE_KEY, res.clone()).catch(() => {});
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(put);
  else await put;
  return { data, source: "MISS" };
}

export { catalogResponse };
