import { useEffect, useState } from "react";
import { fetchCatalog } from "./api.js";

let cache = null;
let inflight = null;

export function useCatalog() {
  const [data, setData] = useState(cache);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!cache) {
          inflight =
            inflight ||
            fetchCatalog().then((d) => {
              cache = d;
              inflight = null;
              return d;
            });
          const d = await inflight;
          if (!cancelled) setData(d);
        }
      } catch (e) {
        if (!cancelled) setError(e);
      }
    })();
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
