import { useMemo, useState } from "react";

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

export function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem("admin_token") || "",
  );
  const [tab, setTab] = useState("materials");
  const [items, setItems] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState("article");

  const ready = Boolean(token);

  async function api(path, opts = {}) {
    const r = await fetch(path, {
      ...opts,
      headers: { ...authHeaders(token), ...(opts.headers || {}) },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  async function loadMaterials() {
    const j = await api(`/api/materials?kind=${kind}`);
    setItems(j.items || []);
    setMsg(`Loaded ${j.items?.length || 0} ${kind}s`);
  }

  async function loadQuestions() {
    const j = await api(`/api/questions?status=new`);
    setQuestions(j.items || []);
    setMsg(`Inbox: ${j.items?.length || 0}`);
  }

  async function rebuildLinks() {
    const j = await api(`/api/interlinks`, { method: "POST", body: "{}" });
    setMsg(`Interlinks: ${j.undirectedEdges} edges, cross=${j.crossIssuePairs}`);
  }

  async function publish(id, status) {
    await api(`/api/publish`, {
      method: "POST",
      body: JSON.stringify({ kind, id, status }),
    });
    await loadMaterials();
  }

  const previewNote = useMemo(
    () => "Preview requires ADMIN_PREVIEW_TOKEN on every request.",
    [],
  );

  return (
    <main className="admin">
      <h1>jes-v2 admin</h1>
      <p className="note">{previewNote}</p>
      <label>
        Token
        <input
          type="password"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            localStorage.setItem("admin_token", e.target.value);
            document.cookie = `admin_token=${encodeURIComponent(e.target.value)}; path=/; SameSite=Strict`;
          }}
        />
      </label>
      {!ready ? <p>Enter ADMIN_PREVIEW_TOKEN to continue.</p> : null}
      <nav className="tabs">
        {["materials", "questions", "tags", "interlinks"].map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      {msg ? <p className="msg">{msg}</p> : null}

      {tab === "materials" && ready ? (
        <section>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="article">articles</option>
            <option value="answer">answers</option>
            <option value="bio">bios</option>
          </select>
          <button type="button" onClick={loadMaterials}>
            Refresh
          </button>
          <ul>
            {items.map((it) => (
              <li key={it.id}>
                <code>{it.slug}</code> · {it.status}{" "}
                <button type="button" onClick={() => publish(it.id, "published")}>
                  publish
                </button>
                <button type="button" onClick={() => publish(it.id, "draft")}>
                  draft
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "questions" && ready ? (
        <section>
          <button type="button" onClick={loadQuestions}>
            Refresh inbox
          </button>
          <ul>
            {questions.map((q) => (
              <li key={q.id}>
                <strong>{q.subject}</strong> · {q.language}
                <div>{q.question_text}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "tags" && ready ? (
        <section>
          <p>Use POST /api/tags to manage tags; materials list shows tagged content after seed.</p>
          <button
            type="button"
            onClick={async () => {
              const j = await api("/api/tags");
              setMsg(`Tags: ${j.tags?.length || 0}, links: ${j.article_tags?.length || 0}`);
            }}
          >
            Load tags
          </button>
        </section>
      ) : null}

      {tab === "interlinks" && ready ? (
        <section>
          <button type="button" onClick={rebuildLinks}>
            Rebuild interlinks
          </button>
        </section>
      ) : null}
    </main>
  );
}
