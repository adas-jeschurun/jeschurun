export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": extra.cache || "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...(extra.headers || {}),
    },
  });
}

export const LANGS = ["he", "en", "ru", "de", "fr"];
export const LANG_SET = new Set(LANGS);
