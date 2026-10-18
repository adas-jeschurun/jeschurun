import { json, LANG_SET } from "../_lib/json.js";
import { notifyNewQuestion } from "../_lib/notify-question.js";

const plain = (v, max) =>
  String(v ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .slice(0, max);
const emailOk = (s) => !s || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254);

export async function onRequestPost({ request, env }) {
  try {
    if (!env.QUESTIONS_DB)
      return json({ ok: false, error: "Questions database is not configured" }, 503);
    if (!env.TURNSTILE_SECRET)
      return json({ ok: false, error: "Turnstile is not configured" }, 503);

    const b = await request.json().catch(() => null);
    if (!b || typeof b !== "object") return json({ ok: false, error: "Bad request" }, 400);

    // Honeypot: 200 ok, no DB row
    if (plain(b.website, 200).trim()) return json({ ok: true });

    const language = plain(b.language, 5);
    const name = plain(b.name, 100).trim();
    const email = plain(b.email, 254).trim();
    const subject = plain(b.subject, 160).trim();
    const question = plain(b.question, 10000).trim();
    const token = plain(b.turnstileToken, 2048);

    if (!LANG_SET.has(language)) return json({ ok: false, error: "Bad language" }, 400);
    if (subject.length < 3) return json({ ok: false, error: "Subject is too short" }, 400);
    if (question.length < 20) return json({ ok: false, error: "Question is too short" }, 400);
    if (!emailOk(email)) return json({ ok: false, error: "Bad email" }, 400);
    if (!token) return json({ ok: false, error: "Spam protection required" }, 400);

    const verifyBody = new URLSearchParams({
      secret: String(env.TURNSTILE_SECRET),
      response: token,
    });
    const vr = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: verifyBody,
      },
    );
    const verified = await vr.json().catch(() => ({ success: false }));
    if (!verified.success) return json({ ok: false, error: "Spam protection failed" }, 403);

    const id = crypto.randomUUID();
    await env.QUESTIONS_DB.prepare(
      `INSERT INTO incoming_questions
        (id,created_at,language,subject,question_text,name,reply_email,status,policy_version)
       VALUES(?1,datetime('now'),?2,?3,?4,?5,?6,'new','2026-08')`,
    )
      .bind(id, language, subject, question, name, email)
      .run();

    // Soft-fail: form success must not depend on email delivery
    await notifyNewQuestion(env, {
      id,
      language,
      name,
      email,
      subject,
      question,
    }).catch(() => {});

    return json({ ok: true, id });
  } catch {
    return json({ ok: false, error: "Server error" }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}
