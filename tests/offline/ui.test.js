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

  it("candle widget is static footer content, not sticky/FAB", () => {
    const layout = readFileSync(resolve(root, "apps/site/src/Layout.jsx"), "utf8");
    const footerIdx = layout.indexOf('className="site-footer"');
    const candleIdx = layout.indexOf("<CandleLightingWidget");
    expect(footerIdx).toBeGreaterThan(-1);
    expect(candleIdx).toBeGreaterThan(footerIdx);
    const afterFooter = layout.slice(footerIdx);
    const footerClose = afterFooter.indexOf("</footer>");
    expect(afterFooter.slice(0, footerClose)).toMatch(/CandleLightingWidget/);
    const css = readFileSync(resolve(root, "apps/site/src/styles.css"), "utf8");
    const candleBlock = css.slice(css.indexOf(".candle-widget {"));
    const candleRule = candleBlock.slice(0, candleBlock.indexOf(".candle-widget-main"));
    expect(candleRule).toMatch(/position:\s*static/);
    expect(candleRule).not.toMatch(/position:\s*fixed/);
    expect(candleRule).not.toMatch(/position:\s*sticky/);
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
    expect(app).toMatch(/path="current"\s+element=\{<RedirectLangHome/);
    expect(app).toMatch(/function LangLayout/);
    expect(app).toMatch(/path="\*"\s+element=\{<NotFoundPage/);
    expect(app).not.toMatch(/Navigate to="\."/);
    const pagesNf = readFileSync(resolve(root, "apps/site/src/pages.jsx"), "utf8");
    expect(pagesNf).toMatch(/export function NotFoundPage/);
    expect(pagesNf).toMatch(/ui\.notFound/);
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
    expect(layout).toMatch(/setDocumentTitle|brandTitle/);
    expect(layout).toMatch(/setMetaDescription/);
    expect(layout).toMatch(/routeSectionMeta/);
    const pages = readFileSync(resolve(root, "apps/site/src/pages.jsx"), "utf8");
    expect(pages).toMatch(/ARTICLES_PAGE_SIZE/);
    expect(pages).toMatch(/rankSearchCorpus/);
    expect(pages).toMatch(/tag-filter/);
    expect(pages).toMatch(/pagination/);
    expect(pages).toMatch(/currentIssue\?\.id/);
    expect(pages).toMatch(/iss\.id !== currentId/);
    expect(pages).toMatch(/\$\{iss\.hebrew_year\} · \$\{parasha\}/);
    expect(pages).toMatch(/articlesListTitle/);
    expect(pages).toMatch(/setMetaDescription/);
    const mw = readFileSync(
      resolve(root, "packages/functions/site/_middleware.js"),
      "utf8",
    );
    expect(mw).toMatch(/archive/);
    expect(mw).toMatch(/noindex, follow/);
  });

  it("SEO titles descriptions in all five langs", async () => {
    const {
      LANGS,
      SEO,
      brandTitle,
      articlesListTitle,
      fillSeoTemplate,
      seoFor,
      UI,
    } = await import(resolve(root, "packages/shared/src/index.js"));
    for (const lang of LANGS) {
      const seo = seoFor(lang);
      expect(seo).toBe(SEO[lang]);
      expect(seo.homeDescription.length).toBeGreaterThan(40);
      expect(seo.articlesDescription.length).toBeGreaterThan(20);
      expect(seo.askDescription.length).toBeGreaterThan(20);
      expect(seo.aboutDescription.length).toBeGreaterThan(20);
      expect(seo.notFoundDescription.length).toBeGreaterThan(20);
      expect(UI[lang].notFound.length).toBeGreaterThan(2);
      expect(UI[lang].notFoundBody.length).toBeGreaterThan(10);
      expect(brandTitle(UI[lang].about, lang)).toMatch(/Jeschurun/);
      expect(brandTitle(UI[lang].notFound, lang)).toMatch(/Jeschurun/);
      expect(brandTitle("", lang)).toBe("Jeschurun");
      expect(
        articlesListTitle({
          lang,
          articlesLabel: UI[lang].articles,
          page: 2,
        }),
      ).toMatch(/2/);
      expect(
        fillSeoTemplate(seo.articlesTagDescription, { tag: "Ethics" }),
      ).toMatch(/Ethics/);
    }
    const layout = readFileSync(resolve(root, "apps/site/src/Layout.jsx"), "utf8");
    expect(layout).toMatch(/seoFor/);
    const pages = readFileSync(resolve(root, "apps/site/src/pages.jsx"), "utf8");
    expect(pages).toMatch(/<h1>\{ui\.articles\}<\/h1>/);
    expect(pages).toMatch(/<h1>\{ui\.about\}<\/h1>/);
    expect(pages).toMatch(/<h1>\{ui\.askSubmitTitle\}<\/h1>/);
    expect(pages).toMatch(/<h1>\{title\}<\/h1>/);
    expect(pages).toMatch(/issue-card-title/);
    expect(pages).toMatch(/export function NotFoundPage/);
    expect(pages).toMatch(/<h1>\{ui\.notFound\}<\/h1>/);
    expect(pages).toMatch(/setMetaDescription\(seo\.notFoundDescription\)/);
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

  it("favicon.ico is a real static asset (not SPA HTML)", () => {
    const ico = resolve(root, "apps/site/public/favicon.ico");
    const buf = readFileSync(ico);
    expect(buf.length).toBeGreaterThan(100);
    // ICO magic: 00 00 01 00
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(1);
    expect(buf[3]).toBe(0);
    const redirects = readFileSync(
      resolve(root, "apps/site/public/_redirects"),
      "utf8",
    );
    expect(redirects).toMatch(/\/favicon\.ico/);
    expect(redirects).toMatch(/\/index\.html\s+200/);
    const routes = JSON.parse(
      readFileSync(resolve(root, "apps/site/public/_routes.json"), "utf8"),
    );
    expect(routes.exclude).toContain("/favicon.ico");
    const html = readFileSync(resolve(root, "apps/site/index.html"), "utf8");
    expect(html).toMatch(/href="\/favicon\.ico"/);
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
