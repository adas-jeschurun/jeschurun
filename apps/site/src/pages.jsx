import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import {
  ARTICLES_PAGE_SIZE,
  LANGS,
  LEGAL,
  rankSearchCorpus,
  sortArticles,
  normalizeSort,
} from "@jeschurun/shared";
import {
  fetchMaterial,
  fetchPopular,
  fetchQuestionConfig,
  fetchSearchCorpus,
  submitQuestion,
  trackEvent,
} from "./api.js";
import { PUBLIC_BIOS } from "./features.js";
import { langData, useCatalog } from "./hooks.js";

const SITE_ORIGIN = "https://jeschurun.org";

function formatPublishedAt(publishedAt, lang) {
  if (!publishedAt) return null;
  const d = new Date(publishedAt);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: "long" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(d);
  }
}

function Card({ lang, item, kind, label }) {
  const d = langData(item.languages, lang);
  const title = d.title || d.name || item.slug;
  const publishedLabel = formatPublishedAt(item.published_at, lang);
  const href =
    kind === "article"
      ? `/${lang}/article/${item.slug}/`
      : kind === "answer"
        ? `/${lang}/answer/${item.slug}/`
        : `/${lang}/biography/${item.slug}/`;
  return (
    <Link to={href} className="content-card">
      {label ? <span className="content-card-kicker">{label}</span> : null}
      <h3>{title}</h3>
      {publishedLabel ? (
        <time className="content-card-date" dateTime={item.published_at}>
          {publishedLabel}
        </time>
      ) : null}
    </Link>
  );
}

