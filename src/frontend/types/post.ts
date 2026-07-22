export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "posted"
  | "failed";

export interface Post {
  id: number;
  content: string;
  link_url: string | null;
  image_url: string | null;
  scheduled_at: string | null;
  status: PostStatus;
  linkedin_post_id: string | null;
  error_message: string | null;
  created_at: string;
}

export function previewContent(content: string, maxLength = 80): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}
