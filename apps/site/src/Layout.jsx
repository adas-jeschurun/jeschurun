import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { LANGS, LANG_LABEL, UI } from "@jeschurun/shared";

export function Layout() {
  const { lang: raw } = useParams();
  const lang = LANGS.includes(raw) ? raw : "en";
  const ui = UI[lang] || UI.en;
  const rtl = lang === "he";
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("rtl", rtl);
  }, [lang, rtl]);

  const nav = [
    ["", ui.home],
    ["current", ui.current],
    ["articles", ui.articles],
    ["ask-rav", ui.ask],
    ["biographies", ui.bios],
    ["about", ui.about],
  ];

  return (
    <div className={`site ${rtl ? "rtl" : ""}`}>
      <header className="site-header">
        <Link to={`/${lang}/`} className="masthead-link">
          <img
            className="masthead"
            src={`/assets/masthead-${lang}.png`}
            alt="Jeschurun"
          />
        </Link>
        <div className="lang-switch">
          {LANGS.map((l) => (
            <Link
              key={l}
              className={l === lang ? "active" : ""}
              to={`/${l}/`}
            >
              {LANG_LABEL[l]}
            </Link>
          ))}
        </div>
      </header>

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
          <Link to={`/${lang}/current/`}>{ui.current}</Link>
          <Link to={`/${lang}/archive/`}>{ui.archive}</Link>
          <Link to={`/${lang}/articles/`}>{ui.articles}</Link>
          <Link to={`/${lang}/ask-rav/`}>{ui.ask}</Link>
          <Link to={`/${lang}/biographies/`}>{ui.bios}</Link>
          <Link to={`/${lang}/about/`}>{ui.about}</Link>
          <Link to={`/${lang}/search/`}>{ui.search}</Link>
        </nav>
        <p className="publisher-line">
          {ui.publisher} · Haifa
        </p>
      </footer>
    </div>
  );
}
