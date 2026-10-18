import { json } from "../../_lib/json.js";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/**
 * City search via Nominatim (same approach as derakhim geo/search).
 */
export async function onRequestGet({ request }) {
  try {
    const u = new URL(request.url);
    const q = String(u.searchParams.get("q") || "").trim();
    const lang = String(u.searchParams.get("lang") || "en").slice(0, 8);
    if (q.length < 2) {
      return json({ ok: true, results: [] }, 200, {
        cache: "public, max-age=60",
      });
    }

    const url = new URL(NOMINATIM);
    url.searchParams.set("q", q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "8");
    url.searchParams.set("featureType", "city");

    const upstream = await fetch(url.toString(), {
      headers: {
        "user-agent": "jeschurun.org candle-widget (contact: ask@jeschurun.org)",
        "accept-language": lang,
        accept: "application/json",
      },
    });

    if (!upstream.ok) {
      return json(
        { ok: false, error: `upstream ${upstream.status}`, results: [] },
        502,
      );
    }

    const rows = await upstream.json();
    const base = (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const lat = Number(row.lat);
        const lon = Number(row.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const addr = row.address || {};
        const name =
          addr.city ||
          addr.town ||
          addr.village ||
          addr.municipality ||
          row.name ||
          row.display_name?.split(",")[0] ||
          "City";
        return {
          id: String(row.place_id || `${lat},${lon}`),
          name,
          nameEn: name,
          label: row.display_name || name,
          lat,
          lon,
        };
      })
      .filter(Boolean);

    const results = await Promise.all(
      base.map(async (item) => {
        try {
          const tzUrl = new URL("https://api.open-meteo.com/v1/forecast");
          tzUrl.searchParams.set("latitude", String(item.lat));
          tzUrl.searchParams.set("longitude", String(item.lon));
          tzUrl.searchParams.set("current", "temperature_2m");
          tzUrl.searchParams.set("timezone", "auto");
          const tzRes = await fetch(tzUrl.toString(), {
            headers: { accept: "application/json" },
          });
          if (tzRes.ok) {
            const tzData = await tzRes.json();
            if (tzData?.timezone) item.tzid = String(tzData.timezone);
          }
        } catch {
          /* optional enrichment */
        }
        return item;
      }),
    );

    return json(
      { ok: true, results },
      200,
      { cache: "public, max-age=300" },
    );
  } catch (e) {
    return json({ ok: false, error: e.message, results: [] }, 500);
  }
}
