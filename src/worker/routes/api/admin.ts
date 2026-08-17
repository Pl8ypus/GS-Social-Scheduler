import { Hono } from "hono";
import type { Env } from "../../env";
import {
  clearLinkedInCredentials,
  getLinkedInCredentialsStatus,
  saveLinkedInCredentials,
} from "../../services/linkedin-credentials-service";
import {
  completeLinkedInAuthorization,
  createLinkedInAuthorizationUrl,
  disconnectLinkedIn,
  getLinkedInStatus,
} from "../../services/linkedin-service";

const admin = new Hono<{ Bindings: Env }>();

admin.get("/linkedin/status", async (c) => {
  const [linkedin, credentials] = await Promise.all([
    getLinkedInStatus(c.env.DB),
    getLinkedInCredentialsStatus(c.env.DB, c.env),
  ]);
  return c.json({ linkedin, credentials });
});

admin.put("/linkedin/credentials", async (c) => {
  let body: { client_id?: string; client_secret?: string };
  try {
    body = await c.req.json<{ client_id?: string; client_secret?: string }>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const result = await saveLinkedInCredentials(
    c.env.DB,
    c.env,
    body.client_id ?? "",
    body.client_secret,
  );
  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }

  const credentials = await getLinkedInCredentialsStatus(c.env.DB, c.env);
  return c.json({ credentials });
});

admin.delete("/linkedin/credentials", async (c) => {
  await clearLinkedInCredentials(c.env.DB);
  const credentials = await getLinkedInCredentialsStatus(c.env.DB, c.env);
  return c.json({ credentials });
});

admin.get("/linkedin/authorize", async (c) => {
  try {
    const url = await createLinkedInAuthorizationUrl(
      c.env.DB,
      c.env,
      c.req.url,
    );
    return c.redirect(url);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "LinkedIn setup failed" },
      500,
    );
  }
});

admin.get("/linkedin/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");
  const description = c.req.query("error_description");

  if (error) {
    return c.redirect(
      `/admin?linkedin=error&message=${encodeURIComponent(description ?? error)}`,
    );
  }
  if (!code || !state) {
    return c.redirect(
      `/admin?linkedin=error&message=${encodeURIComponent("Missing LinkedIn authorization code")}`,
    );
  }

  try {
    await completeLinkedInAuthorization(c.env.DB, c.env, code, state);
    return c.redirect("/admin?linkedin=connected");
  } catch (err) {
    return c.redirect(
      `/admin?linkedin=error&message=${encodeURIComponent(
        err instanceof Error ? err.message : "LinkedIn authorization failed",
      )}`,
    );
  }
});

admin.post("/linkedin/disconnect", async (c) => {
  await disconnectLinkedIn(c.env.DB);
  return c.json({ success: true });
});

export default admin;
