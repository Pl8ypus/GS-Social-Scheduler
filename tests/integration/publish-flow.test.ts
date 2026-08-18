import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/worker/app";
import { processDuePosts } from "../../src/worker/scheduler/process-due-posts";

describe("create → schedule → mock publish flow", () => {
  it("runs end to end through the API and scheduler", async () => {
    const app = createApp();
    const future = new Date(Date.now() + 3_600_000).toISOString();

    const createResponse = await app.fetch(
      new Request("http://localhost/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost" },
        body: JSON.stringify({
          content: "Integration flow post",
          link_url: "https://example.com/article",
          scheduled_at: future,
        }),
      }),
      env,
    );

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      post: { id: number; status: string };
    };
    expect(created.post.status).toBe("scheduled");

    const past = new Date(Date.now() - 1_000).toISOString();
    await env.DB.prepare(`UPDATE posts SET scheduled_at = ? WHERE id = ?`)
      .bind(past, created.post.id)
      .run();

    await processDuePosts(env.DB);

    const listResponse = await app.fetch(
      new Request("http://localhost/api/posts"),
      env,
    );
    expect(listResponse.status).toBe(200);

    const listed = (await listResponse.json()) as {
      posts: Array<{
        id: number;
        status: string;
        linkedin_post_id: string | null;
        content: string;
      }>;
    };

    const published = listed.posts.find((post) => post.id === created.post.id);
    expect(published?.status).toBe("posted");
    expect(published?.linkedin_post_id).toMatch(/^mock-/);
    expect(published?.content).toBe("Integration flow post");

    const event = await env.DB.prepare(
      `SELECT result, scheduler_run_id FROM publish_events WHERE post_id = ?`,
    )
      .bind(created.post.id)
      .first<{ result: string; scheduler_run_id: number | null }>();

    expect(event?.result).toBe("success");
    expect(event?.scheduler_run_id).toBeTypeOf("number");

    const healthResponse = await app.fetch(
      new Request("http://localhost/api/reporting/health"),
      env,
    );
    expect(healthResponse.status).toBe(200);
    const health = (await healthResponse.json()) as {
      health: { publish_totals: { success: number }; failed_posts_count: number };
    };
    expect(health.health.publish_totals.success).toBeGreaterThanOrEqual(1);
    expect(health.health.failed_posts_count).toBe(0);
  });
});
