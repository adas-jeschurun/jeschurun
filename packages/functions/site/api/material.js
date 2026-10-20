import { json, LANG_SET } from "../_lib/json.js";
import { markdownBlocks } from "../_lib/markdown.js";

const CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400";

function tableFor(kind) {
  return kind === "article"
    ? "articles"
    : kind === "answer"
      ? "answers"
      : kind === "bio"
        ? "bios"
        : null;
}

function previewOk(request, env) {
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

function cacheKey(kind, slug, lang) {
  const langPart = lang || "all";
  return new Request(
    `https://jeschurun.internal/material-v1/${kind}/${encodeURIComponent(slug)}/${langPart}`,
  );
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

async function buildMaterial(db, kind, slug, row, langFilter) {
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

export async function onRequestGet({ request, env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "CONTENT_DB missing" }, 500);
    const u = new URL(request.url);
    const kind = u.searchParams.get("kind");
    const slug = u.searchParams.get("slug");
    const langRaw = u.searchParams.get("lang") || "";
    const langFilter = LANG_SET.has(langRaw) ? langRaw : null;
    const table = tableFor(kind);
    if (!table || !/^[A-Za-z0-9._-]+$/.test(String(slug || ""))) {
      return json({ ok: false, error: "Bad material" }, 400);
    }

    const allowDraft = previewOk(request, env);
    // Edge cache only for public published payloads (no preview token).
    if (!allowDraft) {
      const hit = await caches.default.match(cacheKey(kind, slug, langFilter));
      if (hit) {
        const headers = new Headers(hit.headers);
        headers.set("x-jes-material-cache", "HIT");
        return new Response(hit.body, { status: hit.status, headers });
      }
    }

    const row = await env.CONTENT_DB.prepare(`SELECT * FROM ${table} WHERE slug=?1`)
      .bind(slug)
      .first();
    if (
      !row ||
      (!allowDraft &&
        ((kind !== "bio" && row.status !== "published") ||
          (kind === "bio" && row.status === "hidden")))
    ) {
      return json({ ok: false, error: "Not found" }, 404);
    }

    const material = await buildMaterial(
      env.CONTENT_DB,
      kind,
      slug,
      row,
      langFilter,
    );
    const res = json(
      { ok: true, material },
      200,
      {
        cache: allowDraft ? "private, no-store" : CACHE_CONTROL,
        headers: { "x-jes-material-cache": "MISS" },
      },
    );

    if (!allowDraft) {
      try {
        await caches.default.put(cacheKey(kind, slug, langFilter), res.clone());
      } catch {
        /* ignore edge cache write failures */
      }
    }
    return res;
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
