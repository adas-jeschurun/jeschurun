/** Friend-admin kinds ↔ D1 kinds */
export const LANGS = ["he", "en", "ru", "de", "fr"];

export function toDbKind(kind) {
  if (kind === "rabbi-answer" || kind === "answer") return "answer";
  if (kind === "biography" || kind === "bio") return "bio";
  if (kind === "article") return "article";
  if (kind === "issue") return "issue";
  return null;
}

export function toFriendKind(kind) {
  if (kind === "answer") return "rabbi-answer";
  if (kind === "bio") return "biography";
  return kind;
}

export function tableFor(dbKind) {
  return dbKind === "article"
    ? "articles"
    : dbKind === "answer"
      ? "answers"
      : dbKind === "bio"
        ? "bios"
        : dbKind === "issue"
          ? "issues"
          : null;
}

export function folderFor(dbKind) {
  return dbKind === "article"
    ? "articles"
    : dbKind === "answer"
      ? "rabbi-answers"
      : dbKind === "bio"
        ? "biographies"
        : dbKind === "issue"
          ? "issues"
          : null;
}

export function day(s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

export function safeSlug(s) {
  return typeof s === "string" && /^[A-Za-z0-9._-]+$/.test(s);
}
