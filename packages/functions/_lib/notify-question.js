/**
 * Soft-fail email notify for new Ask Rav questions.
 * Requires env.RESEND_API_KEY. Never throws to the caller.
 */
const FROM = "Ask Rav <ask@jeschurun.org>";
const TO = "rits.levi@gmail.com";

export async function notifyNewQuestion(env, row) {
  const key = env?.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true, reason: "no_key" };

  const subject = `[Ask Rav] ${row.subject || "(no subject)"}`;
  const lines = [
    `Language: ${row.language || "—"}`,
    `Name: ${row.name || "—"}`,
    `Reply-To: ${row.email || "—"}`,
    `Id: ${row.id || "—"}`,
    "",
    row.question || "",
  ];
  const payload = {
    from: FROM,
    to: [TO],
    subject: subject.slice(0, 200),
    text: lines.join("\n").slice(0, 12000),
  };
  if (row.email) payload.reply_to = row.email;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[notify-question] resend ${res.status}: ${body.slice(0, 200)}`,
      );
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[notify-question] ${e?.message || e}`);
    return { ok: false, error: true };
  }
}
