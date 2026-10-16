#!/usr/bin/env node
/**
 * Rebuild related_articles from shared tags.
 * DoD: ≥5 edges, ≥1 cross-issue; exit non-zero if eligible pairs but edges=0.
 */
import { readFileSync, existsSync } from "node:fs";
import { assertIsolation } from "./assert-isolation.mjs";
import { sqlLit, sqlBatch } from "./lib/sql-escape.mjs";
import { execD1, queryD1 } from "./cf.mjs";

const D1 = "jes-v2-content";
const MIN_EDGES = 5;

function loadEnv() {
  for (const p of ["/cursor/stores/self/secrets/cf.env"]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

async function main() {
  loadEnv();
  const { accountId, token } = await assertIsolation({ targets: [D1] });

  const articles = (
    await queryD1(
      token,
      accountId,
      D1,
      "SELECT id, source_issue FROM articles WHERE status='published'",
      true,
    )
  )?.[0]?.results || [];

  const tags = (
    await queryD1(
      token,
      accountId,
      D1,
      "SELECT article_id, tag_slug FROM article_tags",
      true,
    )
  )?.[0]?.results || [];

  const tagsByArticle = new Map();
  for (const a of articles) tagsByArticle.set(a.id, new Set());
  for (const t of tags) {
    if (!tagsByArticle.has(t.article_id)) tagsByArticle.set(t.article_id, new Set());
    tagsByArticle.get(t.article_id).add(t.tag_slug);
  }

  const issueById = new Map(articles.map((a) => [a.id, a.source_issue || ""]));
  const edges = []; // undirected unique pairs expanded to directed

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const a = articles[i];
      const b = articles[j];
      const ta = tagsByArticle.get(a.id) || new Set();
      const tb = tagsByArticle.get(b.id) || new Set();
      let shared = 0;
      for (const t of ta) if (tb.has(t)) shared++;
      if (shared <= 0) continue;
      const score = shared;
      edges.push({ a: a.id, b: b.id, score });
    }
  }

  const eligible =
    [...tagsByArticle.values()].filter((s) => s.size > 0).length >= 2;

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

  const edgeCount = (
    await queryD1(
      token,
      accountId,
      D1,
      "SELECT COUNT(*) AS c FROM related_articles",
      true,
    )
  )?.[0]?.results?.[0]?.c;

  // undirected unique pairs
  const undirected = edges.length;

  let crossIssue = 0;
  for (const e of edges) {
    if ((issueById.get(e.a) || "") !== (issueById.get(e.b) || "")) crossIssue++;
  }

  if (eligible && undirected === 0) {
    console.error("[interlink] FAIL: eligible pairs exist but edges=0");
    process.exit(1);
  }

  const report = {
    ok: undirected >= MIN_EDGES && crossIssue >= 1,
    undirectedEdges: undirected,
    directedRows: edgeCount,
    crossIssuePairs: crossIssue,
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
