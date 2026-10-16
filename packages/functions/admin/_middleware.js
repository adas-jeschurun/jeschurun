import { requireAdmin } from "./_lib/admin-auth.js";
import { json } from "./_lib/json.js";

const LOGIN_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>Jeschurun — вход в студию</title>
<style>
:root{--bg:#f3f0ea;--ink:#1f1d19;--line:#d9d1c5;--blue:#24527f}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(160deg,#f7f2e8,#e7eef5 55%,#f3efe6);color:var(--ink);font-family:Georgia,"Times New Roman",serif}
.card{width:min(420px,92vw);background:#fff;border:1px solid var(--line);border-radius:16px;padding:28px 24px;box-shadow:0 8px 40px #00000012}
.brand{font-size:1.6rem;margin:0 0 4px}.sub{color:#716a61;margin:0 0 22px;font:500 .9rem/1.4 system-ui,sans-serif}
label{display:block;font:650 .78rem/1.2 system-ui,sans-serif;color:#716a61;margin-bottom:6px}
input{width:100%;padding:12px;border:1px solid #cbc2b6;border-radius:10px;font:1rem/1.3 system-ui,sans-serif}
button{margin-top:14px;width:100%;padding:12px;border:0;border-radius:10px;background:var(--blue);color:#fff;font:750 .95rem system-ui,sans-serif;cursor:pointer}
.err{color:#9f2929;font:600 .85rem system-ui,sans-serif;margin-top:10px;display:none}
.note{margin-top:16px;font:500 .78rem/1.4 system-ui,sans-serif;color:#716a61}
</style>
</head>
<body>
<form class="card" id="f" method="post" action="/api/login">
  <h1 class="brand">ישורון</h1>
  <p class="sub">Jeschurun — издательская студия</p>
  <label for="token">ADMIN_PREVIEW_TOKEN</label>
  <input id="token" name="token" type="password" autocomplete="current-password" required autofocus/>
  <button type="submit">Войти</button>
  <p class="err" id="err">Неверный токен</p>
  <p class="note">Токен хранится в cookie <code>admin_token</code> (SameSite=Strict). API без токена отвечает 401 JSON.</p>
</form>
<script>
const f=document.getElementById('f'),err=document.getElementById('err');
f.onsubmit=async(e)=>{
  e.preventDefault();err.style.display='none';
  const token=document.getElementById('token').value.trim();
  const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.ok){err.style.display='block';err.textContent=j.error||'Неверный токен';return}
  location.href='/';
};
</script>
</body>
</html>`;

function isLoginShellPath(pathname) {
  return pathname === "/" || pathname === "/index.html";
}

function isStaticAsset(pathname) {
  if (pathname.startsWith("/assets/")) return true;
  return /\.(js|css|ico|svg|png|jpg|jpeg|webp|woff2?|map|txt)$/i.test(pathname);
}

function withSecurity(res) {
  const headers = new Headers(res.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Cache-Control", "no-store");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function loginPage() {
  return withSecurity(
    new Response(LOGIN_HTML, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  );
}

/**
 * Fail-closed ADMIN_PREVIEW_TOKEN.
 * Unauthenticated GET /|/index.html → HTML login (200).
 * Unauthenticated /api/* → 401 JSON.
 * Static assets pass through; authenticated requests continue.
 */
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/login" && request.method === "POST") {
    return withSecurity(await context.next());
  }

  if (isStaticAsset(path)) {
    return withSecurity(await context.next());
  }

  const gate = requireAdmin(request, context.env);
  if (!gate.ok) {
    if (request.method === "GET" && isLoginShellPath(path)) {
      return loginPage();
    }
    // Other SPA navigations without auth also get the login shell (browser UX).
    if (request.method === "GET" && !path.startsWith("/api/")) {
      return loginPage();
    }
    return withSecurity(gate.response || json({ ok: false, error: "Unauthorized" }, 401));
  }

  return withSecurity(await context.next());
}
