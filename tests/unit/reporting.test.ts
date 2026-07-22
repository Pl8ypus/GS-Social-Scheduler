import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/worker/app";
import { processDuePosts, publishDuePost } from "../../src/worker/scheduler/process-due-posts";
import { getSchedulerHealth } from "../../src/worker/services/reporting-service";
import type { Post } from "../../src/worker/types/post";

async function insertDueScheduledPost(content: string): Promise<Post> {
  const past = new Date(Date.now() - 60_000).toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO posts (content, status, scheduled_at)
     VALUES (?, 'scheduled', ?)
     RETURNING id, content, link_url, image_url, scheduled_at, status,
               linkedin_post_id, error_message, created_at`,
  )
    .bind(content, past)
    .first<Post>();

  if (!result) {
    throw new Error("failed to insert due scheduled post");
  }

  return result;
}

describe("reporting", () => {
  it("logs publish events and scheduler runs on processDuePosts", async () => {
    await insertDueScheduledPost("Report me");

    await processDuePosts(env.DB);

    const events = await env.DB.prepare(
      `SELECT post_id, result, error_detail, scheduler_run_id
       FROM publish_events`,
    ).all<{
      post_id: number;
      result: string;
      error_detail: string | null;
      scheduler_run_id: number | null;
    }>();

    expect(events.results?.length).toBe(1);
    expect(events.results?.[0]?.result).toBe("success");
    expect(events.results?.[0]?.scheduler_run_id).toBeTypeOf("number");

    const runs = await env.DB.prepare(
      `SELECT processed_count, success_count, failed_count
       FROM scheduler_runs`,
    ).all<{
      processed_count: number;
      success_count: number;
      failed_count: number;
    }>();

    expect(runs.results?.length).toBe(1);
    expect(runs.results?.[0]?.success_count).toBe(1);
    expect(runs.results?.[0]?.failed_count).toBe(0);
  });

  it("logs failed publish attempts with error detail", async () => {
    const post = await insertDueScheduledPost("Fail me");

    await expect(
      publishDuePost(env.DB, post, async () => {
        throw new Error("LinkedIn API down");
      }),
    ).rejects.toThrow("LinkedIn API down");

    const event = await env.DB.prepare(
      `SELECT result, error_detail FROM publish_events WHERE post_id = ?`,
    )
      .bind(post.id)
      .first<{ result: string; error_detail: string }>();

    expect(event?.result).toBe("failed");
    expect(event?.error_detail).toBe("LinkedIn API down");
  });

  it("getSchedulerHealth returns last run and totals", async () => {
    await insertDueScheduledPost("Health check");
    await processDuePosts(env.DB);

    const health = await getSchedulerHealth(env.DB);

    expect(health.last_run).not.toBeNull();
    expect(health.last_run?.success_count).toBe(1);
    expect(health.publish_totals.success).toBe(1);
    expect(health.failed_posts_count).toBe(0);
  });

  it("GET /api/reporting/health returns scheduler health JSON", async () => {
    await insertDueScheduledPost("API health");
    await processDuePosts(env.DB);

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/reporting/health"),
      env,
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      health: { publish_totals: { success: number } };
    };
    expect(body.health.publish_totals.success).toBeGreaterThanOrEqual(1);
  });
});
