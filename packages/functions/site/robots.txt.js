export async function onRequest() {
  return new Response("User-agent: *\nDisallow: /\n", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
