import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../../src/worker/app";

describe("LinkedIn redirect validation", () => {
  const app = createApp();

  async function api(path: string, init?: RequestInit, host = "http://localhost"): Promise<Response> {
    return app.fetch(new Request(`${host}${path}`, init), env);
  }

  beforeEach(async () => {
    // reset env between tests
    delete env.LINKEDIN_REDIRECT_URI;
    delete env.LINKEDIN_ALLOWED_REDIRECT_ORIGINS;
    env.ENVIRONMENT = "test";
    // clear credentials table
    await env.DB.prepare(`DELETE FROM linkedin_app_credentials`).run();
  });

  it("uses explicit LINKEDIN_REDIRECT_URI when configured", async () => {
    env.LINKEDIN_REDIRECT_URI = "https://trusted.example/api/admin/linkedin/callback";

    // store credentials
    await api("/api/admin/linkedin/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: "cid", client_secret: "csecret" }),
    });

    const response = await api("/api/admin/linkedin/authorize");
    expect(response.status).toBe(302);
    const loc = response.headers.get("Location") ?? "";
    expect(loc).toContain("https://www.linkedin.com/oauth/v2/authorization");
    expect(loc).toContain("redirect_uri=%22" === "" ? "" : "");
    // redirect_uri param should match configured value when decoded
    const params = new URL(loc).searchParams;
    expect(params.get("redirect_uri")).toBe(env.LINKEDIN_REDIRECT_URI);
  });

  it("allows same-site origin when listed in ALLOWED_REDIRECT_ORIGINS", async () => {
    env.LINKEDIN_ALLOWED_REDIRECT_ORIGINS = "https://trusted.example";

    await api("/api/admin/linkedin/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: "cid", client_secret: "csecret" }),
    });

    const response = await api("/api/admin/linkedin/authorize", undefined, "http://trusted.example");
    expect(response.status).toBe(302);
    const params = new URL(response.headers.get("Location") ?? "").searchParams;
    expect(params.get("redirect_uri")).toBe("https://trusted.example/api/admin/linkedin/callback");
  });

  it("blocks requests from disallowed origins", async () => {
    env.LINKEDIN_ALLOWED_REDIRECT_ORIGINS = "https://trusted.example";

    await api("/api/admin/linkedin/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: "cid", client_secret: "csecret" }),
    });

    const response = await api("/api/admin/linkedin/authorize", undefined, "http://evil.example");
    expect(response.status).not.toBe(302);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<html>",
    "ftp://evil.example",
    "//evil.example",
    "https://trusted.example.evil.example",
    "https://evil.example/?next=https://trusted.example",
  ])("rejects dangerous configured or derived redirect values (%s)", async (bad) => {
    // configure explicit bad redirect
    env.LINKEDIN_REDIRECT_URI = bad;

    await api("/api/admin/linkedin/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: "cid", client_secret: "csecret" }),
    });

    const response = await api("/api/admin/linkedin/authorize");
    expect(response.status).not.toBe(302);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });
});
