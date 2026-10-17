#!/usr/bin/env node
/**
 * Rebuild related_articles from shared tags + persist inline markdown links.
 * DoD: ≥5 edges, ≥1 cross-issue; exit non-zero if eligible pairs but edges=0.
 */
import { readFileSync, existsSync } from "node:fs";
import { assertIsolation } from "./assert-isolation.mjs";
import { sqlLit, sqlBatch } from "./lib/sql-escape.mjs";
import { execD1, queryD1 } from "./cf.mjs";
import {
  applyInlineInterlinks,
  buildInterlinkCandidates,
  materialHref,
} from "../packages/functions/_lib/inline-interlink.js";

const D1 = "jes-v2-content";
const MIN_EDGES = 5;

function loadEnv() {
  for (const p of [
    "/cursor/stores/self/secrets/cf.env",
    "/cursor/stores/bc-815882f2-d73a-44b9-82e4-e4e9b9cc90b1/secrets/cf.env",
  ]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

async function q(token, accountId, sql) {
  return (await queryD1(token, accountId, D1, sql, true))?.[0]?.results || [];
}

async function main() {
  loadEnv();
  const { accountId, token } = await assertIsolation({ targets: [D1] });

  const articles = await q(
    token,
    accountId,
    "SELECT id, slug, source_issue FROM articles WHERE status='published'",
  );
  const answers = await q(
    token,
    accountId,
    "SELECT id, slug FROM answers WHERE status='published'",
  );
  const bios = await q(
    token,
    accountId,
    "SELECT id, slug FROM bios WHERE status!='hidden'",
  );
  const tags = await q(token, accountId, "SELECT article_id, tag_slug FROM article_tags");
  const tagMeta = await q(token, accountId, "SELECT slug, labels_json FROM tags");

  const tagsByArticle = new Map();
  for (const a of articles) tagsByArticle.set(a.id, new Set());
  for (const t of tags) {
    if (!tagsByArticle.has(t.article_id)) tagsByArticle.set(t.article_id, new Set());
    tagsByArticle.get(t.article_id).add(t.tag_slug);
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
      const ta = tagsByArticle.get(a.id) || new Set();
      const tb = tagsByArticle.get(b.id) || new Set();
      let shared = 0;
      for (const t of ta) if (tb.has(t)) shared++;
      if (shared <= 0) continue;
      edges.push({ a: a.id, b: b.id, score: shared });
    }
  }

  const eligible = [...tagsByArticle.values()].filter((s) => s.size > 0).length >= 2;

  await execD1(token, accountId, D1, "DELETE FROM related_articles;", true);

  const stmts = [];
  for (const e of edges) {
    stmts.push(
      `INSERT INTO related_articles(article_id,related_id,score) VALUES(${sqlLit(e.a)},${sqlLit(e.b)},${sqlLit(e.score)})`,
    );
    stmts.push(
      `INSERT INTO related_articles(article_id,related_id,score) VALUES(${sqlLit(e.b)},${sqlLit(e.a)},${sqlLit(e.score)})`,
    );
  }
  for (const batch of sqlBatch(stmts.length ? stmts : ["SELECT 1"])) {
    await execD1(token, accountId, D1, batch, true);
  }

  if (eligible && edges.length === 0) {
    console.error("[interlink] FAIL: eligible pairs exist but edges=0");
    process.exit(1);
  }

  let crossIssue = 0;
  for (const e of edges) {
    if ((issueById.get(e.a) || "") !== (issueById.get(e.b) || "")) crossIssue++;
  }

  const titles = await q(
    token,
    accountId,
    "SELECT kind, parent_id, lang, title FROM translations WHERE kind IN ('article','answer','bio')",
  );
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

  const bodies = await q(
    token,
    accountId,
    "SELECT id, kind, parent_id, lang, body_md, body_text FROM translations WHERE kind IN ('article','answer','bio') AND body_md IS NOT NULL AND body_md != ''",
  );

  let inlineBodiesUpdated = 0;
  let inlineLinks = 0;
  for (const row of bodies) {
    const selfTitles = titlesBy.get(`${row.kind}:${row.parent_id}`) || {};
    const candidates = buildInterlinkCandidates({
      selfId: row.parent_id,
      selfKind: row.kind,
      selfTitle: selfTitles[row.lang] || "",
      lang: row.lang,
      materials,
      tagByMaterial: tagsByArticle,
      labelByTag,
      relatedIds: relatedMap.get(row.parent_id) || new Set(),
    });
    const { md, count } = applyInlineInterlinks(row.body_md, candidates);
    if (md === row.body_md) continue;
    const plain = md
      .replace(/\[[^\]]*\]\([^)]+\)/g, (m) => m.replace(/\[([^\]]+)\]\([^)]+\)/, "$1"))
      .replace(/[#>*_`]/g, " ");
    // Parameterized — bodies contain `;` / quotes; never embed via execD1 split.
    await queryD1(
      token,
      accountId,
      D1,
      "UPDATE translations SET body_md=?1, body_text=?2 WHERE id=?3",
      true,
      [md, plain, row.id],
    );
    inlineBodiesUpdated++;
    inlineLinks += count;
  }

  const edgeCount = (
    await q(token, accountId, "SELECT COUNT(*) AS c FROM related_articles")
  )?.[0]?.c;

  const report = {
    ok: edges.length >= MIN_EDGES && crossIssue >= 1,
    undirectedEdges: edges.length,
    directedRows: edgeCount,
    crossIssuePairs: crossIssue,
    taggedArticles: [...tagsByArticle.values()].filter((s) => s.size > 0).length,
    inlineBodiesUpdated,
    inlineLinks,
    sampleHref: materialHref("article", "other-side-of-courage", "ru"),
    minEdges: MIN_EDGES,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error("[interlink] FAIL: DoD not met (≥5 edges, ≥1 cross-issue)");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
