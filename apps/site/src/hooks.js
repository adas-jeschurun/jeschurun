import { useEffect, useState } from "react";
import { fetchCatalog } from "./api.js";

let cache = null;
let inflight = null;

/** Start catalog fetch as soon as the module evaluates (overlaps React boot). */
export function ensureCatalog() {
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

function isMaterialPath(pathname = location.pathname) {
  return /^\/(he|en|ru|de|fr)\/(article|answer|biography)\//.test(pathname);
}

// Article routes: defer catalog — edge HTML already has the body; catalog
// (~80KB) only steals bandwidth from the JS bundle on the critical path.
if (isMaterialPath()) {
  const defer = () => ensureCatalog().catch(() => {});
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(defer, { timeout: 2500 });
  } else {
    setTimeout(defer, 1200);
  }
} else {
  ensureCatalog().catch(() => {});
}

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
