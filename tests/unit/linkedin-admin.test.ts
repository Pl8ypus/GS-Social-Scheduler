import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/worker/app";

describe("LinkedIn admin API", () => {
  const app = createApp();
  const sameOrigin = "http://localhost";

  async function api(
    path: string,
    init?: RequestInit,
    options: { includeOrigin?: boolean } = {},
  ): Promise<Response> {
    const method = init?.method?.toUpperCase() ?? "GET";
    const headers = new Headers(init?.headers);
    if (
      method !== "GET" &&
      method !== "HEAD" &&
      method !== "OPTIONS" &&
      options.includeOrigin !== false &&
      !headers.has("Origin") &&
      !headers.has("Referer")
    ) {
      headers.set("Origin", sameOrigin);
    }
    return app.fetch(new Request(`http://localhost${path}`, { ...init, headers }), env);
  }

  it("reports disconnected status by default", async () => {
    const response = await api("/api/admin/linkedin/status");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      linkedin: { connected: boolean; memberUrn: string | null };
    };
    expect(body.linkedin.connected).toBe(false);
    expect(body.linkedin.memberUrn).toBeNull();
  });

  it("disconnect removes the stored LinkedIn connection", async () => {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO linkedin_connections (
         id, access_token, refresh_token, expires_at, refresh_token_expires_at,
         scope, member_urn, profile_name, connected_at, updated_at
       )
       VALUES ('primary', 'token', NULL, NULL, NULL, 'w_member_social',
         'urn:li:person:123', 'Test User', ?, ?)`,
    )
      .bind(now, now)
      .run();

    const response = await api("/api/admin/linkedin/disconnect", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    const statusResponse = await api("/api/admin/linkedin/status");
    const body = (await statusResponse.json()) as {
      linkedin: { connected: boolean };
    };
    expect(body.linkedin.connected).toBe(false);
  });

  it("rejects LinkedIn disconnect from a malicious Origin", async () => {
    const response = await api("/api/admin/linkedin/disconnect", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("rejects LinkedIn disconnect without Origin or Referer", async () => {
    const response = await api(
      "/api/admin/linkedin/disconnect",
      { method: "POST" },
      { includeOrigin: false },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });
});
