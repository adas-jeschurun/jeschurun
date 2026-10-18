import { useEffect, useState } from "react";

const THRESHOLD = 400;

export function BackToTop({ label = "Back to top" }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > THRESHOLD);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="chrome-fab back-to-top"
      data-back-to-top
      aria-label={label}
      title={label}
      onClick={() => {
        const reduce =
          document.documentElement.classList.contains("a11y-pause-animations") ||
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        const main = document.getElementById("main-content");
        if (main) {
          if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
          main.focus({ preventScroll: true });
        }
      }}
    >
      ↑
    </button>
  );
}
