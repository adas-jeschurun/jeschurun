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
    latestArticles: "Последние статьи",
    latestQuestions: "Вопрос раввину",
    latestBios: "Биографии",
    popular: "Часто читаемые",
    related: "Читайте также",
    tags: "Темы",
    more: "Смотреть всё",
    home: "Главная",
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
    latestArticles: "מאמרים אחרונים",
    latestQuestions: "שאל את הרב",
    latestBios: "רבנים ואישים",
    popular: "הנקראים ביותר",
    related: "לקריאה נוספת",
    tags: "נושאים",
    more: "לכל החומרים",
    home: "דף הבית",
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
    latestArticles: "Latest articles",
    latestQuestions: "Ask the Rav",
    latestBios: "Biographies",
    popular: "Most read",
    related: "Related reading",
    tags: "Topics",
    more: "View all",
    home: "Home",
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
    latestArticles: "Neueste Artikel",
    latestQuestions: "Frage an den Rabbiner",
    latestBios: "Biographien",
    popular: "Meistgelesen",
    related: "Weiterlesen",
    tags: "Themen",
    more: "Alle anzeigen",
    home: "Startseite",
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
    latestArticles: "Derniers articles",
    latestQuestions: "Question au rabbin",
    latestBios: "Biographies",
    popular: "Les plus lus",
    related: "À lire aussi",
    tags: "Sujets",
    more: "Voir tout",
    home: "Accueil",
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
      "По вопросам: maky.rits@gmail.com.",
    ],
    he: [
      "אתר Jeschurun מפרסם חומרים מכתב העת התורני של עדת ישורון בחיפה.",
      "התוכן מיועד לעיון אישי. העתקה ושימוש מסחרי — רק באישור המערכת.",
      "החומרים משקפים את מסורת תורתו של רש״ר הירש וממשיכי דרכו; המערכת רשאית לעדכן ולתקן טקסטים.",
      "ליצירת קשר: maky.rits@gmail.com.",
    ],
    en: [
      "Jeschurun publishes materials from the Torah journal of Adas Jeschurun in Haifa.",
      "Content is for personal study. Reprinting or commercial use requires editorial permission.",
      "Materials reflect the tradition of Rabbi Samson Raphael Hirsch and those who continue his path; the editors may update or correct texts.",
      "Contact: maky.rits@gmail.com.",
    ],
    de: [
      "Jeschurun veröffentlicht Materialien der Tora-Zeitschrift von Adas Jeschurun in Haifa.",
      "Die Inhalte dienen dem persönlichen Studium. Nachdruck und kommerzielle Nutzung nur mit Erlaubnis der Redaktion.",
      "Die Texte stehen in der Tradition Rabbiner Samson Raphael Hirschs und seiner Nachfolger; die Redaktion kann Texte aktualisieren oder korrigieren.",
      "Kontakt: maky.rits@gmail.com.",
    ],
    fr: [
      "Jeschurun publie des textes de la revue de Torah d’Adas Jeschurun à Haïfa.",
      "Le contenu est destiné à l’étude personnelle. Toute réimpression ou usage commercial nécessite l’autorisation de la rédaction.",
      "Les textes s’inscrivent dans la tradition du rabbin Samson Raphaël Hirsch et de ceux qui poursuivent sa voie ; la rédaction peut les mettre à jour ou les corriger.",
      "Contact : maky.rits@gmail.com.",
    ],
  },
  privacy: {
    ru: [
      "Мы бережно относимся к данным посетителей и не ведём рекламных профилей.",
      "Форма «Вопрос раввину» принимает имя, email (необязательно) и текст вопроса. Email используется только для личного ответа и не публикуется. Вопрос и ответ могут быть опубликованы в обезличенном виде по решению редакции.",
      "Для защиты от спама используется Cloudflare Turnstile. Агрегированная статистика просмотров может сохраняться без привязки к личности.",
      "По вопросам о данных: maky.rits@gmail.com.",
    ],
    he: [
      "אנו מכבדים את פרטיות המבקרים ואיננו בונים פרופילי פרסום.",
      "בטופס «שאל את הרב» ניתן למסור שם, דוא״ל (לא חובה) ואת נוסח השאלה. הדוא״ל משמש לתשובה אישית בלבד ואינו מתפרסם. השאלה והתשובה עשויות להתפרסם באופן אנונימי לפי שיקול דעת המערכת.",
      "להגנה מפני ספאם נעשה שימוש ב־Cloudflare Turnstile. ייתכן שימור סטטיסטיקת צפיות מצטברת ללא זיהוי אישי.",
      "לשאלות בנושא נתונים: maky.rits@gmail.com.",
    ],
    en: [
      "We respect visitor privacy and do not build advertising profiles.",
      "The Ask the Rav form may collect a name, optional email, and the question text. Email is used only for a personal reply and is never published. Questions and answers may be published in anonymized form at the editors’ discretion.",
      "Cloudflare Turnstile helps prevent spam. Aggregated view counts may be stored without identifying individuals.",
      "Data questions: maky.rits@gmail.com.",
    ],
    de: [
      "Wir achten die Privatsphäre der Besucher und erstellen keine Werbeprofile.",
      "Das Formular «Frage an den Rabbiner» kann Name, optional E-Mail und den Fragetext erfassen. Die E-Mail dient nur der persönlichen Antwort und wird nicht veröffentlicht. Frage und Antwort können anonymisiert veröffentlicht werden.",
      "Cloudflare Turnstile schützt vor Spam. Aggregierte Aufrufzahlen können ohne Personenbezug gespeichert werden.",
      "Fragen zu Daten: maky.rits@gmail.com.",
    ],
    fr: [
      "Nous respectons la vie privée des visiteurs et ne construisons pas de profils publicitaires.",
      "Le formulaire « Question au rabbin » peut recueillir un nom, un e-mail facultatif et le texte de la question. L’e-mail sert uniquement à une réponse personnelle et n’est pas publié. Question et réponse peuvent être publiées sous forme anonymisée.",
      "Cloudflare Turnstile aide à prévenir le spam. Des compteurs de consultation agrégés peuvent être conservés sans identifier les personnes.",
      "Questions relatives aux données : maky.rits@gmail.com.",
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
