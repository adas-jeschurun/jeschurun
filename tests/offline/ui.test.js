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
    expect(layout).toMatch(/footer-nav/);
    const navStart = layout.indexOf("const nav = [");
    const navEnd = layout.indexOf("];", navStart);
    const navBlock = layout.slice(navStart, navEnd);
    expect(navBlock).not.toMatch(/archive/);
    expect(layout).toMatch(/\/\$\{lang\}\/archive\//);
  });

  it("sort + related block", () => {
    const pages = readFileSync(resolve(root, "apps/site/src/pages.jsx"), "utf8");
    expect(pages).toMatch(/date_desc/);
    expect(pages).toMatch(/date_asc/);
    expect(pages).toMatch(/title_asc/);
    expect(pages).toMatch(/related-block/);
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
