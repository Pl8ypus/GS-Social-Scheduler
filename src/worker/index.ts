import { createApp } from "./app";
import type { Env } from "./env";
import { processDuePosts } from "./scheduler/process-due-posts";

const app = createApp();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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
