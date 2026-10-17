import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useParams,
} from "react-router-dom";
import { HEADER_SUBTITLE, LANGS, LANG_LABEL, UI } from "@jeschurun/shared";
import { PUBLIC_BIOS } from "./features.js";

const SITE_ORIGIN = "https://jeschurun.org";

function pathRest(pathname) {
  const m = String(pathname || "").match(/^\/[a-z]{2}(\/.*)?$/i);
  return m?.[1] || "/";
}

function withTrailingSlash(p) {
  if (!p || p === "/") return "/";
  return p.endsWith("/") ? p : `${p}/`;
}

/** Build same-path URL for another language; drop page on switch. */
function langHref(targetLang, pathname, search) {
  const rest = withTrailingSlash(pathRest(pathname));
  const params = new URLSearchParams(search);
  params.delete("page");
  const qs = params.toString();
  const path = `/${targetLang}${rest === "/" ? "/" : rest}`;
  return qs ? `${path}?${qs}` : path;
}

function routeUiTitle(rest, ui) {
  if (rest === "/" || rest === "") return null;
  if (rest === "/articles/" || rest === "/articles") return ui.articles;
  if (rest === "/ask-rav/" || rest === "/ask-rav") return ui.ask;
  if (rest === "/biographies/" || rest === "/biographies") return ui.bios;
  if (rest === "/about/" || rest === "/about") return ui.about;
  if (rest === "/archive/" || rest === "/archive") return ui.archive;
  if (rest === "/search/" || rest === "/search") return ui.search;
  return null;
}

function useSeoHead(lang) {
  const location = useLocation();
  const ui = UI[lang] || UI.en;

  useEffect(() => {
    const rest = withTrailingSlash(pathRest(location.pathname));
    const params = new URLSearchParams(location.search);
    const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
    const isArticles = rest === "/articles/" || rest === "/articles";
    const isArchive = /^\/archive(\/|$)/.test(rest);

    const hrefParams = new URLSearchParams(location.search);
    hrefParams.delete("page");
    const altQs = hrefParams.toString();

    // Section routes set title here; article/answer/bio/issue pages own document.title.
    const section = routeUiTitle(rest, ui);
    const pageOwnsTitle = /^\/(article|answer|biography|issue)(\/|$)/.test(rest);
    if (!pageOwnsTitle) {
      document.title = section ? `${section} · Jeschurun` : "Jeschurun";
    }

    document.querySelectorAll("[data-seo=jes]").forEach((el) => el.remove());

    for (const l of LANGS) {
      const link = document.createElement("link");
      link.setAttribute("data-seo", "jes");
      link.rel = "alternate";
      link.hreflang = l;
      const path = `/${l}${rest === "/" ? "/" : rest}`;
      link.href = altQs ? `${SITE_ORIGIN}${path}?${altQs}` : `${SITE_ORIGIN}${path}`;
      document.head.appendChild(link);
    }

    const xd = document.createElement("link");
    xd.setAttribute("data-seo", "jes");
    xd.rel = "alternate";
    xd.hreflang = "x-default";
    const enPath = `/en${rest === "/" ? "/" : rest}`;
    xd.href = altQs ? `${SITE_ORIGIN}${enPath}?${altQs}` : `${SITE_ORIGIN}${enPath}`;
    document.head.appendChild(xd);

    const can = document.createElement("link");
    can.setAttribute("data-seo", "jes");
    can.rel = "canonical";
    if (isArticles && page >= 2) {
      can.href = `${SITE_ORIGIN}/${lang}/articles/`;
    } else {
      const selfPath = `/${lang}${rest === "/" ? "/" : rest}`;
      const selfQs = location.search.replace(/^\?/, "");
      can.href = selfQs ? `${SITE_ORIGIN}${selfPath}?${selfQs}` : `${SITE_ORIGIN}${selfPath}`;
    }
    document.head.appendChild(can);

    if (isArchive) {
      const meta = document.createElement("meta");
      meta.setAttribute("data-seo", "jes");
      meta.name = "robots";
      meta.content = "noindex, follow";
      document.head.appendChild(meta);
    }

    return () => {
      document.querySelectorAll("[data-seo=jes]").forEach((el) => el.remove());
    };
  }, [lang, location.pathname, location.search]);
}

