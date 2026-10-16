import { requireAdmin } from "./_lib/admin-auth.js";
import { json } from "./_lib/json.js";

/** Fail-closed ADMIN_PREVIEW_TOKEN on ALL routes (GET + write). */
export async function onRequest(context) {
  const gate = requireAdmin(context.request, context.env);
  if (!gate.ok) return gate.response;
  const res = await context.next();
  const headers = new Headers(res.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Cache-Control", "no-store");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
