#!/usr/bin/env node
/**
 * Fail-closed isolation gate for jes-v2 Cloudflare mutations.
 * Usage:
 *   node scripts/assert-isolation.mjs [--target NAME]...
 * Env: CF_API_TOKEN (required), CF_ACCOUNT_ID (optional expected), CF_TARGET / CF_TARGETS
 */
import { createHash } from "node:crypto";

const EXPECTED_ACCOUNT = "a58137a2fbfd21aecffa8885f16bf12f";
const NAME_RE = /^jes-v2-/;

/** sha256 of friend D1 UUID strings (plaintext never in public tree) */
const FRIEND_D1_UUID_SHA256 = new Set([
  "a4bc59c351229c79e6497ae414cf9eaae43bcc446a24f31f429bc9ad5d1e5681",
  "939a5773f75a7780de20edc15467ff90533588dd33db3f11b3b40f1d68dc765d",
]);

const FRIEND_PAGES = new Set(["jeschurun-site", "jeschurun-admin"]);
const FRIEND_REMOTES = new Set([
  "jeschurun-site",
  "jeschurun-admin",
  "jeschurun-content",
]);

function die(msg) {
  console.error(`[assert-isolation] FAIL: ${msg}`);
  process.exit(1);
}

function sha256(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
}

function parseTargets(argv) {
  const targets = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--target" && argv[i + 1]) {
      targets.push(argv[++i]);
    } else if (argv[i].startsWith("--target=")) {
      targets.push(argv[i].slice("--target=".length));
    }
  }
  if (process.env.CF_TARGET) targets.push(process.env.CF_TARGET);
  if (process.env.CF_TARGETS) {
    targets.push(
      ...process.env.CF_TARGETS.split(/[,:\s]+/).filter(Boolean),
    );
  }
  return [...new Set(targets.map((t) => t.trim()).filter(Boolean))];
}

function assertNameSafe(name, label = "target") {
  if (!name) die(`${label} is empty`);
  if (FRIEND_PAGES.has(name) || FRIEND_REMOTES.has(name)) {
    die(`${label} "${name}" is a friend Pages/remote name (denylist)`);
  }
  if (!NAME_RE.test(name)) {
    die(`${label} "${name}" must match ^jes-v2-`);
  }
}

function assertUuidSafe(id, label = "uuid") {
  if (!id) return;
  const h = sha256(id);
  if (FRIEND_D1_UUID_SHA256.has(h)) {
    die(`${label} matches friend D1 denylist hash`);
  }
}

async function resolveAccount(token) {
  const res = await fetch("https://api.cloudflare.com/client/v4/accounts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) {
    die(
      `token account lookup failed HTTP ${res.status}: ${JSON.stringify(body.errors || body)}`,
    );
  }
  const accounts = body.result || [];
  const ids = accounts.map((a) => a.id);
  if (!ids.includes(EXPECTED_ACCOUNT)) {
    die(
      `token does not resolve to expected account ${EXPECTED_ACCOUNT}; got: ${ids.join(", ") || "(none)"}`,
    );
  }
  const envId = process.env.CF_ACCOUNT_ID;
  if (envId && envId !== EXPECTED_ACCOUNT) {
    die(`CF_ACCOUNT_ID=${envId} !== expected ${EXPECTED_ACCOUNT}`);
  }
  return EXPECTED_ACCOUNT;
}

export async function assertIsolation(options = {}) {
  const token = options.token || process.env.CF_API_TOKEN;
  if (!token) die("CF_API_TOKEN is required");

  const accountId = await resolveAccount(token);
  const targets = options.targets || parseTargets(process.argv.slice(2));

  for (const t of targets) {
    assertNameSafe(t);
  }

  const uuids = options.uuids || [];
  for (const u of uuids) assertUuidSafe(u);

  if (options.requireTarget && targets.length === 0) {
    die("--target NAME is required for this operation");
  }

  console.error(
    `[assert-isolation] OK account=${accountId}` +
      (targets.length ? ` targets=${targets.join(",")}` : " (account-only)"),
  );
  return { accountId, targets, token };
}

// CLI when executed directly
const entry = process.argv[1] || "";
if (entry.endsWith("assert-isolation.mjs") || entry.endsWith("assert-isolation.js")) {
  assertIsolation({ requireTarget: false }).catch((e) => {
    die(e?.message || String(e));
  });
}

export {
  EXPECTED_ACCOUNT,
  FRIEND_D1_UUID_SHA256,
  FRIEND_PAGES,
  FRIEND_REMOTES,
  assertNameSafe,
  assertUuidSafe,
  sha256,
  NAME_RE,
};
