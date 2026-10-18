import he from "./he.md?raw";
import en from "./en.md?raw";
import ru from "./ru.md?raw";
import de from "./de.md?raw";
import fr from "./fr.md?raw";

/** Full About markdown bodies keyed by lang (exact store copies). */
export const ABOUT_MD = { he, en, ru, de, fr };

/** Drop leading `# …` so the page can own a single H1 via ui.about. */
export function stripLeadingH1(md) {
  return String(md || "").replace(/^#[^\n]*\n+/, "");
}
