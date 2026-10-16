/** Site-wide noindex until domain cutover. */
export async function onRequest(context) {
  const res = await context.next();
  const headers = new Headers(res.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
