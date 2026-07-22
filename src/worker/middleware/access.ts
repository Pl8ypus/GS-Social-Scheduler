import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";

export type AccessVariables = {
  accessSubject: string;
};

const jwksCache = new Map<string, JWTVerifyGetKey>();

function getJwks(teamDomain: string): JWTVerifyGetKey {
  const certsUrl = `https://${teamDomain}/cdn-cgi/access/certs`;
  let jwks = jwksCache.get(certsUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(certsUrl));
    jwksCache.set(certsUrl, jwks);
  }
  return jwks;
}

/**
 * Verifies the Cloudflare Access JWT issued for this application.
 *
 * This does NOT implement authentication itself — it trusts the Access proxy
 * sitting in front of the Worker and only validates the signed assertion it
 * mints (`iss` + `aud`) against the team's public JWKS. Requests that reach the
 * Worker without a valid assertion are rejected.
 *
 * NOTE: the cron `scheduled()` handler runs server-side with no HTTP request,
 * so Access cannot gate it. It is trusted by execution context, not by this
 * middleware.
 */
export const accessAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: AccessVariables;
}> = async (c, next) => {
  // Tests run without an Access proxy in front. Fail open only for that
  // explicit marker so production fails closed.
  if (c.env.ENVIRONMENT === "test") {
    return next();
  }

  const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN;
  const audience = c.env.CF_ACCESS_AUD;
  if (!teamDomain || !audience) {
    console.error(
      "[access] CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD not configured; refusing all API requests",
    );
    return c.json({ error: "unauthorized" }, 401);
  }

  const token =
    c.req.header("Cf-Access-Jwt-Assertion") ?? getCookie(c, "CF_Authorization");
  if (!token) {
    return c.json({ error: "unauthorized" }, 401);
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience,
    });
    c.set("accessSubject", typeof payload.sub === "string" ? payload.sub : "");
  } catch (error) {
    // Log the real reason server-side; never surface it to the client.
    console.error(
      `[access] JWT verification failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return c.json({ error: "unauthorized" }, 401);
  }

  return next();
};
