import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  HEADER_SUBTITLE,
  LANGS,
  LANG_LABEL,
  UI,
  brandTitle,
  fillSeoTemplate,
  seoFor,
} from "@jeschurun/shared";
import { AccessibilityPanel } from "./components/AccessibilityPanel.jsx";
import { BackToTop } from "./components/BackToTop.jsx";
import { CandleLightingWidget } from "./components/CandleLightingWidget.jsx";
import { PUBLIC_BIOS } from "./features.js";
import { setDocumentTitle, setMetaDescription } from "./seo.js";

const SITE_ORIGIN = "https://jeschurun.org";
const CONTACT_EMAIL = "ask@jeschurun.org";
const PUBLISHER_EMAIL = CONTACT_EMAIL;

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

/**
 * Title + description for section routes.
 * Articles list (tag/page) and material/issue pages own title via their pages.
 */
function routeSectionMeta(rest, lang, ui, seo, search) {
  const params = new URLSearchParams(search);
  if (rest === "/" || rest === "") {
    return {
      title: brandTitle(seo.homeTitle, lang),
      description: seo.homeDescription,
    };
  }
  if (rest === "/articles/" || rest === "/articles") {
    return { pageOwns: true };
  }
  if (rest === "/ask-rav/" || rest === "/ask-rav") {
    return {
      title: brandTitle(ui.askSubmitTitle, lang),
      description: seo.askDescription,
    };
  }
  if (rest === "/biographies/" || rest === "/biographies") {
    return {
      title: brandTitle(ui.bios, lang),
      description: seo.biosDescription,
    };
  }
  if (rest === "/about/" || rest === "/about") {
    return {
      title: brandTitle(ui.about, lang),
      description: seo.aboutDescription,
    };
  }
  if (rest === "/archive/" || rest === "/archive") {
    return {
      title: brandTitle(ui.archive, lang),
      description: seo.archiveDescription,
    };
  }
  if (rest === "/search/" || rest === "/search") {
    const q = (params.get("q") || "").trim();
    if (q) {
      return {
        title: brandTitle(`${ui.search}: ${q}`, lang),
        description: fillSeoTemplate(seo.searchQueryDescription, { q }),
      };
    }
    return {
      title: brandTitle(ui.search, lang),
      description: seo.searchDescription,
    };
  }
  if (rest === "/terms/" || rest === "/terms") {
    return {
      title: brandTitle(ui.terms, lang),
      description: seo.termsDescription,
    };
  }
  if (rest === "/privacy/" || rest === "/privacy") {
    return {
      title: brandTitle(ui.privacy, lang),
      description: seo.privacyDescription,
    };
  }
  if (rest === "/cookies/" || rest === "/cookies") {
    return {
      title: brandTitle(ui.cookies, lang),
      description: seo.cookiesDescription,
    };
  }
  // Unknown section / material miss → NotFoundPage owns title + description
  return { pageOwns: true };
}

function injectJsonLd(id, data) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
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
    const seo = seoFor(lang);

    const hrefParams = new URLSearchParams(location.search);
    hrefParams.delete("page");
    const altQs = hrefParams.toString();

    // Section routes set title/description here; articles/material/issue own theirs.
    const section = routeSectionMeta(rest, lang, ui, seo, location.search);
    const pageOwnsTitle =
      section?.pageOwns ||
      /^\/(article|answer|biography|issue)(\/|$)/.test(rest);
    if (!pageOwnsTitle) {
      setDocumentTitle(section?.title || seo.brand);
      if (section?.description) setMetaDescription(section.description);
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

    injectJsonLd("jes-ld-org", {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: ui.publisher,
      alternateName: "Jeschurun",
      url: SITE_ORIGIN,
      email: PUBLISHER_EMAIL,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Haifa",
        addressCountry: "IL",
      },
      logo: `${SITE_ORIGIN}/assets/publisher-seal.png`,
    });
    injectJsonLd("jes-ld-website", {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Jeschurun",
      url: SITE_ORIGIN,
      inLanguage: LANGS,
      publisher: {
        "@type": "Organization",
        name: ui.publisher,
        url: SITE_ORIGIN,
      },
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_ORIGIN}/${lang}/search/?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    });

    return () => {
      document.querySelectorAll("[data-seo=jes]").forEach((el) => el.remove());
    };
  }, [lang, location.pathname, location.search, ui]);
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

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

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
          aria-label={ui.menu || "Menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav-panel"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
        <div
          id="mobile-nav-panel"
          className={`mobile-nav-panel${menuOpen ? " open" : ""}`}
          hidden={!menuOpen}
          role="navigation"
          aria-label={ui.menu || "Menu"}
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

        <main id="main-content" className="page-main" tabIndex={-1}>
          <Outlet context={{ lang, ui }} />
        </main>

        <CandleLightingWidget lang={lang} ui={ui} />
        <AccessibilityPanel ui={ui} />
        <BackToTop label={ui.backToTop || "Back to top"} />

        <footer className="site-footer">
          <img
            className="publisher-seal"
            src="/assets/publisher-seal.png"
            alt={ui.publisher}
          />
          <div className="footer-columns footer-nav">
            <nav className="footer-col" aria-label={ui.footerExplore}>
              <h2 className="footer-col-title">{ui.footerExplore}</h2>
              <Link to={`/${lang}/articles/`}>{ui.articles}</Link>
              <Link to={`/${lang}/archive/`}>{ui.archive}</Link>
              <Link to={`/${lang}/ask-rav/`}>{ui.ask}</Link>
              <Link to={`/${lang}/search/`}>{ui.search}</Link>
            </nav>
            <nav className="footer-col" aria-label={ui.footerAbout}>
              <h2 className="footer-col-title">{ui.footerAbout}</h2>
              <Link to={`/${lang}/`}>{ui.home}</Link>
              <Link to={`/${lang}/about/`}>{ui.about}</Link>
            </nav>
            <nav className="footer-col" aria-label={ui.footerLegal}>
              <h2 className="footer-col-title">{ui.footerLegal}</h2>
              <Link to={`/${lang}/terms/`}>{ui.terms}</Link>
              <Link to={`/${lang}/privacy/`}>{ui.privacy}</Link>
              <Link to={`/${lang}/cookies/`}>{ui.cookies}</Link>
            </nav>
          </div>
          <p className="publisher-line">
            {ui.publisher} · {ui.publisherPlace || "Haifa"}
          </p>
          <p className="publisher-line">
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
          <p className="copyright-line">
            {ui.copyright} {new Date().getFullYear()} {ui.publisher}
          </p>
        </footer>
      </div>
    </div>
  );
}
