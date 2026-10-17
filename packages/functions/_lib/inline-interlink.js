/**
 * Automatic in-body markdown links to other site materials.
 * Idempotent: strips prior auto-links, then re-applies.
 */

const AUTO_HREF =
  /\[([^\]]+)\]\(\/(he|en|ru|de|fr)\/(article|answer|biography)\/[A-Za-z0-9._-]+\/\)/g;

const MIN_PHRASE = 4;
const MAX_LINKS_PER_BODY = 5;

export function materialHref(kind, slug, lang) {
  const seg =
    kind === "article" ? "article" : kind === "answer" ? "answer" : "biography";
  return `/${lang}/${seg}/${slug}/`;
}

export function stripAutoInterlinks(md) {
  return String(md || "").replace(AUTO_HREF, "$1");
}

const STOP_FIRST = /^(The|A|An|Der|Die|Das|Le|La|Les|Un|Une|El|L'|L’)$/i;

export function titleAliases(title) {
  const t = String(title || "").trim();
  const out = new Set();
  if (t.length >= MIN_PHRASE) out.add(t);
  const stripped = t
    .replace(/^(The|A|An|Der|Die|Das|Le|La|Les|Un|Une|El|L'|L’)\s+/i, "")
    .trim();
  if (stripped.length >= MIN_PHRASE) out.add(stripped);
  // Multi-word proper names only (e.g. Sarah Schenirer) — skip "The Time".
  const proper = t.match(
    /([A-ZÀ-ÖØ-ÞА-ЯЁ][\p{L}'’.-]+(?:\s+[A-ZÀ-ÖØ-ÞА-ЯЁ][\p{L}'’.-]+)+)/u,
  );
  if (proper?.[1] && proper[1].length >= 10) {
    const words = proper[1].split(/\s+/);
    if (words.length >= 2 && !STOP_FIRST.test(words[0])) out.add(proper[1]);
  }
  if (/[\u0590-\u05FF]/.test(t) && t.length >= MIN_PHRASE) out.add(t);
  return [...out];
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseRegex(phrase) {
  const p = String(phrase);
  const esc = escapeRe(p);
  if (/[A-Za-zÀ-ÿ]/.test(p) && !/[\u0590-\u05FF]/.test(p)) {
    return new RegExp(`(?<![A-Za-zÀ-ÖØ-öø-ÿ])${esc}(?![A-Za-zÀ-ÖØ-öø-ÿ])`, "i");
  }
  if (/[\u0590-\u05FF]/.test(p)) {
    return new RegExp(`(?<![\\u0590-\\u05FF])${esc}(?![\\u0590-\\u05FF])`);
  }
  if (/[А-Яа-яЁё]/.test(p)) {
    return new RegExp(`(?<![А-Яа-яЁё])${esc}(?![А-Яа-яЁё])`, "i");
  }
  return new RegExp(esc, "i");
}

/**
 * @param {string} bodyMd
 * @param {{ phrase: string, href: string, priority?: number }[]} candidates
 * @param {{ maxLinks?: number }} [opts]
 * @returns {{ md: string, count: number, changed: boolean }}
 */
export function applyInlineInterlinks(bodyMd, candidates, opts = {}) {
  const maxLinks = opts.maxLinks ?? MAX_LINKS_PER_BODY;
  const original = String(bodyMd || "");
  let work = stripAutoInterlinks(original);

  const placeholders = [];
  work = work.replace(/!\[[^\]]*\]\([^)]+\)/g, (m) => {
    placeholders.push(m);
    return `\0IMG${placeholders.length - 1}\0`;
  });
  work = work.replace(/\[[^\]]*\]\([^)]+\)/g, (m) => {
    placeholders.push(m);
    return `\0LNK${placeholders.length - 1}\0`;
  });

  const sorted = [...(candidates || [])]
    .filter((c) => c?.phrase && c?.href && String(c.phrase).length >= MIN_PHRASE)
    .sort(
      (a, b) =>
        (b.priority || 0) - (a.priority || 0) ||
        String(b.phrase).length - String(a.phrase).length,
    );

  const usedHref = new Set();
  const usedPhrase = new Set();
  let count = 0;

  for (const c of sorted) {
    if (count >= maxLinks) break;
    const phrase = String(c.phrase).trim();
    const key = phrase.toLowerCase();
    if (usedPhrase.has(key) || usedHref.has(c.href)) continue;
    let re;
    try {
      re = phraseRegex(phrase);
    } catch {
      continue;
    }
    const m = work.match(re);
    if (!m || m.index == null) continue;
    const matched = m[0];
    const before = work.slice(0, m.index);
    const after = work.slice(m.index + matched.length);
    work = `${before}[${matched}](${c.href})${after}`;
    usedPhrase.add(key);
    usedHref.add(c.href);
    count++;
  }

  work = work.replace(/\0(?:IMG|LNK)(\d+)\0/g, (_, i) => placeholders[Number(i)] || "");

  return { md: work, count, changed: work !== original };
}

/**
 * Build link candidates for one body from catalog rows.
 * @param {object} args
 */
export function buildInterlinkCandidates({
  selfId,
  selfKind = "article",
  selfTitle = "",
  lang,
  materials,
  tagByMaterial,
  labelByTag,
  relatedIds,
}) {
  const myTags = new Set(tagByMaterial?.get?.(selfId) || []);
  const related = relatedIds || new Set();
  const selfTitleLc = String(selfTitle || "").toLowerCase();
  const out = [];

  function usable(phrase) {
    const p = String(phrase || "").trim();
    if (p.length < MIN_PHRASE) return false;
    // Avoid linking phrases that are part of this material's own title.
    if (selfTitleLc && selfTitleLc.includes(p.toLowerCase()) && p.length < 24) {
      return false;
    }
    return true;
  }

  for (const mat of materials || []) {
    if (mat.id === selfId && mat.kind === selfKind) continue;
    const title = mat.titles?.[lang] || "";
    const prefer = related.has(mat.id) ? 100 : mat.kind === "article" ? 20 : 5;
    for (const phrase of titleAliases(title)) {
      if (!usable(phrase)) continue;
      // Full titles preferred; short answer-title fragments are noisy.
      if (mat.kind !== "article" && phrase.length < 16 && phrase.split(/\s+/).length < 3) {
        continue;
      }
      out.push({
        phrase,
        href: materialHref(mat.kind, mat.slug, lang),
        priority: prefer + phrase.length,
      });
    }
  }

  for (const tagSlug of myTags) {
    const labels = labelByTag?.get?.(tagSlug) || {};
    const lab = labels[lang] || labels.en || "";
    if (!usable(lab) || lab.length < 5) continue;
    // Prefer a related article that shares this tag; else any other.
    let target = null;
    for (const mid of related) {
      if ((tagByMaterial?.get?.(mid) || new Set()).has(tagSlug)) {
        const mat = (materials || []).find((x) => x.id === mid && x.kind === "article");
        if (mat) {
          target = mat;
          break;
        }
      }
    }
    if (!target) {
      for (const [mid, tags] of tagByMaterial || []) {
        if (mid === selfId) continue;
        if (tags.has(tagSlug)) {
          const mat = (materials || []).find((x) => x.id === mid && x.kind === "article");
          if (mat) {
            target = mat;
            break;
          }
        }
      }
    }
    if (!target) continue;
    out.push({
      phrase: lab,
      href: materialHref("article", target.slug, lang),
      priority: 50 + lab.length,
    });
  }

  return out;
}
