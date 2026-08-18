import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";

const PRODUCTION_ORIGIN = "https://linkedin-scheduler.greg-staunton.com";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isDevOrTest(env: Env): boolean {
  return (
    env.ENVIRONMENT === "test" ||
    env.ENVIRONMENT === "development" ||
    env.ENVIRONMENT === "dev"
  );
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]" ||
        url.hostname === "::1")
    );
  } catch {
    return false;
  }
}

function originFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function isTrustedOrigin(origin: string, env: Env): boolean {
  if (origin === PRODUCTION_ORIGIN) return true;
  return isDevOrTest(env) && isLocalOrigin(origin);
}

export const validateUnsafeRequestOrigin: MiddlewareHandler<{
  Bindings: Env;
}> = async (c, next) => {
  if (!UNSAFE_METHODS.has(c.req.method.toUpperCase())) {
    return next();
  }

  const origin =
    c.req.header("Origin") ?? originFromReferer(c.req.header("Referer"));
  if (!origin || !isTrustedOrigin(origin, c.env)) {
    return c.json({ error: "forbidden" }, 403);
  }

  return next();
};
