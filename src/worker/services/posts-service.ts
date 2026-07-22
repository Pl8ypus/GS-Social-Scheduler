import {
  getPostById,
  parsePostBody,
  parseSchedule,
  POST_COLUMNS,
  type PostBody,
} from "../routes/api/posts-utils";
import type { Post } from "../types/post";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

export async function listPosts(db: D1Database): Promise<Post[]> {
  const { results } = await db
    .prepare(
      `SELECT ${POST_COLUMNS} FROM posts
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC, id DESC`,
    )
    .all<Post>();

  return results ?? [];
}

export async function listDeletedPosts(db: D1Database): Promise<Post[]> {
  const { results } = await db
    .prepare(
      `SELECT ${POST_COLUMNS} FROM posts
       WHERE deleted_at IS NOT NULL
       ORDER BY deleted_at DESC, id DESC`,
    )
    .all<Post>();

  return results ?? [];
}

export async function getPost(
  db: D1Database,
  id: number,
): Promise<ServiceResult<Post>> {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, status: 400, error: "invalid post id" };
  }

  const post = await getPostById(db, id);
  if (!post) {
    return { ok: false, status: 404, error: "post not found" };
  }

  return { ok: true, data: post };
}

export async function createPost(
  db: D1Database,
  body: PostBody,
): Promise<ServiceResult<Post>> {
  const parsed = parsePostBody(body);
  if (!parsed.ok) {
    return { ok: false, status: 400, error: parsed.error };
  }

  const schedule = parseSchedule(body.scheduled_at);
  if (!schedule.ok) {
    return { ok: false, status: 400, error: schedule.error };
  }

  const result = await db
    .prepare(
      `INSERT INTO posts (content, link_url, image_url, status, scheduled_at)
       VALUES (?, ?, ?, ?, ?)
       RETURNING ${POST_COLUMNS}`,
    )
    .bind(
      parsed.content,
      parsed.linkUrl,
      parsed.imageUrl,
      schedule.status,
      schedule.scheduledAt,
    )
    .first<Post>();

  if (!result) {
    return { ok: false, status: 500, error: "failed to create post" };
  }

  return { ok: true, data: result };
}

export async function updatePost(
  db: D1Database,
  id: number,
  body: PostBody,
): Promise<ServiceResult<Post>> {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, status: 400, error: "invalid post id" };
  }

  const existing = await getPostById(db, id);
  if (!existing) {
    return { ok: false, status: 404, error: "post not found" };
  }
  // L3: `publishing` is a transient claim, not a permanent state — surface it as
  // a conflict rather than a flat 403.
  if (existing.status === "publishing") {
    return {
      ok: false,
      status: 409,
      error: "this post is being published and can no longer be edited",
    };
  }
  if (existing.status !== "draft" && existing.status !== "scheduled") {
    return { ok: false, status: 403, error: "only draft or scheduled posts can be edited" };
  }

  const parsed = parsePostBody(body);
  if (!parsed.ok) {
    return { ok: false, status: 400, error: parsed.error };
  }

  const schedule = parseSchedule(body.scheduled_at);
  if (!schedule.ok) {
    return { ok: false, status: 400, error: schedule.error };
  }

  const imageUrl =
    body.image_url === undefined ? existing.image_url : parsed.imageUrl;

  const result = await db
    .prepare(
      `UPDATE posts
       SET content = ?, link_url = ?, image_url = ?, status = ?, scheduled_at = ?
       WHERE id = ? AND status IN ('draft', 'scheduled')
       RETURNING ${POST_COLUMNS}`,
    )
    .bind(
      parsed.content,
      parsed.linkUrl,
      imageUrl,
      schedule.status,
      schedule.scheduledAt,
      id,
    )
    .first<Post>();

  if (!result) {
    // L3: the guard confirmed draft/scheduled, but the row is no longer in that
    // state — the scheduler claimed it for publishing between the read and the
    // write. Report the conflict instead of a misleading 500.
    return {
      ok: false,
      status: 409,
      error: "this post is being published and can no longer be edited",
    };
  }

  return { ok: true, data: result };
}

export async function cancelScheduledPost(
  db: D1Database,
  id: number,
): Promise<ServiceResult<Post>> {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, status: 400, error: "invalid post id" };
  }

  const existing = await getPostById(db, id);
  if (!existing) {
    return { ok: false, status: 404, error: "post not found" };
  }
  // L3: `publishing` is a transient claim — report the conflict, not a flat 403.
  if (existing.status === "publishing") {
    return {
      ok: false,
      status: 409,
      error: "this post is being published and can no longer be cancelled",
    };
  }
  if (existing.status !== "scheduled") {
    return { ok: false, status: 403, error: "only scheduled posts can be cancelled" };
  }

  const result = await db
    .prepare(
      `UPDATE posts
       SET status = 'draft', scheduled_at = NULL
       WHERE id = ? AND status = 'scheduled'
       RETURNING ${POST_COLUMNS}`,
    )
    .bind(id)
    .first<Post>();

  if (!result) {
    // L3: the row left `scheduled` between the read and the write (claimed for
    // publishing by the scheduler). Report the conflict instead of a 500.
    return {
      ok: false,
      status: 409,
      error: "this post is being published and can no longer be cancelled",
    };
  }

  return { ok: true, data: result };
}

export async function deletePost(
  db: D1Database,
  id: number,
): Promise<ServiceResult<null>> {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, status: 400, error: "invalid post id" };
  }

  // L1: soft delete — stamp `deleted_at` so the row is recoverable. The
  // `deleted_at IS NULL` guard makes a repeat delete a no-op (404).
  const result = await db
    .prepare(
      `UPDATE posts SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(new Date().toISOString(), id)
    .run();

  if (result.meta.changes === 0) {
    return { ok: false, status: 404, error: "post not found" };
  }

  return { ok: true, data: null };
}

export async function restorePost(
  db: D1Database,
  id: number,
): Promise<ServiceResult<Post>> {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, status: 400, error: "invalid post id" };
  }

  const result = await db
    .prepare(
      `UPDATE posts SET deleted_at = NULL
       WHERE id = ? AND deleted_at IS NOT NULL
       RETURNING ${POST_COLUMNS}`,
    )
    .bind(id)
    .first<Post>();

  if (!result) {
    return { ok: false, status: 404, error: "deleted post not found" };
  }

  return { ok: true, data: result };
}
