export async function fetchCatalog() {
  // credentials:omit matches <link rel=preload as=fetch crossorigin> so the
  // early preload can be reused instead of issuing a second request.
  const r = await fetch("/api/content", { credentials: "omit" });
  return r.json();
}

export async function fetchMaterial(kind, slug, opts = {}) {
  const q = new URLSearchParams({ kind, slug });
  if (opts.adminPreview) q.set("admin_preview", opts.adminPreview);
  const r = await fetch(`/api/material?${q}`);
  return r.json();
}

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