export function Layout() {
  const { lang: raw } = useParams();
  const lang = LANGS.includes(raw) ? raw : "en";
  const ui = UI[lang] || UI.en;
  const rtl = lang === "he";
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useSeoHead(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("rtl", rtl);
  }, [lang, rtl]);

  const nav = [
    ["", ui.home],
    ["articles", ui.articles],
    ["ask-rav", ui.ask],
    ...(PUBLIC_BIOS ? [["biographies", ui.bios]] : []),
    ["about", ui.about],
  ];

  return (
    <div className={`site ${rtl ? "rtl" : ""}`}>
      <header className="site-header">
        <div className="site-header-inner">
          <Link to={`/${lang}/`} className="masthead-link">
            <img
              className="masthead"
              src={`/assets/masthead-${lang}.png`}
              alt="Jeschurun"
            />
          </Link>
          <div className="lang-switch" role="navigation" aria-label="Language">
            {LANGS.map((l) => (
              <Link
                key={l}
                className={l === lang ? "active" : ""}
                to={langHref(l, location.pathname, location.search)}
                lang={l}
                hrefLang={l}
              >
                {LANG_LABEL[l]}
              </Link>
            ))}
          </div>
          <p className="site-subtitle">{HEADER_SUBTITLE[lang]}</p>
        </div>
      </header>

      <div className="site-body">
        <nav className="main-nav top-bar" data-main-nav aria-label="Main">
          {nav.map(([r, t]) => (
            <NavLink
              key={r || "home"}
              to={r ? `/${lang}/${r}/` : `/${lang}/`}
              className={({ isActive }) => (isActive ? "active" : "")}
              end={!r}
            >
              {t}
            </NavLink>
          ))}
          <NavLink
            to={`/${lang}/search/`}
            className={({ isActive }) =>
              `nav-search-link${isActive ? " active" : ""}`
            }
            aria-label={ui.search}
            title={ui.search}
          >
            ⌕
          </NavLink>
        </nav>

        <button
          type="button"
          className="mobile-nav-trigger"
          aria-label="Menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
        <div
          className={`mobile-nav-panel${menuOpen ? " open" : ""}`}
          hidden={!menuOpen}
        >
          {nav.map(([r, t]) => (
            <Link
              key={r || "home"}
              to={r ? `/${lang}/${r}/` : `/${lang}/`}
              onClick={() => setMenuOpen(false)}
            >
              {t}
            </Link>
          ))}
          <Link to={`/${lang}/search/`} onClick={() => setMenuOpen(false)}>
            {ui.search}
          </Link>
        </div>

        <main className="page-main">
          <Outlet context={{ lang, ui }} />
        </main>

        <footer className="site-footer">
          <img
            className="publisher-seal"
            src="/assets/publisher-seal.png"
            alt=""
          />
          <nav className="footer-nav" aria-label="Footer">
            <Link to={`/${lang}/`}>{ui.home}</Link>
            <Link to={`/${lang}/archive/`}>{ui.archive}</Link>
            <Link to={`/${lang}/articles/`}>{ui.articles}</Link>
            <Link to={`/${lang}/ask-rav/`}>{ui.ask}</Link>
            {PUBLIC_BIOS ? (
              <Link to={`/${lang}/biographies/`}>{ui.bios}</Link>
            ) : null}
            <Link to={`/${lang}/about/`}>{ui.about}</Link>
            <Link to={`/${lang}/search/`}>{ui.search}</Link>
          </nav>
          <p className="publisher-line">
            {ui.publisher} · Haifa
          </p>
        </footer>
      </div>
    </div>
  );
}
