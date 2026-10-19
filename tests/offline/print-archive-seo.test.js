import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  articlePrintPath,
  articlePublicUrl,
  issueDownloadLinks,
  pastPublishedIssues,
  updatedDateLine,
} from "../../apps/site/src/article-meta.js";
import { LANGS, publicPageSeo } from "../../packages/shared/src/index.js";

const root = resolve(import.meta.dirname, "../..");

describe("print archive dates seo favicon", () => {
  it("print route is noindex and articles link to it", () => {
    const pages = readFileSync(resolve(root, "apps/site/src/pages.jsx"), "utf8");
    const app = readFileSync(resolve(root, "apps/site/src/App.jsx"), "utf8");
    const layoutStart = app.indexOf("element={<Layout />}");
    const layoutEnd = app.indexOf("</Route>", layoutStart);
    expect(app.slice(layoutStart, layoutEnd)).not.toMatch(/PrintArticlePage/);
    expect(app).toMatch(/path="article\/:slug\/print"/);
    expect(pages).toMatch(/kind === "article"/);
    expect(pages).toMatch(/rel="nofollow"/);
    expect(pages).toMatch(/articlePrintPath\(lang, m\.slug\)/);
    expect(pages).toMatch(/window\.print\(\)/);
    const printFn = pages.slice(
      pages.indexOf("export function PrintArticlePage"),
      pages.indexOf("export function AskRavPage"),
    );
    expect(printFn).toMatch(/publisher-seal\.png/);
    expect(printFn).toMatch(/articlePublicUrl/);
    expect(printFn).toMatch(/<Blocks body=\{d\.body\}/);
    expect(printFn).toMatch(/noindex, nofollow/);
    expect(printFn).toMatch(/rel = "canonical"/);
    expect(printFn).not.toMatch(/hreflang/);
    expect(printFn).not.toMatch(/site-header|NavLink|related-block/);
    expect(articlePrintPath("ru", "courage")).toBe("/ru/article/courage/print/");
    expect(articlePublicUrl("ru", "courage")).toBe(
      "https://jeschurun.org/ru/article/courage/",
    );
    const robots = readFileSync(resolve(root, "apps/site/public/robots.txt"), "utf8");
    expect(robots).toMatch(/Disallow: \/\*\/article\/\*\/print\//);
    const robotsFn = readFileSync(
      resolve(root, "packages/functions/site/robots.txt.js"),
      "utf8",
    );
    expect(robotsFn).toMatch(/Disallow: \/\*\/article\/\*\/print\//);
    const mw = readFileSync(
      resolve(root, "packages/functions/site/_middleware.js"),
      "utf8",
    );
    expect(mw).toMatch(/noindex, nofollow/);
    const material = readFileSync(
      resolve(root, "packages/functions/site/api/material.js"),
      "utf8",
    );
    expect(material).toMatch(/updated_at: row\.updated_at/);
  });

  it("archive lists only past issues and omits a missing file", () => {
    const current = {
      id: "cur",
      hebrew_year: "5786",
      slug: "now",
      status: "published",
      downloads: { en: { pdf: "downloads/en.pdf", epub: "downloads/en.epub" } },
    };
    const older = {
      id: "old",
      hebrew_year: "5785",
      slug: "then",
      status: "published",
      downloads: { ru: { pdf: "downloads/ru.pdf", epub: "downloads/ru.epub" }, en: { pdf: "downloads/en.pdf" } },
    };
    const rows = pastPublishedIssues([current, older], current);
    expect(rows.map((r) => r.id)).toEqual(["old"]);
    const files = issueDownloadLinks(older, "ru");
    expect(files.map((f) => f.kind)).toEqual(["pdf", "epub"]);
    expect(files[0].href).toBe(
      `/api/file?path=${encodeURIComponent("content/issues/5785/then/downloads/ru.pdf")}`,
    );
    expect(files[1].href).toContain("ru.epub");
    expect(issueDownloadLinks(older, "en").map((f) => f.kind)).toEqual(["pdf"]);
    expect(issueDownloadLinks(older, "he")).toEqual([]);
  });

  it("updated_at wins and the line has gregorian and Hebrew", () => {
    const preferred = updatedDateLine(
      { updated_at: "2024-01-15", published_at: "2020-01-01" },
      "en",
      "Updated:",
    );
    expect(preferred).toMatch(/January 15, 2024/);
    expect(preferred).not.toMatch(/2020/);
    expect(preferred).toMatch(/[\u0590-\u05FF]/);
    const fallback = updatedDateLine(
      { updated_at: "  ", published_at: "2020-05-02" },
      "en",
      "Updated:",
    );
    expect(fallback).toMatch(/May 2, 2020/);
    expect(fallback).toMatch(/[\u0590-\u05FF]/);
  });

  it("SEO copy for five langs is distinct and names Jeschurun", () => {
    const pages = ["home", "articles", "ask", "about", "archive"];
    for (const lang of LANGS) {
      const packs = pages.map((page) => publicPageSeo(lang, page));
      const article = publicPageSeo(lang, "article", {
        title: "Courage",
        summary: "A summary of the essay.",
      });
      for (const pack of [...packs, article]) {
        expect(pack.title.length).toBeGreaterThan(0);
        expect(pack.description.length).toBeGreaterThan(0);
        expect(pack.title.includes("Jeschurun") || pack.title.includes("Courage")).toBe(
          true,
        );
      }
      const descriptions = packs.map((p) => p.description);
      expect(new Set(descriptions).size).toBe(descriptions.length);
      expect(article.description).toBe("A summary of the essay.");
    }
    expect(LANGS).toEqual(["he", "en", "ru", "de", "fr"]);
  });

  it("favicon.ico is an image, not an HTML document", () => {
    const buf = readFileSync(resolve(root, "apps/site/public/favicon.ico"));
    expect(buf.length).toBeGreaterThan(100);
    const head = buf.subarray(0, 16).toString("utf8").toLowerCase();
    expect(head).not.toMatch(/<!doctype|<html/);
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(1);
    expect(buf[3]).toBe(0);
  });
});
