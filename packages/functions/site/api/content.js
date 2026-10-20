import { json } from "../_lib/json.js";
import {
  CATALOG_CACHE_KEY,
  catalogResponse,
  loadCatalog,
} from "../_lib/load-catalog.js";

export async function onRequestGet({ env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "CONTENT_DB missing" }, 500);

    const cache = caches.default;
    const hit = await cache.match(CATALOG_CACHE_KEY);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set("x-jes-catalog-cache", "HIT");
      return new Response(hit.body, { status: hit.status, headers });
    }

    const data = await loadCatalog(env.CONTENT_DB);
    const res = catalogResponse(data, "MISS");
    try {
      await cache.put(CATALOG_CACHE_KEY, res.clone());
    } catch {
      /* ignore edge cache write failures */
    }
    return res;
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
