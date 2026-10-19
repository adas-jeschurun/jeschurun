import { json } from "../../_lib/json.js";

const JERUSALEM = {
  id: "jerusalem",
  name: "Jerusalem",
  label: "Jerusalem, Israel",
  lat: 31.7788472,
  lon: 35.2257856,
  tzid: "Asia/Jerusalem",
  city: "Jerusalem",
  country: "IL",
  source: "fallback",
};

/**
 * Resolve approximate visitor location from Cloudflare request.cf.
 * Falls back to Jerusalem when geo is unavailable.
 */
export async function onRequestGet({ request }) {
  try {
    const cf = request.cf || {};
    const lat = Number(cf.latitude);
    const lon = Number(cf.longitude);
    const city = String(cf.city || "").trim();
    const country = String(cf.country || "").trim();
    const tzid = String(cf.timezone || "").trim();

    if (Number.isFinite(lat) && Number.isFinite(lon) && (city || country)) {
      const name = city || country || "Current location";
      const label = [city, country].filter(Boolean).join(", ") || name;
      return json(
        {
          ok: true,
          id: `cf:${city || country}:${lat.toFixed(3)},${lon.toFixed(3)}`,
          name,
          label,
          lat,
          lon,
          tzid: tzid || undefined,
          city: city || undefined,
          country: country || undefined,
          source: "cf",
        },
        200,
        { cache: "private, max-age=300" },
      );
    }

    return json({ ok: true, ...JERUSALEM }, 200, {
      cache: "private, max-age=60",
    });
  } catch (e) {
    return json({ ok: true, ...JERUSALEM, error: e.message }, 200, {
      cache: "private, max-age=60",
    });
  }
}
