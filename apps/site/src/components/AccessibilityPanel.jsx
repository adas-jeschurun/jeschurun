import { useEffect, useId, useState } from "react";
import {
  DEFAULT_A11Y,
  applyA11y,
  loadA11y,
  saveA11y,
} from "./a11y.js";

export function AccessibilityPanel({ ui }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(DEFAULT_A11Y);
  const titleId = useId();

  useEffect(() => {
    const s = loadA11y();
    setState(s);
    applyA11y(s);
  }, []);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-a11y-open", open);
    return () => document.documentElement.removeAttribute("data-a11y-open");
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const update = (patch) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      saveA11y(next);
      applyA11y(next);
      return next;
    });
  };

  const reset = () => {
    saveA11y(DEFAULT_A11Y);
    applyA11y(DEFAULT_A11Y);
    setState({ ...DEFAULT_A11Y });
  };

  const t = {
    title: ui.a11yTitle || "Accessibility",
    open: ui.a11yOpen || "Accessibility settings",
    font: ui.a11yFont || "Text size",
    line: ui.a11yLine || "Line height",
    spacing: ui.a11ySpacing || "Letter spacing",
    contrast: ui.a11yContrast || "High contrast",
    mono: ui.a11yMono || "Grayscale",
    links: ui.a11yLinks || "Underline links",
    headings: ui.a11yHeadings || "Highlight headings",
    motion: ui.a11yMotion || "Reduce motion",
    cursor: ui.a11yCursor || "Large cursor",
    readable: ui.a11yReadable || "Readable font",
    colorBlind: ui.a11yColorBlind || "Color filter",
    none: ui.a11yNone || "None",
    reset: ui.a11yReset || "Reset",
    close: ui.a11yClose || "Close",
  };

  return (
    <>
      <button
        type="button"
        className="chrome-fab a11y-fab"
        aria-label={t.open}
        aria-expanded={open}
        aria-controls="jes-a11y-panel"
        title={t.open}
        onClick={() => setOpen((v) => !v)}
      >
        A
      </button>

      {open ? (
        <div
          className="a11y-scrim"
          role="presentation"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div
        id="jes-a11y-panel"
        className={`a11y-panel${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        hidden={!open}
      >
        <div className="a11y-panel-head">
          <h2 id={titleId}>{t.title}</h2>
          <button type="button" className="button" onClick={() => setOpen(false)}>
            {t.close}
          </button>
        </div>

        <div className="a11y-row">
          <span>{t.font}</span>
          <div className="a11y-stepper">
            <button
              type="button"
              className="button"
              onClick={() => update({ fontScale: Math.max(-2, state.fontScale - 1) })}
              aria-label="−"
            >
              −
            </button>
            <span>{state.fontScale}</span>
            <button
              type="button"
              className="button"
              onClick={() => update({ fontScale: Math.min(4, state.fontScale + 1) })}
              aria-label="+"
            >
              +
            </button>
          </div>
        </div>

        <div className="a11y-row">
          <span>{t.line}</span>
          <div className="a11y-stepper">
            <button
              type="button"
              className="button"
              onClick={() => update({ lineHeight: Math.max(0, state.lineHeight - 1) })}
            >
              −
            </button>
            <span>{state.lineHeight}</span>
            <button
              type="button"
              className="button"
              onClick={() => update({ lineHeight: Math.min(3, state.lineHeight + 1) })}
            >
              +
            </button>
          </div>
        </div>

        <div className="a11y-row">
          <span>{t.spacing}</span>
          <div className="a11y-stepper">
            <button
              type="button"
              className="button"
              onClick={() =>
                update({ letterSpacing: Math.max(0, state.letterSpacing - 1) })
              }
            >
              −
            </button>
            <span>{state.letterSpacing}</span>
            <button
              type="button"
              className="button"
              onClick={() =>
                update({ letterSpacing: Math.min(3, state.letterSpacing + 1) })
              }
            >
              +
            </button>
          </div>
        </div>

        {[
          ["highContrast", t.contrast],
          ["monochrome", t.mono],
          ["highlightLinks", t.links],
          ["highlightHeadings", t.headings],
          ["pauseAnimations", t.motion],
          ["bigCursor", t.cursor],
          ["readableFont", t.readable],
        ].map(([key, label]) => (
          <label key={key} className="a11y-toggle">
            <input
              type="checkbox"
              checked={!!state[key]}
              onChange={(e) => update({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}

        <label className="a11y-row a11y-select-row">
          <span>{t.colorBlind}</span>
          <select
            value={state.colorBlind || ""}
            onChange={(e) => update({ colorBlind: e.target.value })}
          >
            <option value="">{t.none}</option>
            <option value="protanopia">Protanopia</option>
            <option value="deuteranopia">Deuteranopia</option>
            <option value="tritanopia">Tritanopia</option>
          </select>
        </label>

        <button type="button" className="button" onClick={reset}>
          {t.reset}
        </button>
      </div>

      {/* SVG filters for color-blind modes */}
      <svg className="a11y-filters" aria-hidden="true" focusable="false">
        <defs>
          <filter id="a11y-protanopia">
            <feColorMatrix
              type="matrix"
              values="0.567,0.433,0,0,0 0.558,0.442,0,0,0 0,0.242,0.758,0,0 0,0,0,1,0"
            />
          </filter>
          <filter id="a11y-deuteranopia">
            <feColorMatrix
              type="matrix"
              values="0.625,0.375,0,0,0 0.7,0.3,0,0,0 0,0.3,0.7,0,0 0,0,0,1,0"
            />
          </filter>
          <filter id="a11y-tritanopia">
            <feColorMatrix
              type="matrix"
              values="0.95,0.05,0,0,0 0,0.433,0.567,0,0 0,0.475,0.525,0,0 0,0,0,1,0"
            />
          </filter>
        </defs>
      </svg>
    </>
  );
}
