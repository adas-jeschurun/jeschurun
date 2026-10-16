import { describe, expect, it } from "vitest";
import { requireAdmin } from "../../packages/functions/_lib/admin-auth.js";

describe("admin auth fail-closed", () => {
  it("missingSecret.failsClosed", () => {
    const req = new Request("http://local/");
    const gate = requireAdmin(req, {});
    expect(gate.ok).toBe(false);
    expect(gate.response.status).toBe(401);
  });

  it("unauth.read.rejected", () => {
    const req = new Request("http://local/");
    const gate = requireAdmin(req, { ADMIN_PREVIEW_TOKEN: "secret" });
    expect(gate.ok).toBe(false);
    expect(gate.response.status).toBe(401);
  });

  it("auth bearer accepted", () => {
    const req = new Request("http://local/", {
      headers: { authorization: "Bearer secret" },
    });
    const gate = requireAdmin(req, { ADMIN_PREVIEW_TOKEN: "secret" });
    expect(gate.ok).toBe(true);
  });

  it("auth cookie accepted", () => {
    const req = new Request("http://local/", {
      headers: { cookie: "admin_token=secret" },
    });
    const gate = requireAdmin(req, { ADMIN_PREVIEW_TOKEN: "secret" });
    expect(gate.ok).toBe(true);
  });
});
