import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

describe("ui gates", () => {
  it("mobile hides top nav; bottom 3-dot menu only", () => {
    const css = readFileSync(resolve(root, "apps/site/src/styles.css"), "utf8");
    expect(css).toMatch(/\.main-nav\.top-bar/);
    expect(css).toMatch(/display:\s*none\s*!important/);
    expect(css).toMatch(/\.mobile-nav-trigger/);
    expect(css).toMatch(/bottom:\s*calc\(16px/);
    const layout = readFileSync(resolve(root, "apps/site/src/Layout.jsx"), "utf8");
    expect(layout).toMatch(/id="main-content"/);
    expect(layout).toMatch(/AccessibilityPanel/);
    expect(layout).toMatch(/CandleLightingWidget/);
    expect(layout).toMatch(/BackToTop/);
  });

  it("a11y bootstrap + geo candle APIs present", () => {
    const html = readFileSync(resolve(root, "apps/site/index.html"), "utf8");
    expect(html).toMatch(/jes-a11y-bootstrap/);
    expect(html).toMatch(/jes-a11y/);
    const resolveGeo = readFileSync(
      resolve(root, "packages/functions/site/api/geo/resolve.js"),
      "utf8",
    );
    const searchGeo = readFileSync(
      resolve(root, "packages/functions/site/api/geo/search.js"),
      "utf8",
    );
    expect(resolveGeo).toMatch(/Jerusalem/);
    expect(searchGeo).toMatch(/nominatim\.openstreetmap\.org/);
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
    expect(md).toMatch(/mailto:/);
  });

  it("About page uses full markdown bodies for five langs", () => {
    const pages = readFileSync(resolve(root, "apps/site/src/pages.jsx"), "utf8");
    expect(pages).toMatch(/ABOUT_MD/);
    expect(pages).toMatch(/stripLeadingH1/);
    expect(pages).toMatch(/markdownBlocks/);
    for (const lang of ["he", "en", "ru", "de", "fr"]) {
      const body = readFileSync(
        resolve(root, `apps/site/src/content/about/${lang}.md`),
        "utf8",
      );
      expect(body).toMatch(/^# /);
      expect(body).toMatch(/Jeschurun/);
      expect(body).toMatch(/ask@jeschurun\.org/);
    }
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
    // Edge Cache API + batched translations + clipped body (payload budget)
    expect(src).toMatch(/caches\.default/);
    expect(src).toMatch(/search-corpus-v2/);
    expect(src).toMatch(/Promise\.all/);
    expect(src).toMatch(/BODY_CHARS/);
    expect(src).toMatch(/parent_id IN/);
  });

  it("mobile nav clears header; menu not mid-viewport", () => {
    const css = readFileSync(resolve(root, "apps/site/src/styles.css"), "utf8");
    expect(css).not.toMatch(/padding-top:\s*56px/);
    expect(css).not.toMatch(/top:\s*52%/);
    expect(css).toMatch(/\.mobile-nav-trigger[\s\S]*?top:\s*auto/);
    expect(css).toMatch(/\.mobile-nav-panel\.open[\s\S]*?bottom:\s*calc\(72px/);
    const html = readFileSync(resolve(root, "apps/site/index.html"), "utf8");
    expect(html).toMatch(/fonts\.googleapis\.com/);
    expect(html).toMatch(/preconnect/);
    const cssNoImport = css.includes("@import url(\"https://fonts.googleapis");
    expect(cssNoImport).toBe(false);
    const api = readFileSync(resolve(root, "apps/site/src/api.js"), "utf8");
    expect(api).toMatch(/searchCorpusCache/);
  });

  it("ask-rav honeypot does not expand RTL scrollWidth", () => {
    const css = readFileSync(resolve(root, "apps/site/src/styles.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    // Large negative left blows document scrollWidth (~10k) and squeezes HE mobile
    expect(css).not.toMatch(/left:\s*-\d{2,}px/);
    expect(css).toMatch(/\.hp-website[\s\S]*?clip-path:\s*inset\(50%\)/);
    expect(css).toMatch(/\.hp-website[\s\S]*?position:\s*fixed/);
    expect(css).toMatch(/\.ask-form[\s\S]*?overflow:\s*hidden/);
    expect(css).toMatch(/html\s*\{[\s\S]*?overflow-x:\s*hidden/);
  });

  it("sitewide CSS has no off-screen honeypot / negative-left traps", () => {
    const css = readFileSync(resolve(root, "apps/site/src/styles.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const jsx = readFileSync(resolve(root, "apps/site/src/pages.jsx"), "utf8");
    // Class of bug: absolute + large negative left/right expands scrollWidth in LTR+RTL
    expect(css).not.toMatch(/left:\s*-\d{2,}px/);
    expect(css).not.toMatch(/right:\s*-\d{2,}px/);
    expect(css).not.toMatch(/text-indent:\s*-\d+/);
    expect(css).not.toMatch(/max-width:\s*100vw/);
    expect(jsx).toMatch(/className="hp-website"/);
    expect(css).toMatch(/\.visually-hidden/);
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
