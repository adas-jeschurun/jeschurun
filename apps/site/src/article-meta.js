import { HDate } from "@hebcal/core";

/** updated_at when set, otherwise published_at. */
export function materialDateSource(material) {
  const updated = String(material?.updated_at || "").trim();
  if (updated) return updated;
  return String(material?.published_at || "").trim();
}

export function parseCivilDate(iso) {
  const m = String(iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function gregorianDate(iso, lang) {
  const d = parseCivilDate(iso);
  if (!d) return "";
  const locale = lang || "en";
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(d);
  }
}

export function hebrewDate(iso) {
  const d = parseCivilDate(iso);
  if (!d) return "";
  return new HDate(d).renderGematriya(false);
}

export function updatedDateLine(material, lang, label) {
  const iso = materialDateSource(material);
  const g = gregorianDate(iso, lang);
  const h = hebrewDate(iso);
  if (!g && !h) return "";
  const prefix = String(label || "").trim();
  return `${prefix} ${[g, h].filter(Boolean).join(" · ")}`.trim();
}

export function articlePrintPath(lang, slug) {
  return `/${lang}/article/${slug}/print/`;
}

export function articlePublicUrl(lang, slug) {
  return `https://jeschurun.org/${lang}/article/${slug}/`;
}

/** PDF and EPUB for the active language only. Missing files are omitted. */
export function issueDownloadLinks(issue, lang) {
  const dl = issue?.downloads?.[lang] || {};
  const base = `content/issues/${issue?.hebrew_year}/${issue?.slug}`;
  const files = [];
  if (dl.pdf) {
    files.push({
      kind: "pdf",
      label: "PDF",
      href: `/api/file?path=${encodeURIComponent(`${base}/${dl.pdf}`)}`,
    });
  }
  if (dl.epub) {
    files.push({
      kind: "epub",
      label: "EPUB",
      href: `/api/file?path=${encodeURIComponent(`${base}/${dl.epub}`)}`,
    });
  }
  return files;
}

/** Previous published issues. The current issue is left out. */
export function pastPublishedIssues(issues, currentIssue) {
  const currentId = currentIssue?.id;
  return (issues || []).filter(
    (iss) => iss && iss.id !== currentId && iss.status !== "draft" && iss.status !== "hidden",
  );
}
