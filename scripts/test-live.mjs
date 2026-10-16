#!/usr/bin/env node
/**
 * Agent-only live checks against jes-v2 resources (not friend stack).
 */
import { readFileSync, existsSync } from "node:fs";
import { assertIsolation } from "./assert-isolation.mjs";
import { queryD1 } from "./cf.mjs";

function loadEnv() {
  for (const p of [
    "/cursor/stores/self/secrets/cf.env",
    "/cursor/stores/self/secrets/turnstile.env",
  ]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

async function main() {
  loadEnv();
  const { accountId, token } = await assertIsolation({
    targets: ["jes-v2-content", "jes-v2-questions"],
  });

  const checks = [];

  const articles = (
    await queryD1(
      token,
      accountId,
      "jes-v2-content",
      "SELECT COUNT(*) AS c FROM articles WHERE status='published'",
      true,
    )
  )?.[0]?.results?.[0]?.c;
  checks.push({ name: "articles_imported", ok: articles > 0, articles });

  const edges = (
    await queryD1(
      token,
      accountId,
      "jes-v2-content",
      "SELECT COUNT(*) AS c FROM related_articles",
      true,
    )
  )?.[0]?.results?.[0]?.c;
  checks.push({ name: "interlink_minEdges", ok: edges >= 10, edges }); // directed ≥10 ⇒ undirected ≥5

  const sitekey = process.env.TURNSTILE_SITEKEY || "";
  checks.push({
    name: "turnstile_not_test_keys",
    ok: sitekey && !sitekey.startsWith("1x000000"),
    sitekeyPrefix: sitekey.slice(0, 8),
  });

  const tagged = (
    await queryD1(
      token,
      accountId,
      "jes-v2-content",
      "SELECT COUNT(DISTINCT article_id) AS c FROM article_tags",
      true,
    )
  )?.[0]?.results?.[0]?.c;
  checks.push({ name: "tagged_articles", ok: tagged >= 5, tagged });

  const ok = checks.every((c) => c.ok);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
