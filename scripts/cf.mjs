#!/usr/bin/env node
/**
 * Cloudflare mutate wrapper — always runs assert-isolation first.
 *
 *   node scripts/cf.mjs verify
 *   node scripts/cf.mjs d1 list
 *   node scripts/cf.mjs d1 create <jes-v2-name>
 *   node scripts/cf.mjs d1 delete <jes-v2-name>
 *   node scripts/cf.mjs d1 query <jes-v2-name> --sql "..." | --file path.sql
 *   node scripts/cf.mjs r2 create <jes-v2-name>
 *   node scripts/cf.mjs r2 list
 *   node scripts/cf.mjs turnstile create <jes-v2-name> [--domain host]...
 *   node scripts/cf.mjs turnstile list
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertIsolation,
  assertNameSafe,
  assertUuidSafe,
  EXPECTED_ACCOUNT,
} from "./assert-isolation.mjs";

const API = "https://api.cloudflare.com/client/v4";

function usage(code = 1) {
  console.error(`Usage: node scripts/cf.mjs <command> ...
  verify | d1 list|create|delete|query | r2 list|create | turnstile list|create`);
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
    else if (a === "--domain" && argv[i + 1]) flags.domains.push(argv[++i]);
    else if (a.startsWith("--domain=")) flags.domains.push(a.slice(9));
    else if (a === "--json") flags.json = true;
    else flags._.push(a);
  }
  return flags;
}

async function cfFetch(token, path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const err = new Error(
      `CF API ${opts.method || "GET"} ${path} → ${res.status}: ${JSON.stringify(body.errors || body)}`,
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
    body: JSON.stringify({ name }),
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

async function queryD1(token, accountId, name, sql) {
  assertNameSafe(name);
  const row = await findD1ByName(token, accountId, name);
  if (!row) throw new Error(`D1 not found: ${name}`);
  assertUuidSafe(row.uuid);
  const body = await cfFetch(
    token,
    `/accounts/${accountId}/d1/database/${row.uuid}/query`,
    { method: "POST", body: JSON.stringify({ sql }) },
  );
  console.log(JSON.stringify({ ok: true, name, result: body.result }, null, 2));
  return body.result;
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
    body: JSON.stringify({ name }),
  });
  console.log(JSON.stringify({ ok: true, created: true, result: body.result }));
  return body.result;
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
      body: JSON.stringify({
        name,
        domains: hosts,
        mode: "managed",
      }),
    },
  );
  // secret is returned once — print for secrets store; do not commit
  console.log(JSON.stringify({ ok: true, created: true, result: body.result }));
  return body.result;
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

  const resourceName =
    args[0] ||
    (cmd === "d1" || cmd === "r2" || cmd === "turnstile" ? args[1] : null);

  // Subcommands that need a jes-v2 target
  let targets = [];
  if (
    (cmd === "d1" && ["create", "delete", "query"].includes(args[0])) ||
    (cmd === "r2" && args[0] === "create") ||
    (cmd === "turnstile" && args[0] === "create")
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
      if (flags.file) {
        sql = readFileSync(resolve(flags.file), "utf8");
      }
      if (!sql?.trim()) {
        console.error("d1 query needs --sql or --file");
        usage();
      }
      await queryD1(token, accountId, args[1], sql);
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

  usage();
}

main().catch((e) => {
  console.error(`[cf.mjs] ${e.message || e}`);
  process.exit(1);
});
