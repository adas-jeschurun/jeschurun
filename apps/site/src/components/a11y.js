/** Shared a11y prefs: localStorage `jes-a11y` + html class sync. */

export const A11Y_KEY = "jes-a11y";

export const DEFAULT_A11Y = {
  fontScale: 0,
  lineHeight: 0,
  letterSpacing: 0,
  highContrast: false,
  monochrome: false,
  highlightLinks: false,
  highlightHeadings: false,
  pauseAnimations: false,
  bigCursor: false,
  readableFont: false,
  colorBlind: "",
};

const FONT = [
  "a11y-font--2",
  "a11y-font--1",
  "",
  "a11y-font-1",
  "a11y-font-2",
  "a11y-font-3",
  "a11y-font-4",
];
const COLOR_BLIND = ["protanopia", "deuteranopia", "tritanopia"];

export function loadA11y() {
  try {
    const raw = localStorage.getItem(A11Y_KEY);
    if (!raw) return { ...DEFAULT_A11Y };
    return { ...DEFAULT_A11Y, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_A11Y };
  }
}

export function saveA11y(state) {
  try {
    localStorage.setItem(A11Y_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function applyA11y(state) {
  const r = document.documentElement;
  let fs = Math.round(Number(state.fontScale) || 0);
  if (fs < -2) fs = -2;
  if (fs > 4) fs = 4;
  let lh = Math.round(Number(state.lineHeight) || 0);
  if (lh < 0) lh = 0;
  if (lh > 3) lh = 3;
  let ls = Math.round(Number(state.letterSpacing) || 0);
  if (ls < 0) ls = 0;
  if (ls > 3) ls = 3;

  FONT.filter(Boolean).forEach((c) => r.classList.remove(c));
  if (fs) {
    const fc = FONT[fs + 2];
    if (fc) r.classList.add(fc);
  }

  ["a11y-line-1", "a11y-line-2", "a11y-line-3"].forEach((c) =>
    r.classList.remove(c),
  );
  if (lh > 0) r.classList.add(`a11y-line-${lh}`);

  ["a11y-spacing-1", "a11y-spacing-2", "a11y-spacing-3"].forEach((c) =>
    r.classList.remove(c),
  );
  if (ls > 0) r.classList.add(`a11y-spacing-${ls}`);

  r.classList.toggle("a11y-high-contrast", !!state.highContrast);
  r.classList.toggle("a11y-monochrome", !!state.monochrome);
  r.classList.toggle("a11y-highlight-links", !!state.highlightLinks);
  r.classList.toggle("a11y-highlight-headings", !!state.highlightHeadings);
  r.classList.toggle("a11y-pause-animations", !!state.pauseAnimations);
  r.classList.toggle("a11y-big-cursor", !!state.bigCursor);
  r.classList.toggle("a11y-readable-font", !!state.readableFont);

  COLOR_BLIND.forEach((c) => r.classList.remove(`a11y-${c}`));
  if (COLOR_BLIND.includes(state.colorBlind)) {
    r.classList.add(`a11y-${state.colorBlind}`);
  }
}
