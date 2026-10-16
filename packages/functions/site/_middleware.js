/** noindex only on *.pages.dev preview hosts; custom domains are indexable. */
function isPagesDevHost(host) {
  return /\.pages\.dev$/i.test(String(host || "").split(":")[0]);
}

export async function onRequest(context) {
  const res = await context.next();
  const headers = new Headers(res.headers);
  const host = context.request.headers.get("host") || "";
  if (isPagesDevHost(host)) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
