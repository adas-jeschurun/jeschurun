import { describe, expect, it, vi } from "vitest";

function makeEnv({ turnstileOk = true, secret = "test-secret" } = {}) {
  const rows = [];
  const QUESTIONS_DB = {
    prepare() {
      return {
        bind(...args) {
          return {
            async run() {
              rows.push(args);
              return { success: true };
            },
            async first() {
              return null;
            },
            async all() {
              return { results: rows.map((r) => ({ id: r[0] })) };
            },
          };
        },
      };
    },
  };
  globalThis.fetch = vi.fn(async () => ({
    json: async () => ({ success: turnstileOk }),
  }));
  return {
    env: {
      QUESTIONS_DB,
      TURNSTILE_SECRET: secret,
    },
    rows,
  };
}

describe("api.question", () => {
  it("honeypot → 200 + no row", async () => {
    const { onRequestPost } = await import(
      "../../packages/functions/site/api/question.js"
    );
    const { env, rows } = makeEnv();
    const req = new Request("http://local/api/question", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        website: "http://spam.example",
        language: "en",
        subject: "Hello there",
        question: "This is a long enough question body.",
        turnstileToken: "x",
      }),
    });
    const res = await onRequestPost({ request: req, env });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(rows.length).toBe(0);
  });

  it("badTurnstile → 403 + no row", async () => {
    const { onRequestPost } = await import(
      "../../packages/functions/site/api/question.js"
    );
    const { env, rows } = makeEnv({ turnstileOk: false });
    const req = new Request("http://local/api/question", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        language: "en",
        subject: "Hello there",
        question: "This is a long enough question body.",
        turnstileToken: "bad",
      }),
    });
    const res = await onRequestPost({ request: req, env });
    expect(res.status).toBe(403);
    expect(rows.length).toBe(0);
  });

  it("validSubmit.persists", async () => {
    const { onRequestPost } = await import(
      "../../packages/functions/site/api/question.js"
    );
    const { env, rows } = makeEnv({ turnstileOk: true });
    const req = new Request("http://local/api/question", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        language: "en",
        name: "Test",
        email: "a@b.co",
        subject: "Hello there",
        question: "This is a long enough question body.",
        turnstileToken: "ok-token",
      }),
    });
    const res = await onRequestPost({ request: req, env });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.id).toBeTruthy();
    expect(rows.length).toBe(1);
  });
});
