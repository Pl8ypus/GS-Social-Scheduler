import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/worker/app";

describe("LinkedIn admin API", () => {
  const app = createApp();

  async function api(path: string, init?: RequestInit): Promise<Response> {
    return app.fetch(new Request(`http://localhost${path}`, init), env);
  }

  it("reports disconnected status by default", async () => {
    const response = await api("/api/admin/linkedin/status");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      linkedin: { connected: boolean; memberUrn: string | null };
      credentials: { configured: boolean; source: string | null };
    };
    expect(body.linkedin.connected).toBe(false);
    expect(body.linkedin.memberUrn).toBeNull();
    expect(body.credentials.configured).toBe(false);
    expect(body.credentials.source).toBeNull();
  });

  it("stores LinkedIn credentials without returning the secret", async () => {
    const response = await api("/api/admin/linkedin/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: "test-client-id",
        client_secret: "test-client-secret",
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      credentials: {
        configured: boolean;
        clientId: string;
        hasStoredSecret: boolean;
        source: string;
      };
    };
    expect(body.credentials.configured).toBe(true);
    expect(body.credentials.clientId).toBe("test-client-id");
    expect(body.credentials.hasStoredSecret).toBe(true);
    expect(body.credentials.source).toBe("database");
    expect(JSON.stringify(body)).not.toContain("test-client-secret");
  });

  it("allows updating client id while keeping the stored secret", async () => {
    await api("/api/admin/linkedin/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: "initial-client-id",
        client_secret: "stored-client-secret",
      }),
    });

    const response = await api("/api/admin/linkedin/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: "updated-client-id",
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      credentials: { clientId: string; hasStoredSecret: boolean };
    };
    expect(body.credentials.clientId).toBe("updated-client-id");
    expect(body.credentials.hasStoredSecret).toBe(true);
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
});
