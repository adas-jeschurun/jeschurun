import { json, LANGS } from "../_lib/json.js";
import { tableFor } from "../_lib/kinds.js";

const MAX_FILES = 250;
const MAX_BODY = 35 * 1024 * 1024;

function stripStaging(path) {
  return String(path || "").replace(/^staging\//, "");
}

function decodeBytes(f) {
  if (typeof f.base64 === "string") {
    const bin = atob(f.base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new TextEncoder().encode(String(f.text || ""));
}

function guessCt(path) {
  if (/\.md$/i.test(path)) return "text/markdown; charset=utf-8";
  if (/\.json$/i.test(path)) return "application/json";
  if (/\.pdf$/i.test(path)) return "application/pdf";
  if (/\.epub$/i.test(path)) return "application/epub+zip";
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.jpe?g$/i.test(path)) return "image/jpeg";
  if (/\.webp$/i.test(path)) return "image/webp";
  if (/\.gif$/i.test(path)) return "image/gif";
  if (/\.svg$/i.test(path)) return "image/svg+xml";
  return "application/octet-stream";
}

async function sha256Hex(buf) {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function upsertMaterialFromMeta(db, meta, folder) {
  const dbKind =
    folder === "articles"
      ? "article"
      : folder === "rabbi-answers"
        ? "answer"
        : folder === "biographies"
          ? "bio"
          : null;
  if (!dbKind) return null;
  const table = tableFor(dbKind);
  const id = meta.id || meta.slug;
  const slug = meta.slug || id;
  const now = new Date().toISOString();
  const status = meta.status || "draft";
  const source_issue = meta.source_issue || "";
  const published_at = meta.published_at || meta.date || "";
  if (dbKind === "article") {
    await db
      .prepare(
        `INSERT INTO articles(id,slug,status,source_issue,published_at,updated_at,lead_image,meta_json)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
         ON CONFLICT(id) DO UPDATE SET
           slug=excluded.slug,status=excluded.status,source_issue=excluded.source_issue,
           published_at=excluded.published_at,updated_at=excluded.updated_at,meta_json=excluded.meta_json`,
      )
      .bind(id, slug, status, source_issue, published_at, now, meta.lead_image || "", "{}")
      .run();
  } else if (dbKind === "answer") {
    await db
      .prepare(
        `INSERT INTO answers(id,slug,status,source_issue,published_at,updated_at,meta_json)
         VALUES(?1,?2,?3,?4,?5,?6,?7)
         ON CONFLICT(id) DO UPDATE SET
           slug=excluded.slug,status=excluded.status,source_issue=excluded.source_issue,
           published_at=excluded.published_at,updated_at=excluded.updated_at,meta_json=excluded.meta_json`,
      )
      .bind(id, slug, status, source_issue, published_at, now, "{}")
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO bios(id,slug,status,years,published_at,updated_at,meta_json)
         VALUES(?1,?2,?3,?4,?5,?6,?7)
         ON CONFLICT(id) DO UPDATE SET
           slug=excluded.slug,status=excluded.status,years=excluded.years,
           published_at=excluded.published_at,updated_at=excluded.updated_at,meta_json=excluded.meta_json`,
      )
      .bind(id, slug, status, meta.years || "", published_at, now, "{}")
      .run();
  }

  // language meta titles into translations (body filled from .md files)
  for (const l of LANGS) {
    const info = meta.languages?.[l] || {};
    const title =
      dbKind === "bio" ? info.name || "" : info.title || "";
    const summary = dbKind === "answer" ? info.question || "" : info.summary || "";
    const extra =
      dbKind === "answer" ? { question: info.question || "" } : {};
    const tid = `${dbKind}:${id}:${l}`;
    const existing = await db
      .prepare(`SELECT body_md FROM translations WHERE id=?1`)
      .bind(tid)
      .first();
    await db
      .prepare(
        `INSERT INTO translations(id,kind,parent_id,lang,title,summary,body_md,body_text,extra_json)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title,summary=excluded.summary,extra_json=excluded.extra_json`,
      )
      .bind(
        tid,
        dbKind,
        id,
        l,
        title,
        summary,
        existing?.body_md || "",
        existing?.body_md || "",
        JSON.stringify(extra),
      )
      .run();
  }
  return { dbKind, id, slug };
}

async function upsertIssue(db, data) {
  const id = data.id || `${data.hebrew_year}-${data.slug}`;
  const slug = data.slug;
  const year = Number(data.hebrew_year || 0);
  await db
    .prepare(
      `INSERT INTO issues(id,hebrew_year,slug,parasha_key,published_at,status,sort_order,meta_json)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
       ON CONFLICT(id) DO UPDATE SET
         hebrew_year=excluded.hebrew_year,slug=excluded.slug,parasha_key=excluded.parasha_key,
         published_at=excluded.published_at,status=excluded.status,meta_json=excluded.meta_json`,
    )
    .bind(
      id,
      year,
      slug,
      data.parasha_key || slug,
      data.published_at || data.date || "",
      data.status || "draft",
      data.sort_order || 0,
      JSON.stringify({
        languages: data.languages || {},
        downloads: data.downloads || {},
        articles: data.articles || [],
        rabbi_answers: data.rabbi_answers || [],
        biographies: data.biographies || [],
      }),
    )
    .run();

  for (const l of LANGS) {
    const info = data.languages?.[l] || {};
    const tid = `issue:${id}:${l}`;
    await db
      .prepare(
        `INSERT INTO translations(id,kind,parent_id,lang,title,summary,body_md,body_text,extra_json)
         VALUES(?1,'issue',?2,?3,?4,?5,?6,?7,?8)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title,summary=excluded.summary,body_md=excluded.body_md,
           body_text=excluded.body_text,extra_json=excluded.extra_json`,
      )
      .bind(
        tid,
        id,
        l,
        info.title || "",
        info.summary || "",
        info.issue_intro || "",
        info.issue_intro || "",
        JSON.stringify({
          parasha: info.parasha || "",
          kicker: info.kicker || "",
        }),
      )
      .run();
  }

  if (data.current) {
    await db
      .prepare(
        `INSERT INTO site_config(key,value) VALUES('current_issue',?1)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      )
      .bind(id)
      .run();
  }
  return { id, slug };
}

/**
 * Friend-compatible save: accepts staging/content/... files, writes D1 + R2.
 * No GitHub writes.
 */
export async function onRequestPost({ request, env }) {
  try {
    if (!env.CONTENT_DB) return json({ ok: false, error: "CONTENT_DB missing" }, 500);
    const len = Number(request.headers.get("content-length") || 0);
    if (len > MAX_BODY) return json({ ok: false, error: "Payload too large" }, 413);
    const body = await request.json();
    const files = body.files;
    if (!Array.isArray(files) || !files.length) {
      return json({ ok: false, error: "Нет файлов для сохранения" }, 400);
    }
    if (files.length > MAX_FILES) {
      return json({ ok: false, error: `Слишком много файлов (${files.length})` }, 400);
    }

    const paths = [];
    const mdByKey = new Map();
    const metas = [];
    let issuePayload = null;
    let currentFlag = !!body.current;

    for (const f of files) {
      const logical = stripStaging(f.path);
      if (!logical.startsWith("content/") || logical.includes("..")) {
        return json({ ok: false, error: "Путь должен быть content/…: " + f.path }, 400);
      }
      paths.push(logical);

      if (/\/meta\.json$/.test(logical)) {
        const text =
          typeof f.text === "string"
            ? f.text
            : new TextDecoder().decode(decodeBytes(f));
        const meta = JSON.parse(text);
        const m = logical.match(
          /^content\/(articles|rabbi-answers|biographies)\/([^/]+)\/meta\.json$/,
        );
        if (m) metas.push({ folder: m[1], slug: m[2], meta });
        continue;
      }

      if (/\/issue\.json$/.test(logical)) {
        const text =
          typeof f.text === "string"
            ? f.text
            : new TextDecoder().decode(decodeBytes(f));
        issuePayload = JSON.parse(text);
        if (body.current != null) issuePayload.current = body.current;
        continue;
      }

      const md = logical.match(
        /^content\/(articles|rabbi-answers|biographies)\/([^/]+)\/(he|en|ru|de|fr)\.md$/,
      );
      if (md) {
        const text =
          typeof f.text === "string"
            ? f.text
            : new TextDecoder().decode(decodeBytes(f));
        mdByKey.set(`${md[1]}:${md[2]}:${md[3]}`, text);
        continue;
      }

      // binary / asset → R2
      if (env.FILES) {
        const bytes = decodeBytes(f);
        const ct = guessCt(logical);
        await env.FILES.put(logical, bytes, { httpMetadata: { contentType: ct } });
        const sha = await sha256Hex(bytes);
        await env.CONTENT_DB.prepare(
          `INSERT INTO files(key,sha256,size,content_type,source_path) VALUES(?1,?2,?3,?4,?5)
           ON CONFLICT(key) DO UPDATE SET sha256=excluded.sha256,size=excluded.size,content_type=excluded.content_type`,
        )
          .bind(logical, sha, bytes.byteLength, ct, logical)
          .run();
      }
    }

    for (const { folder, meta } of metas) {
      await upsertMaterialFromMeta(env.CONTENT_DB, meta, folder);
    }

    // apply markdown bodies (resolve parent id by slug)
    for (const [key, text] of mdByKey) {
      const [folder, slug, lang] = key.split(":");
      const dbKind =
        folder === "articles" ? "article" : folder === "rabbi-answers" ? "answer" : "bio";
      const table = tableFor(dbKind);
      const row = await env.CONTENT_DB.prepare(`SELECT id FROM ${table} WHERE slug=?1`)
        .bind(slug)
        .first();
      if (!row) continue;
      const tid = `${dbKind}:${row.id}:${lang}`;
      const existing = await env.CONTENT_DB.prepare(
        `SELECT title, summary, extra_json FROM translations WHERE id=?1`,
      )
        .bind(tid)
        .first();
      await env.CONTENT_DB.prepare(
        `INSERT INTO translations(id,kind,parent_id,lang,title,summary,body_md,body_text,extra_json)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
         ON CONFLICT(id) DO UPDATE SET body_md=excluded.body_md,body_text=excluded.body_text`,
      )
        .bind(
          tid,
          dbKind,
          row.id,
          lang,
          existing?.title || "",
          existing?.summary || "",
          text,
          text,
          existing?.extra_json || "{}",
        )
        .run();
    }

    if (issuePayload) {
      if (currentFlag) issuePayload.current = true;
      await upsertIssue(env.CONTENT_DB, issuePayload);
    }

    return json({
      ok: true,
      commit: `d1-${Date.now().toString(36)}`,
      files: files.length,
      paths,
      backend: "d1-r2",
    });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
