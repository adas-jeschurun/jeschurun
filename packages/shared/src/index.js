/** Shared types/utils for jes-v2 site + admin. */

export const LANGS = ["he", "en", "ru", "de", "fr"];

export const LANG_LABEL = {
  he: "עברית",
  en: "EN",
  ru: "RU",
  de: "DE",
  fr: "FR",
};

/** Masthead tagline under language pills (friend-site copy). */
export const HEADER_SUBTITLE = {
  ru: "Из учения нашего наставника, рава Шимшона Рафаэля Гирша, благословенной памяти, и продолжателей его пути, прошлых и ныне живущих.",
  he: "מתורתו של מורינו הרב שמשון רפאל הירש זצ״ל וממשיכי דרכו זצ״ל ויבלחט״א",
  en: "From the teachings of our teacher, Rabbi Samson Raphael Hirsch, of blessed memory, and of those who continue in his path — past and present.",
  de: "Aus der Lehre unseres Lehrers, Rabbiner Samson Raphael Hirsch sel. A., und derer, die seinen Weg fortführen — früher und heute.",
  fr: "D’après l’enseignement de notre maître, le rabbin Samson Raphaël Hirsch, de mémoire bénie, et de ceux qui poursuivent sa voie, hier comme aujourd’hui.",
};

export const SORT_OPTIONS = ["date_desc", "date_asc", "title_asc"];

/**
 * @param {string | null | undefined} value
 * @returns {"date_desc" | "date_asc" | "title_asc"}
 */
export function normalizeSort(value) {
  if (value && SORT_OPTIONS.includes(value)) return value;
  return "date_desc";
}

