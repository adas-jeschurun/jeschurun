#!/usr/bin/env node
/**
 * Cloudflare mutate wrapper — always runs assert-isolation first.
 *
 *   node scripts/cf.mjs verify
 *   node scripts/cf.mjs d1 list|create|delete|query|exec
 *   node scripts/cf.mjs r2 list|create|put|get-meta
 *   node scripts/cf.mjs turnstile list|create
 *   node scripts/cf.mjs pages list|create|deploy|secret
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, join, basename, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertIsolation,
  assertNameSafe,
  assertUuidSafe,
  EXPECTED_ACCOUNT,
} from "./assert-isolation.mjs";

const API = "https://api.cloudflare.com/client/v4";

function usage(code = 1) {
  console.error(`Usage: node scripts/cf.mjs <command> ...
  verify
  d1 list|create|delete|query|exec
  r2 list|create|put|get-meta
  turnstile list|create
  pages list|create|deploy|secret`);
  process.exit(code);
}

function parseFlags(argv) {
  const flags = { domains: [], _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sql" && argv[i + 1]) flags.sql = argv[++i];
    else if (a.startsWith("--sql=")) flags.sql = a.slice(6);
    else if (a === "--file" && argv[i + 1]) flags.file = argv[++i];
    else if (a.startsWith("--file=")) flags.file = a.slice(7);
    else if (a === "--key" && argv[i + 1]) flags.key = argv[++i];
    else if (a.startsWith("--key=")) flags.key = a.slice(5);
    else if (a === "--ct" && argv[i + 1]) flags.ct = argv[++i];
    else if (a.startsWith("--ct=")) flags.ct = a.slice(5);
    else if (a === "--dir" && argv[i + 1]) flags.dir = argv[++i];
    else if (a.startsWith("--dir=")) flags.dir = a.slice(6);
    else if (a === "--branch" && argv[i + 1]) flags.branch = argv[++i];
    else if (a.startsWith("--branch=")) flags.branch = a.slice(9);
    else if (a === "--name" && argv[i + 1]) flags.name = argv[++i];
    else if (a.startsWith("--name=")) flags.name = a.slice(7);
    else if (a === "--value" && argv[i + 1]) flags.value = argv[++i];
    else if (a.startsWith("--value=")) flags.value = a.slice(8);
    else if (a === "--env" && argv[i + 1]) flags.env = argv[++i];
    else if (a.startsWith("--env=")) flags.env = a.slice(6);
    else if (a === "--domain" && argv[i + 1]) flags.domains.push(argv[++i]);
    else if (a.startsWith("--domain=")) flags.domains.push(a.slice(9));
    else if (a === "--json") flags.json = true;
    else if (a === "--quiet") flags.quiet = true;
    else flags._.push(a);
  }
  return flags;
}

async function cfFetch(token, path, opts = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(opts.headers || {}),
  };
  if (opts.jsonBody !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API}${path}`, {
    method: opts.method || "GET",
    headers,
    body:
      opts.jsonBody !== undefined
        ? JSON.stringify(opts.jsonBody)
        : opts.body,
  });
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json")
    ? await res.json().catch(() => ({}))
    : await res.arrayBuffer();
  if (!res.ok || (body && body.success === false)) {
    const err = new Error(
      `CF API ${opts.method || "GET"} ${path} → ${res.status}: ${JSON.stringify(
        (body && body.errors) || body || {},
      )}`,
    );
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function listD1(token, accountId) {
  const body = await cfFetch(
    token,
    `/accounts/${accountId}/d1/database?per_page=100`,
  );
  return body.result || [];
}

async function findD1ByName(token, accountId, name) {
  const all = await listD1(token, accountId);
  return all.find((d) => d.name === name) || null;
}

async function createD1(token, accountId, name) {
  assertNameSafe(name);
  const existing = await findD1ByName(token, accountId, name);
  if (existing) {
    assertUuidSafe(existing.uuid);
    console.log(JSON.stringify({ ok: true, existed: true, result: existing }));
    return existing;
  }
  const body = await cfFetch(token, `/accounts/${accountId}/d1/database`, {
    method: "POST",
    jsonBody: { name },
  });
  assertUuidSafe(body.result?.uuid);
  console.log(JSON.stringify({ ok: true, created: true, result: body.result }));
  return body.result;
}

async function deleteD1(token, accountId, name) {
  assertNameSafe(name);
  const row = await findD1ByName(token, accountId, name);
  if (!row) {
    console.log(JSON.stringify({ ok: true, deleted: false, missing: true, name }));
    return;
  }
  assertUuidSafe(row.uuid);
  await cfFetch(token, `/accounts/${accountId}/d1/database/${row.uuid}`, {
    method: "DELETE",
  });
  console.log(JSON.stringify({ ok: true, deleted: true, name, uuid: row.uuid }));
}

async function queryD1(token, accountId, name, sql, quiet = false, params) {
  assertNameSafe(name);
  const row = await findD1ByName(token, accountId, name);
  if (!row) throw new Error(`D1 not found: ${name}`);
  assertUuidSafe(row.uuid);
  const payload = { sql };
  if (params) payload.params = params;
  const body = await cfFetch(
    token,
    `/accounts/${accountId}/d1/database/${row.uuid}/query`,
    { method: "POST", jsonBody: payload },
  );
  if (!quiet) {
    console.log(JSON.stringify({ ok: true, name, result: body.result }, null, 2));
  }
  return body.result;
}

/** Split SQL into statements; run sequentially (DDL + batches). */
async function execD1(token, accountId, name, sql, quiet = false) {
  const cleaned = String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (t.startsWith("--")) return "";
      return line;
    })
    .join("\n");
  const parts = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const results = [];
  for (const stmt of parts) {
    results.push(await queryD1(token, accountId, name, stmt, true));
  }
  if (!quiet) {
    console.log(JSON.stringify({ ok: true, name, statements: parts.length }));
  }
  return results;
}

