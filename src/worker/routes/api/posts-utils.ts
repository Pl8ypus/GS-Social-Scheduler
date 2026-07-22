import type { PostStatus } from "../../types/post";

type PostBody = {
  content?: string;
  link_url?: string | null;
  image_url?: string | null;
  scheduled_at?: string | null;
};

type ParsedPostBody =
  | { ok: true; content: string; linkUrl: string | null; imageUrl: string | null }
  | { ok: false; error: string };

type ParsedSchedule =
  | { ok: true; scheduledAt: string | null; status: PostStatus }
  | { ok: false; error: string };

// M1: field caps. `content` matches LinkedIn's ~3000-char post limit; URLs are
// capped well under typical limits; a `data:` image URL needs headroom for the
// base64 payload but must not be unbounded (storage-abuse protection).
export const CONTENT_MAX_LENGTH = 3000;
export const URL_MAX_LENGTH = 2048;
export const IMAGE_URL_MAX_LENGTH = 5 * 1024 * 1024;

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * M1: `image_url` accepts the same http/https allowlist as `link_url`, plus
 * inline `data:image/*;base64` uploads produced by the frontend. `svg+xml` is
 * rejected because it can carry executable script.
 */
export function isValidImageUrl(value: string): boolean {
  if (isValidUrl(value)) {
    return true;
  }
  const match = /^data:image\/([a-z0-9.+-]+);base64,/i.exec(value);
  if (!match) {
    return false;
  }
  return match[1].toLowerCase() !== "svg+xml";
}

export function parsePostBody(body: PostBody): ParsedPostBody {
  const content = body.content?.trim() ?? "";
  if (!content) {
    return { ok: false, error: "content is required" };
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    return {
      ok: false,
      error: `content must be at most ${CONTENT_MAX_LENGTH} characters`,
    };
  }

  const linkUrlRaw = body.link_url?.trim() ?? "";
  const linkUrl = linkUrlRaw || null;
  if (linkUrl && linkUrl.length > URL_MAX_LENGTH) {
    return {
      ok: false,
      error: `link_url must be at most ${URL_MAX_LENGTH} characters`,
    };
  }
  if (linkUrl && !isValidUrl(linkUrl)) {
    return { ok: false, error: "link_url must be a valid http or https URL" };
  }

  const imageUrlRaw = body.image_url?.trim() ?? "";
  const imageUrl = imageUrlRaw || null;
  if (imageUrl && imageUrl.length > IMAGE_URL_MAX_LENGTH) {
    return { ok: false, error: "image_url exceeds the maximum allowed size" };
  }
  if (imageUrl && !isValidImageUrl(imageUrl)) {
    return {
      ok: false,
      error: "image_url must be a valid http/https URL or data:image upload",
    };
  }

  return { ok: true, content, linkUrl, imageUrl };
}

export function parseSchedule(scheduledAt: string | null | undefined): ParsedSchedule {
  if (scheduledAt === undefined || scheduledAt === null || scheduledAt.trim() === "") {
    return { ok: true, scheduledAt: null, status: "draft" };
  }

  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: "scheduled_at must be a valid datetime" };
  }
  if (date.getTime() <= Date.now()) {
    return { ok: false, error: "scheduled_at must be in the future" };
  }

  return { ok: true, scheduledAt: date.toISOString(), status: "scheduled" };
}

export const POST_COLUMNS = `id, content, link_url, image_url, scheduled_at, status,
  linkedin_post_id, error_message, created_at`;

export async function getPostById(db: D1Database, id: number): Promise<import("../../types/post").Post | null> {
  return db
    .prepare(`SELECT ${POST_COLUMNS} FROM posts WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first();
}

export type { PostBody };
