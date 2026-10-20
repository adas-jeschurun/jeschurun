import { json, LANG_SET } from "../_lib/json.js";
import {
  MATERIAL_CACHE_CONTROL,
  buildMaterial,
  materialCacheKey,
  previewOk,
  tableFor,
} from "../_lib/load-material.js";

export async function onRequestGet({ request, env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "CONTENT_DB missing" }, 500);
    const u = new URL(request.url);
    const kind = u.searchParams.get("kind");
    const slug = u.searchParams.get("slug");
    const langRaw = u.searchParams.get("lang") || "";
    const langFilter = LANG_SET.has(langRaw) ? langRaw : null;
    const table = tableFor(kind);
    if (!table || !/^[A-Za-z0-9._-]+$/.test(String(slug || ""))) {
      return json({ ok: false, error: "Bad material" }, 400);
    }

    const allowDraft = previewOk(request, env);
    // Edge cache only for public published payloads (no preview token).
    if (!allowDraft) {
      const hit = await caches.default.match(materialCacheKey(kind, slug, langFilter));
      if (hit) {
        const headers = new Headers(hit.headers);
        headers.set("x-jes-material-cache", "HIT");
        return new Response(hit.body, { status: hit.status, headers });
      }
    }

    const row = await env.CONTENT_DB.prepare(`SELECT * FROM ${table} WHERE slug=?1`)
      .bind(slug)
      .first();
    if (
      !row ||
      (!allowDraft &&
        ((kind !== "bio" && row.status !== "published") ||
          (kind === "bio" && row.status === "hidden")))
    ) {
      return json({ ok: false, error: "Not found" }, 404);
    }

    const material = await buildMaterial(
      env.CONTENT_DB,
      kind,
      slug,
      row,
      langFilter,
    );
    const res = json(
      { ok: true, material },
      200,
      {
        cache: allowDraft ? "private, no-store" : MATERIAL_CACHE_CONTROL,
        headers: { "x-jes-material-cache": "MISS" },
      },
    );

    if (!allowDraft) {
      try {
        await caches.default.put(
          materialCacheKey(kind, slug, langFilter),
          res.clone(),
        );
      } catch {
        /* ignore edge cache write failures */
      }
    }
    return res;
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
