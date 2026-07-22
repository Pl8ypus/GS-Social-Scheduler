import { createApp } from "./app";
import type { Env } from "./env";
import { processDuePosts } from "./scheduler/process-due-posts";

const app = createApp();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/__scheduled") {
      // C2: this manual trigger must never be reachable in production — the real
      // cron `scheduled()` handler is the only publishing path there. Fail
      // closed (treat unset ENVIRONMENT as production).
      if ((env.ENVIRONMENT ?? "production") === "production") {
        return new Response("Not found\n", { status: 404 });
      }

      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.SCHEDULED_RATE_LIMITER.limit({
        key: `scheduled:${ip}`,
      });
      if (!success) {
        return new Response("Rate limit exceeded\n", { status: 429 });
      }

      await processDuePosts(env.DB);
      return new Response("Scheduled job executed\n", { status: 200 });
    }

    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env, _ctx) {
    console.log("[scheduler] Cron triggered");
    await processDuePosts(env.DB);
  },
} satisfies ExportedHandler<Env>;
