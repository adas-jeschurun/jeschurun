#!/usr/bin/env node
/**
 * Import published content/ from jeschurun-content into jes-v2-content D1
 * and binaries into jes-v2-files R2. All CF mutates via cf.mjs helpers.
 *
 *   node scripts/import-content.mjs [--content-root PATH] [--dry-run]
 */
import { createHash } from "node:crypto";
import {
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { resolve, join, relative, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { assertIsolation } from "./assert-isolation.mjs";
import { sqlLit, sqlBatch } from "./lib/sql-escape.mjs";
import { putR2, execD1, queryD1, findD1ByName, guessCt } from "./cf.mjs";

const LANGS = ["he", "en", "ru", "de", "fr"];
const BIN_EXT = new Set([
  ".pdf",
  ".epub",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
]);
const D1_NAME = "jes-v2-content";
const R2_NAME = "jes-v2-files";

function die(msg) {
  console.error(`[import] FAIL: ${msg}`);
  process.exit(1);
}

function sha256buf(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function listDirs(p) {
  if (!existsSync(p)) return [];
  return readdirSync(p)
    .map((n) => join(p, n))
    .filter((x) => statSync(x).isDirectory());
}

function walkFiles(root) {
  const out = [];
  function walk(d) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out.push(p);
    }
  }
  if (existsSync(root)) walk(root);
  return out;
}

function stripMd(md) {
  return String(md || "")
    .replace(/!\[[^\]]*\]\([^)]+\)(?:\s+\{[^}]*\})?/g, " ")
    .replace(/[#>*_[\]()`~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentSha(root) {
  const r = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  });
  if (r.status !== 0) die(`cannot resolve content git SHA in ${root}`);
  return r.stdout.trim();
}

function escIdent(s) {
  return String(s).replace(/[^A-Za-z0-9._/-]/g, "_");
}

