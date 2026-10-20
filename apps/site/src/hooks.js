import { useEffect, useState } from "react";
import { fetchCatalog } from "./api.js";

const STORAGE_KEY = "jes-catalog-v3";

let cache = null;
let inflight = null;
/** True when cache came from edge HTML or session — still soft-revalidate. */
let needsRevalidate = false;

function persistCatalog(data) {
  if (!data?.ok || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

/** Sync seed from middleware-injected JSON (before React first paint). */
export function ingestCatalogBootstrap() {
  if (typeof document === "undefined") return null;
  const el = document.getElementById("jes-catalog-bootstrap");
  if (!el) return null;
  try {
    const data = JSON.parse(el.textContent || "");
    if (data?.ok) {
      cache = data;
      needsRevalidate = false;
      persistCatalog(data);
      return data;
    }
  } catch {
    /* ignore bad bootstrap */
  }
  return null;
}

function readSessionCatalog() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.ok) {
      cache = data;
      needsRevalidate = true;
      return data;
    }
  } catch {
    /* ignore */
  }
  return null;
}

// Prefer edge bootstrap, then session (instant shell on hard reload).
ingestCatalogBootstrap() || readSessionCatalog();

/** Start catalog fetch as soon as the module evaluates (overlaps React boot). */
export function ensureCatalog(opts = {}) {
  const force = !!opts.force;
  if (cache?.ok && !force && !needsRevalidate) {
    return Promise.resolve(cache);
  }
  if (cache?.ok && needsRevalidate && !force) {
    // Return stale immediately; refresh in background once.
    needsRevalidate = false;
    if (!inflight) {
      inflight = fetchCatalog()
        .then((d) => {
          if (d?.ok) {
            cache = d;
            persistCatalog(d);
          }
          inflight = null;
          return cache;
        })
        .catch(() => {
          inflight = null;
          return cache;
        });
    }
    return Promise.resolve(cache);
  }
  if (!inflight) {
    inflight = fetchCatalog()
      .then((d) => {
        cache = d;
        needsRevalidate = false;
        persistCatalog(d);
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

// With edge catalog bootstrap, skip competing fetch on first paint.
// Material routes: defer; list routes: ensure (no-op if bootstrap seeded).
if (isMaterialPath()) {
  const defer = () => ensureCatalog().catch(() => {});
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(defer, { timeout: 2500 });
  } else {
    setTimeout(defer, 1200);
  }
} else if (!cache?.ok) {
  ensureCatalog().catch(() => {});
} else if (needsRevalidate) {
  ensureCatalog().catch(() => {});
}

export function useCatalog() {
  const [data, setData] = useState(cache);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    // Seeded cache paints immediately; ensureCatalog may soft-revalidate.
    if (cache?.ok) setData(cache);
    ensureCatalog()
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch((e) => {
        if (!cancelled && !cache) setError(e);
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
