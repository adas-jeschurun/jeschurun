/** Preview hosts stay closed to crawlers; custom domain is open. */
function isPagesDevHost(host) {
  return /\.pages\.dev$/i.test(String(host || "").split(":")[0]);
}

export async function onRequest(context) {
  const host = context.request.headers.get("host") || "";
  const preview = isPagesDevHost(host);
  const body = preview
    ? "User-agent: *\nDisallow: /\n"
    : "User-agent: *\nAllow: /\nDisallow: /*/article/*/print/\n";
  const headers = {
    "content-type": "text/plain; charset=utf-8",
  };
  if (preview) headers["X-Robots-Tag"] = "noindex, nofollow";
  return new Response(body, { headers });
}
