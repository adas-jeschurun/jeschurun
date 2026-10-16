export async function fetchCatalog() {
  const r = await fetch("/api/content");
  return r.json();
}

export async function fetchMaterial(kind, slug, opts = {}) {
  const q = new URLSearchParams({ kind, slug });
  if (opts.adminPreview) q.set("admin_preview", opts.adminPreview);
  const r = await fetch(`/api/material?${q}`);
  return r.json();
}

export async function fetchSearchCorpus() {
  const r = await fetch("/api/search-corpus");
  return r.json();
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
