import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

describe("isolation", () => {
  it("pages.yml absent on branch", () => {
    expect(existsSync(resolve(root, ".github/workflows/pages.yml"))).toBe(false);
  });

  it("friend D1 denylist is hashed", () => {
    const src = readFileSync(resolve(root, "scripts/assert-isolation.mjs"), "utf8");
    expect(src).toMatch(/FRIEND_D1_UUID_SHA256/);
    expect(src).not.toMatch(/75fef166-596c-4c89-8ff5-e7cedb72785a/);
    expect(src).not.toMatch(/de6886e7-7e1c-47bc-9461-8582e8252b83/);
  });

  it("bindings prefix jes-v2 in wrangler", () => {
    for (const app of ["site", "admin"]) {
      const toml = readFileSync(resolve(root, `apps/${app}/wrangler.toml`), "utf8");
      const names = [...toml.matchAll(/database_name\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
      const buckets = [...toml.matchAll(/bucket_name\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
      for (const n of [...names, ...buckets]) {
        expect(n.startsWith("jes-v2-")).toBe(true);
      }
    }
  });

  it("sync-functions output present after sync", () => {
    expect(existsSync(resolve(root, "apps/site/functions/api/content.js"))).toBe(true);
    expect(existsSync(resolve(root, "apps/admin/functions/_middleware.js"))).toBe(true);
  });
});

describe("shared sort/search", async () => {
  const shared = await import("../../packages/shared/src/index.js");
  it("normalizeSort defaults", () => {
    expect(shared.normalizeSort("nope")).toBe("date_desc");
  });
  it("niqqud normalize strips marks", () => {
    expect(shared.normalizeSearchText("בְּרֵאשִׁית")).toBe(
      shared.normalizeSearchText("בראשית"),
    );
  });
  it("rankSearchCorpus prefers phrase title and AND then OR", () => {
    const pool = [
      {
        kind: "article",
        item: {
          id: "1",
          slug: "a",
          published_at: "2024-01-01",
          languages: {
            en: { title: "Torah and mitzvot", summary: "about law", body: [] },
            ru: { title: "Тора", summary: "закон", body: [] },
          },
        },
      },
      {
        kind: "article",
        item: {
          id: "2",
          slug: "b",
          published_at: "2020-01-01",
          languages: {
            en: {
              title: "Other",
              summary: "mentions Torah elsewhere",
              body: [{ text: "Torah only in body" }],
            },
          },
        },
      },
    ];
    const ranked = shared.rankSearchCorpus(pool, {
      q: "Torah mitzvot",
      lang: "en",
      limit: 50,
    });
    expect(ranked[0].item.id).toBe("1");
    expect(ranked.length).toBeGreaterThanOrEqual(1);
    const orOnly = shared.rankSearchCorpus(pool, {
      q: "mitzvot nowhereelse",
      lang: "en",
    });
    expect(orOnly.some((r) => r.item.id === "1")).toBe(true);
  });
  it("ARTICLES_PAGE_SIZE is 20", () => {
    expect(shared.ARTICLES_PAGE_SIZE).toBe(20);
  });
});
