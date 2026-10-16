import { json } from "../_lib/json.js";

export async function onRequestPost({ request, env }) {
  const expected = env.ADMIN_PREVIEW_TOKEN;
  if (!expected || !String(expected).trim()) {
    return json({ ok: false, error: "Admin not configured" }, 401);
  }
  let token = "";
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const b = await request.json().catch(() => ({}));
    token = String(b.token || "").trim();
  } else {
    const form = await request.formData().catch(() => null);
    token = String(form?.get("token") || "").trim();
  }
  if (!token || token !== expected) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  // Not HttpOnly: studio builds jes-v2-site preview links with ?admin_preview=
  const cookie = `admin_token=${encodeURIComponent(token)}; Path=/; Secure; SameSite=Strict; Max-Age=2592000`;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": cookie,
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export async function onRequestDelete({ env }) {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": "admin_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
      "cache-control": "no-store",
    },
  });
}
