import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

describe("ui gates", () => {
  it("sticky mobile top bar CSS present", () => {
    const css = readFileSync(resolve(root, "apps/site/src/styles.css"), "utf8");
    expect(css).toMatch(/position:\s*fixed\s*!important/);
    expect(css).toMatch(/\.main-nav\.top-bar/);
  });

  it("archive in footer not main nav", () => {
    const layout = readFileSync(resolve(root, "apps/site/src/Layout.jsx"), "utf8");
    expect(layout).toMatch(/footer-columns/);
    expect(layout).toMatch(/footer-nav/);
    const navStart = layout.indexOf("const nav = [");
    const navEnd = layout.indexOf("];", navStart);
    const navBlock = layout.slice(navStart, navEnd);
    expect(navBlock).not.toMatch(/archive/);
    expect(navBlock).not.toMatch(/current/);
    expect(layout).toMatch(/\/\$\{lang\}\/archive\//);
    expect(layout).not.toMatch(/\/\$\{lang\}\/current\//);
    expect(layout).toMatch(/\/\$\{lang\}\/terms\//);
    expect(layout).toMatch(/\/\$\{lang\}\/privacy\//);
    expect(layout).toMatch(/\/\$\{lang\}\/cookies\//);
    expect(layout).toMatch(/application\/ld\+json/);
  });

  it("current route removed; issue card on home", () => {
    const app = readFileSync(resolve(root, "apps/site/src/App.jsx"), "utf8");
    expect(app).not.toMatch(/CurrentPage/);
    expect(app).toMatch(/path="current"/);
    expect(app).toMatch(/Navigate to="\.\."/);
    const pages = readFileSync(resolve(root, "apps/site/src/pages.jsx"), "utf8");
    expect(pages).not.toMatch(/export function CurrentPage/);
    expect(pages).toMatch(/issue-card--home/);
    expect(pages).toMatch(/IssueView issue=\{issue\}/);
    const css = readFileSync(resolve(root, "apps/site/src/styles.css"), "utf8");
    expect(css).toMatch(/\.issue-card-downloads/);
    expect(css).toMatch(/\.site-header/);
    expect(css).toMatch(/--blue:\s*#1a3d67/);
  });

  it("sort + related block + tag filter", () => {
    const pages = readFileSync(resolve(root, "apps/site/src/pages.jsx"), "utf8");
    expect(pages).toMatch(/date_desc/);
    expect(pages).toMatch(/date_asc/);
    expect(pages).toMatch(/title_asc/);
    expect(pages).toMatch(/related-block/);
    expect(pages).toMatch(/tagFilter|sp\.get\("tag"\)/);
    expect(pages).toMatch(/articles\/\?tag=/);
  });

  it("markdown allows internal interlinks", () => {
    const md = readFileSync(
      resolve(root, "packages/functions/_lib/markdown.js"),
      "utf8",
    );
    expect(md).toMatch(/internal-link/);
    expect(md).toMatch(/article\|answer\|biography/);
  });

  it("hreflang canonical tag filter pagination archive", () => {
    const layout = readFileSync(resolve(root, "apps/site/src/Layout.jsx"), "utf8");
    expect(layout).toMatch(/hreflang/);
    expect(layout).toMatch(/x-default/);
    expect(layout).toMatch(/rel = "canonical"/);
    expect(layout).toMatch(/noindex, follow/);
    expect(layout).toMatch(/document\.title/);
    expect(layout).toMatch(/routeUiTitle/);
    const pages = readFileSync(resolve(root, "apps/site/src/pages.jsx"), "utf8");
    expect(pages).toMatch(/ARTICLES_PAGE_SIZE/);
    expect(pages).toMatch(/rankSearchCorpus/);
    expect(pages).toMatch(/tag-filter/);
    expect(pages).toMatch(/pagination/);
    expect(pages).toMatch(/currentIssue\?\.id/);
    expect(pages).toMatch(/iss\.id !== currentId/);
    expect(pages).toMatch(/\$\{iss\.hebrew_year\} · \$\{parasha\}/);
    expect(pages).toMatch(/document\.title/);
    const mw = readFileSync(
      resolve(root, "packages/functions/site/_middleware.js"),
      "utf8",
    );
    expect(mw).toMatch(/archive/);
    expect(mw).toMatch(/noindex, follow/);
  });

  it("search-corpus does not SELECT source_issue from bios", () => {
    const src = readFileSync(
      resolve(root, "packages/functions/site/api/search-corpus.js"),
      "utf8",
    );
    expect(src).toMatch(/kind === "bio"/);
    // bios table has no source_issue — bio branch must omit it
    const bioSelect = src.match(
      /kind === "bio"\s*\?\s*`([^`]+)`/,
    )?.[1];
    expect(bioSelect).toBeTruthy();
    expect(bioSelect).not.toMatch(/source_issue/);
    expect(bioSelect).toMatch(/FROM \$\{table\}/);
  });

  it("noindex scoped to pages.dev; custom domain indexable", () => {
    expect(readFileSync(resolve(root, "apps/site/public/robots.txt"), "utf8")).toMatch(
      /Allow: \//,
    );
    expect(readFileSync(resolve(root, "apps/site/public/_headers"), "utf8")).not.toMatch(
      /noindex/,
    );
    const mw = readFileSync(
      resolve(root, "packages/functions/site/_middleware.js"),
      "utf8",
    );
    expect(mw).toMatch(/pages\.dev/);
    expect(mw).toMatch(/X-Robots-Tag/);
    expect(mw).toMatch(/www\.jeschurun\.org/);
    expect(mw).toMatch(/Response\.redirect/);
    expect(mw).toMatch(/301/);
    expect(mw).toMatch(/jeschurun\.org/);
    const robotsFn = readFileSync(
      resolve(root, "packages/functions/site/robots.txt.js"),
      "utf8",
    );
    expect(robotsFn).toMatch(/Allow: \//);
    expect(robotsFn).toMatch(/Disallow: \//);
  });
});
