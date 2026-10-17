/**
 * Shared related_articles rebuild + inline body interlinks (admin + CLI).
 */

import {
  applyInlineInterlinks,
  buildInterlinkCandidates,
} from "./inline-interlink.js";

/**
 * @param {D1Database} db
 * @param {{ applyInline?: boolean, minEdges?: number }} [opts]
 */
export async function rebuildRelatedAndInline(db, opts = {}) {
  const applyInline = opts.applyInline !== false;
  const minEdges = opts.minEdges ?? 5;

  const articles =
    (
      await db
        .prepare(`SELECT id, slug, source_issue FROM articles WHERE status='published'`)
        .all()
    ).results || [];
  const answers =
    (
      await db
        .prepare(`SELECT id, slug FROM answers WHERE status='published'`)
        .all()
    ).results || [];
  const bios =
    (
      await db
        .prepare(`SELECT id, slug FROM bios WHERE status!='hidden'`)
        .all()
    ).results || [];

  const tagRows =
    (await db.prepare(`SELECT article_id, tag_slug FROM article_tags`).all())
      .results || [];
  const tagMeta =
    (await db.prepare(`SELECT slug, labels_json FROM tags`).all()).results || [];

  const tagByMaterial = new Map();
  for (const a of articles) tagByMaterial.set(a.id, new Set());
  for (const t of tagRows) {
    if (!tagByMaterial.has(t.article_id)) tagByMaterial.set(t.article_id, new Set());
    tagByMaterial.get(t.article_id).add(t.tag_slug);
  }
  const labelByTag = new Map(
    tagMeta.map((t) => [t.slug, JSON.parse(t.labels_json || "{}")]),
  );

  const issueById = new Map(articles.map((a) => [a.id, a.source_issue || ""]));
  const edges = [];
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const a = articles[i];
      const b = articles[j];
      const ta = tagByMaterial.get(a.id) || new Set();
      const tb = tagByMaterial.get(b.id) || new Set();
      let shared = 0;
      for (const t of ta) if (tb.has(t)) shared++;
      if (shared <= 0) continue;
      edges.push({ a: a.id, b: b.id, score: shared });
    }
  }

  const eligible =
    [...tagByMaterial.values()].filter((s) => s.size > 0).length >= 2;

  await db.prepare(`DELETE FROM related_articles`).run();
  let crossIssue = 0;
  for (const e of edges) {
    if ((issueById.get(e.a) || "") !== (issueById.get(e.b) || "")) crossIssue++;
    await db
      .prepare(
        `INSERT INTO related_articles(article_id,related_id,score) VALUES(?1,?2,?3)`,
      )
      .bind(e.a, e.b, e.score)
      .run();
    await db
      .prepare(
        `INSERT INTO related_articles(article_id,related_id,score) VALUES(?1,?2,?3)`,
      )
      .bind(e.b, e.a, e.score)
      .run();
  }

  if (eligible && edges.length === 0) {
    return {
      ok: false,
      error: "eligible pairs exist but edges=0",
      undirectedEdges: 0,
      crossIssuePairs: 0,
      inlineBodiesUpdated: 0,
      inlineLinks: 0,
    };
  }

  let inlineBodiesUpdated = 0;
  let inlineLinks = 0;

  if (applyInline) {
    const titles =
      (
        await db
          .prepare(
            `SELECT kind, parent_id, lang, title FROM translations WHERE kind IN ('article','answer','bio')`,
          )
          .all()
      ).results || [];
    const titlesBy = new Map();
    for (const t of titles) {
      const k = `${t.kind}:${t.parent_id}`;
      if (!titlesBy.has(k)) titlesBy.set(k, {});
      titlesBy.get(k)[t.lang] = t.title || "";
    }

    const materials = [
      ...articles.map((a) => ({
        id: a.id,
        slug: a.slug,
        kind: "article",
        titles: titlesBy.get(`article:${a.id}`) || {},
      })),
      ...answers.map((a) => ({
        id: a.id,
        slug: a.slug,
        kind: "answer",
        titles: titlesBy.get(`answer:${a.id}`) || {},
      })),
      ...bios.map((a) => ({
        id: a.id,
        slug: a.slug,
        kind: "bio",
        titles: titlesBy.get(`bio:${a.id}`) || {},
      })),
    ];

    const relatedMap = new Map();
    for (const e of edges) {
      if (!relatedMap.has(e.a)) relatedMap.set(e.a, new Set());
      if (!relatedMap.has(e.b)) relatedMap.set(e.b, new Set());
      relatedMap.get(e.a).add(e.b);
      relatedMap.get(e.b).add(e.a);
    }

    const bodies =
      (
        await db
          .prepare(
            `SELECT id, kind, parent_id, lang, body_md FROM translations WHERE kind IN ('article','answer','bio') AND body_md IS NOT NULL AND body_md != ''`,
          )
          .all()
      ).results || [];

    for (const row of bodies) {
      const relatedIds = relatedMap.get(row.parent_id) || new Set();
      const selfTitles = titlesBy.get(`${row.kind}:${row.parent_id}`) || {};
      const candidates = buildInterlinkCandidates({
        selfId: row.parent_id,
        selfKind: row.kind,
        selfTitle: selfTitles[row.lang] || "",
        lang: row.lang,
        materials,
        tagByMaterial,
        labelByTag,
        relatedIds,
      });
      const { md, count, changed } = applyInlineInterlinks(row.body_md, candidates);
      if (!changed && count === 0) continue;
      if (md === row.body_md) continue;
      const plain = md
        .replace(/\[[^\]]*\]\([^)]+\)/g, (m) =>
          m.replace(/\[([^\]]+)\]\([^)]+\)/, "$1"),
        )
        .replace(/[#>*_`]/g, " ");
      await db
        .prepare(`UPDATE translations SET body_md=?1, body_text=?2 WHERE id=?3`)
        .bind(md, plain, row.id)
        .run();
      inlineBodiesUpdated++;
      inlineLinks += count;
    }
  }

  const ok = edges.length >= minEdges && crossIssue >= 1;
  return {
    ok,
    undirectedEdges: edges.length,
    directedRows: edges.length * 2,
    crossIssuePairs: crossIssue,
    taggedArticles: [...tagByMaterial.values()].filter((s) => s.size > 0).length,
    tagCount: tagMeta.length,
    articleTagLinks: tagRows.length,
    inlineBodiesUpdated,
    inlineLinks,
    minEdges,
    error: ok
      ? null
      : "DoD not met (≥5 undirected edges, ≥1 cross-issue)",
  };
}
