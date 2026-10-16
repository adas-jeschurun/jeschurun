#!/usr/bin/env node
/**
 * Copy packages/functions → apps/{site,admin}/functions (generated; gitignored).
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "packages", "functions");
const targets = [
  join(root, "apps", "site", "functions"),
  join(root, "apps", "admin", "functions"),
];

if (!existsSync(src)) {
  console.error(`[sync-functions] missing ${src}`);
  process.exit(1);
}

const entries = readdirSync(src);
if (entries.length === 0) {
  // ensure placeholder so copy still creates dirs
  writeFileSync(
    join(src, ".gitkeep"),
    "",
  );
}

for (const dest of targets) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`[sync-functions] ${src} → ${dest}`);
}
