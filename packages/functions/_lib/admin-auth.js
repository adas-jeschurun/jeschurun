import { json } from "./json.js";

/**
 * Fail-closed admin auth. Missing ADMIN_PREVIEW_TOKEN → 401.
 * Accept Authorization: Bearer <token> or Cookie: admin_token=<token>.
 */
export function requireAdmin(request, env) {
  const expected = env.ADMIN_PREVIEW_TOKEN;
  if (!expected || !String(expected).trim()) {
    return { ok: false, response: json({ ok: false, error: "Admin not configured" }, 401) };
  }
  const auth = request.headers.get("authorization") || "";
  let token = "";
  if (/^Bearer\s+/i.test(auth)) token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    const cookie = request.headers.get("cookie") || "";
    const m = cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
    if (m) token = decodeURIComponent(m[1].trim());
  }
  if (!token || token !== expected) {
    return { ok: false, response: json({ ok: false, error: "Unauthorized" }, 401) };
  }
  return { ok: true };
}