async function runSqlBatches(token, accountId, name, statements) {
  // One statement per HTTP call — never split on ';' inside JSON/markdown payloads.
  const total = statements.length;
  for (let i = 0; i < total; i++) {
    if (i % 25 === 0) {
      process.stderr.write(`[import] SQL ${i + 1}/${total}\n`);
    }
    const stmt = statements[i].trim().replace(/;$/, "");
    await queryD1(token, accountId, name, stmt, true);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  let contentRoot = "/agent/repos/jeschurun-content";
  let dry = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--content-root" && argv[i + 1]) contentRoot = argv[++i];
    else if (argv[i] === "--dry-run") dry = true;
  }
  contentRoot = resolve(contentRoot);
  const published = join(contentRoot, "content");
  if (!existsSync(published)) die(`missing ${published}`);

  const sourceSha = contentSha(contentRoot);
  process.stderr.write(`[import] content SHA ${sourceSha}\n`);

  // Source counts (published only)
  const articleDirs = listDirs(join(published, "articles"));
  const answerDirs = listDirs(join(published, "rabbi-answers"));
  const bioDirs = listDirs(join(published, "biographies"));
  const issueFiles = walkFiles(join(published, "issues")).filter((p) =>
    p.endsWith("/issue.json"),
  );
  const binaries = walkFiles(published).filter((p) =>
    BIN_EXT.has(extname(p).toLowerCase()),
  );

  const source = {
    issues: 0,
    articles: 0,
    answers: 0,
    bios: 0,
    translations: { article: 0, answer: 0, bio: 0, issue: 0 },
    binaries: binaries.length,
    currentIssue: null,
  };

  const issues = [];
  for (const ip of issueFiles) {
    const d = loadJson(ip);
    if (d.status !== "published") continue;
    source.issues++;
    issues.push({ path: ip, data: d });
    for (const l of LANGS) if (d.languages?.[l]) source.translations.issue++;
  }

  const articles = [];
  for (const dir of articleDirs) {
    const metaPath = existsSync(join(dir, "meta.json"))
      ? join(dir, "meta.json")
      : join(dir, "article.json");
    if (!existsSync(metaPath)) continue;
    const d = loadJson(metaPath);
    if (d.status !== "published") continue;
    source.articles++;
    articles.push({ dir, data: d, slug: d.slug || basenameSafe(dir) });
    for (const l of LANGS) {
      const info = d.languages?.[l];
      if (!info) continue;
      const file = join(dir, info.file || `${l}.md`);
      if (existsSync(file) || metaPath.endsWith("article.json")) {
        source.translations.article++;
      }
    }
  }

  const answers = [];
  for (const dir of answerDirs) {
    const metaPath = existsSync(join(dir, "meta.json"))
      ? join(dir, "meta.json")
      : join(dir, "answer.json");
    if (!existsSync(metaPath)) continue;
    const d = loadJson(metaPath);
    if (d.status !== "published") continue;
    source.answers++;
    answers.push({ dir, data: d, slug: d.slug || basenameSafe(dir) });
    for (const l of LANGS) {
      const info = d.languages?.[l];
      if (!info) continue;
      const file = join(dir, info.file || `${l}.md`);
      if (existsSync(file) || metaPath.endsWith("answer.json")) {
        source.translations.answer++;
      }
    }
  }

  const bios = [];
  for (const dir of bioDirs) {
    const metaPath = existsSync(join(dir, "meta.json"))
      ? join(dir, "meta.json")
      : null;
    const legacy = join(dir + ".json");
    const path = metaPath || (existsSync(legacy) ? legacy : null);
    if (!path) continue;
    const d = loadJson(path);
    if (d.status === "hidden") continue;
    source.bios++;
    bios.push({
      dir: metaPath ? dir : null,
      data: d,
      slug: d.slug || basenameSafe(dir),
      path,
    });
    for (const l of LANGS) if (d.languages?.[l]) source.translations.bio++;
  }

  let currentIssueKey = null;
  const curPath = join(contentRoot, "config/current-issue.json");
  if (existsSync(curPath)) {
    currentIssueKey = loadJson(curPath).current_issue || null;
  }
  source.currentIssue = currentIssueKey;

  console.log(JSON.stringify({ phase: "source-counts", source }, null, 2));
  if (dry) return;

  // Load CF token
  for (const p of [
    "/cursor/stores/self/secrets/cf.env",
    resolve("secrets/cf.env"),
  ]) {
    if (existsSync(p)) {
      for (const line of readFileSync(p, "utf8").split(/\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      }
    }
  }

  const { accountId, token } = await assertIsolation({
    targets: [D1_NAME, R2_NAME],
  });

  // Apply schema
  const schema = readFileSync(resolve("schema/content.sql"), "utf8");
  await execD1(token, accountId, D1_NAME, schema, true);

  // Clear mutable tables for idempotent re-import
  await execD1(
    token,
    accountId,
    D1_NAME,
    `
    DELETE FROM related_articles;
    DELETE FROM article_tags;
    DELETE FROM tags;
    DELETE FROM translations;
    DELETE FROM files;
    DELETE FROM articles;
    DELETE FROM answers;
    DELETE FROM bios;
    DELETE FROM issues;
    DELETE FROM site_config;
    DELETE FROM import_manifest;
  `,
    true,
  );

  const stmts = [];
  const issueDate = new Map();

  for (const { data: d } of issues) {
    const id = d.id || `${d.hebrew_year}-${d.slug}`;
    issueDate.set(`${d.hebrew_year}/${d.slug}`, d.published_at || "");
    stmts.push(
      `INSERT INTO issues(id,hebrew_year,slug,parasha_key,published_at,status,sort_order,meta_json) VALUES(${[
        sqlLit(id),
        sqlLit(d.hebrew_year),
        sqlLit(d.slug),
        sqlLit(d.parasha_key || d.slug),
        sqlLit(d.published_at || ""),
        sqlLit(d.status || "published"),
        sqlLit(d.sort_order || 0),
        sqlLit(JSON.stringify(d)),
      ].join(",")})`,
    );
    for (const l of LANGS) {
      const info = d.languages?.[l];
      if (!info) continue;
      const tid = `issue:${id}:${l}`;
      stmts.push(
        `INSERT INTO translations(id,kind,parent_id,lang,title,summary,body_md,body_text,extra_json) VALUES(${[
          sqlLit(tid),
          sqlLit("issue"),
          sqlLit(id),
          sqlLit(l),
          sqlLit(info.title || ""),
          sqlLit(info.summary || ""),
          sqlLit(""),
          sqlLit(
            [info.title, info.summary, info.parasha, info.kicker]
              .filter(Boolean)
              .join(" "),
          ),
          sqlLit(JSON.stringify(info)),
        ].join(",")})`,
      );
    }
  }

  async function ingestMaterial(kind, items) {
    for (const item of items) {
      const d = item.data;
      const slug = item.slug;
      const id = d.id || slug;
      const pub =
        d.published_at ||
        (d.source_issue && issueDate.get(d.source_issue)) ||
        "";
      if (kind === "article") {
        stmts.push(
          `INSERT INTO articles(id,slug,status,source_issue,published_at,updated_at,lead_image,order_in_issue,meta_json) VALUES(${[
            sqlLit(id),
            sqlLit(slug),
            sqlLit(d.status || "published"),
            sqlLit(d.source_issue || ""),
            sqlLit(pub),
            sqlLit(d.updated_at || ""),
            sqlLit(d.lead_image || ""),
            sqlLit(d.order ?? null),
            sqlLit(JSON.stringify({ ...d, languages: undefined })),
          ].join(",")})`,
        );
      } else if (kind === "answer") {
        stmts.push(
          `INSERT INTO answers(id,slug,status,source_issue,published_at,updated_at,meta_json) VALUES(${[
            sqlLit(id),
            sqlLit(slug),
            sqlLit(d.status || "published"),
            sqlLit(d.source_issue || ""),
            sqlLit(pub),
            sqlLit(d.updated_at || ""),
            sqlLit(JSON.stringify({ ...d, languages: undefined })),
          ].join(",")})`,
        );
      } else {
        stmts.push(
          `INSERT INTO bios(id,slug,status,years,published_at,updated_at,meta_json) VALUES(${[
            sqlLit(id),
            sqlLit(slug),
            sqlLit(d.status || "published"),
            sqlLit(d.years || ""),
            sqlLit(pub),
            sqlLit(d.updated_at || ""),
            sqlLit(JSON.stringify({ ...d, languages: undefined })),
          ].join(",")})`,
        );
      }

      for (const l of LANGS) {
        const info = d.languages?.[l];
        if (!info) continue;
        let md = "";
        if (item.dir) {
          const file = join(item.dir, info.file || `${l}.md`);
          if (existsSync(file)) md = readFileSync(file, "utf8");
        } else if (info.body) {
          md = typeof info.body === "string" ? info.body : "";
        }
        // legacy embedded body blocks
        if (!md && Array.isArray(info.body)) {
          md = info.body.map((b) => b.text || "").join("\n\n");
        }
        const title =
          info.title || info.name || info.question || info.subject || "";
        const summary = info.summary || info.question || "";
        const tid = `${kind}:${id}:${l}`;
        stmts.push(
          `INSERT INTO translations(id,kind,parent_id,lang,title,summary,body_md,body_text,extra_json) VALUES(${[
            sqlLit(tid),
            sqlLit(kind),
            sqlLit(id),
            sqlLit(l),
            sqlLit(title),
            sqlLit(summary),
            sqlLit(md),
            sqlLit(stripMd(md) || [title, summary].join(" ")),
            sqlLit(JSON.stringify({ ...info, file: info.file || `${l}.md` })),
          ].join(",")})`,
        );
      }
    }
  }

  await ingestMaterial("article", articles);
  await ingestMaterial("answer", answers);
  await ingestMaterial("bio", bios);

  if (currentIssueKey) {
    stmts.push(
      `INSERT INTO site_config(key,value) VALUES('current_issue',${sqlLit(currentIssueKey)})`,
    );
  }
  stmts.push(
    `INSERT INTO import_manifest(key,value) VALUES('source_sha',${sqlLit(sourceSha)})`,
  );
  stmts.push(
    `INSERT INTO import_manifest(key,value) VALUES('imported_at',${sqlLit(new Date().toISOString())})`,
  );
  stmts.push(
    `INSERT INTO import_manifest(key,value) VALUES('source_counts',${sqlLit(JSON.stringify(source))})`,
  );

  await runSqlBatches(token, accountId, D1_NAME, stmts);

  // Upload binaries to R2 + files table
  const fileStmts = [];
  let uploaded = 0;
  for (const abs of binaries) {
    const rel = relative(contentRoot, abs).replace(/\\/g, "/");
    const key = escIdent(rel);
    process.stderr.write(`[import] R2 put ${key}\n`);
    const meta = await putR2(token, accountId, R2_NAME, key, abs);
    fileStmts.push(
      `INSERT INTO files(key,sha256,size,content_type,source_path) VALUES(${[
        sqlLit(key),
        sqlLit(meta.sha256),
        sqlLit(meta.size),
        sqlLit(meta.contentType),
        sqlLit(rel),
      ].join(",")})`,
    );
    uploaded++;
  }
  if (fileStmts.length) await runSqlBatches(token, accountId, D1_NAME, fileStmts);

  // Count gate
  const counts = {};
  for (const [label, sql] of [
    ["issues", "SELECT COUNT(*) AS c FROM issues WHERE status='published'"],
    ["articles", "SELECT COUNT(*) AS c FROM articles WHERE status='published'"],
    ["answers", "SELECT COUNT(*) AS c FROM answers WHERE status='published'"],
    ["bios", "SELECT COUNT(*) AS c FROM bios WHERE status!='hidden'"],
    ["binaries", "SELECT COUNT(*) AS c FROM files"],
    [
      "tr_article",
      "SELECT COUNT(*) AS c FROM translations WHERE kind='article'",
    ],
    ["tr_answer", "SELECT COUNT(*) AS c FROM translations WHERE kind='answer'"],
    ["tr_bio", "SELECT COUNT(*) AS c FROM translations WHERE kind='bio'"],
    ["tr_issue", "SELECT COUNT(*) AS c FROM translations WHERE kind='issue'"],
  ]) {
    const r = await queryD1(token, accountId, D1_NAME, sql, true);
    counts[label] = r?.[0]?.results?.[0]?.c ?? r?.[0]?.c ?? 0;
  }
  const cur = await queryD1(
    token,
    accountId,
    D1_NAME,
    "SELECT value FROM site_config WHERE key='current_issue'",
    true,
  );
  const dbCurrent =
    cur?.[0]?.results?.[0]?.value ?? cur?.[0]?.value ?? null;

  const gate = {
    issues: counts.issues === source.issues,
    articles: counts.articles === source.articles,
    answers: counts.answers === source.answers,
    bios: counts.bios === source.bios,
    binaries: counts.binaries === source.binaries,
    tr_article: counts.tr_article === source.translations.article,
    tr_answer: counts.tr_answer === source.translations.answer,
    tr_bio: counts.tr_bio === source.translations.bio,
    tr_issue: counts.tr_issue === source.translations.issue,
    currentIssue: dbCurrent === source.currentIssue,
  };
  const ok = Object.values(gate).every(Boolean);

  // Verify binary sha256 round-trip via files table vs local
  let shaOk = true;
  for (const abs of binaries) {
    const rel = relative(contentRoot, abs).replace(/\\/g, "/");
    const key = escIdent(rel);
    const local = sha256buf(readFileSync(abs));
    const row = await queryD1(
      token,
      accountId,
      D1_NAME,
      `SELECT sha256 FROM files WHERE key=${sqlLit(key)}`,
      true,
    );
    const remote = row?.[0]?.results?.[0]?.sha256 ?? row?.[0]?.sha256;
    if (remote !== local) {
      shaOk = false;
      console.error(`[import] sha mismatch ${key}`);
    }
  }

  const report = {
    ok: ok && shaOk,
    sourceSha,
    source,
    counts,
    gate,
    shaOk,
    uploaded,
    dbCurrent,
  };

  const qaDir = "/cursor/stores/self/internal/qa";
  mkdirSync(qaDir, { recursive: true });
  writeFileSync(
    join(qaDir, "import-manifest.json"),
    JSON.stringify(report, null, 2),
  );

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) die("count/sha gate failed");
}

function basenameSafe(p) {
  return p.split(/[/\\]/).filter(Boolean).pop();
}

main().catch((e) => {
  console.error(`[import] ${e.stack || e}`);
  process.exit(1);
});
