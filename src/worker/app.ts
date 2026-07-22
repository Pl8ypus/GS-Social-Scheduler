import { Hono } from "hono";
import type { Env } from "./env";
import { accessAuth, type AccessVariables } from "./middleware/access";
import { rateLimit } from "./middleware/rate-limit";
import api from "./routes/api";

export function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: AccessVariables }>();

  // M3: single sanitizing error boundary — log the real error, return generic.
  app.onError((error, c) => {
    console.error(
      `[app] Unhandled error on ${c.req.method} ${c.req.path}:`,
      error,
    );
    return c.json({ error: "internal error" }, 500);
  });

  // M2: throttle before the expensive JWT verification below.
  app.use("/api/*", rateLimit((env) => env.API_RATE_LIMITER));
  // C1: verify the Cloudflare Access assertion on every API request.
  app.use("/api/*", accessAuth);

  app.route("/api", api);
  return app;
}
