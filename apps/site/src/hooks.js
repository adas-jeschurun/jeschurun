import { useEffect, useState } from "react";
import { fetchCatalog } from "./api.js";

let cache = null;
let inflight = null;

/** Start catalog fetch as soon as the module evaluates (overlaps React boot). */
function ensureCatalog() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetchCatalog()
      .then((d) => {
        cache = d;
        inflight = null;
        return d;
      })
      .catch((e) => {
        inflight = null;
        throw e;
      });
  }
  return inflight;
}

// Kick off immediately when the JS bundle runs — before first paint of Outlet.
ensureCatalog().catch(() => {});

export function useCatalog() {
  const [data, setData] = useState(cache);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (cache) {
      setData(cache);
      return;
    }
    ensureCatalog()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { data, error, loading: !data && !error };
}

export function langData(obj, lang) {
  if (!obj) return {};
  return obj[lang] || obj.en || obj.he || Object.values(obj)[0] || {};
}