export function HomePage() {
  const { lang, ui } = useOutletContext();
  const { data } = useCatalog();
  const [popular, setPopular] = useState([]);
  useEffect(() => {
    fetchPopular(lang).then((p) => {
      if (!p?.items?.length || !data) return;
      const mapped = p.items
        .map((it) => {
          const [type, id] = String(it.key).split(":");
          if (
            !PUBLIC_BIOS &&
            (type === "bio" || type === "biography")
          ) {
            return null;
          }
          const list =
            type === "article"
              ? data.articles
              : type === "answer"
                ? data.answers
                : data.biographies;
          return list?.find((x) => x.id === id || x.slug === id);
        })
        .filter(Boolean)
        .slice(0, 6);
      setPopular(mapped);
    });
  }, [lang, data]);
  if (!data?.ok) return <p className="loading">…</p>;
  const issue = data.currentIssue;
  return (
    <div className="home">
      <IssueView issue={issue} lang={lang} ui={ui} featured />
      <section className="home-latest">
        <h2>{ui.latestArticles}</h2>
        <div className="content-list">
          {(data.articles || []).slice(0, 6).map((a) => (
            <Card key={a.id} lang={lang} item={a} kind="article" />
          ))}
        </div>
      </section>
      <section>
        <h2>{ui.latestQuestions}</h2>
        <div className="content-list">
          {(data.answers || []).slice(0, 4).map((a) => (
            <Card key={a.id} lang={lang} item={a} kind="answer" />
          ))}
        </div>
      </section>
      {popular.length ? (
        <section>
          <h2>{ui.popular}</h2>
          <div className="content-list">
            {popular.map((a) => (
              <Card
                key={a.id}
                lang={lang}
                item={a}
                kind={a.type || "article"}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function IssueView({ issue, lang, ui, featured = false }) {
  const { data } = useCatalog();
  if (!issue) return <p className="empty-note">{ui.noIssue}</p>;
  const d = langData(issue.languages, lang);
  const articles = (issue.articles || [])
    .map((slug) => data?.articles?.find((a) => a.slug === slug || a.id === slug))
    .filter(Boolean);
  const answers = (issue.rabbi_answers || [])
    .map((slug) => data?.answers?.find((a) => a.slug === slug || a.id === slug))
    .filter(Boolean);
  const downloads = issue.downloads || {};
  const dl = downloads[lang] || downloads.en || {};
  const fileBase = `content/issues/${issue.hebrew_year}/${issue.slug}`;
  return (
    <section className={`issue-card${featured ? " issue-card--home" : ""}`}>
      <header className="issue-card-head">
        <h1 className="issue-card-title">
          {d.title || `${issue.hebrew_year} / ${issue.slug}`}
        </h1>
        {(d.parasha || issue.parasha_key) && (
          <p className="issue-card-parasha">{d.parasha || issue.parasha_key}</p>
        )}
        {d.summary ? <p className="issue-card-lead">{d.summary}</p> : null}
        {(dl.pdf || dl.epub) && (
          <div className="issue-card-downloads">
            <span className="issue-card-downloads-label">{ui.download}</span>
            <div className="issue-card-download-links">
              {dl.pdf ? (
                <a
                  className="issue-card-dl"
                  href={`/api/file?path=${encodeURIComponent(`${fileBase}/${dl.pdf}`)}`}
                >
                  PDF
                </a>
              ) : null}
              {dl.epub ? (
                <a
                  className="issue-card-dl"
                  href={`/api/file?path=${encodeURIComponent(`${fileBase}/${dl.epub}`)}`}
                >
                  EPUB
                </a>
              ) : null}
            </div>
          </div>
        )}
      </header>
      <div className="issue-card-body">
        <h2 className="issue-card-toc">{ui.inIssue}</h2>
        <div className="content-list issue-card-list">
          {articles.map((a) => (
            <Card key={a.id} lang={lang} item={a} kind="article" />
          ))}
          {answers.map((a) => (
            <Card key={a.id} lang={lang} item={a} kind="answer" />
          ))}
        </div>
      </div>
    </section>
  );
}

export function ArchivePage() {
  const { lang, ui } = useOutletContext();
  const { data } = useCatalog();
  if (!data?.ok) return <p>…</p>;
  const currentId = data.currentIssue?.id;
  const archived = (data.issues || []).filter((iss) => iss.id !== currentId);
  return (
    <div>
      <h1>{ui.archive}</h1>
      <div className="content-list">
        {archived.map((iss) => {
          const d = langData(iss.languages, lang);
          const parasha = d.parasha || iss.parasha_key || iss.slug;
          const heading = iss.hebrew_year
            ? `${iss.hebrew_year} · ${parasha}`
            : parasha;
          return (
            <Link
              key={iss.id}
              to={`/${lang}/issue/${iss.hebrew_year}/${iss.slug}/`}
              className="content-card"
            >
              <h3>{heading}</h3>
              {d.kicker ? (
                <span className="content-card-kicker">{d.kicker}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function IssuePage() {
  const { lang, ui } = useOutletContext();
  const { year, slug } = useParams();
  const { data } = useCatalog();
  const issue = data?.issues?.find(
    (i) => String(i.hebrew_year) === String(year) && i.slug === slug,
  );
  const d = issue ? langData(issue.languages, lang) : null;
  const pageTitle = d
    ? d.parasha
      ? `${issue.hebrew_year} · ${d.parasha}`
      : d.title || `${issue.hebrew_year} / ${issue.slug}`
    : "";
  useEffect(() => {
    if (!pageTitle) return;
    document.title = `${pageTitle} · Jeschurun`;
    return () => {
      document.title = "Jeschurun";
    };
  }, [pageTitle]);
  if (!data?.ok) return <p>…</p>;
  return <IssueView issue={issue} lang={lang} ui={ui} />;
}

export function ArticlesPage() {
  const { lang, ui } = useOutletContext();
  const { data } = useCatalog();
  const [sp, setSp] = useSearchParams();
  const sort = normalizeSort(sp.get("sort"));
  const tagFilter = (sp.get("tag") || "").trim();
  const pageRaw = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const tagsByArticle = data?.tagsByArticle || {};

  const tagCatalog = useMemo(() => {
    const map = new Map();
    for (const list of Object.values(tagsByArticle)) {
      for (const t of list || []) {
        if (t?.slug && !map.has(t.slug)) map.set(t.slug, t);
      }
    }
    return [...map.values()].sort((a, b) =>
      String(a.labels?.[lang] || a.slug).localeCompare(
        String(b.labels?.[lang] || b.slug),
        lang,
      ),
    );
  }, [tagsByArticle, lang]);

  const filtered = useMemo(() => {
    if (!data?.ok) return [];
    let list = data.articles || [];
    if (tagFilter) {
      list = list.filter((a) =>
        (tagsByArticle[a.id] || a.tags || []).some((t) => t.slug === tagFilter),
      );
    }
    return sortArticles(list, sort, lang);
  }, [data, tagsByArticle, tagFilter, sort, lang]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ARTICLES_PAGE_SIZE));
  const page = Math.min(pageRaw, totalPages);
  const slice = filtered.slice(
    (page - 1) * ARTICLES_PAGE_SIZE,
    page * ARTICLES_PAGE_SIZE,
  );

  function patchParams(mutate) {
    const next = new URLSearchParams(sp);
    mutate(next);
    if (!next.get("sort") || next.get("sort") === "date_desc") next.delete("sort");
    if (!next.get("tag")) next.delete("tag");
    if (!next.get("page") || next.get("page") === "1") next.delete("page");
    setSp(next);
  }

  if (!data?.ok) return <p>…</p>;

  return (
    <div>
      <h1>{ui.articles}</h1>
      <label className="sort-control">
        {ui.sort}:{" "}
        <select
          value={sort}
          onChange={(e) => {
            patchParams((next) => {
              next.set("sort", e.target.value);
              next.delete("page");
            });
          }}
        >
          <option value="date_desc">{ui.sortDateDesc}</option>
          <option value="date_asc">{ui.sortDateAsc}</option>
          <option value="title_asc">{ui.sortTitleAsc}</option>
        </select>
      </label>
      {tagCatalog.length ? (
        <div className="tag-filter" role="group" aria-label={ui.tags}>
          <button
            type="button"
            className={`tag-chip${!tagFilter ? " active" : ""}`}
            onClick={() =>
              patchParams((next) => {
                next.delete("tag");
                next.delete("page");
              })
            }
          >
            {ui.tagAll}
          </button>
          {tagCatalog.map((t) => (
            <button
              key={t.slug}
              type="button"
              className={`tag-chip${tagFilter === t.slug ? " active" : ""}`}
              onClick={() =>
                patchParams((next) => {
                  next.set("tag", t.slug);
                  next.delete("page");
                })
              }
            >
              {t.labels?.[lang] || t.slug}
            </button>
          ))}
        </div>
      ) : null}
      <div className="content-list">
        {slice.map((a) => (
          <Card key={a.id} lang={lang} item={a} kind="article" />
        ))}
      </div>
      {totalPages > 1 ? (
        <nav className="pagination" aria-label={ui.pagination}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`page-num${n === page ? " active" : ""}`}
              aria-current={n === page ? "page" : undefined}
              onClick={() =>
                patchParams((next) => {
                  if (n <= 1) next.delete("page");
                  else next.set("page", String(n));
                })
              }
            >
              {n}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function Blocks({ body }) {
  return (
    <div className="article-body">
      {(body || []).map((b, i) => {
        if (b.type === "p")
          return (
            <p key={i} dangerouslySetInnerHTML={{ __html: b.html || b.text }} />
          );
        if (b.type === "h2" || b.type === "h3") {
          const Tag = b.type;
          return (
            <Tag key={i} dangerouslySetInnerHTML={{ __html: b.html || b.text }} />
          );
        }
        if (b.type === "quote")
          return (
            <blockquote
              key={i}
              dangerouslySetInnerHTML={{ __html: b.html || b.text }}
            />
          );
        if (b.type === "divider") return <hr key={i} />;
        if (b.type === "image")
          return (
            <figure key={i} className={`img-${b.layout || "center"}`}>
              <img src={b.src} alt={b.alt || ""} />
              {b.caption ? <figcaption>{b.caption}</figcaption> : null}
            </figure>
          );
        return null;
      })}
    </div>
  );
}

export function MaterialPage({ kind }) {
  const { lang, ui } = useOutletContext();
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const adminPreview = searchParams.get("admin_preview") || "";
  const [mat, setMat] = useState(null);
  useEffect(() => {
    fetchMaterial(kind, slug, { adminPreview: adminPreview || undefined }).then(setMat);
  }, [kind, slug, adminPreview]);
  useEffect(() => {
    if (mat?.material?.id && !adminPreview) {
      trackEvent({
        content_id: mat.material.id,
        content_type: kind,
        language: lang,
        event: "view",
        source: "",
      });
    }
  }, [mat, kind, lang, adminPreview]);
  const m = mat?.ok ? mat.material : null;
  const d = m ? langData(m.languages, lang) : {};
  const title = m ? d.title || d.name || m.slug : "";
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · Jeschurun`;
    return () => {
      document.title = "Jeschurun";
    };
  }, [title]);
  useEffect(() => {
    const id = "jes-ld-article";
    if (kind !== "article" || !m || !title) {
      document.getElementById(id)?.remove();
      return undefined;
    }
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description: d.summary || "",
      inLanguage: lang,
      datePublished: m.published_at || undefined,
      mainEntityOfPage: `${SITE_ORIGIN}/${lang}/article/${m.slug}/`,
      author: {
        "@type": "Organization",
        name: ui.publisher,
      },
      publisher: {
        "@type": "Organization",
        name: ui.publisher,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_ORIGIN}/assets/publisher-seal.png`,
        },
      },
    });
    return () => {
      document.getElementById(id)?.remove();
    };
  }, [kind, m, title, d.summary, lang, ui.publisher]);
  if (!mat) return <p>…</p>;
  if (!mat.ok || !m) return <p>Not found</p>;
  return (
    <article className="material">
      {adminPreview && m.status !== "published" ? (
        <p className="meta">Preview draft · {m.status}</p>
      ) : null}
      <h1>{title}</h1>
      {d.question ? <p className="question">{d.question}</p> : null}
      {d.summary ? <p className="summary">{d.summary}</p> : null}
      {m.tags?.length ? (
        <p className="tags">
          {ui.tags}:{" "}
          {m.tags.map((t) => (
            <Link
              key={t.slug}
              className="tag"
              to={`/${lang}/articles/?tag=${encodeURIComponent(t.slug)}`}
            >
              {t.labels?.[lang] || t.slug}
            </Link>
          ))}
        </p>
      ) : null}
      <Blocks body={d.body} />
      {m.related?.length ? (
        <section className="related-block" data-related>
          <h2>{ui.related}</h2>
          <div className="content-list">
            {m.related.map((a) => (
              <Card key={a.id} lang={lang} item={a} kind="article" />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}

export function AskRavPage() {
  const { lang, ui } = useOutletContext();
  const { data } = useCatalog();
  const [cfg, setCfg] = useState(null);
  const [status, setStatus] = useState("");
  const formRef = useRef(null);
  const widgetRef = useRef(null);
  useEffect(() => {
    fetchQuestionConfig().then(setCfg);
  }, []);
  useEffect(() => {
    if (!cfg?.sitekey) return;
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    document.body.appendChild(s);
    return () => s.remove();
  }, [cfg]);

  async function onSubmit(e) {
    e.preventDefault();
    const fd = new FormData(formRef.current);
    const turnstileToken =
      fd.get("cf-turnstile-response") ||
      document.querySelector("[name=cf-turnstile-response]")?.value ||
      "";
    const body = {
      language: lang,
      name: fd.get("name"),
      email: fd.get("email"),
      subject: fd.get("subject"),
      question: fd.get("question"),
      website: fd.get("website"),
      turnstileToken,
    };
    const res = await submitQuestion(body);
    setStatus(res.ok ? ui.askSent : res.error || ui.askSendError);
  }

  return (
    <div className="ask-page">
      <h1>{ui.askSubmitTitle}</h1>
      <form className="ask-form" ref={formRef} onSubmit={onSubmit}>
        <input
          className="hp-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />
        <label>
          {ui.askName}
          <input name="name" />
        </label>
        <label>
          {ui.askEmail}
          <input name="email" type="email" />
        </label>
        <label>
          {ui.askSubject}
          <input name="subject" required minLength={3} />
        </label>
        <label>
          {ui.askQuestion}
          <textarea name="question" required minLength={20} rows={6} />
        </label>
        {cfg?.sitekey ? (
          <div
            ref={widgetRef}
            className="cf-turnstile"
            data-sitekey={cfg.sitekey}
          />
        ) : (
          <p>{ui.askSecurityLoading}</p>
        )}
        <p className="policy">{ui.askPolicy}</p>
        <button className="button primary" type="submit">
          {ui.askSend}
        </button>
        {status ? <p className="form-status">{status}</p> : null}
      </form>
      <div className="content-list">
        {(data?.answers || []).slice(0, 8).map((a) => (
          <Card key={a.id} lang={lang} item={a} kind="answer" />
        ))}
      </div>
    </div>
  );
}

export function BiosPage() {
  const { lang, ui } = useOutletContext();
  const { data } = useCatalog();
  if (!data?.ok) return <p>…</p>;
  const bios = data.biographies || [];
  return (
    <div>
      <h1>{ui.bios}</h1>
      {bios.length ? (
        <div className="content-list">
          {bios.map((a) => (
            <Card key={a.id} lang={lang} item={a} kind="bio" />
          ))}
        </div>
      ) : (
        <p className="empty-note">{ui.searchNoResults}</p>
      )}
    </div>
  );
}

export function AboutPage() {
  const { lang, ui } = useOutletContext();
  const copy = {
    he: {
      lead: "Jeschurun הוא כתב עת תורני של עדת ישורון בחיפה.",
      tradition:
        "החומרים נשענים על תורתו של מורינו הרב שמשון רפאל הירש זצ״ל ועל ממשיכי דרכו.",
      publisher: "המוציא לאור: עדת ישורון, חיפה.",
      contact: "ליצירת קשר עם המערכת: maky.rits@gmail.com",
    },
    en: {
      lead: "Jeschurun is a Torah journal of Adas Jeschurun in Haifa.",
      tradition:
        "Its materials draw on the teachings of Rabbi Samson Raphael Hirsch, of blessed memory, and of those who continue in his path.",
      publisher: "Publisher: Adas Jeschurun, Haifa.",
      contact: "Editorial contact: maky.rits@gmail.com",
    },
    ru: {
      lead: "Jeschurun — торанический журнал общины Адас Йешурун в Хайфе.",
      tradition:
        "Материалы опираются на учение рава Шимшона Рафаэля Гирша, благословенной памяти, и продолжателей его пути.",
      publisher: "Издатель: Адас Йешурун, Хайфа.",
      contact: "Связь с редакцией: maky.rits@gmail.com",
    },
    de: {
      lead: "Jeschurun ist eine Tora-Zeitschrift von Adas Jeschurun in Haifa.",
      tradition:
        "Die Beiträge stützen sich auf die Lehre Rabbiner Samson Raphael Hirschs sel. A. und derer, die seinen Weg fortführen.",
      publisher: "Herausgeber: Adas Jeschurun, Haifa.",
      contact: "Redaktion: maky.rits@gmail.com",
    },
    fr: {
      lead: "Jeschurun est une revue de Torah d’Adas Jeschurun à Haïfa.",
      tradition:
        "Les textes s’appuient sur l’enseignement du rabbin Samson Raphaël Hirsch, de mémoire bénie, et de ceux qui poursuivent sa voie.",
      publisher: "Éditeur : Adas Jeschurun, Haïfa.",
      contact: "Rédaction : maky.rits@gmail.com",
    },
  };
  const t = copy[lang] || copy.en;
  return (
    <div className="about-eeat">
      <h1>{ui.about}</h1>
      <p>{t.lead}</p>
      <p>{t.tradition}</p>
      <p className="about-meta">{t.publisher}</p>
      <p className="about-meta">{t.contact}</p>
    </div>
  );
}

export function LegalPage({ kind }) {
  const { lang, ui } = useOutletContext();
  const title =
    kind === "privacy" ? ui.privacy : kind === "cookies" ? ui.cookies : ui.terms;
  const paras = LEGAL[kind]?.[lang] || LEGAL[kind]?.en || [];
  return (
    <div className="legal-page">
      <h1>{title}</h1>
      {paras.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

export function SearchPage() {
  const { lang, ui } = useOutletContext();
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") || "";
  const [corpus, setCorpus] = useState(null);
  useEffect(() => {
    fetchSearchCorpus().then(setCorpus);
  }, []);
  const results = useMemo(() => {
    if (!corpus?.ok || !q.trim()) return [];
    const pool = [
      ...(corpus.articles || []).map((i) => ({ item: i, kind: "article" })),
      ...(corpus.answers || []).map((i) => ({ item: i, kind: "answer" })),
      ...(PUBLIC_BIOS
        ? (corpus.biographies || []).map((i) => ({ item: i, kind: "bio" }))
        : []),
    ];
    return rankSearchCorpus(pool, { q, lang, limit: 50 });
  }, [corpus, q, lang]);

  return (
    <div className="search-page">
      <h1>{ui.search}</h1>
      <form
        className="site-search-form"
        onSubmit={(e) => {
          e.preventDefault();
          const v = new FormData(e.target).get("q");
          setSp(v ? { q: String(v) } : {});
        }}
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={ui.searchPlaceholder}
        />
        <button className="button primary" type="submit">
          {ui.searchButton}
        </button>
      </form>
      {q ? (
        <section>
          <h2>
            {ui.searchResults} <span>{results.length}</span>
          </h2>
          {results.length ? (
            <div className="content-list">
              {results.map((r) => (
                <Card
                  key={`${r.kind}-${r.item.id}-${r.displayLang}`}
                  lang={r.displayLang}
                  item={r.item}
                  kind={r.kind}
                />
              ))}
            </div>
          ) : (
            <p>{ui.searchNoResults}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

export function RedirectHome() {
  const browser = (navigator.language || "en").toLowerCase();
  const lang =
    LANGS.find((l) => browser.startsWith(l)) ||
    (browser.startsWith("iw") ? "he" : "en");
  window.location.replace(`/${lang}/`);
  return null;
}
