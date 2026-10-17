import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import {
  LANGS,
  normalizeSearchText,
  searchTokens,
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
import { langData, useCatalog } from "./hooks.js";

function Card({ lang, item, kind, label }) {
  const d = langData(item.languages, lang);
  const title = d.title || d.name || item.slug;
  const summary = d.summary || d.question || "";
  const href =
    kind === "article"
      ? `/${lang}/article/${item.slug}/`
      : kind === "answer"
        ? `/${lang}/answer/${item.slug}/`
        : `/${lang}/biography/${item.slug}/`;
  return (
    <article className="content-card">
      <h3>
        <Link to={href}>{title}</Link>
      </h3>
      {summary ? <p>{summary}</p> : null}
      {label ? <span className="meta">{label}</span> : null}
    </article>
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
      <h1 className="issue-card-title">
        {d.title || `${issue.hebrew_year} / ${issue.slug}`}
      </h1>
      {(d.parasha || issue.parasha_key) && (
        <p className="issue-card-parasha">{d.parasha || issue.parasha_key}</p>
      )}
      {d.summary ? <p className="issue-card-lead">{d.summary}</p> : null}
      {(dl.pdf || dl.epub) && (
        <p className="issue-card-downloads">
          {ui.download}:{" "}
          {dl.pdf ? (
            <a
              href={`/api/file?path=${encodeURIComponent(`${fileBase}/${dl.pdf}`)}`}
            >
              PDF
            </a>
          ) : null}
          {dl.pdf && dl.epub ? " " : null}
          {dl.epub ? (
            <a
              href={`/api/file?path=${encodeURIComponent(`${fileBase}/${dl.epub}`)}`}
            >
              EPUB
            </a>
          ) : null}
        </p>
      )}
      <h2 className="issue-card-toc">{ui.inIssue}</h2>
      <div className="content-list issue-card-list">
        {articles.map((a) => (
          <Card key={a.id} lang={lang} item={a} kind="article" />
        ))}
        {answers.map((a) => (
          <Card key={a.id} lang={lang} item={a} kind="answer" />
        ))}
      </div>
    </section>
  );
}

export function ArchivePage() {
  const { lang, ui } = useOutletContext();
  const { data } = useCatalog();
  if (!data?.ok) return <p>…</p>;
  return (
    <div>
      <h1>{ui.archive}</h1>
      <div className="content-list">
        {(data.issues || []).map((iss) => {
          const d = langData(iss.languages, lang);
          return (
            <article key={iss.id} className="content-card">
              <h3>
                <Link to={`/${lang}/issue/${iss.hebrew_year}/${iss.slug}/`}>
                  {d.title || `${iss.hebrew_year} / ${iss.slug}`}
                </Link>
              </h3>
              <p>{d.summary}</p>
            </article>
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
  if (!data?.ok) return <p>…</p>;
  return <IssueView issue={issue} lang={lang} ui={ui} />;
}

export function ArticlesPage() {
  const { lang, ui } = useOutletContext();
  const { data } = useCatalog();
  const [sp, setSp] = useSearchParams();
  const sort = normalizeSort(sp.get("sort"));
  if (!data?.ok) return <p>…</p>;
  const list = sortArticles(data.articles || [], sort, lang);
  return (
    <div>
      <h1>{ui.articles}</h1>
      <label className="sort-control">
        {ui.sort}:{" "}
        <select
          value={sort}
          onChange={(e) => {
            const next = new URLSearchParams(sp);
            next.set("sort", e.target.value);
            setSp(next);
          }}
        >
          <option value="date_desc">{ui.sortDateDesc}</option>
          <option value="date_asc">{ui.sortDateAsc}</option>
          <option value="title_asc">{ui.sortTitleAsc}</option>
        </select>
      </label>
      <div className="content-list">
        {list.map((a) => (
          <Card key={a.id} lang={lang} item={a} kind="article" />
        ))}
      </div>
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
  if (!mat) return <p>…</p>;
  if (!mat.ok) return <p>Not found</p>;
  const m = mat.material;
  const d = langData(m.languages, lang);
  const title = d.title || d.name || m.slug;
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
            <span key={t.slug} className="tag">
              {t.labels?.[lang] || t.slug}
            </span>
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
      <div className="content-list">
        {(data?.answers || []).slice(0, 8).map((a) => (
          <Card key={a.id} lang={lang} item={a} kind="answer" />
        ))}
      </div>
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
    </div>
  );
}

export function BiosPage() {
  const { lang, ui } = useOutletContext();
  const { data } = useCatalog();
  if (!data?.ok) return <p>…</p>;
  return (
    <div>
      <h1>{ui.bios}</h1>
      <div className="content-list">
        {(data.biographies || []).map((a) => (
          <Card key={a.id} lang={lang} item={a} kind="bio" />
        ))}
      </div>
    </div>
  );
}

export function AboutPage() {
  const { lang, ui } = useOutletContext();
  const text = {
    he: "Jeschurun הוא כתב עת תורני של עדת ישורון בחיפה.",
    en: "Jeschurun is a Torah journal of Adas Jeschurun in Haifa.",
    ru: "Jeschurun — торанический журнал общины Адас Йешурун в Хайфе.",
    de: "Jeschurun ist eine Tora-Zeitschrift von Adas Jeschurun in Haifa.",
    fr: "Jeschurun est une revue de Torah d’Adas Jeschurun à Haïfa.",
  };
  return (
    <div>
      <h1>{ui.about}</h1>
      <p>{text[lang] || text.en}</p>
    </div>
  );
}

function scoreItem(item, kind, lang, tokens, q) {
  const d = item.languages?.[lang];
  if (!d) return null;
  const title = normalizeSearchText(d.title || d.name || "");
  const summary = normalizeSearchText(d.summary || d.question || "");
  const body = normalizeSearchText(
    (d.body || []).map((b) => b.text || "").join(" "),
  );
  const nq = normalizeSearchText(q);
  let score = 0;
  if (title.includes(nq)) score += 50;
  if (summary.includes(nq)) score += 20;
  for (const t of tokens) {
    if (title.includes(t)) score += 10;
    if (summary.includes(t)) score += 4;
    if (body.includes(t)) score += 1;
  }
  if (score <= 0) return null;
  return { item, kind, lang, score, title: d.title || d.name, summary: d.summary };
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
    const tokens = searchTokens(q);
    if (!tokens.length) return [];
    const pool = [
      ...(corpus.articles || []).map((i) => ({ item: i, kind: "article" })),
      ...(corpus.answers || []).map((i) => ({ item: i, kind: "answer" })),
      ...(corpus.biographies || []).map((i) => ({ item: i, kind: "bio" })),
    ];
    const out = [];
    for (const x of pool) {
      const matches = LANGS.map((l) =>
        scoreItem(x.item, x.kind, l, tokens, q),
      ).filter(Boolean);
      if (!matches.length) continue;
      matches.sort((a, b) => b.score - a.score);
      const best = matches[0];
      out.push({
        ...best,
        displayLang: best.lang === lang ? lang : best.lang,
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 50);
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
