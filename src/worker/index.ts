import { Hono } from "hono";
import type { Env } from "./env";
import api from "./routes/api";

const app = new Hono<{ Bindings: Env }>();

app.route("/api", api);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
