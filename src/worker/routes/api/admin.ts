import { Hono } from "hono";
import type { Env } from "../../env";
import {
  completeLinkedInAuthorization,
  createLinkedInAuthorizationUrl,
  disconnectLinkedIn,
  getLinkedInStatus,
} from "../../services/linkedin-service";

const admin = new Hono<{ Bindings: Env }>();
const LINKEDIN_AUTHORIZATION_ORIGIN = "https://www.linkedin.com";

admin.get("/linkedin/status", async (c) => {
  const status = await getLinkedInStatus(c.env.DB);
  return c.json({ linkedin: status });
});

admin.get("/linkedin/authorize", async (c) => {
  try {
    const url = await createLinkedInAuthorizationUrl(
      c.env.DB,
      c.env,
      c.req.url,
    );
    const redirectUrl = new URL(url);
    if (redirectUrl.origin !== LINKEDIN_AUTHORIZATION_ORIGIN) {
      return c.json({ error: "Invalid LinkedIn authorization redirect" }, 500);
    }

    return c.redirect(redirectUrl.toString());
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
