/** Canonical host redirects + noindex + edge article bootstrap. */

import { resolveMaterial } from "./_lib/load-material.js";
import {
  buildEdgeArticleInject,
  matchMaterialPath,
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

function rewriteHtml(html, pathMatch, inject) {
  // Drop catalog preload on material routes — frees bandwidth for JS.
  let out = html.replace(
    /<link\s+rel="preload"\s+href="\/api\/content"[^>]*>\s*/i,
    "",
  );
  // Material is embedded; drop the client preload script block.
  out = out.replace(
    /<script>\s*\(function\s*\(\)\s*\{\s*var m = location\.pathname\.match[\s\S]*?<\/script>\s*/i,
    "",
  );
  if (inject.titleTag) {
    out = out.replace(/<title>[^<]*<\/title>/i, inject.titleTag);
  }
  out = out.replace(/<html\s+lang="[^"]*"/i, `<html lang="${pathMatch.lang}"`);
  if (out.includes("</head>")) {
    out = out.replace("</head>", `${inject.bootScript}</head>`);
  }
  if (out.includes('<div id="root"></div>')) {
    out = out.replace(
      '<div id="root"></div>',
      `${inject.edgeHtml}<div id="root"></div>`,
    );
  }
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

  // Resolve material in parallel with static HTML (Cache API / D1).
  const materialPromise =
    pathMatch && context.env?.CONTENT_DB && context.request.method === "GET"
      ? resolveMaterial(context.env, pathMatch).catch(() => null)
      : null;

  const res = await context.next();
  const headers = new Headers(res.headers);
  applySecurityHeaders(headers, host, url.pathname);

  if (materialPromise) {
    try {
      const resolved = await materialPromise;
      const ct = res.headers.get("content-type") || "";
      if (resolved?.ok && ct.includes("text/html")) {
        const inject = buildEdgeArticleInject({
          ...pathMatch,
          payload: resolved,
        });
        if (inject) {
          const html = rewriteHtml(await res.text(), pathMatch, inject);
          headers.set("x-jes-edge-article", resolved.cache || "OK");
          headers.delete("content-length");
          return new Response(html, {
            status: res.status,
            statusText: res.statusText,
            headers,
          });
        }
      }
    } catch {
      /* SPA fallback */
    }
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
