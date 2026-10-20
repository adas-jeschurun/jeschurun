/** Canonical host redirects + noindex + edge article + catalog bootstrap. */

import { resolveMaterial } from "./_lib/load-material.js";
import { resolveCatalog } from "./_lib/load-catalog.js";
import {
  buildCatalogBootstrapScript,
  buildEdgeArticleInject,
  matchMaterialPath,
  SITE_SHELL_CSS,
} from "./_lib/edge-article-html.js";

const CANONICAL_ORIGIN = "https://jeschurun.org";
const WWW_HOST = "www.jeschurun.org";

function hostname(host) {
  return String(host || "").split(":")[0].toLowerCase();
}

function isPagesDevHost(host) {
  return /\.pages\.dev$/i.test(hostname(host));
}

/** www → apex; jes-v2 pages.dev → apex (zone rules cannot cover pages.dev). */
function shouldRedirectToApex(host) {
  const h = hostname(host);
  return h === WWW_HOST || isPagesDevHost(h);
}

function applySecurityHeaders(headers, host, path) {
  const isPrint = /^\/(he|en|ru|de|fr)\/article\/[^/]+\/print\/?$/i.test(path);
  const isArchive = /^\/(he|en|ru|de|fr)\/archive(\/|$)/i.test(path);
  if (isPrint) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  } else if (isArchive) {
    headers.set("X-Robots-Tag", "noindex, follow");
  } else if (isPagesDevHost(host)) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  headers.set("X-Content-Type-Options", "nosniff");
}

function rewriteHtml(html, { pathMatch, inject, catalogBoot, catalogSource }) {
  let out = html;

  // Catalog is embedded — drop competing preload (all routes when boot present).
  if (catalogBoot) {
    out = out.replace(
      /<link\s+rel="preload"\s+href="\/api\/content"[^>]*>\s*/i,
      "",
    );
  }

  // Drop catalog preload on material routes even without catalog (bandwidth).
  if (pathMatch && !catalogBoot) {
    out = out.replace(
      /<link\s+rel="preload"\s+href="\/api\/content"[^>]*>\s*/i,
      "",
    );
  }

  // Material is embedded; drop the client preload script block.
  if (pathMatch) {
    out = out.replace(
      /<script>\s*\(function\s*\(\)\s*\{\s*var m = location\.pathname\.match[\s\S]*?<\/script>\s*/i,
      "",
    );
  }

  if (inject?.titleTag) {
    out = out.replace(/<title>[^<]*<\/title>/i, inject.titleTag);
  }
  if (pathMatch) {
    out = out.replace(/<html\s+lang="[^"]*"/i, `<html lang="${pathMatch.lang}"`);
  }

  if (out.includes("</head>")) {
    const headBits = [
      out.includes("id=\"jes-shell-css\"") ? "" : SITE_SHELL_CSS,
      inject?.edgeCss || "",
      inject?.bootScript || "",
      catalogBoot || "",
    ].join("");
    out = out.replace("</head>", `${headBits}</head>`);
  }

  if (inject?.edgeHtml && out.includes('<div id="root"></div>')) {
    out = out.replace(
      '<div id="root"></div>',
      `${inject.edgeHtml}<div id="root"></div>`,
    );
  }

  // Silence unused in rewrite; caller sets headers from catalogSource.
  void catalogSource;
  return out;
}

export async function onRequest(context) {
  const host = context.request.headers.get("host") || "";
  if (shouldRedirectToApex(host)) {
    const incoming = new URL(context.request.url);
    const dest = `${CANONICAL_ORIGIN}${incoming.pathname}${incoming.search}`;
    return Response.redirect(dest, 301);
  }

  const url = new URL(context.request.url);
  const pathMatch = matchMaterialPath(url.pathname);
  const isGet = context.request.method === "GET";
  const path = url.pathname;
  const isAssetOrApi =
    path.startsWith("/api/") ||
    path.startsWith("/assets/") ||
    /\.(js|css|png|jpe?g|webp|svg|ico|woff2?|map|txt|xml)$/i.test(path);

  // Resolve material + catalog in parallel with static HTML.
  const materialPromise =
    pathMatch && context.env?.CONTENT_DB && isGet
      ? resolveMaterial(context.env, pathMatch).catch(() => null)
      : null;

  // Catalog for every document navigation — seeds React before /api/content.
  const catalogPromise =
    isGet && !isAssetOrApi && context.env?.CONTENT_DB
      ? resolveCatalog(context.env, context).catch(() => null)
      : null;

  const res = await context.next();
  const headers = new Headers(res.headers);
  applySecurityHeaders(headers, host, url.pathname);

  const ct = res.headers.get("content-type") || "";
  const isHtml = ct.includes("text/html");

  let inject = null;
  if (materialPromise) {
    try {
      const resolved = await materialPromise;
      if (resolved?.ok && isHtml) {
        inject = buildEdgeArticleInject({
          ...pathMatch,
          payload: resolved,
        });
        if (inject) {
          headers.set("x-jes-edge-article", resolved.cache || "OK");
        }
      }
    } catch {
      /* SPA fallback */
    }
  }

  let catalogBoot = "";
  let catalogSource = "";
  if (catalogPromise && isHtml) {
    try {
      const cat = await catalogPromise;
      if (cat?.data?.ok) {
        catalogBoot = buildCatalogBootstrapScript(cat.data);
        catalogSource = cat.source;
        headers.set("x-jes-catalog-boot", catalogSource);
      }
    } catch {
      /* client fetch fallback */
    }
  }

  if ((inject || catalogBoot) && isHtml) {
    const html = rewriteHtml(await res.text(), {
      pathMatch,
      inject,
      catalogBoot,
      catalogSource,
    });
    headers.delete("content-length");
    return new Response(html, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
