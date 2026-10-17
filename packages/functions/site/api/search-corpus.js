import { json } from "../_lib/json.js";

const CACHE_KEY = new Request("https://jeschurun.internal/search-corpus-v2");
const CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400";
/** Keep enough body text for ranking without shipping full articles (~700KB → ~200KB). */
const BODY_CHARS = 2000;

function clipBody(text) {
  const s = String(text || "");
  if (s.length <= BODY_CHARS) return s;
  return s.slice(0, BODY_CHARS);
}

async function loadBucket(db, kind, table, bucket) {
  // bios has no source_issue column (schema/content.sql)
  const rows = await db
    .prepare(
      kind === "bio"
        ? `SELECT id, slug, status, published_at FROM ${table} WHERE status!='hidden'`
        : `SELECT id, slug, status, source_issue, published_at FROM ${table} WHERE status='published'`,
    )
    .all();
  const list = rows.results || [];
  if (!list.length) return { bucket, items: [] };

  const ids = list.map((r) => r.id);
  const placeholders = ids.map((_, i) => `?${i + 2}`).join(",");
  const tr = await db
    .prepare(
      `SELECT parent_id, lang, title, summary, body_text, extra_json FROM translations WHERE kind=?1 AND parent_id IN (${placeholders})`,
    )
    .bind(kind, ...ids)
    .all();

  const byParent = new Map();
  for (const t of tr.results || []) {
    if (!byParent.has(t.parent_id)) byParent.set(t.parent_id, {});
    const extra = JSON.parse(t.extra_json || "{}");
    const text = clipBody(t.body_text || "");
    if (kind === "article") {
      byParent.get(t.parent_id)[t.lang] = {
        title: t.title || "",
        summary: t.summary || "",
        body: [{ type: "p", text }],
      };
    } else if (kind === "answer") {
      byParent.get(t.parent_id)[t.lang] = {
        title: t.title || "",
        question: extra.question || t.summary || "",
        body: [{ type: "p", text }],
      };
    } else {
      byParent.get(t.parent_id)[t.lang] = {
        name: t.title || "",
        summary: t.summary || "",
        body: [{ type: "p", text }],
      };
    }
  }

  const items = list.map((row) => ({
    id: row.id,
    slug: row.slug,
    type: kind,
    status: row.status,
    source_issue: kind === "bio" ? "" : row.source_issue || "",
    published_at: row.published_at || "",
    languages: byParent.get(row.id) || {},
  }));
  return { bucket, items };
}

async function buildCorpus(db) {
  const [articles, answers, biographies] = await Promise.all([
    loadBucket(db, "article", "articles", "articles"),
    loadBucket(db, "answer", "answers", "answers"),
    loadBucket(db, "bio", "bios", "biographies"),
  ]);
  return {
    ok: true,
    articles: articles.items,
    answers: answers.items,
    biographies: biographies.items,
  };
}

export async function onRequestGet({ env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "CONTENT_DB missing" }, 500);

    const cache = caches.default;
    const hit = await cache.match(CACHE_KEY);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set("x-jes-corpus-cache", "HIT");
      return new Response(hit.body, { status: hit.status, headers });
    }

    const data = await buildCorpus(env.CONTENT_DB);
    const res = json(data, 200, {
      cache: CACHE_CONTROL,
      headers: { "x-jes-corpus-cache": "MISS" },
    });
    try {
      await cache.put(CACHE_KEY, res.clone());
    } catch {
      /* ignore edge cache write failures */
    }
    return res;
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
