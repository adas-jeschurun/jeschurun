/** Escape text for HTML text nodes / attributes. */
export function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Safe JSON for inline <script type="application/json">. */
export function safeJson(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function blocksHtml(body) {
  return (body || [])
    .map((b) => {
      if (b.type === "p") return `<p>${b.html || esc(b.text)}</p>`;
      if (b.type === "h2") return `<h2>${b.html || esc(b.text)}</h2>`;
      if (b.type === "h3") return `<h3>${b.html || esc(b.text)}</h3>`;
      if (b.type === "quote")
        return `<blockquote>${b.html || esc(b.text)}</blockquote>`;
      if (b.type === "divider") return "<hr />";
      if (b.type === "image") {
        const cap = b.caption
          ? `<figcaption>${esc(b.caption)}</figcaption>`
          : "";
        return `<figure class="img-${esc(b.layout || "center")}"><img src="${esc(b.src)}" alt="${esc(b.alt || "")}" />${cap}</figure>`;
      }
      return "";
    })
    .join("");
}

/**
 * Build early-visible article markup + bootstrap JSON for SPA hydrate.
 * Shown before the JS bundle downloads/parses.
 */
export function buildEdgeArticleInject({ kind, slug, lang, payload }) {
  const m = payload?.material;
  if (!payload?.ok || !m) return null;
  const d = m.languages?.[lang] || Object.values(m.languages || {})[0] || {};
  const title = d.title || d.name || m.slug || "";
  if (!title) return null;

  const rtl = lang === "he";
  const summary = d.summary
    ? `<p class="summary">${esc(d.summary)}</p>`
    : "";
  const question = d.question
    ? `<p class="question">${esc(d.question)}</p>`
    : "";
  const body = blocksHtml(d.body);

  const bootstrap = {
    kind,
    slug,
    lang,
    payload: { ok: true, material: m },
  };

  const edgeHtml = `<div id="jes-edge-content" class="page-main jes-edge-content" lang="${esc(lang)}"${rtl ? ' dir="rtl"' : ""}><article class="material"><h1>${esc(title)}</h1>${question}${summary}<div class="article-body">${body}</div></article></div>`;

  const bootScript = `<script type="application/json" id="jes-bootstrap">${safeJson(bootstrap)}</script>`;
  const titleTag = `<title>${esc(title)} · Jeschurun</title>`;

  return { edgeHtml, bootScript, titleTag, title, cache: payload.cache };
}

/** Parse /:lang/(article|answer|biography)/:slug[/] */
export function matchMaterialPath(pathname) {
  const m = String(pathname || "").match(
    /^\/(he|en|ru|de|fr)\/(article|answer|biography)\/([^/]+)\/?$/i,
  );
  if (!m) return null;
  const kind = m[2].toLowerCase() === "biography" ? "bio" : m[2].toLowerCase();
  return { lang: m[1].toLowerCase(), kind, slug: m[3] };
}
