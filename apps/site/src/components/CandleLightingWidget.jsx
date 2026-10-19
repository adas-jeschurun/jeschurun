import { useEffect, useMemo, useState } from "react";
import { HebrewCalendar, Location } from "@hebcal/core";

const CITY_KEY = "jes-candle-city";
const JERUSALEM = {
  id: "jerusalem",
  name: "Jerusalem",
  label: "Jerusalem, Israel",
  lat: 31.7788472,
  lon: 35.2257856,
  tzid: "Asia/Jerusalem",
  candleLightingMins: 40,
};

function loadCity() {
  try {
    const raw = localStorage.getItem(CITY_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCity(city) {
  try {
    localStorage.setItem(CITY_KEY, JSON.stringify(city));
  } catch {
    /* ignore */
  }
}

function guessTzid(lat, lon) {
  // Prefer API tzid; coarse fallback by longitude band for Israel-ish.
  if (lat > 29 && lat < 34 && lon > 34 && lon < 36) return "Asia/Jerusalem";
  return "UTC";
}

function nextCandle(city) {
  const tzid = city.tzid || guessTzid(city.lat, city.lon);
  const il = tzid === "Asia/Jerusalem";
  const mins = city.candleLightingMins ?? (il ? 40 : 18);
  const loc = new Location(
    city.lat,
    city.lon,
    il,
    tzid,
    city.name || "City",
    il ? "IL" : undefined,
    undefined,
    mins,
  );
  const start = new Date();
  const end = new Date(start.getTime() + 21 * 86400000);
  const events = HebrewCalendar.calendar({
    start,
    end,
    location: loc,
    candlelighting: true,
    sedrot: false,
    omer: false,
    molad: false,
  });
  for (const ev of events) {
    const cats = ev.getCategories?.() || [];
    const desc = String(ev.getDesc?.() || "");
    if (cats.includes("candles") || /Candle lighting/i.test(desc)) {
      const when = ev.eventTime || null;
      const timeStr = ev.eventTimeStr || null;
      return { when, timeStr, desc, tzid };
    }
  }
  return null;
}

function formatWhen(next, lang) {
  if (!next) return "—";
  if (next.timeStr) return next.timeStr;
  if (!next.when) return "—";
  try {
    return new Intl.DateTimeFormat(lang || "en", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: next.tzid || undefined,
    }).format(next.when);
  } catch {
    return next.when.toISOString();
  }
}

export function CandleLightingWidget({ lang, ui }) {
  const [city, setCity] = useState(JERUSALEM);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = loadCity();
      if (saved?.lat != null && saved?.lon != null) {
        if (!cancelled) {
          setCity({ ...JERUSALEM, ...saved });
          setResolving(false);
        }
        return;
      }
      try {
        const r = await fetch("/api/geo/resolve");
        const data = await r.json();
        if (!cancelled && data?.lat != null && data?.lon != null) {
          const resolved = {
            id: data.id || "ip",
            name: data.name || data.city || JERUSALEM.name,
            label: data.label || data.name || JERUSALEM.label,
            lat: Number(data.lat),
            lon: Number(data.lon),
            tzid: data.tzid || data.timezone || guessTzid(Number(data.lat), Number(data.lon)),
            candleLightingMins: data.candleLightingMins,
          };
          saveCity(resolved);
          setCity(resolved);
        } else if (!cancelled) {
          setCity(JERUSALEM);
        }
      } catch {
        if (!cancelled) setCity(JERUSALEM);
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const qTrim = q.trim();
    if (qTrim.length < 2) {
      setResults([]);
      return undefined;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/geo/search?q=${encodeURIComponent(qTrim)}&lang=${encodeURIComponent(lang || "en")}`,
        );
        const data = await r.json();
        setResults(Array.isArray(data?.results) ? data.results : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q, pickerOpen, lang]);

  const next = useMemo(() => {
    try {
      return nextCandle(city);
    } catch {
      return null;
    }
  }, [city]);

  const pick = async (item) => {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    let tzid = item.tzid || guessTzid(lat, lon);
    if (!item.tzid) {
      try {
        const tzUrl = new URL("https://api.open-meteo.com/v1/forecast");
        tzUrl.searchParams.set("latitude", String(lat));
        tzUrl.searchParams.set("longitude", String(lon));
        tzUrl.searchParams.set("current", "temperature_2m");
        tzUrl.searchParams.set("timezone", "auto");
        const tzRes = await fetch(tzUrl.toString());
        if (tzRes.ok) {
          const tzData = await tzRes.json();
          if (tzData?.timezone) tzid = String(tzData.timezone);
        }
      } catch {
        /* keep guess */
      }
    }
    const nextCity = {
      id: item.id || `${lat},${lon}`,
      name: item.name || item.nameEn || "City",
      label: item.label || item.name,
      lat,
      lon,
      tzid,
    };
    saveCity(nextCity);
    setCity(nextCity);
    setPickerOpen(false);
    setQ("");
    setResults([]);
  };

  return (
    <aside className="candle-widget" aria-label={ui.candleTitle || "Candle lighting"}>
      <div className="candle-widget-main">
        <span className="candle-widget-label">{ui.candleTitle || "Candle lighting"}</span>
        <strong className="candle-widget-time">
          {resolving ? "…" : formatWhen(next, lang)}
        </strong>
        <span className="candle-widget-city">{city.name}</span>
      </div>
      <button
        type="button"
        className="candle-widget-pick"
        onClick={() => setPickerOpen((v) => !v)}
      >
        {ui.candleChooseCity || "Choose city"}
      </button>

      {pickerOpen ? (
        <div className="candle-picker">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={ui.candleSearchPlaceholder || "Search city…"}
            aria-label={ui.candleSearchPlaceholder || "Search city…"}
            autoFocus
          />
          {loading ? <p className="candle-picker-status">…</p> : null}
          <ul className="candle-picker-list">
            <li>
              <button type="button" onClick={() => pick(JERUSALEM)}>
                {JERUSALEM.label}
              </button>
            </li>
            {results.map((item) => (
              <li key={item.id || `${item.lat}-${item.lon}`}>
                <button type="button" onClick={() => pick(item)}>
                  {item.label || item.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
