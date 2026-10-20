export async function fetchCatalog() {
  // Same-origin + crossorigin=anonymous preload uses credentials mode
  // "same-origin" (HTML/Chrome), not "omit". Must match or the preload is discarded.
  const r = await fetch("/api/content", { credentials: "same-origin" });
  return r.json();
}

const materialCache = new Map();
const materialInflight = new Map();

function materialKey(kind, slug, lang, adminPreview) {
  return `${kind}:${slug}:${lang || "all"}:${adminPreview || ""}`;
}

/** Shared material fetch — reuses preload / module-eager requests. */
export function ensureMaterial(kind, slug, opts = {}) {
  const lang = opts.lang || "";
  const adminPreview = opts.adminPreview || "";
  const key = materialKey(kind, slug, lang, adminPreview);
  if (materialCache.has(key)) return Promise.resolve(materialCache.get(key));
  if (materialInflight.has(key)) return materialInflight.get(key);

  const q = new URLSearchParams({ kind, slug });
  if (lang) q.set("lang", lang);
  if (adminPreview) q.set("admin_preview", adminPreview);
  const p = fetch(`/api/material?${q}`, { credentials: "same-origin" })
    .then((r) => r.json())
    .then((d) => {
      materialCache.set(key, d);
      materialInflight.delete(key);
      return d;
    })
    .catch((e) => {
      materialInflight.delete(key);
      throw e;
    });
  materialInflight.set(key, p);
  return p;
}

export async function fetchMaterial(kind, slug, opts = {}) {
  return ensureMaterial(kind, slug, opts);
}

/** Start material fetch from the current URL as soon as JS evaluates. */
export function kickMaterialFromLocation(pathname = location.pathname) {
  const m = String(pathname).match(
    /^\/(he|en|ru|de|fr)\/(article|answer|biography)\/([^/]+)/,
  );
  if (!m) return;
  const kind = m[2] === "biography" ? "bio" : m[2];
  ensureMaterial(kind, m[3], { lang: m[1] }).catch(() => {});
}

kickMaterialFromLocation();

/** Module-level corpus cache — search page only; avoid refetch on lang switch. */
let searchCorpusCache = null;
let searchCorpusInflight = null;

export async function fetchSearchCorpus() {
  if (searchCorpusCache) return searchCorpusCache;
  if (!searchCorpusInflight) {
    searchCorpusInflight = fetch("/api/search-corpus", { credentials: "omit" })
      .then((r) => r.json())
      .then((d) => {
        searchCorpusCache = d;
        searchCorpusInflight = null;
        return d;
      })
      .catch((e) => {
        searchCorpusInflight = null;
        throw e;
      });
  }
  return searchCorpusInflight;
}

export async function fetchPopular(lang) {
  const r = await fetch(`/api/popular?language=${encodeURIComponent(lang)}&limit=8`);
  if (!r.ok) return { ok: false, items: [] };
  return r.json();
}

export async function fetchQuestionConfig() {
  const r = await fetch("/api/question-config");
  return r.json();
}

export async function submitQuestion(body) {
  const r = await fetch("/api/question", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, ...(await r.json()) };
}

export function trackEvent(payload) {
  fetch("/api/content-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
