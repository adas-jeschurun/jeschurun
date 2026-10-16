import { json } from "../_lib/json.js";
import { day } from "../_lib/kinds.js";

function classify(path) {
  const p = String(path || "");
  let m = p.match(/^content\/issues\/([^/]+)\/([^/]+)\/(.+)$/);
  if (m) return { scope: "live", kind: "issue", year: m[1], item: m[2], file: m[3] };
  m = p.match(/^content\/articles\/([^/]+)\/(.+)$/);
  if (m) return { scope: "live", kind: "article", item: m[1], file: m[2] };
  m = p.match(/^content\/rabbi-answers\/([^/]+)\/(.+)$/);
  if (m) return { scope: "live", kind: "rabbi-answer", item: m[1], file: m[2] };
  m = p.match(/^content\/biographies\/([^/]+)\/(.+)$/);
  if (m) return { scope: "live", kind: "biography", item: m[1], file: m[2] };
  return { scope: "live", kind: "other", item: p.split("/")[0] || "other", file: p };
}

/** List R2/content files from D1 files index (+ optional R2 list). */
export async function onRequestGet({ env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "no db" }, 500);
    const rows =
      (
        await env.CONTENT_DB.prepare(
          `SELECT key, sha256, size, content_type, source_path FROM files ORDER BY key`,
        ).all()
      ).results || [];

    // Enrich with titles from materials when possible
    const titleCache = new Map();
    async function titleFor(kind, slug) {
      const k = `${kind}:${slug}`;
      if (titleCache.has(k)) return titleCache.get(k);
      const dbKind =
        kind === "rabbi-answer" ? "answer" : kind === "biography" ? "bio" : kind;
      const table =
        dbKind === "article"
          ? "articles"
          : dbKind === "answer"
            ? "answers"
            : dbKind === "bio"
              ? "bios"
              : dbKind === "issue"
                ? "issues"
                : null;
      if (!table) {
        titleCache.set(k, slug);
        return slug;
      }
      const cols =
        dbKind === "issue"
          ? "id, published_at"
          : "id, published_at, updated_at";
      const row = await env.CONTENT_DB.prepare(
        `SELECT ${cols} FROM ${table} WHERE slug=?1`,
      )
        .bind(slug)
        .first();
      if (!row) {
        titleCache.set(k, slug);
        return slug;
      }
      const tr = await env.CONTENT_DB.prepare(
        `SELECT title FROM translations WHERE kind=?1 AND parent_id=?2 AND lang='ru'`,
      )
        .bind(dbKind === "issue" ? "issue" : dbKind, row.id)
        .first();
      const title = tr?.title || slug;
      titleCache.set(k, title);
      titleCache.set(
        `${k}:date`,
        day(row.updated_at) || day(row.published_at) || "",
      );
      return title;
    }

    const files = [];
    for (const r of rows) {
      const c0 = classify(r.key);
      const title = await titleFor(c0.kind, c0.item);
      const dateKey = titleCache.get(`${c0.kind}:${c0.item}:date`) || "";
      const lm = String(c0.file).match(/^(he|en|ru|de|fr)\.(?:md|pdf|epub)$/);
      files.push({
        path: r.key,
        size: r.size || 0,
        sha: r.sha256 || "",
        scope: c0.scope,
        kind: c0.kind,
        item: c0.item,
        year: c0.year || "",
        dateKey,
        title,
        lang: lm ? lm[1] : "",
        content_type: r.content_type || "",
      });
    }
    return json({ ok: true, files });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
