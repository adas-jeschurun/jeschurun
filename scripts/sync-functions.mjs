#!/usr/bin/env node
/**
 * Copy packages/functions/{site,admin} → apps/{site,admin}/functions
 * Resolves _lib (symlink or sibling) into each destination.
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "packages", "functions");
const libSrc = join(pkg, "_lib");

const maps = [
  { src: join(pkg, "site"), dest: join(root, "apps", "site", "functions") },
  { src: join(pkg, "admin"), dest: join(root, "apps", "admin", "functions") },
];

function realLibPath(appSrc) {
  const nested = join(appSrc, "_lib");
  if (existsSync(nested)) {
    try {
      if (lstatSync(nested).isSymbolicLink()) {
        return resolve(appSrc, readlinkSync(nested));
      }
    } catch {
      /* fallthrough */
    }
    return nested;
  }
  return libSrc;
}

for (const { src, dest } of maps) {
  if (!existsSync(src)) {
    console.error(`[sync-functions] missing ${src}`);
    process.exit(1);
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  // copy app tree but skip _lib symlink (handled below as real files)
  cpSync(src, dest, {
    recursive: true,
    filter: (p) => !p.endsWith(`${src}/_lib`) && !p.includes(`${src}/_lib/`),
  });
  // Node filter receives absolute paths; also remove accidental _lib
  rmSync(join(dest, "_lib"), { recursive: true, force: true });
  const lib = realLibPath(src);
  if (!existsSync(lib)) {
    console.error(`[sync-functions] missing _lib at ${lib}`);
    process.exit(1);
  }
  cpSync(lib, join(dest, "_lib"), { recursive: true });
  writeFileSync(join(dest, ".generated"), "sync-functions\n");
  console.log(`[sync-functions] ${src} (+_lib) → ${dest}`);
}
