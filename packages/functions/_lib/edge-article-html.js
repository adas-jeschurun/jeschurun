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

  // Inline CSS so body text is readable before the JS bundle (which carries styles.css).
  const edgeCss = `<style id="jes-edge-css">#jes-edge-content{max-width:980px;margin:0 auto;padding:24px 16px 40px;font-family:Georgia,"Times New Roman",serif;line-height:1.55;color:#1a1a1a}#jes-edge-content[hidden]{display:none!important}/* Hide React chrome until edge hands off — prevents blank/… gap over edge text */body:has(#jes-edge-content:not([hidden])) #root{display:none!important}#jes-edge-content h1{font-size:clamp(1.45rem,4vw,1.85rem);line-height:1.25;margin:0 0 .75rem;color:#1a3d67}#jes-edge-content .summary,#jes-edge-content .question{margin:0 0 1em;opacity:.9}#jes-edge-content .article-body p{margin:0 0 1em}#jes-edge-content .article-body h2,#jes-edge-content .article-body h3{color:#1a3d67;margin:1.25em 0 .5em}</style>`;

  const bootScript = `<script type="application/json" id="jes-bootstrap">${safeJson(bootstrap)}</script>`;
  const titleTag = `<title>${esc(title)} · Jeschurun</title>`;

  return { edgeHtml, edgeCss, bootScript, titleTag, title, cache: payload.cache };
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

/** Inline catalog JSON so home/list routes skip the /api/content gate. */
export function buildCatalogBootstrapScript(catalog) {
  if (!catalog?.ok) return "";
  return `<script type="application/json" id="jes-catalog-bootstrap">${safeJson(catalog)}</script>`;
}

/**
 * Minimal shell CSS for every route (not only articles) so Layout paints
 * before the JS-bundled stylesheet arrives.
 */
export const SITE_SHELL_CSS = `<style id="jes-shell-css">:root{--ink:#1a1f26;--blue:#1a3d67;--blue-dark:#163653;--gold:#d8bb63;--line:#d5dde6;--paper:#f7f4ef;--paper-2:#efe8dc;--font-display:Georgia,"Times New Roman",serif;--font-body:"Segoe UI",system-ui,sans-serif}*{box-sizing:border-box}html,body,#root{margin:0;min-height:100%}body{font-family:var(--font-body);color:var(--ink);background:linear-gradient(180deg,var(--paper) 0%,var(--paper-2) 100%)}.site{padding:0 0 48px}.site-body{max-width:980px;margin:0 auto;padding:0 16px}.site-header{background:var(--blue);color:#f7f4ed;text-align:center;padding:10px 16px 12px;border-bottom:3px solid var(--gold)}.page-main{min-height:40vh;padding:8px 0 24px}.main-nav.top-bar{display:flex;gap:4px;padding:8px;background:rgba(247,244,239,.96);border:1px solid var(--line);border-radius:8px;justify-content:center;flex-wrap:wrap}.skeleton-line{height:14px;margin:8px 0;border-radius:4px;background:linear-gradient(90deg,#e8e2d6 25%,#f3eee4 50%,#e8e2d6 75%);background-size:200% 100%}.skeleton-line--title{height:28px;width:70%}.skeleton-line--sub{width:45%}.skeleton-line--short{width:35%}.skeleton-card{padding:12px 0;border-bottom:1px solid var(--line)}</style>`;
