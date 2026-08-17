import { Hono } from "hono";
import type { Env } from "../../env";
import { publishPostNow } from "../../scheduler/process-due-posts";
import { publishPostToLinkedIn } from "../../services/linkedin-service";
import type { PostBody } from "./posts-utils";
import {
  cancelScheduledPost,
  createPost,
  deletePost,
  getPost,
  getPostWithLatestPublishEvent,
  listDeletedPosts,
  listPosts,
  restorePost,
  updatePost,
} from "../../services/posts-service";

const posts = new Hono<{ Bindings: Env }>();

posts.get("/", async (c) => {
  const results = await listPosts(c.env.DB);
  return c.json({ posts: results });
});

// Registered before "/:id" so "deleted" isn't captured as an id param.
posts.get("/deleted", async (c) => {
  const results = await listDeletedPosts(c.env.DB);
  return c.json({ posts: results });
});

posts.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const result = await getPost(c.env.DB, id);
  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json({ post: result.data });
});

posts.post("/", async (c) => {
  let body: PostBody;
  try {
    body = await c.req.json<PostBody>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const result = await createPost(c.env.DB, body);
  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json({ post: result.data }, 201);
});

posts.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  let body: PostBody;
  try {
    body = await c.req.json<PostBody>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const result = await updatePost(c.env.DB, id, body);
  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json({ post: result.data });
});

posts.post("/:id/cancel", async (c) => {
  const id = Number(c.req.param("id"));
  const result = await cancelScheduledPost(c.env.DB, id);
  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json({ post: result.data });
});

posts.post("/:id/send", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "invalid post id" }, 400);
  }

  const post = await getPostWithLatestPublishEvent(c.env.DB, id);
  if (!post) {
    return c.json({ error: "post not found" }, 404);
  }
  if (post.status === "publishing") {
    return c.json({ error: "this post is already being published" }, 409);
  }
  if (post.status !== "scheduled" && post.status !== "failed") {
    return c.json({ error: "only scheduled or failed posts can be sent now" }, 403);
  }

  try {
    const linkedinPostId = await publishPostNow(c.env.DB, post, (_claimId, post) =>
      publishPostToLinkedIn(c.env.DB, c.env, post),
    );
    const updated = await getPostWithLatestPublishEvent(c.env.DB, id);
    return c.json({ post: updated, linkedin_post_id: linkedinPostId });
  } catch (error) {
    const updated = await getPostWithLatestPublishEvent(c.env.DB, id);
    return c.json(
      {
        error: error instanceof Error ? error.message : "failed to send post",
        post: updated,
      },
      502,
    );
  }
});

posts.post("/:id/restore", async (c) => {
  const id = Number(c.req.param("id"));
  const result = await restorePost(c.env.DB, id);
  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json({ post: result.data });
});

posts.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const result = await deletePost(c.env.DB, id);
  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }
  return c.body(null, 204);
});

export default posts;
