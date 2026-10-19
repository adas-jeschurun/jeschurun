import { json, LANGS } from "../_lib/json.js";
import { markdownBlocks } from "../_lib/markdown.js";

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

export async function onRequestGet({ request, env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "CONTENT_DB missing" }, 500);
    const u = new URL(request.url);
    const kind = u.searchParams.get("kind");
    const slug = u.searchParams.get("slug");
    const table = tableFor(kind);
    if (!table || !/^[A-Za-z0-9._-]+$/.test(String(slug || ""))) {
      return json({ ok: false, error: "Bad material" }, 400);
    }
    const row = await env.CONTENT_DB.prepare(
      `SELECT * FROM ${table} WHERE slug=?1`,
    )
      .bind(slug)
      .first();
    const allowDraft = previewOk(request, env);
    if (
      !row ||
      (!allowDraft &&
        ((kind !== "bio" && row.status !== "published") ||
          (kind === "bio" && row.status === "hidden")))
    ) {
      return json({ ok: false, error: "Not found" }, 404);
    }

    const tr = await env.CONTENT_DB.prepare(
      `SELECT lang, title, summary, body_md, extra_json FROM translations WHERE kind=?1 AND parent_id=?2`,
    )
      .bind(kind, row.id)
      .all();

    const languages = {};
    const assetPrefix = `/api/asset?path=${encodeURIComponent(`content/${kind === "answer" ? "rabbi-answers" : kind === "bio" ? "biographies" : "articles"}/${slug}`)}`;
    for (const t of tr.results || []) {
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

    const tags =
      kind === "article"
        ? (
            await env.CONTENT_DB.prepare(
              `SELECT t.slug, t.labels_json FROM article_tags at JOIN tags t ON t.slug=at.tag_slug WHERE at.article_id=?1`,
            )
              .bind(row.id)
              .all()
          ).results?.map((x) => ({
            slug: x.slug,
            labels: JSON.parse(x.labels_json || "{}"),
          })) || []
        : [];

    const related =
      kind === "article"
        ? await (async () => {
            const rel = await env.CONTENT_DB.prepare(
              `SELECT related_id, score FROM related_articles WHERE article_id=?1 ORDER BY score DESC LIMIT 8`,
            )
              .bind(row.id)
              .all();
            const out = [];
            for (const r of rel.results || []) {
              const a = await env.CONTENT_DB.prepare(
                `SELECT id, slug, source_issue, published_at FROM articles WHERE id=?1 AND status='published'`,
              )
                .bind(r.related_id)
                .first();
              if (!a) continue;
              const titles = await env.CONTENT_DB.prepare(
                `SELECT lang, title, summary FROM translations WHERE kind='article' AND parent_id=?1`,
              )
                .bind(a.id)
                .all();
              const languages = {};
              for (const t of titles.results || []) {
                languages[t.lang] = { title: t.title, summary: t.summary };
              }
              out.push({
                id: a.id,
                slug: a.slug,
                type: "article",
                source_issue: a.source_issue,
                published_at: a.published_at,
                score: r.score,
                languages,
              });
            }
            return out;
          })()
        : [];

    const material = {
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
    return json({ ok: true, material }, 200, { cache: "public, max-age=60" });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
