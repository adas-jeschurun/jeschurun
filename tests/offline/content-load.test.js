import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("content load path", () => {
  it("catalog keeps Cache API + HTML preload + shared loader", () => {
    const content = readFileSync(
      resolve(root, "packages/functions/site/api/content.js"),
      "utf8",
    );
    const lib = readFileSync(
      resolve(root, "packages/functions/site/_lib/load-catalog.js"),
      "utf8",
    );
    expect(lib).toMatch(/catalog-v3/);
    expect(lib).toMatch(/resolveCatalog/);
    expect(content).toMatch(/load-catalog/);
    expect(content).toMatch(/x-jes-catalog-cache|CATALOG_CACHE/);
    expect(lib).toMatch(/stale-while-revalidate/);
    const html = readFileSync(resolve(root, "apps/site/index.html"), "utf8");
    expect(html).toMatch(/rel="preload"[^>]+\/api\/content/);
    expect(html).toMatch(/jes-shell-css/);
    expect(html).toMatch(/\/api\/material\?kind=/);
    expect(html).toMatch(/media="print"/);
  });

  it("material uses Cache API, lang filter, batched related", () => {
    const material = readFileSync(
      resolve(root, "packages/functions/site/api/material.js"),
      "utf8",
    );
    const lib = readFileSync(
      resolve(root, "packages/functions/site/_lib/load-material.js"),
      "utf8",
    );
    expect(lib).toMatch(/material-v1/);
    expect(material).toMatch(/x-jes-material-cache/);
    expect(material).toMatch(/langFilter/);
    expect(lib).toMatch(/loadRelated/);
    expect(lib).toMatch(/Promise\.all/);
    expect(lib).not.toMatch(/for \(const r of rel\.results/);
  });

  it("client reuses preload and starts material early", () => {
    const api = readFileSync(resolve(root, "apps/site/src/api.js"), "utf8");
    // Same-origin anonymous preload ↔ fetch credentials:same-origin (not omit).
    expect(api).toMatch(
      /fetch\("\/api\/content",\s*\{\s*credentials:\s*"same-origin"\s*\}\)/,
    );
    expect(api).toMatch(
      /fetch\(`\/api\/material\?\$\{q\}`,\s*\{\s*credentials:\s*"same-origin"\s*\}\)/,
    );
    expect(api).toMatch(/kickMaterialFromLocation/);
    expect(api).toMatch(/ensureMaterial/);
    expect(api).toMatch(/peekMaterial/);
    expect(api).toMatch(/jes-bootstrap/);
    expect(api).toMatch(/q\.set\("lang"/);
    const html = readFileSync(resolve(root, "apps/site/index.html"), "utf8");
    expect(html).toMatch(/crossorigin="anonymous"/);
    expect(html).toMatch(/link\.crossOrigin\s*=\s*"anonymous"/);
    const main = readFileSync(resolve(root, "apps/site/src/main.jsx"), "utf8");
    expect(main).toMatch(/import "\.\/api\.js"/);
    const pages = readFileSync(resolve(root, "apps/site/src/pages.jsx"), "utf8");
    expect(pages).toMatch(/peekMaterial\(kind, slug/);
    expect(pages).toMatch(/jes-edge-content/);
    expect(pages).toMatch(/releaseEdgeArticle|edgeArticleStillOnPage/);
    expect(api).toMatch(/ingestEdgeBootstrap/);
    const app = readFileSync(resolve(root, "apps/site/src/App.jsx"), "utf8");
    expect(app).toMatch(/kickMaterialFromLocation/);
  });

  it("edge middleware injects article HTML before JS", () => {
    const mw = readFileSync(
      resolve(root, "packages/functions/site/_middleware.js"),
      "utf8",
    );
    expect(mw).toMatch(/resolveMaterial/);
    expect(mw).toMatch(/buildEdgeArticleInject/);
    expect(mw).toMatch(/x-jes-edge-article/);
    const edge = readFileSync(
      resolve(root, "packages/functions/site/_lib/edge-article-html.js"),
      "utf8",
    );
    expect(edge).toMatch(/jes-edge-content/);
    expect(edge).toMatch(/jes-bootstrap/);
    expect(edge).toMatch(/jes-edge-css/);
    expect(mw).toMatch(/edgeCss/);
    const hooks = readFileSync(resolve(root, "apps/site/src/hooks.js"), "utf8");
    expect(hooks).toMatch(/requestIdleCallback|isMaterialPath/);
  });

  it("edge embeds catalog bootstrap site-wide + client seeds sync", () => {
    const mw = readFileSync(
      resolve(root, "packages/functions/site/_middleware.js"),
      "utf8",
    );
    expect(mw).toMatch(/resolveCatalog/);
    expect(mw).toMatch(/jes-catalog-bootstrap|buildCatalogBootstrapScript/);
    expect(mw).toMatch(/x-jes-catalog-boot/);
    expect(mw).toMatch(/SITE_SHELL_CSS|jes-shell-css/);
    // Article routes skip catalog so edge body is not blocked by ~80KB JSON.
    expect(mw).toMatch(/!pathMatch/);
    const edge = readFileSync(
      resolve(root, "packages/functions/site/_lib/edge-article-html.js"),
      "utf8",
    );
    expect(edge).toMatch(/jes-catalog-bootstrap/);
    expect(edge).toMatch(/jes-shell-css/);
    expect(edge).toMatch(/body:has\(#jes-edge-content/);
    const hooks = readFileSync(resolve(root, "apps/site/src/hooks.js"), "utf8");
    expect(hooks).toMatch(/ingestCatalogBootstrap/);
    expect(hooks).toMatch(/jes-catalog-bootstrap/);
    expect(hooks).toMatch(/sessionStorage/);
    expect(hooks).toMatch(/jes-catalog-v3/);
    const pages = readFileSync(resolve(root, "apps/site/src/pages.jsx"), "utf8");
    expect(pages).toMatch(/ListSkeleton/);
    expect(pages).not.toMatch(/if \(!data\?\.ok\) return <p>…<\/p>/);
    expect(pages).toMatch(/jes-bootstrap/);
  });

  it("article template paints edge before React root", () => {
    const mw = readFileSync(
      resolve(root, "packages/functions/site/_middleware.js"),
      "utf8",
    );
    expect(mw).toMatch(/inject\.edgeHtml\}\$\{inject\.bootScript/);
    const edge = readFileSync(
      resolve(root, "packages/functions/site/_lib/edge-article-html.js"),
      "utf8",
    );
    expect(edge).toMatch(/display:none!important/);
    const pages = readFileSync(resolve(root, "apps/site/src/pages.jsx"), "utf8");
    expect(pages).toMatch(/edgeArticleStillOnPage/);
    expect(pages).toMatch(/releaseEdgeArticle/);
  });
});
