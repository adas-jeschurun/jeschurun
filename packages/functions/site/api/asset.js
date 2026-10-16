export async function onRequestGet({ request, env }) {
  try {
    if (!env.FILES) return new Response("FILES binding missing", { status: 500 });
    const u = new URL(request.url);
    const base = u.searchParams.get("path") || "";
    const file = u.searchParams.get("file") || u.searchParams.get("name") || "";
    // material.js builds: /api/asset?path=<base><encoded /filename>
    // Also support ?path=content/articles/slug&file=img.png
    let key = "";
    if (file) {
      key = `${base.replace(/\/$/, "")}/${file}`.replace(/^\//, "");
    } else {
      // path may already include encoded filename suffix from markdown helper
      const raw = u.searchParams.get("path") || "";
      // When called as assetPrefix + encodeURIComponent('/neher.png')
      // full query is path=<base>/neher.png percent-encoded as separate append — handle both
      const m = request.url.match(/[?&]path=([^&]+)/);
      const decoded = decodeURIComponent(m?.[1] || "");
      if (decoded.includes("/content/") || decoded.startsWith("content/")) {
        key = decoded.replace(/^\//, "");
      } else if (decoded.includes("/")) {
        // base was path=content/articles/slug and we appended %2Fneher.png → path=content/articles/slug/neher.png
        key = decoded.replace(/^\//, "");
      } else {
        return new Response("Bad path", { status: 400 });
      }
    }
    if (!/^content\/[A-Za-z0-9._\-\/]+$/.test(key)) {
      return new Response("Bad path", { status: 400 });
    }
    const obj = await env.FILES.get(key);
    if (!obj) return new Response("Not found", { status: 404 });
    const ext = key.split(".").pop().toLowerCase();
    const ct =
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
        svg: "image/svg+xml",
      }[ext] || "application/octet-stream";
    return new Response(obj.body, {
      headers: {
        "content-type": ct,
        "cache-control": "public, max-age=604800",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}
