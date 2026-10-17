/** Canonical host redirects + noindex on any non-redirected *.pages.dev. */

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

export async function onRequest(context) {
  const host = context.request.headers.get("host") || "";
  if (shouldRedirectToApex(host)) {
    const incoming = new URL(context.request.url);
    const dest = `${CANONICAL_ORIGIN}${incoming.pathname}${incoming.search}`;
    return Response.redirect(dest, 301);
  }

  const res = await context.next();
  const headers = new Headers(res.headers);
  const path = new URL(context.request.url).pathname;
  const isArchive = /^\/(he|en|ru|de|fr)\/archive(\/|$)/i.test(path);
  if (isArchive) {
    headers.set("X-Robots-Tag", "noindex, follow");
  } else if (isPagesDevHost(host)) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
