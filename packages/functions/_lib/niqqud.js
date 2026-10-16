/** Hebrew niqqud + NFKD normalize for search. */
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
