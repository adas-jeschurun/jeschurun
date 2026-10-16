import { json } from "../_lib/json.js";

/** Friend button «Пересобрать индекс» → rebuild related_articles (+ item count). */
export async function onRequestPost(context) {
  const { onRequestPost: rebuild } = await import("./interlinks.js");
  const res = await rebuild(context);
  try {
    const data = await res.clone().json();
    if (data.ok) {
      const r = await context.env.CONTENT_DB.prepare(
        `SELECT COUNT(*) AS c FROM articles WHERE status='published'`,
      ).first();
      return json({
        ...data,
        items: r?.c || 0,
        undirectedEdges: data.undirectedEdges,
      });
    }
  } catch {
    /* fallthrough */
  }
  return res;
}

export async function onRequestGet(context) {
  const { onRequestGet: get } = await import("./interlinks.js");
  return get(context);
}