export function normalizeSearchText(s) {
  return String(s || "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchTokens(q) {
  return normalizeSearchText(q)
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter(Boolean);
}

/** Articles list page size (tag filter applies before pagination). */
export const ARTICLES_PAGE_SIZE = 20;

/**
 * Score one language variant of a corpus item.
 * Weights: exact phrase in title ≫ title token ≫ summary ≫ body;
 * bonus for current lang; light decay by published_at age.
 * @returns {{ score: number, andOk: boolean } | null}
 */
export function scoreSearchHit({
  title,
  summary,
  body,
  publishedAt,
  tokens,
  query,
  isCurrentLang,
}) {
  const nTitle = normalizeSearchText(title);
  const nSummary = normalizeSearchText(summary);
  const nBody = normalizeSearchText(body);
  const nq = normalizeSearchText(query);
  if (!tokens.length) return null;

  const inFields = (t) =>
    nTitle.includes(t) || nSummary.includes(t) || nBody.includes(t);
  const andOk = tokens.every(inFields);
  const orOk = tokens.some(inFields);
  if (!andOk && !orOk) return null;

  let score = 0;
  if (nq.length >= 2) {
    if (nTitle.includes(nq)) score += 100;
    else if (nSummary.includes(nq)) score += 35;
    else if (nBody.includes(nq)) score += 8;
  }
  for (const t of tokens) {
    if (nTitle.includes(t)) score += 25;
    if (nSummary.includes(t)) score += 8;
    if (nBody.includes(t)) score += 2;
  }
  if (isCurrentLang) score += 20;
  if (andOk) score += 40;

  if (publishedAt) {
    const ms = Date.parse(publishedAt);
    if (!Number.isNaN(ms)) {
      const ageYears = Math.max(0, (Date.now() - ms) / (365.25 * 86400000));
      score += Math.max(0, 12 * Math.exp(-ageYears / 3));
    }
  }

  return { score, andOk };
}

/**
 * Rank search corpus: AND matches first, OR fallback if empty; top `limit`.
 * @param {{ item: object, kind: string }[]} pool
 * @param {{ q: string, lang: string, limit?: number }} opts
 */
export function rankSearchCorpus(pool, { q, lang, limit = 50 }) {
  const tokens = searchTokens(q);
  if (!tokens.length) return [];

  function gather(requireAnd) {
    const out = [];
    for (const x of pool) {
      const matches = [];
      for (const l of LANGS) {
        const d = x.item.languages?.[l];
        if (!d) continue;
        const hit = scoreSearchHit({
          title: d.title || d.name || "",
          summary: d.summary || d.question || "",
          body: (d.body || []).map((b) => b.text || "").join(" "),
          publishedAt: x.item.published_at,
          tokens,
          query: q,
          isCurrentLang: l === lang,
        });
        if (!hit) continue;
        if (requireAnd && !hit.andOk) continue;
        matches.push({
          item: x.item,
          kind: x.kind,
          lang: l,
          score: hit.score,
          title: d.title || d.name,
          summary: d.summary,
        });
      }
      if (!matches.length) continue;
      matches.sort((a, b) => b.score - a.score);
      const best = matches[0];
      const prefer = matches.find((m) => m.lang === lang) || best;
      out.push({
        ...best,
        score: best.score,
        displayLang: prefer.lang,
        title: prefer.title,
        summary: prefer.summary,
        lang: prefer.lang,
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }

  const andHits = gather(true);
  return andHits.length ? andHits : gather(false);
}

export function sortArticles(list, sort, lang) {
  const mode = normalizeSort(sort);
  const titleOf = (a) =>
    a.languages?.[lang]?.title ||
    a.languages?.en?.title ||
    a.slug ||
    "";
  const dateOf = (a) => a.published_at || "";
  const arr = [...list];
  arr.sort((a, b) => {
    if (mode === "title_asc") {
      const c = titleOf(a).localeCompare(titleOf(b), lang);
      return c || String(a.slug).localeCompare(String(b.slug));
    }
    if (mode === "date_asc") {
      const c = dateOf(a).localeCompare(dateOf(b));
      return c || String(a.slug).localeCompare(String(b.slug));
    }
    const c = dateOf(b).localeCompare(dateOf(a));
    return c || String(a.slug).localeCompare(String(b.slug));
  });
  return arr;
}

/**
 * Per-language SEO copy for public pages.
 * Titles use brandTitle(); description strings support {tag} / {q}.
 */
export const SEO = {
  en: {
    brand: "Jeschurun",
    titleSep: " · ",
    pageN: "page {n}",
    homeTitle: "Weekly Torah journal from Haifa",
    homeDescription:
      "Jeschurun is the weekly Torah journal of Adas Jeschurun in Haifa: essays on the portion in the path of Rabbi Samson Raphael Hirsch and his students.",
    articlesTitle: "Torah articles by topic and date",
    articlesDescription:
      "Read Jeschurun articles on the weekly portion, faith, and community life — arranged by topic and date, in Hebrew, English, Russian, German, and French.",
    articlesTagDescription:
      "Jeschurun articles on {tag}: Torah essays from Adas Jeschurun in Haifa, in the path of Rabbi Samson Raphael Hirsch.",
    askTitle: "Ask the Rav a Torah question",
    askDescription:
      "Send a question to the Rav of Adas Jeschurun. The editorial desk answers at ask@jeschurun.org; a published answer never includes your name or email.",
    searchTitle: "Search the Torah journal",
    searchDescription:
      "Search Jeschurun across every language for articles, Rav answers, and issue materials from the Adas Jeschurun journal in Haifa.",
    searchQueryDescription:
      "Jeschurun search results for “{q}”: articles and Rav answers from the Haifa Torah journal.",
    aboutTitle: "About this Haifa Torah journal",
    aboutDescription:
      "Jeschurun is published by Adas Jeschurun in Haifa. The journal teaches the weekly portion in the tradition of Rabbi Samson Raphael Hirsch.",
    archiveTitle: "Past issues of the Torah journal",
    archiveDescription:
      "Earlier published issues of Jeschurun, the Haifa Torah journal, with the PDF and EPUB of each issue in the language you are reading.",
    biosTitle: "Biographies in the Hirsch tradition",
    biosDescription:
      "Life stories of rabbis and teachers in the Hirschian path, as published by the Jeschurun Torah journal of Adas Jeschurun in Haifa.",
    termsTitle: "Terms of use for journal content",
    termsDescription:
      "Terms for reading Jeschurun online: personal study is welcome; reprinting or commercial use of the journal needs permission from the editors.",
    privacyTitle: "Privacy for readers and questions",
    privacyDescription:
      "How Jeschurun handles a visit to the site, the Ask the Rav form, and spam protection — without publishing your name or email address.",
    cookiesTitle: "Cookies and technical site storage",
    cookiesDescription:
      "What Jeschurun stores in the browser: language, accessibility choices, and the technical cookies needed to show the journal and its forms.",
    articleFallbackDescription:
      "An article from Jeschurun, the weekly Torah journal of Adas Jeschurun in Haifa, in the path of Rabbi Samson Raphael Hirsch.",
    answerFallbackDescription:
      "A reply from Ask the Rav on Jeschurun, the Torah journal of Adas Jeschurun in Haifa.",
    bioFallbackDescription:
      "A biography published by Jeschurun, the Haifa Torah journal in the tradition of Rabbi Samson Raphael Hirsch.",
    issueFallbackDescription:
      "An issue of Jeschurun, the weekly Torah journal of Adas Jeschurun in Haifa.",
    notFoundTitle: "This page was not found",
    notFoundDescription:
      "That address is not a page of Jeschurun. Return to the Haifa Torah journal, its articles, or the current issue.",
  },
  he: {
    brand: "Jeschurun",
    titleSep: " · ",
    pageN: "עמוד {n}",
    homeTitle: "כתב עת תורני שבועי מחיפה",
    homeDescription:
      "Jeschurun הוא כתב העת התורני השבועי של עדת ישורון בחיפה: מאמרים על הפרשה בדרך רש״ר הירש זצ״ל וממשיכי דרכו.",
    articlesTitle: "מאמרי תורה לפי נושא ותאריך",
    articlesDescription:
      "מאמרי Jeschurun על הפרשה, האמונה וחיי הקהילה — לפי נושא ולפי תאריך, בעברית, אנגלית, רוסית, גרמנית וצרפתית.",
    articlesTagDescription:
      "מאמרי Jeschurun בנושא {tag}: דברי תורה של עדת ישורון בחיפה, בדרך רש״ר הירש זצ״ל.",
    askTitle: "שליחת שאלה תורנית לרב",
    askDescription:
      "שליחת שאלה לרב של עדת ישורון. המערכת עונה ב־ask@jeschurun.org, ותשובה שתפורסם לא תכלול את שמכם או את הדוא״ל.",
    searchTitle: "חיפוש בכתב העת",
    searchDescription:
      "חיפוש ב־Jeschurun בכל השפות: מאמרים, תשובות הרב וחומרי הגיליון של כתב העת התורני של עדת ישורון בחיפה.",
    searchQueryDescription:
      "תוצאות חיפוש ב־Jeschurun עבור «{q}»: מאמרים ותשובות הרב מכתב העת התורני בחיפה.",
    aboutTitle: "על כתב העת התורני מחיפה",
    aboutDescription:
      "Jeschurun יוצא לאור על ידי עדת ישורון בחיפה. כתב העת מלמד את פרשת השבוע במסורת רש״ר הירש זצ״ל.",
    archiveTitle: "גיליונות קודמים של כתב העת",
    archiveDescription:
      "גיליונות Jeschurun שכבר פורסמו, כתב העת התורני מחיפה, עם קובץ PDF ו־EPUB של כל גיליון בשפה שבה אתם קוראים.",
    biosTitle: "ביוגרפיות במסורת הרש״ר",
    biosDescription:
      "סיפורי חיים של רבנים ומורים בדרך הרש״ר, כפי שפורסמו בכתב העת התורני Jeschurun של עדת ישורון בחיפה.",
    termsTitle: "תנאי השימוש בכתב העת",
    termsDescription:
      "תנאי הקריאה ב־Jeschurun: לימוד אישי מותר; הדפסה מחדש או שימוש מסחרי בחומר טעונים רשות של המערכת.",
    privacyTitle: "פרטיות הקוראים והשאלות",
    privacyDescription:
      "כיצד Jeschurun מטפל בביקור באתר, בטופס שאל את הרב ובהגנת ספאם — בלי לפרסם את שמכם או את כתובת הדוא״ל.",
    cookiesTitle: "עוגיות ואחסון טכני באתר",
    cookiesDescription:
      "מה Jeschurun שומר בדפדפן: שפה, בחירות נגישות, והעוגיות הטכניות הדרושות להצגת כתב העת והטפסים.",
    articleFallbackDescription:
      "מאמר מ־Jeschurun, כתב העת התורני השבועי של עדת ישורון בחיפה, בדרך רש״ר הירש זצ״ל.",
    answerFallbackDescription:
      "תשובה ממדור שאל את הרב ב־Jeschurun, כתב העת התורני של עדת ישורון בחיפה.",
    bioFallbackDescription:
      "ביוגרפיה שפורסמה ב־Jeschurun, כתב העת התורני מחיפה במסורת רש״ר הירש זצ״ל.",
    issueFallbackDescription:
      "גיליון של Jeschurun, כתב העת התורני השבועי של עדת ישורון בחיפה.",
    notFoundTitle: "הדף המבוקש לא נמצא",
    notFoundDescription:
      "הכתובת הזו אינה דף ב־Jeschurun. אפשר לחזור לכתב העת התורני מחיפה, למאמרים או לגיליון הנוכחי.",
  },
  ru: {
    brand: "Jeschurun",
    titleSep: " · ",
    pageN: "стр. {n}",
    homeTitle: "Еженедельный журнал Торы из Хайфы",
    homeDescription:
      "Jeschurun — еженедельный торанический журнал общины Адас Йешурун в Хайфе: очерки о главе недели по пути рава Шимшона Рафаэля Гирша и его учеников.",
    articlesTitle: "Статьи Торы по теме и дате",
    articlesDescription:
      "Статьи Jeschurun о недельной главе, вере и жизни общины — по теме и по дате, на иврите, английском, русском, немецком и французском.",
    articlesTagDescription:
      "Статьи Jeschurun на тему «{tag}»: очерки Торы общины Адас Йешурун в Хайфе, по пути рава Гирша.",
    askTitle: "Задать раввину вопрос по Торе",
    askDescription:
      "Отправьте вопрос раввину Адас Йешурун. Редакция отвечает на ask@jeschurun.org; в опубликованном ответе не будет вашего имени и почты.",
    searchTitle: "Поиск по журналу Торы",
    searchDescription:
      "Поиск по Jeschurun на всех языках: статьи, ответы раввина и материалы выпусков торанического журнала Адас Йешурун в Хайфе.",
    searchQueryDescription:
      "Результаты поиска Jeschurun по запросу «{q}»: статьи и ответы раввина хайфского журнала Торы.",
    aboutTitle: "О тораническом журнале из Хайфы",
    aboutDescription:
      "Jeschurun издаёт община Адас Йешурун в Хайфе. Журнал разбирает недельную главу в традиции рава Шимшона Рафаэля Гирша.",
    archiveTitle: "Прошлые выпуски журнала Торы",
    archiveDescription:
      "Уже вышедшие выпуски Jeschurun, хайфского журнала Торы, с файлами PDF и EPUB каждого выпуска на языке, который вы читаете.",
    biosTitle: "Биографии традиции рава Гирша",
    biosDescription:
      "Жизнеописания раввинов и учителей гиршианского пути, опубликованные журналом Jeschurun общины Адас Йешурун в Хайфе.",
    termsTitle: "Условия использования журнала",
    termsDescription:
      "Условия чтения Jeschurun: личное изучение разрешено; перепечатка и коммерческое использование текстов требуют разрешения редакции.",
    privacyTitle: "Конфиденциальность читателей и вопросов",
    privacyDescription:
      "Как Jeschurun обрабатывает визит на сайт, форму «Вопрос раввину» и защиту от спама — не публикуя ваше имя и адрес почты.",
    cookiesTitle: "Файлы cookie и техническое хранение",
    cookiesDescription:
      "Что Jeschurun хранит в браузере: язык, настройки доступности и технические cookie, без которых журнал и формы не открываются.",
    articleFallbackDescription:
      "Статья Jeschurun, еженедельного торанического журнала общины Адас Йешурун в Хайфе, по пути рава Гирша.",
    answerFallbackDescription:
      "Ответ из раздела «Вопрос раввину» на Jeschurun, тораническом журнале общины Адас Йешурун в Хайфе.",
    bioFallbackDescription:
      "Биография в издании Jeschurun, хайфском журнале Торы в традиции рава Шимшона Рафаэля Гирша.",
    issueFallbackDescription:
      "Выпуск Jeschurun, еженедельного торанического журнала общины Адас Йешурун в Хайфе.",
    notFoundTitle: "Страница не найдена",
    notFoundDescription:
      "Такого адреса на Jeschurun нет. Вернитесь к хайфскому журналу Торы, к статьям или к текущему выпуску.",
  },
  de: {
    brand: "Jeschurun",
    titleSep: " · ",
    pageN: "Seite {n}",
    homeTitle: "Wöchentliche Tora-Zeitschrift aus Haifa",
    homeDescription:
      "Jeschurun ist die wöchentliche Tora-Zeitschrift von Adas Jeschurun in Haifa: Essays zum Wochenabschnitt auf dem Weg Rabbiner Samson Raphael Hirschs und seiner Schüler.",
    articlesTitle: "Tora-Artikel nach Thema und Datum",
    articlesDescription:
      "Artikel von Jeschurun zum Wochenabschnitt, zum Glauben und zum Gemeindeleben — nach Thema und Datum, auf Hebräisch, Englisch, Russisch, Deutsch und Französisch.",
    articlesTagDescription:
      "Jeschurun-Artikel zum Thema {tag}: Tora-Essays von Adas Jeschurun in Haifa, auf dem Weg Rabbiner Hirschs.",
    askTitle: "Eine Tora-Frage an den Rabbiner",
    askDescription:
      "Senden Sie eine Frage an den Rabbiner von Adas Jeschurun. Die Redaktion antwortet unter ask@jeschurun.org; ein veröffentlichter Text nennt weder Namen noch E-Mail.",
    searchTitle: "Die Tora-Zeitschrift durchsuchen",
    searchDescription:
      "Suche in Jeschurun in allen Sprachen: Artikel, Antworten des Rabbiners und Materialien der Haifaer Tora-Zeitschrift Adas Jeschurun.",
    searchQueryDescription:
      "Jeschurun-Suchergebnisse für „{q}“: Artikel und Antworten des Rabbiners aus der Haifaer Tora-Zeitschrift.",
    aboutTitle: "Über die Tora-Zeitschrift aus Haifa",
    aboutDescription:
      "Jeschurun erscheint bei Adas Jeschurun in Haifa. Die Zeitschrift legt den Wochenabschnitt in der Tradition Rabbiner Samson Raphael Hirschs aus.",
    archiveTitle: "Frühere Ausgaben der Tora-Zeitschrift",
    archiveDescription:
      "Bereits erschienene Ausgaben von Jeschurun, der Haifaer Tora-Zeitschrift, mit PDF und EPUB jeder Ausgabe in der Sprache, die Sie lesen.",
    biosTitle: "Biographien der Hirsch-Tradition",
    biosDescription:
      "Lebensbilder von Rabbinern und Lehrern auf dem Hirschschen Weg, veröffentlicht von der Tora-Zeitschrift Jeschurun der Adas Jeschurun in Haifa.",
    termsTitle: "Nutzungsbedingungen der Zeitschrift",
    termsDescription:
      "Bedingungen für Jeschurun: persönliches Studium ist willkommen; Nachdruck oder gewerbliche Nutzung braucht die Erlaubnis der Redaktion.",
    privacyTitle: "Datenschutz für Leser und Fragen",
    privacyDescription:
      "Wie Jeschurun einen Besuch, das Formular «Frage an den Rabbiner» und den Spamschutz handhabt — ohne Ihren Namen oder Ihre E-Mail zu veröffentlichen.",
    cookiesTitle: "Cookies und technischer Speicher",
    cookiesDescription:
      "Was Jeschurun im Browser speichert: Sprache, Barrierefreiheit und die technischen Cookies, ohne die Zeitschrift und Formulare nicht laden.",
    articleFallbackDescription:
      "Ein Artikel aus Jeschurun, der wöchentlichen Tora-Zeitschrift von Adas Jeschurun in Haifa, auf dem Weg Rabbiner Hirschs.",
    answerFallbackDescription:
      "Eine Antwort aus «Frage an den Rabbiner» auf Jeschurun, der Tora-Zeitschrift von Adas Jeschurun in Haifa.",
    bioFallbackDescription:
      "Eine Biographie bei Jeschurun, der Haifaer Tora-Zeitschrift in der Tradition Rabbiner Samson Raphael Hirschs.",
    issueFallbackDescription:
      "Eine Ausgabe von Jeschurun, der wöchentlichen Tora-Zeitschrift von Adas Jeschurun in Haifa.",
    notFoundTitle: "Seite wurde nicht gefunden",
    notFoundDescription:
      "Diese Adresse ist keine Seite von Jeschurun. Zurück zur Haifaer Tora-Zeitschrift, zu den Artikeln oder zur aktuellen Ausgabe.",
  },
  fr: {
    brand: "Jeschurun",
    titleSep: " · ",
    pageN: "page {n}",
    homeTitle: "Revue de Torah hebdomadaire à Haïfa",
    homeDescription:
      "Jeschurun est la revue de Torah hebdomadaire d’Adas Jeschurun à Haïfa : essais sur la parachah dans la voie du rabbin Samson Raphaël Hirsch et de ses élèves.",
    articlesTitle: "Articles de Torah par sujet et date",
    articlesDescription:
      "Articles de Jeschurun sur la parachah, la foi et la vie de la communauté — par sujet et par date, en hébreu, anglais, russe, allemand et français.",
    articlesTagDescription:
      "Articles Jeschurun sur {tag} : essais de Torah d’Adas Jeschurun à Haïfa, dans la voie du rabbin Hirsch.",
    askTitle: "Poser une question de Torah au rabbin",
    askDescription:
      "Envoyez une question au rabbin d’Adas Jeschurun. La rédaction répond à ask@jeschurun.org ; une réponse publiée n’indique ni votre nom ni votre e-mail.",
    searchTitle: "Chercher dans la revue de Torah",
    searchDescription:
      "Recherchez dans Jeschurun, dans toutes les langues : articles, réponses du rabbin et textes des numéros de la revue de Torah d’Adas Jeschurun à Haïfa.",
    searchQueryDescription:
      "Résultats Jeschurun pour « {q} » : articles et réponses du rabbin de la revue de Torah de Haïfa.",
    aboutTitle: "À propos de la revue de Torah",
    aboutDescription:
      "Jeschurun est publié par Adas Jeschurun à Haïfa. La revue commente la parachah de la semaine dans la tradition du rabbin Samson Raphaël Hirsch.",
    archiveTitle: "Anciens numéros de la revue de Torah",
    archiveDescription:
      "Numéros déjà parus de Jeschurun, la revue de Torah de Haïfa, avec le PDF et l’EPUB de chaque numéro dans la langue que vous lisez.",
    biosTitle: "Biographies de la tradition Hirsch",
    biosDescription:
      "Vies de rabbins et de maîtres dans la voie hirschienne, publiées par la revue de Torah Jeschurun d’Adas Jeschurun à Haïfa.",
    termsTitle: "Conditions d’utilisation de la revue",
    termsDescription:
      "Conditions de lecture de Jeschurun : l’étude personnelle est libre ; une réimpression ou un usage commercial exige l’accord de la rédaction.",
    privacyTitle: "Confidentialité des lecteurs et questions",
    privacyDescription:
      "Comment Jeschurun traite une visite, le formulaire « Question au rabbin » et l’antispam — sans publier votre nom ni votre e-mail.",
    cookiesTitle: "Cookies et stockage technique",
    cookiesDescription:
      "Ce que Jeschurun garde dans le navigateur : langue, accessibilité, et les cookies techniques sans lesquels la revue et les formulaires ne s’affichent pas.",
    articleFallbackDescription:
      "Un article de Jeschurun, revue de Torah hebdomadaire d’Adas Jeschurun à Haïfa, dans la voie du rabbin Hirsch.",
    answerFallbackDescription:
      "Une réponse de « Question au rabbin » sur Jeschurun, la revue de Torah d’Adas Jeschurun à Haïfa.",
    bioFallbackDescription:
      "Une biographie publiée par Jeschurun, la revue de Torah de Haïfa dans la tradition du rabbin Samson Raphaël Hirsch.",
    issueFallbackDescription:
      "Un numéro de Jeschurun, la revue de Torah hebdomadaire d’Adas Jeschurun à Haïfa.",
    notFoundTitle: "Page introuvable",
    notFoundDescription:
      "Cette adresse n’est pas une page de Jeschurun. Revenez à la revue de Torah de Haïfa, aux articles ou au numéro en cours.",
  },
};

/** @param {string} lang */
export function seoFor(lang) {
  return SEO[lang] || SEO.en;
}

/**
 * Document title: page purpose + brand, or brand alone for home.
 * @param {string | null | undefined} pageTitle
 * @param {string} lang
 */
export function brandTitle(pageTitle, lang) {
  const seo = seoFor(lang);
  const t = String(pageTitle || "").trim();
  if (!t || t === seo.brand) return seo.brand;
  return `${t}${seo.titleSep}${seo.brand}`;
}

/**
 * Articles list title with optional tag + pagination.
 * @param {{ lang: string, articlesLabel: string, page?: number, tagLabel?: string }} opts
 */
export function articlesListTitle({ lang, articlesLabel, page = 1, tagLabel = "" }) {
  const seo = seoFor(lang);
  let base = articlesLabel;
  const tag = String(tagLabel || "").trim();
  if (tag) base = `${base} — ${tag}`;
  if (page >= 2) {
    base = `${base} — ${seo.pageN.replace("{n}", String(page))}`;
  }
  return brandTitle(base, lang);
}

/**
 * @param {string} template
 * @param {Record<string, string>} vars
 */
export function fillSeoTemplate(template, vars) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : "",
  );
}

const PUBLIC_PAGE_KEYS = {
  home: ["homeTitle", "homeDescription"],
  articles: ["articlesTitle", "articlesDescription"],
  ask: ["askTitle", "askDescription"],
  about: ["aboutTitle", "aboutDescription"],
  archive: ["archiveTitle", "archiveDescription"],
  search: ["searchTitle", "searchDescription"],
  bios: ["biosTitle", "biosDescription"],
  terms: ["termsTitle", "termsDescription"],
  privacy: ["privacyTitle", "privacyDescription"],
  cookies: ["cookiesTitle", "cookiesDescription"],
  notFound: ["notFoundTitle", "notFoundDescription"],
};

/**
 * Title + description for a public template. Article/issue titles use the
 * content title; section pages use the editorial title in SEO.
 * @param {string} lang
 * @param {string} page
 * @param {{ title?: string, summary?: string, question?: string, page?: number, tagLabel?: string, q?: string }} [opts]
 */
export function publicPageSeo(lang, page, opts = {}) {
  const seo = seoFor(lang);
  if (page === "article" || page === "answer" || page === "bio" || page === "issue") {
    const fallback =
      page === "answer"
        ? seo.answerFallbackDescription
        : page === "bio"
          ? seo.bioFallbackDescription
          : page === "issue"
            ? seo.issueFallbackDescription
            : seo.articleFallbackDescription;
    const description = String(opts.summary || opts.question || fallback || "").trim();
    return { title: brandTitle(opts.title, lang), description };
  }
  const [titleKey, descKey] = PUBLIC_PAGE_KEYS[page] || PUBLIC_PAGE_KEYS.home;
  let title = brandTitle(seo[titleKey] || seo.brand, lang);
  let description = seo[descKey] || "";
  if (page === "articles") {
    title = articlesListTitle({
      lang,
      articlesLabel: seo.articlesTitle || seo.brand,
      page: opts.page || 1,
      tagLabel: opts.tagLabel || "",
    });
    if (opts.tagLabel) {
      description = fillSeoTemplate(seo.articlesTagDescription, { tag: opts.tagLabel });
    }
  }
  if (page === "search" && String(opts.q || "").trim()) {
    const q = String(opts.q).trim();
    title = brandTitle(`${seo.searchTitle}: ${q}`, lang);
    description = fillSeoTemplate(seo.searchQueryDescription, { q });
  }
  return { title, description };
}

export const UI = {
  ru: {
    askSubmit: "Задать вопрос",
    askSubmitTitle: "Задать вопрос раввину",
    askName: "Имя (необязательно)",
    askEmail: "Email для личного ответа (необязательно)",
    askSubject: "Тема вопроса",
    askQuestion: "Ваш вопрос",
    askSend: "Отправить вопрос",
    askPolicy:
      "Отправляя вопрос, вы соглашаетесь с тем, что редакция Jeschurun может по своему усмотрению опубликовать вопрос и ответ в обезличенном виде. Персональные данные и адрес электронной почты не публикуются.",
    askEmailNote: "Email используется только для личного ответа и не публикуется.",
    askSent: "Вопрос получен. Спасибо.",
    askSendError: "Не удалось отправить вопрос.",
    askSecurityLoading: "Подготавливается защита от спама…",
    search: "Поиск",
    searchPlaceholder: "Поиск по всем языкам…",
    searchButton: "Найти",
    searchResults: "Результаты поиска",
    searchNoResults: "Ничего не найдено.",
    searchAlsoAvailable: "Также на других языках",
    notFound: "Не найдено",
    notFoundBody: "Запрашиваемая страница не найдена.",
    latestArticles: "Последние статьи",
    latestQuestions: "Вопрос раввину",
    latestBios: "Биографии",
    popular: "Часто читаемые",
    related: "Читайте также",
    tags: "Темы",
    more: "Смотреть всё",
    home: "Главная",
    menu: "Меню",
    backToTop: "Наверх",
    a11yTitle: "Доступность",
    a11yOpen: "Настройки доступности",
    a11yFont: "Размер текста",
    a11yLine: "Межстрочный интервал",
    a11ySpacing: "Межбуквенный интервал",
    a11yContrast: "Высокий контраст",
    a11yMono: "Оттенки серого",
    a11yLinks: "Подчёркивать ссылки",
    a11yHeadings: "Выделять заголовки",
    a11yMotion: "Меньше анимации",
    a11yCursor: "Крупный курсор",
    a11yReadable: "Читаемый шрифт",
    a11yColorBlind: "Цветовой фильтр",
    a11yNone: "Нет",
    a11yReset: "Сбросить",
    a11yClose: "Закрыть",
    candleTitle: "Зажигание свечей",
    candleChooseCity: "Выбрать город",
    candleSearchPlaceholder: "Поиск города…",
    current: "Текущий выпуск",
    archive: "Архив",
    articles: "Статьи",
    ask: "Вопрос раввину",
    bios: "Биографии",
    about: "Об издании",
    readIssue: "Открыть выпуск",
    readArticle: "Читать статью",
    readAnswer: "Читать ответ",
    inIssue: "В выпуске",
    download: "Выпуск для скачивания",
    updated: "Обновлено:",
    print: "Печать",
    printPage: "Печать",
    noIssue: "Опубликованный текущий выпуск пока не выбран.",
    sort: "Сортировка",
    sortDateDesc: "Сначала новые",
    sortDateAsc: "Сначала старые",
    sortTitleAsc: "По названию",
    tagAll: "Все темы",
    pagination: "Страницы",
    publisher: "Адас Йешурун",
    publisherPlace: "Хайфа",
    footerExplore: "Разделы",
    footerAbout: "Об издании",
    footerLegal: "Правовая информация",
    terms: "Условия использования",
    privacy: "Политика конфиденциальности",
    cookies: "Файлы cookie",
    copyright: "©",
  },
  he: {
    askSubmit: "שליחת שאלה",
    askSubmitTitle: "שליחת שאלה לרב",
    askName: "שם (לא חובה)",
    askEmail: "דוא״ל לתשובה אישית (לא חובה)",
    askSubject: "נושא השאלה",
    askQuestion: "השאלה שלך",
    askSend: "שליחת השאלה",
    askPolicy:
      "בשליחת השאלה הנך מסכים לכך שמערכת Jeschurun רשאית, לפי שיקול דעתה, לפרסם את השאלה ואת התשובה בצורה אנונימית. פרטים אישיים וכתובת הדוא״ל אינם מתפרסמים.",
    askEmailNote: "כתובת הדוא״ל משמשת רק למתן תשובה אישית ואינה מתפרסמת.",
    askSent: "השאלה התקבלה. תודה.",
    askSendError: "לא ניתן היה לשלוח את השאלה.",
    askSecurityLoading: "הגנת הספאם בהכנה…",
    search: "חיפוש",
    searchPlaceholder: "חיפוש בכל השפות…",
    searchButton: "חיפוש",
    searchResults: "תוצאות חיפוש",
    searchNoResults: "לא נמצאו תוצאות.",
    searchAlsoAvailable: "גם בשפות אחרות",
    notFound: "לא נמצא",
    notFoundBody: "הדף שביקשת לא נמצא.",
    latestArticles: "מאמרים אחרונים",
    latestQuestions: "שאל את הרב",
    latestBios: "רבנים ואישים",
    popular: "הנקראים ביותר",
    related: "לקריאה נוספת",
    tags: "נושאים",
    more: "לכל החומרים",
    home: "דף הבית",
    menu: "תפריט",
    backToTop: "לראש העמוד",
    a11yTitle: "נגישות",
    a11yOpen: "הגדרות נגישות",
    a11yFont: "גודל טקסט",
    a11yLine: "ריווח שורות",
    a11ySpacing: "ריווח אותיות",
    a11yContrast: "ניגודיות גבוהה",
    a11yMono: "גווני אפור",
    a11yLinks: "הדגשת קישורים",
    a11yHeadings: "הדגשת כותרות",
    a11yMotion: "הפחתת אנימציה",
    a11yCursor: "סמן גדול",
    a11yReadable: "גופן קריא",
    a11yColorBlind: "מסנן צבע",
    a11yNone: "ללא",
    a11yReset: "איפוס",
    a11yClose: "סגירה",
    candleTitle: "הדלקת נרות",
    candleChooseCity: "בחירת עיר",
    candleSearchPlaceholder: "חיפוש עיר…",
    current: "הגיליון הנוכחי",
    archive: "ארכיון",
    articles: "מאמרים",
    ask: "שאל את הרב",
    bios: "רבנים ואישים",
    about: "אודות",
    readIssue: "לפתיחת הגיליון",
    readArticle: "לקריאת המאמר",
    readAnswer: "לקריאת התשובה",
    inIssue: "בגיליון",
    download: "הגיליון להורדה",
    updated: "עודכן:",
    print: "הדפסה",
    printPage: "הדפסה",
    noIssue: "עדיין לא נבחר גיליון נוכחי שפורסם.",
    sort: "מיון",
    sortDateDesc: "חדשים תחילה",
    sortDateAsc: "ישנים תחילה",
    sortTitleAsc: "לפי כותרת",
    tagAll: "כל הנושאים",
    pagination: "עמודים",
    publisher: "עדת ישורון",
    publisherPlace: "חיפה",
    footerExplore: "מדורים",
    footerAbout: "אודות",
    footerLegal: "מידע משפטי",
    terms: "תנאי שימוש",
    privacy: "מדיניות פרטיות",
    cookies: "עוגיות",
    copyright: "©",
  },
  en: {
    askSubmit: "Submit a question",
    askSubmitTitle: "Submit a question to the Rav",
    askName: "Name (optional)",
    askEmail: "Email for a personal reply (optional)",
    askSubject: "Subject",
    askQuestion: "Your question",
    askSend: "Send question",
    askPolicy:
      "By submitting a question, you agree that the editors of Jeschurun may, at their discretion, publish the question and answer in anonymized form. Personal details and email addresses are not published.",
    askEmailNote: "Your email is used only for a personal reply and is never published.",
    askSent: "Your question has been received. Thank you.",
    askSendError: "The question could not be sent.",
    askSecurityLoading: "Preparing spam protection…",
    search: "Search",
    searchPlaceholder: "Search all languages…",
    searchButton: "Search",
    searchResults: "Search results",
    searchNoResults: "Nothing found.",
    searchAlsoAvailable: "Also available in other languages",
    notFound: "Not found",
    notFoundBody: "The page you requested was not found.",
    latestArticles: "Latest articles",
    latestQuestions: "Ask the Rav",
    latestBios: "Biographies",
    popular: "Most read",
    related: "Related reading",
    tags: "Topics",
    more: "View all",
    home: "Home",
    menu: "Menu",
    backToTop: "Back to top",
    a11yTitle: "Accessibility",
    a11yOpen: "Accessibility settings",
    a11yFont: "Text size",
    a11yLine: "Line height",
    a11ySpacing: "Letter spacing",
    a11yContrast: "High contrast",
    a11yMono: "Grayscale",
    a11yLinks: "Underline links",
    a11yHeadings: "Highlight headings",
    a11yMotion: "Reduce motion",
    a11yCursor: "Large cursor",
    a11yReadable: "Readable font",
    a11yColorBlind: "Color filter",
    a11yNone: "None",
    a11yReset: "Reset",
    a11yClose: "Close",
    candleTitle: "Candle lighting",
    candleChooseCity: "Choose city",
    candleSearchPlaceholder: "Search city…",
    current: "Current Issue",
    archive: "Archive",
    articles: "Articles",
    ask: "Ask the Rav",
    bios: "Biographies",
    about: "About",
    readIssue: "Open issue",
    readArticle: "Read article",
    readAnswer: "Read answer",
    inIssue: "In this issue",
    download: "Download issue",
    updated: "Updated:",
    print: "Print",
    printPage: "Print",
    noIssue: "No published current issue has been selected yet.",
    sort: "Sort",
    sortDateDesc: "Newest first",
    sortDateAsc: "Oldest first",
    sortTitleAsc: "By title",
    tagAll: "All topics",
    pagination: "Pages",
    publisher: "Adas Jeschurun",
    publisherPlace: "Haifa",
    footerExplore: "Sections",
    footerAbout: "About",
    footerLegal: "Legal",
    terms: "Terms of use",
    privacy: "Privacy policy",
    cookies: "Cookies",
    copyright: "©",
  },
  de: {
    askSubmit: "Frage senden",
    askSubmitTitle: "Eine Frage an den Rabbiner senden",
    askName: "Name (optional)",
    askEmail: "E-Mail für eine persönliche Antwort (optional)",
    askSubject: "Thema",
    askQuestion: "Ihre Frage",
    askSend: "Frage senden",
    askPolicy:
      "Mit dem Absenden der Frage erklären Sie sich damit einverstanden, dass die Redaktion von Jeschurun die Frage und die Antwort nach eigenem Ermessen in anonymisierter Form veröffentlichen kann.",
    askEmailNote: "Die E-Mail-Adresse wird nur für eine persönliche Antwort verwendet.",
    askSent: "Ihre Frage ist eingegangen. Vielen Dank.",
    askSendError: "Die Frage konnte nicht gesendet werden.",
    askSecurityLoading: "Spamschutz wird vorbereitet…",
    search: "Suche",
    searchPlaceholder: "In allen Sprachen suchen…",
    searchButton: "Suchen",
    searchResults: "Suchergebnisse",
    searchNoResults: "Keine Ergebnisse gefunden.",
    searchAlsoAvailable: "Auch in anderen Sprachen",
    notFound: "Nicht gefunden",
    notFoundBody: "Die angeforderte Seite wurde nicht gefunden.",
    latestArticles: "Neueste Artikel",
    latestQuestions: "Frage an den Rabbiner",
    latestBios: "Biographien",
    popular: "Meistgelesen",
    related: "Weiterlesen",
    tags: "Themen",
    more: "Alle anzeigen",
    home: "Startseite",
    menu: "Menü",
    backToTop: "Nach oben",
    a11yTitle: "Barrierefreiheit",
    a11yOpen: "Einstellungen zur Barrierefreiheit",
    a11yFont: "Textgröße",
    a11yLine: "Zeilenabstand",
    a11ySpacing: "Zeichenabstand",
    a11yContrast: "Hoher Kontrast",
    a11yMono: "Graustufen",
    a11yLinks: "Links unterstreichen",
    a11yHeadings: "Überschriften hervorheben",
    a11yMotion: "Weniger Bewegung",
    a11yCursor: "Großer Cursor",
    a11yReadable: "Lesbare Schrift",
    a11yColorBlind: "Farbfilter",
    a11yNone: "Keine",
    a11yReset: "Zurücksetzen",
    a11yClose: "Schließen",
    candleTitle: "Kerzenanzünden",
    candleChooseCity: "Stadt wählen",
    candleSearchPlaceholder: "Stadt suchen…",
    current: "Aktuelle Ausgabe",
    archive: "Archiv",
    articles: "Artikel",
    ask: "Frage an den Rabbiner",
    bios: "Biographien",
    about: "Über Jeschurun",
    readIssue: "Ausgabe öffnen",
    readArticle: "Artikel lesen",
    readAnswer: "Antwort lesen",
    inIssue: "In dieser Ausgabe",
    download: "Ausgabe herunterladen",
    updated: "Aktualisiert:",
    print: "Drucken",
    printPage: "Drucken",
    noIssue: "Noch keine veröffentlichte aktuelle Ausgabe ausgewählt.",
    sort: "Sortierung",
    sortDateDesc: "Neueste zuerst",
    sortDateAsc: "Älteste zuerst",
    sortTitleAsc: "Nach Titel",
    tagAll: "Alle Themen",
    pagination: "Seiten",
    publisher: "Adas Jeschurun",
    publisherPlace: "Haifa",
    footerExplore: "Rubriken",
    footerAbout: "Über uns",
    footerLegal: "Rechtliches",
    terms: "Nutzungsbedingungen",
    privacy: "Datenschutz",
    cookies: "Cookies",
    copyright: "©",
  },
  fr: {
    askSubmit: "Poser une question",
    askSubmitTitle: "Poser une question au rabbin",
    askName: "Nom (facultatif)",
    askEmail: "E-mail pour une réponse personnelle (facultatif)",
    askSubject: "Sujet",
    askQuestion: "Votre question",
    askSend: "Envoyer la question",
    askPolicy:
      "En envoyant une question, vous acceptez que la rédaction de Jeschurun puisse publier la question et la réponse sous une forme anonymisée.",
    askEmailNote: "L’adresse e-mail sert uniquement à une réponse personnelle.",
    askSent: "Votre question a bien été reçue. Merci.",
    askSendError: "La question n’a pas pu être envoyée.",
    askSecurityLoading: "Préparation de la protection antispam…",
    search: "Recherche",
    searchPlaceholder: "Rechercher dans toutes les langues…",
    searchButton: "Rechercher",
    searchResults: "Résultats de recherche",
    searchNoResults: "Aucun résultat.",
    searchAlsoAvailable: "Aussi disponible dans d’autres langues",
    notFound: "Introuvable",
    notFoundBody: "La page demandée est introuvable.",
    latestArticles: "Derniers articles",
    latestQuestions: "Question au rabbin",
    latestBios: "Biographies",
    popular: "Les plus lus",
    related: "À lire aussi",
    tags: "Sujets",
    more: "Voir tout",
    home: "Accueil",
    menu: "Menu",
    backToTop: "Haut de page",
    a11yTitle: "Accessibilité",
    a11yOpen: "Paramètres d’accessibilité",
    a11yFont: "Taille du texte",
    a11yLine: "Interligne",
    a11ySpacing: "Espacement des lettres",
    a11yContrast: "Contraste élevé",
    a11yMono: "Niveaux de gris",
    a11yLinks: "Souligner les liens",
    a11yHeadings: "Mettre en évidence les titres",
    a11yMotion: "Réduire les animations",
    a11yCursor: "Grand curseur",
    a11yReadable: "Police lisible",
    a11yColorBlind: "Filtre de couleur",
    a11yNone: "Aucun",
    a11yReset: "Réinitialiser",
    a11yClose: "Fermer",
    candleTitle: "Allumage des bougies",
    candleChooseCity: "Choisir une ville",
    candleSearchPlaceholder: "Rechercher une ville…",
    current: "Numéro actuel",
    archive: "Archives",
    articles: "Articles",
    ask: "Question au rabbin",
    bios: "Biographies",
    about: "À propos",
    readIssue: "Ouvrir le numéro",
    readArticle: "Lire l’article",
    readAnswer: "Lire la réponse",
    inIssue: "Dans ce numéro",
    download: "Télécharger le numéro",
    updated: "Mis à jour :",
    print: "Imprimer",
    printPage: "Imprimer",
    noIssue: "Aucun numéro actuel publié n’a encore été sélectionné.",
    sort: "Tri",
    sortDateDesc: "Plus récents",
    sortDateAsc: "Plus anciens",
    sortTitleAsc: "Par titre",
    tagAll: "Tous les sujets",
    pagination: "Pages",
    publisher: "Adas Jeschurun",
    publisherPlace: "Haïfa",
    footerExplore: "Rubriques",
    footerAbout: "À propos",
    footerLegal: "Mentions légales",
    terms: "Conditions d’utilisation",
    privacy: "Politique de confidentialité",
    cookies: "Cookies",
    copyright: "©",
  },
};

/** Simple legal page bodies (plain paragraphs). */
export const LEGAL = {
  terms: {
    ru: [
      "Сайт Jeschurun публикует материалы торанического журнала общины Адас Йешурун (Хайфа).",
      "Содержание предназначено для личного ознакомления. Перепечатка и коммерческое использование — только с разрешения редакции.",
      "Материалы отражают традицию учения рава Шимшона Рафаэля Гирша и продолжателей его пути; редакция может обновлять и исправлять тексты.",
      "По вопросам: ask@jeschurun.org.",
    ],
    he: [
      "אתר Jeschurun מפרסם חומרים מכתב העת התורני של עדת ישורון בחיפה.",
      "התוכן מיועד לעיון אישי. העתקה ושימוש מסחרי — רק באישור המערכת.",
      "החומרים משקפים את מסורת תורתו של רש״ר הירש וממשיכי דרכו; המערכת רשאית לעדכן ולתקן טקסטים.",
      "ליצירת קשר: ask@jeschurun.org.",
    ],
    en: [
      "Jeschurun publishes materials from the Torah journal of Adas Jeschurun in Haifa.",
      "Content is for personal study. Reprinting or commercial use requires editorial permission.",
      "Materials reflect the tradition of Rabbi Samson Raphael Hirsch and those who continue his path; the editors may update or correct texts.",
      "Contact: ask@jeschurun.org.",
    ],
    de: [
      "Jeschurun veröffentlicht Materialien der Tora-Zeitschrift von Adas Jeschurun in Haifa.",
      "Die Inhalte dienen dem persönlichen Studium. Nachdruck und kommerzielle Nutzung nur mit Erlaubnis der Redaktion.",
      "Die Texte stehen in der Tradition Rabbiner Samson Raphael Hirschs und seiner Nachfolger; die Redaktion kann Texte aktualisieren oder korrigieren.",
      "Kontakt: ask@jeschurun.org.",
    ],
    fr: [
      "Jeschurun publie des textes de la revue de Torah d’Adas Jeschurun à Haïfa.",
      "Le contenu est destiné à l’étude personnelle. Toute réimpression ou usage commercial nécessite l’autorisation de la rédaction.",
      "Les textes s’inscrivent dans la tradition du rabbin Samson Raphaël Hirsch et de ceux qui poursuivent sa voie ; la rédaction peut les mettre à jour ou les corriger.",
      "Contact : ask@jeschurun.org.",
    ],
  },
  privacy: {
    ru: [
      "Мы бережно относимся к данным посетителей и не ведём рекламных профилей.",
      "Форма «Вопрос раввину» принимает имя, email (необязательно) и текст вопроса. Email используется только для личного ответа и не публикуется. Вопрос и ответ могут быть опубликованы в обезличенном виде по решению редакции.",
      "Для защиты от спама используется Cloudflare Turnstile. Агрегированная статистика просмотров может сохраняться без привязки к личности.",
      "По вопросам о данных: ask@jeschurun.org.",
    ],
    he: [
      "אנו מכבדים את פרטיות המבקרים ואיננו בונים פרופילי פרסום.",
      "בטופס «שאל את הרב» ניתן למסור שם, דוא״ל (לא חובה) ואת נוסח השאלה. הדוא״ל משמש לתשובה אישית בלבד ואינו מתפרסם. השאלה והתשובה עשויות להתפרסם באופן אנונימי לפי שיקול דעת המערכת.",
      "להגנה מפני ספאם נעשה שימוש ב־Cloudflare Turnstile. ייתכן שימור סטטיסטיקת צפיות מצטברת ללא זיהוי אישי.",
      "לשאלות בנושא נתונים: ask@jeschurun.org.",
    ],
    en: [
      "We respect visitor privacy and do not build advertising profiles.",
      "The Ask the Rav form may collect a name, optional email, and the question text. Email is used only for a personal reply and is never published. Questions and answers may be published in anonymized form at the editors’ discretion.",
      "Cloudflare Turnstile helps prevent spam. Aggregated view counts may be stored without identifying individuals.",
      "Data questions: ask@jeschurun.org.",
    ],
    de: [
      "Wir achten die Privatsphäre der Besucher und erstellen keine Werbeprofile.",
      "Das Formular «Frage an den Rabbiner» kann Name, optional E-Mail und den Fragetext erfassen. Die E-Mail dient nur der persönlichen Antwort und wird nicht veröffentlicht. Frage und Antwort können anonymisiert veröffentlicht werden.",
      "Cloudflare Turnstile schützt vor Spam. Aggregierte Aufrufzahlen können ohne Personenbezug gespeichert werden.",
      "Fragen zu Daten: ask@jeschurun.org.",
    ],
    fr: [
      "Nous respectons la vie privée des visiteurs et ne construisons pas de profils publicitaires.",
      "Le formulaire « Question au rabbin » peut recueillir un nom, un e-mail facultatif et le texte de la question. L’e-mail sert uniquement à une réponse personnelle et n’est pas publié. Question et réponse peuvent être publiées sous forme anonymisée.",
      "Cloudflare Turnstile aide à prévenir le spam. Des compteurs de consultation agrégés peuvent être conservés sans identifier les personnes.",
      "Questions relatives aux données : ask@jeschurun.org.",
    ],
  },
  cookies: {
    ru: [
      "Сайт не использует рекламные cookie и не отслеживает вас для маркетинга.",
      "Могут применяться технические механизмы, необходимые для работы защиты от спама (Turnstile) и базовой работы сайта у вашего браузера.",
      "Вы можете ограничить или удалить cookie в настройках браузера; часть функций формы вопроса при этом может стать недоступной.",
    ],
    he: [
      "האתר אינו משתמש בעוגיות פרסום ואינו עוקב אחריך למטרות שיווק.",
      "ייתכנו מנגנונים טכניים הנדרשים להגנת ספאם (Turnstile) ולתפקוד בסיסי של האתר בדפדפן.",
      "ניתן להגביל או למחוק עוגיות בהגדרות הדפדפן; חלק מפונקציות טופס השאלה עלול שלא לפעול אז.",
    ],
    en: [
      "This site does not use advertising cookies and does not track you for marketing.",
      "Technical mechanisms required for spam protection (Turnstile) and basic site operation in your browser may apply.",
      "You can limit or delete cookies in your browser settings; parts of the question form may then stop working.",
    ],
    de: [
      "Diese Website verwendet keine Werbe-Cookies und trackt Sie nicht zu Marketingzwecken.",
      "Technische Mechanismen für den Spamschutz (Turnstile) und den grundlegenden Betrieb der Website in Ihrem Browser können zum Einsatz kommen.",
      "Cookies können in den Browsereinstellungen eingeschränkt oder gelöscht werden; Teile des Frageformulars funktionieren dann möglicherweise nicht.",
    ],
    fr: [
      "Ce site n’utilise pas de cookies publicitaires et ne vous suit pas à des fins marketing.",
      "Des mécanismes techniques nécessaires à la protection antispam (Turnstile) et au fonctionnement de base du site dans votre navigateur peuvent s’appliquer.",
      "Vous pouvez limiter ou supprimer les cookies dans les paramètres du navigateur ; certaines fonctions du formulaire de question peuvent alors cesser de fonctionner.",
    ],
  },
};
