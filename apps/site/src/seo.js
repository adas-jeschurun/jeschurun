/** DOM helpers for document title + meta description (extends Layout useSeoHead). */

export function setDocumentTitle(title) {
  if (title) document.title = title;
}

export function setMetaDescription(content) {
  let el = document.querySelector('meta[name="description"]');
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", "description");
    document.head.appendChild(el);
  }
  el.setAttribute("content", String(content || "").slice(0, 320));
}

export function clearMetaDescription() {
  const el = document.querySelector('meta[name="description"]');
  if (el) el.setAttribute("content", "");
}
