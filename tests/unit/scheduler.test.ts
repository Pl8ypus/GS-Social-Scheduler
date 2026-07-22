import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  claimPostForPublish,
  completePublish,
  processDuePosts,
  publishDuePost,
  reclaimStuckPost,
  recoverPublishingPosts,
} from "../../src/worker/scheduler/process-due-posts";
import { createPost } from "../../src/worker/services/posts-service";
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

/**
 * Simulate a crashed publisher: force the post's claim lease to have expired so
 * it becomes eligible for the recovery path.
 */
async function expirePublishLease(id: number): Promise<void> {
  const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await env.DB.prepare(`UPDATE posts SET publish_claim_at = ? WHERE id = ?`)
    .bind(stale, id)
    .run();
}

describe("scheduler idempotency", () => {
  it("claims, publishes, and completes a due post", async () => {
    const post = await insertDueScheduledPost("Due post");

    await processDuePosts(env.DB);

    const row = await env.DB.prepare(
      "SELECT status, linkedin_post_id FROM posts WHERE id = ?",
    )
      .bind(post.id)
      .first<{ status: string; linkedin_post_id: string | null }>();

    expect(row?.status).toBe("posted");
    expect(row?.linkedin_post_id).toMatch(/^mock-/);
  });

  it("recovers stuck publishing posts without double publish", async () => {
    const post = await insertDueScheduledPost("Stuck post");
    const linkedinPostId = "mock-stuck-1";

    const claimed = await claimPostForPublish(env.DB, post, linkedinPostId);
    expect(claimed).toBe(true);
    await expirePublishLease(post.id);

    let publishCalls = 0;
    await recoverPublishingPosts(env.DB, async () => {
      publishCalls += 1;
    });

    expect(publishCalls).toBe(1);

    const row = await env.DB.prepare(
      "SELECT status, linkedin_post_id FROM posts WHERE id = ?",
    )
      .bind(post.id)
      .first<{ status: string; linkedin_post_id: string }>();

    expect(row?.status).toBe("posted");
    expect(row?.linkedin_post_id).toBe(linkedinPostId);
  });

  it("recovery does not publish again after post is already posted", async () => {
    const post = await insertDueScheduledPost("Already done");
    const linkedinPostId = "mock-stuck-2";
    await claimPostForPublish(env.DB, post, linkedinPostId);
    await expirePublishLease(post.id);

    let publishCalls = 0;
    await recoverPublishingPosts(env.DB, async () => {
      publishCalls += 1;
    });
    expect(publishCalls).toBe(1);

    await recoverPublishingPosts(env.DB, async () => {
      publishCalls += 1;
    });
    expect(publishCalls).toBe(1);
  });

  it("does not recover a post whose publish lease is still live", async () => {
    const post = await insertDueScheduledPost("Actively publishing");
    await claimPostForPublish(env.DB, post, "mock-live-1");

    let publishCalls = 0;
    await recoverPublishingPosts(env.DB, async () => {
      publishCalls += 1;
    });

    // Lease is fresh -> treated as an in-flight publish, left untouched.
    expect(publishCalls).toBe(0);
    const row = await env.DB.prepare("SELECT status FROM posts WHERE id = ?")
      .bind(post.id)
      .first<{ status: string }>();
    expect(row?.status).toBe("publishing");
  });

  it("atomic re-claim lets only one concurrent runner win a stuck post", async () => {
    const post = await insertDueScheduledPost("Contended");
    await claimPostForPublish(env.DB, post, "mock-contended-1");
    await expirePublishLease(post.id);

    const stuck = { ...post, status: "publishing" as const, publish_claim_at: null };
    // Both runners observed the same (expired) lease value; emulate the race by
    // reading the real stored value and racing two CAS re-claims on it.
    const stored = await env.DB.prepare(
      "SELECT publish_claim_at FROM posts WHERE id = ?",
    )
      .bind(post.id)
      .first<{ publish_claim_at: string | null }>();
    const observed = { ...stuck, publish_claim_at: stored?.publish_claim_at ?? null };

    const [a, b] = await Promise.all([
      reclaimStuckPost(env.DB, observed, "2999-01-01T00:00:00.000Z"),
      reclaimStuckPost(env.DB, observed, "2999-01-01T00:00:01.000Z"),
    ]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("marks failed when publish executor throws after claim", async () => {
    const post = await insertDueScheduledPost("Failing post");

    await expect(
      publishDuePost(env.DB, post, async () => {
        throw new Error("LinkedIn API down");
      }),
    ).rejects.toThrow("LinkedIn API down");

    const row = await env.DB.prepare(
      "SELECT status, error_message FROM posts WHERE id = ?",
    )
      .bind(post.id)
      .first<{ status: string; error_message: string }>();

    expect(row?.status).toBe("failed");
    // H3: the raw error is logged server-side; only a generic message is stored.
    expect(row?.error_message).toBe("Publish failed");
    expect(row?.error_message).not.toContain("LinkedIn API down");

    const event = await env.DB.prepare(
      `SELECT result, error_detail FROM publish_events WHERE post_id = ?`,
    )
      .bind(post.id)
      .first<{ result: string; error_detail: string }>();

    expect(event?.result).toBe("failed");
    expect(event?.error_detail).toBe("LinkedIn API down");
  });

  it("completePublish is idempotent only from publishing state", async () => {
    const post = await insertDueScheduledPost("Complete guard");
    const linkedinPostId = "mock-complete-guard";

    await claimPostForPublish(env.DB, post, linkedinPostId);
    expect(await completePublish(env.DB, post.id, linkedinPostId)).toBe(true);
    expect(await completePublish(env.DB, post.id, linkedinPostId)).toBe(false);
  });
});
