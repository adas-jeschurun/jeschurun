export async function onRequestGet({ request, env }) {
  try {
    if (!env.FILES) return new Response("FILES binding missing", { status: 500 });
    const u = new URL(request.url);
    const path = u.searchParams.get("path") || "";
    if (
      !/^content\/issues\/[A-Za-z0-9._\-\/]+\/downloads\/[A-Za-z0-9._\-]+$/.test(
        path,
      )
    ) {
      return new Response("Bad path", { status: 400 });
    }
    const key = path; // imported as content/...
    const obj = await env.FILES.get(key);
    if (!obj) return new Response("Not found", { status: 404 });
    const ext = path.split(".").pop().toLowerCase();
    const ct =
      ext === "pdf"
        ? "application/pdf"
        : ext === "epub"
          ? "application/epub+zip"
          : "application/octet-stream";
    return new Response(obj.body, {
      headers: {
        "content-type": ct,
        "content-disposition": `inline; filename="${path.split("/").pop()}"`,
        "cache-control": "public, max-age=3600",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}
