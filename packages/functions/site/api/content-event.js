import { json } from "../_lib/json.js";

const TYPES = new Set(["article", "answer", "bio"]);
const EVENTS = new Set([
  "view",
  "print_click",
  "pdf_download",
  "epub_download",
  "share_whatsapp",
  "share_facebook",
  "share_telegram",
  "share_x",
  "share_email",
  "share_native",
  "copy_link",
  "related_click",
]);
const SOURCES = new Set([
  "",
  "home_latest",
  "home_questions",
  "home_biographies",
  "home_popular",
  "archive",
  "related",
]);
const LANGS = new Set(["he", "en", "ru", "de", "fr"]);
const ID = /^[A-Za-z0-9._-]+$/;

export async function onRequestPost({ request, env }) {
  try {
    const b = await request.json().catch(() => ({}));
    const content_id = String(b.content_id || "");
    const content_type = String(b.content_type || "");
    const language = String(b.language || "");
    const event = String(b.event || "");
    const source = String(b.source || "");
    if (
      !ID.test(content_id) ||
      !TYPES.has(content_type) ||
      !LANGS.has(language) ||
      !EVENTS.has(event) ||
      !SOURCES.has(source)
    ) {
      return json({ ok: false, error: "Bad event" }, 400);
    }
    if (!env.ANALYTICS_DB) return json({ ok: false, error: "analytics missing" }, 500);

    await env.ANALYTICS_DB.prepare(
      `INSERT INTO content_events_daily
        (event_date,content_id,content_type,language,event,source,count)
       VALUES(date('now'),?1,?2,?3,?4,?5,1)
       ON CONFLICT(event_date,content_id,content_type,language,event,source)
       DO UPDATE SET count=count+1`,
    )
      .bind(content_id, content_type, language, event, source)
      .run();

    return json({ ok: true, enabled: true });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}