async function listR2(token, accountId) {
  const body = await cfFetch(
    token,
    `/accounts/${accountId}/r2/buckets?per_page=100`,
  );
  return body.result?.buckets || body.result || [];
}

async function createR2(token, accountId, name) {
  assertNameSafe(name);
  const buckets = await listR2(token, accountId);
  const existing = (buckets || []).find((b) => (b.name || b) === name);
  if (existing) {
    console.log(JSON.stringify({ ok: true, existed: true, result: existing }));
    return existing;
  }
  const body = await cfFetch(token, `/accounts/${accountId}/r2/buckets`, {
    method: "POST",
    jsonBody: { name },
  });
  console.log(JSON.stringify({ ok: true, created: true, result: body.result }));
  return body.result;
}

function guessCt(path) {
  const ext = path.split(".").pop()?.toLowerCase();
  return (
    {
      pdf: "application/pdf",
      epub: "application/epub+zip",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      svg: "image/svg+xml",
      md: "text/markdown; charset=utf-8",
      json: "application/json",
      css: "text/css",
      js: "application/javascript",
      html: "text/html; charset=utf-8",
      txt: "text/plain; charset=utf-8",
    }[ext] || "application/octet-stream"
  );
}

async function putR2(token, accountId, bucket, key, filePath, ct) {
  assertNameSafe(bucket);
  if (!key || key.includes("..")) throw new Error("bad R2 key");
  const abs = resolve(filePath);
  if (!existsSync(abs)) throw new Error(`file not found: ${abs}`);
  const buf = readFileSync(abs);
  const sha = createHash("sha256").update(buf).digest("hex");
  const contentType = ct || guessCt(abs);
  const encodedKey = key
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
  await cfFetch(
    token,
    `/accounts/${accountId}/r2/buckets/${bucket}/objects/${encodedKey}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buf.length),
      },
      body: buf,
    },
  );
  return { key, sha256: sha, size: buf.length, contentType };
}

async function listTurnstile(token, accountId) {
  const body = await cfFetch(
    token,
    `/accounts/${accountId}/challenges/widgets`,
  );
  return body.result || [];
}

async function createTurnstile(token, accountId, name, domains) {
  assertNameSafe(name);
  const existing = (await listTurnstile(token, accountId)).find(
    (w) => w.name === name,
  );
  if (existing) {
    console.log(
      JSON.stringify({
        ok: true,
        existed: true,
        result: {
          sitekey: existing.sitekey,
          name: existing.name,
          domains: existing.domains,
          mode: existing.mode,
        },
      }),
    );
    return existing;
  }
  const hosts =
    domains.length > 0
      ? domains
      : ["localhost", "127.0.0.1", "jes-v2-site.pages.dev"];
  const body = await cfFetch(
    token,
    `/accounts/${accountId}/challenges/widgets`,
    {
      method: "POST",
      jsonBody: { name, domains: hosts, mode: "managed" },
    },
  );
  console.log(JSON.stringify({ ok: true, created: true, result: body.result }));
  return body.result;
}

async function listPages(token, accountId) {
  const body = await cfFetch(
    token,
    `/accounts/${accountId}/pages/projects`,
  );
  return body.result || [];
}

async function getPages(token, accountId, name) {
  assertNameSafe(name);
  try {
    const body = await cfFetch(
      token,
      `/accounts/${accountId}/pages/projects/${name}`,
    );
    return body.result || null;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function createPages(token, accountId, name) {
  assertNameSafe(name);
  const existing = await getPages(token, accountId, name);
  if (existing) {
    console.log(
      JSON.stringify({
        ok: true,
        existed: true,
        result: { name: existing.name, subdomain: existing.subdomain },
      }),
    );
    return existing;
  }
  const body = await cfFetch(token, `/accounts/${accountId}/pages/projects`, {
    method: "POST",
    jsonBody: {
      name,
      production_branch: "cursor/vite-react-site-90b1",
    },
  });
  console.log(JSON.stringify({ ok: true, created: true, result: body.result }));
  return body.result;
}

function runWrangler(args, env, cwd = process.cwd()) {
  const r = spawnSync("npx", ["--yes", "wrangler@4", ...args], {
    env: { ...process.env, ...env },
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.status !== 0) {
    throw new Error(
      `wrangler ${args.join(" ")} failed (${r.status}): ${r.stderr || r.stdout}`,
    );
  }
  return (r.stdout || "") + (r.stderr || "");
}

async function deployPages(token, accountId, name, dir, branch) {
  assertNameSafe(name);
  const abs = resolve(dir);
  if (!existsSync(abs)) throw new Error(`deploy dir missing: ${abs}`);
  // Prefer app root (contains functions/ + dist/) so Pages Functions bind.
  let deployPath = abs;
  let cwd = process.cwd();
  if (basename(abs) === "dist") {
    cwd = dirname(abs);
    deployPath = "dist";
  }
  const out = runWrangler(
    [
      "pages",
      "deploy",
      deployPath,
      `--project-name=${name}`,
      `--branch=${branch || "cursor/vite-react-site-90b1"}`,
      "--commit-dirty=true",
    ],
    {
      CLOUDFLARE_API_TOKEN: token,
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CF_API_TOKEN: token,
      CF_ACCOUNT_ID: accountId,
    },
    cwd,
  );
  console.log(out);
  const urlMatch = out.match(/https:\/\/[^\s]+\.pages\.dev[^\s]*/g);
  return {
    ok: true,
    name,
    url: urlMatch?.[urlMatch.length - 1] || urlMatch?.[0] || null,
    urls: urlMatch || [],
    log: out,
  };
}

async function pagesSecret(token, accountId, name, secretName, value, envName) {
  assertNameSafe(name);
  if (!secretName || value == null) throw new Error("secret name/value required");
  const args = [
    "pages",
    "secret",
    "put",
    secretName,
    `--project-name=${name}`,
  ];
  if (envName) args.push(`--env=${envName}`);
  const r = spawnSync("npx", ["--yes", "wrangler@4", ...args], {
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: token,
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CF_API_TOKEN: token,
      CF_ACCOUNT_ID: accountId,
    },
    input: String(value),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (r.status !== 0) {
    throw new Error(`pages secret put failed: ${r.stderr || r.stdout}`);
  }
  console.log(JSON.stringify({ ok: true, project: name, secret: secretName, env: envName || "production" }));
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length) usage();
  const cmd = argv[0];
  const flags = parseFlags(argv.slice(1));
  const args = flags._;

  if (cmd === "verify") {
    await assertIsolation({ targets: [] });
    console.log(JSON.stringify({ ok: true, accountId: EXPECTED_ACCOUNT }));
    return;
  }

  let targets = [];
  if (
    (cmd === "d1" && ["create", "delete", "query", "exec"].includes(args[0])) ||
    (cmd === "r2" && ["create", "put", "get-meta"].includes(args[0])) ||
    (cmd === "turnstile" && args[0] === "create") ||
    (cmd === "pages" && ["create", "deploy", "secret"].includes(args[0]))
  ) {
    const name = args[1];
    if (!name) usage();
    targets = [name];
  }

  const { accountId, token } = await assertIsolation({
    targets,
    requireTarget: targets.length > 0,
  });

  if (cmd === "d1") {
    const sub = args[0];
    if (sub === "list") {
      const rows = await listD1(token, accountId);
      const jes = rows.filter((r) => /^jes-v2-/.test(r.name));
      console.log(JSON.stringify({ ok: true, result: jes }, null, 2));
      return;
    }
    if (sub === "create") {
      await createD1(token, accountId, args[1]);
      return;
    }
    if (sub === "delete") {
      await deleteD1(token, accountId, args[1]);
      return;
    }
    if (sub === "query") {
      let sql = flags.sql;
      if (flags.file) sql = readFileSync(resolve(flags.file), "utf8");
      if (!sql?.trim()) usage();
      await queryD1(token, accountId, args[1], sql, flags.quiet);
      return;
    }
    if (sub === "exec") {
      let sql = flags.sql;
      if (flags.file) sql = readFileSync(resolve(flags.file), "utf8");
      if (!sql?.trim()) usage();
      await execD1(token, accountId, args[1], sql, flags.quiet);
      return;
    }
    usage();
  }

  if (cmd === "r2") {
    const sub = args[0];
    if (sub === "list") {
      const rows = await listR2(token, accountId);
      const jes = (rows || []).filter((b) => /^jes-v2-/.test(b.name || b));
      console.log(JSON.stringify({ ok: true, result: jes }, null, 2));
      return;
    }
    if (sub === "create") {
      await createR2(token, accountId, args[1]);
      return;
    }
    if (sub === "put") {
      const bucket = args[1];
      const key = flags.key || args[2];
      const file = flags.file || args[3];
      if (!key || !file) usage();
      const meta = await putR2(token, accountId, bucket, key, file, flags.ct);
      console.log(JSON.stringify({ ok: true, bucket, ...meta }));
      return;
    }
    if (sub === "get-meta") {
      // list object via HEAD-like GET metadata not always available; use d1 files table
      console.log(JSON.stringify({ ok: true, note: "use files table in D1 for sha256" }));
      return;
    }
    usage();
  }

  if (cmd === "turnstile") {
    const sub = args[0];
    if (sub === "list") {
      const rows = await listTurnstile(token, accountId);
      const jes = rows.filter((w) => /^jes-v2-/.test(w.name || ""));
      console.log(
        JSON.stringify(
          {
            ok: true,
            result: jes.map((w) => ({
              sitekey: w.sitekey,
              name: w.name,
              domains: w.domains,
              mode: w.mode,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }
    if (sub === "create") {
      await createTurnstile(token, accountId, args[1], flags.domains);
      return;
    }
    usage();
  }

  if (cmd === "pages") {
    const sub = args[0];
    if (sub === "list") {
      const rows = await listPages(token, accountId);
      const jes = rows.filter((p) => /^jes-v2-/.test(p.name));
      console.log(
        JSON.stringify(
          {
            ok: true,
            result: jes.map((p) => ({
              name: p.name,
              subdomain: p.subdomain,
              domains: p.domains,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }
    if (sub === "create") {
      await createPages(token, accountId, args[1]);
      return;
    }
    if (sub === "deploy") {
      const dir = flags.dir || args[2];
      if (!dir) usage();
      await deployPages(token, accountId, args[1], dir, flags.branch);
      return;
    }
    if (sub === "secret") {
      await pagesSecret(
        token,
        accountId,
        args[1],
        flags.name || args[2],
        flags.value ?? args[3],
        flags.env,
      );
      return;
    }
    usage();
  }

  usage();
}

export {
  putR2,
  queryD1,
  execD1,
  findD1ByName,
  listD1,
  createPages,
  deployPages,
  guessCt,
  cfFetch,
  API,
};

const entry = process.argv[1] || "";
if (entry.endsWith("cf.mjs") || entry.endsWith("cf.js")) {
  main().catch((e) => {
    console.error(`[cf.mjs] ${e.message || e}`);
    process.exit(1);
  });
}
