import { LANG_SET } from "./json.js";
import { markdownBlocks } from "./markdown.js";

export const MATERIAL_CACHE_CONTROL =
  "public, max-age=300, stale-while-revalidate=86400";

export function tableFor(kind) {
  return kind === "article"
    ? "articles"
    : kind === "answer"
      ? "answers"
      : kind === "bio"
        ? "bios"
        : null;
}

export function materialCacheKey(kind, slug, lang) {
  const langPart = lang || "all";
  return new Request(
    `https://jeschurun.internal/material-v1/${kind}/${encodeURIComponent(slug)}/${langPart}`,
  );
}

export function previewOk(request, env) {
  const expected = env.ADMIN_PREVIEW_TOKEN;
  if (!expected || !String(expected).trim()) return false;
  const u = new URL(request.url);
  const q = u.searchParams.get("admin_preview") || "";
  if (q && q === expected) return true;
  const auth = request.headers.get("authorization") || "";
  if (/^Bearer\s+/i.test(auth) && auth.replace(/^Bearer\s+/i, "").trim() === expected) {
    return true;
  }
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
  if (m && decodeURIComponent(m[1].trim()) === expected) return true;
  return false;
}

async function loadRelated(db, articleId) {
  const rel = await db
    .prepare(
      `SELECT related_id, score FROM related_articles WHERE article_id=?1 ORDER BY score DESC LIMIT 8`,
    )
    .bind(articleId)
    .all();
  const rows = rel.results || [];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.related_id);
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
  const [articlesR, titlesR] = await Promise.all([
    db
      .prepare(
        `SELECT id, slug, source_issue, published_at FROM articles WHERE id IN (${placeholders}) AND status='published'`,
      )
      .bind(...ids)
      .all(),
    db
      .prepare(
        `SELECT parent_id, lang, title, summary FROM translations WHERE kind='article' AND parent_id IN (${placeholders})`,
      )
      .bind(...ids)
      .all(),
  ]);

  const byId = new Map((articlesR.results || []).map((a) => [a.id, a]));
  const langsById = new Map();
  for (const t of titlesR.results || []) {
    if (!langsById.has(t.parent_id)) langsById.set(t.parent_id, {});
    langsById.get(t.parent_id)[t.lang] = { title: t.title, summary: t.summary };
  }

  const out = [];
  for (const r of rows) {
    const a = byId.get(r.related_id);
    if (!a) continue;
    out.push({
      id: a.id,
      slug: a.slug,
      type: "article",
      source_issue: a.source_issue,
      published_at: a.published_at,
      score: r.score,
      languages: langsById.get(a.id) || {},
    });
  }
  return out;
}

export async function buildMaterial(db, kind, slug, row, langFilter) {
  const tr = await db
    .prepare(
      `SELECT lang, title, summary, body_md, extra_json FROM translations WHERE kind=?1 AND parent_id=?2`,
    )
    .bind(kind, row.id)
    .all();

  const languages = {};
  const assetPrefix = `/api/asset?path=${encodeURIComponent(`content/${kind === "answer" ? "rabbi-answers" : kind === "bio" ? "biographies" : "articles"}/${slug}`)}`;
  for (const t of tr.results || []) {
    if (langFilter && t.lang !== langFilter) continue;
    const extra = JSON.parse(t.extra_json || "{}");
    const body = markdownBlocks(t.body_md || "", assetPrefix);
    if (kind === "article") {
      languages[t.lang] = { title: t.title || "", summary: t.summary || "", body };
    } else if (kind === "answer") {
      languages[t.lang] = {
        title: t.title || "",
        question: extra.question || t.summary || "",
        summary: t.summary || "",
        body,
      };
    } else {
      languages[t.lang] = { name: t.title || "", summary: t.summary || "", body };
    }
  }

  const [tags, related] = await Promise.all([
    kind === "article"
      ? db
          .prepare(
            `SELECT t.slug, t.labels_json FROM article_tags at JOIN tags t ON t.slug=at.tag_slug WHERE at.article_id=?1`,
          )
          .bind(row.id)
          .all()
          .then(
            (r) =>
              r.results?.map((x) => ({
                slug: x.slug,
                labels: JSON.parse(x.labels_json || "{}"),
              })) || [],
          )
      : Promise.resolve([]),
    kind === "article" ? loadRelated(db, row.id) : Promise.resolve([]),
  ]);

  return {
    id: row.id,
    slug: row.slug,
    type: kind,
    status: row.status,
    source_issue: row.source_issue || "",
    published_at: row.published_at || "",
    updated_at: row.updated_at || "",
    years: row.years || "",
    lead_image: row.lead_image || "",
    languages,
    tags,
    related,
  };
}

/**
 * Resolve published material payload (Cache API first, then D1).
 * Returns { ok, material, cache: "HIT"|"MISS" } or { ok:false }.
 */
export async function resolveMaterial(env, { kind, slug, lang }) {
  const table = tableFor(kind);
  if (!table || !env?.CONTENT_DB) return { ok: false, error: "unavailable" };
  if (!/^[A-Za-z0-9._-]+$/.test(String(slug || ""))) {
    return { ok: false, error: "Bad material" };
  }
  const langFilter = LANG_SET.has(lang) ? lang : null;

  try {
    const hit = await caches.default.match(
      materialCacheKey(kind, slug, langFilter),
    );
    if (hit) {
      const data = await hit.json();
      if (data?.ok && data.material) {
        return { ok: true, material: data.material, cache: "HIT" };
      }
    }
  } catch {
    /* fall through to D1 */
  }

  const row = await env.CONTENT_DB.prepare(`SELECT * FROM ${table} WHERE slug=?1`)
    .bind(slug)
    .first();
  if (
    !row ||
    (kind !== "bio" && row.status !== "published") ||
    (kind === "bio" && row.status === "hidden")
  ) {
    return { ok: false, error: "Not found" };
  }

  const material = await buildMaterial(
    env.CONTENT_DB,
    kind,
    slug,
    row,
    langFilter,
  );

  try {
    const body = JSON.stringify({ ok: true, material });
    await caches.default.put(
      materialCacheKey(kind, slug, langFilter),
      new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": MATERIAL_CACHE_CONTROL,
          "x-jes-material-cache": "MISS",
        },
      }),
    );
  } catch {
    /* ignore */
  }

  return { ok: true, material, cache: "MISS" };
}
