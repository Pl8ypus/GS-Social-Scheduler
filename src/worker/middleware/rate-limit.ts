import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";

/**
 * Applies a Cloudflare Rate Limiting binding to a route. Keyed by client IP +
 * path so an unauthenticated flood is throttled before it reaches the (more
 * expensive) Access JWT verification.
 */
export function rateLimit(
  pickLimiter: (env: Env) => RateLimit | undefined,
): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const limiter = pickLimiter(c.env);
    // Defensive: if the binding is missing (misconfig), don't take the whole
    // API down — Access (C1) is the real gate. Log so it doesn't hide silently.
    if (!limiter || typeof limiter.limit !== "function") {
      console.error("[rate-limit] limiter binding missing; skipping throttle");
      return next();
    }

    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    const key = `${ip}:${new URL(c.req.url).pathname}`;
    const { success } = await limiter.limit({ key });
    if (!success) {
      return c.json({ error: "rate limit exceeded" }, 429);
    }

    return next();
  };
}
