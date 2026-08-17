import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/worker/app";
import {
  cancelScheduledPost,
  createPost,
  deletePost,
  listDeletedPosts,
  listPosts,
  restorePost,
  updatePost,
} from "../../src/worker/services/posts-service";

describe("posts API routes", () => {
  const app = createApp();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function api(
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    return app.fetch(new Request(`http://localhost${path}`, init), env);
  }

  it("POST /api/posts creates a draft", async () => {
    const response = await api("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Draft from test" }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { post: { status: string; content: string } };
    expect(body.post.status).toBe("draft");
    expect(body.post.content).toBe("Draft from test");
  });

  it("PUT /api/posts/:id updates a draft", async () => {
    const created = await createPost(env.DB, { content: "Original" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const response = await api(`/api/posts/${created.data.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Updated content" }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { post: { content: string } };
    expect(body.post.content).toBe("Updated content");
  });

  it("POST /api/posts/:id/cancel reverts scheduled post to draft", async () => {
    const scheduledAt = new Date(Date.now() + 60_000).toISOString();
    const created = await createPost(env.DB, {
      content: "Scheduled post",
      scheduled_at: scheduledAt,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.status).toBe("scheduled");

    const response = await api(`/api/posts/${created.data.id}/cancel`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { post: { status: string; scheduled_at: null } };
    expect(body.post.status).toBe("draft");
    expect(body.post.scheduled_at).toBeNull();
  });

  it("DELETE soft-deletes, then /deleted lists and /restore recovers it", async () => {
    const created = await createPost(env.DB, { content: "To be deleted" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.data.id;

    const deleteResponse = await api(`/api/posts/${id}`, { method: "DELETE" });
    expect(deleteResponse.status).toBe(204);

    // Gone from normal reads...
    const getResponse = await api(`/api/posts/${id}`);
    expect(getResponse.status).toBe(404);
    const listResponse = await api("/api/posts");
    const listed = (await listResponse.json()) as { posts: Array<{ id: number }> };
    expect(listed.posts.some((p) => p.id === id)).toBe(false);

    // ...but present in the deleted list.
    const deletedResponse = await api("/api/posts/deleted");
    const deletedList = (await deletedResponse.json()) as {
      posts: Array<{ id: number }>;
    };
    expect(deletedList.posts.some((p) => p.id === id)).toBe(true);

    // Restore brings it back.
    const restoreResponse = await api(`/api/posts/${id}/restore`, {
      method: "POST",
    });
    expect(restoreResponse.status).toBe(200);
    const getAfter = await api(`/api/posts/${id}`);
    expect(getAfter.status).toBe(200);
  });

  it("DELETE twice returns 404 the second time", async () => {
    const created = await createPost(env.DB, { content: "Delete twice" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await api(`/api/posts/${created.data.id}`, { method: "DELETE" });
    expect(first.status).toBe(204);
    const second = await api(`/api/posts/${created.data.id}`, { method: "DELETE" });
    expect(second.status).toBe(404);
  });

  it("GET /api/posts/deleted is not captured by the :id route", async () => {
    const response = await api("/api/posts/deleted");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { posts: unknown[] };
    expect(Array.isArray(body.posts)).toBe(true);
  });

  it("GET /api/posts includes latest publish error details", async () => {
    const created = await createPost(env.DB, { content: "Failed with detail" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await env.DB.prepare(
      `UPDATE posts SET status = 'failed', error_message = 'Publish failed'
       WHERE id = ?`,
    )
      .bind(created.data.id)
      .run();
    await env.DB.prepare(
      `INSERT INTO publish_events
         (post_id, attempted_at, result, error_detail, linkedin_post_id)
       VALUES (?, ?, 'failed', ?, ?)`,
    )
      .bind(
        created.data.id,
        new Date().toISOString(),
        "LinkedIn post request failed (HTTP 400): Bad payload",
        "claim-test",
      )
      .run();

    const response = await api("/api/posts");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      posts: Array<{
        id: number;
        latest_publish_result: string | null;
        latest_publish_error_detail: string | null;
      }>;
    };
    const post = body.posts.find((post) => post.id === created.data.id);
    expect(post?.latest_publish_result).toBe("failed");
    expect(post?.latest_publish_error_detail).toContain("Bad payload");
  });

  it("POST /api/posts/:id/send publishes a scheduled post immediately", async () => {
    const created = await createPost(env.DB, {
      content: "Send now scheduled",
      scheduled_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await env.DB.prepare(
      `INSERT OR REPLACE INTO linkedin_connections (
         id, access_token, refresh_token, expires_at, refresh_token_expires_at,
         scope, member_urn, profile_name, connected_at, updated_at
       )
       VALUES ('primary', 'access-token', NULL, ?, NULL, 'openid,profile,w_member_social',
         'urn:li:person:test-member', 'Test User', ?, ?)`,
    )
      .bind(
        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(null, {
          status: 201,
          headers: { "x-restli-id": "urn:li:share:send-now" },
        }),
      ),
    );

    const response = await api(`/api/posts/${created.data.id}/send`, {
      method: "POST",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      post: { status: string; latest_publish_result: string | null };
      linkedin_post_id: string;
    };
    expect(body.post.status).toBe("posted");
    expect(body.post.latest_publish_result).toBe("success");
    expect(body.linkedin_post_id).toBe("urn:li:share:send-now");
  });

  it("POST /api/posts/:id/send retries a failed post and records failure details", async () => {
    const created = await createPost(env.DB, { content: "Retry failed" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await env.DB.prepare(
      `UPDATE posts SET status = 'failed', error_message = 'Publish failed'
       WHERE id = ?`,
    )
      .bind(created.data.id)
      .run();
    await env.DB.prepare(
      `INSERT OR REPLACE INTO linkedin_connections (
         id, access_token, refresh_token, expires_at, refresh_token_expires_at,
         scope, member_urn, profile_name, connected_at, updated_at
       )
       VALUES ('primary', 'access-token', NULL, ?, NULL, 'openid,profile,w_member_social',
         'urn:li:person:test-member', 'Test User', ?, ?)`,
    )
      .bind(
        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { message: "Requested version 20250601 is not active" },
          { status: 400 },
        ),
      ),
    );

    const response = await api(`/api/posts/${created.data.id}/send`, {
      method: "POST",
    });
    expect(response.status).toBe(502);
    const body = (await response.json()) as {
      error: string;
      post: { status: string; latest_publish_error_detail: string | null };
    };
    expect(body.error).toContain("Requested version");
    expect(body.post.status).toBe("failed");
    expect(body.post.latest_publish_error_detail).toContain("HTTP 400");
  });
});

describe("posts service", () => {
  it("rejects invalid cancel on draft", async () => {
    const created = await createPost(env.DB, { content: "Just a draft" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await cancelScheduledPost(env.DB, created.data.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
  });

  it("rejects edit on posted status", async () => {
    const created = await createPost(env.DB, { content: "Will be posted" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await env.DB.prepare(`UPDATE posts SET status = 'posted' WHERE id = ?`)
      .bind(created.data.id)
      .run();

    const result = await updatePost(env.DB, created.data.id, {
      content: "Nope",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
  });

  it("L3: returns 409 when editing a post claimed for publishing", async () => {
    const created = await createPost(env.DB, {
      content: "Racing edit",
      scheduled_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Simulate the scheduler claiming it between read and write.
    await env.DB.prepare(`UPDATE posts SET status = 'publishing' WHERE id = ?`)
      .bind(created.data.id)
      .run();

    const result = await updatePost(env.DB, created.data.id, { content: "Too late" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
  });

  it("L3: returns 409 when cancelling a post claimed for publishing", async () => {
    const created = await createPost(env.DB, {
      content: "Racing cancel",
      scheduled_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await env.DB.prepare(`UPDATE posts SET status = 'publishing' WHERE id = ?`)
      .bind(created.data.id)
      .run();

    const result = await cancelScheduledPost(env.DB, created.data.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
  });

  it("soft delete hides from listPosts and shows in listDeletedPosts", async () => {
    const created = await createPost(env.DB, { content: "Soft deleted service" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.data.id;

    await deletePost(env.DB, id);

    const active = await listPosts(env.DB);
    expect(active.some((p) => p.id === id)).toBe(false);

    const deleted = await listDeletedPosts(env.DB);
    expect(deleted.some((p) => p.id === id)).toBe(true);

    const restored = await restorePost(env.DB, id);
    expect(restored.ok).toBe(true);
  });
});
