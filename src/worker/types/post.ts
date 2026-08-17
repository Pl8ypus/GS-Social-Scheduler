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
  latest_publish_event_id?: number | null;
  latest_publish_attempted_at?: string | null;
  latest_publish_result?: "success" | "failed" | null;
  latest_publish_error_detail?: string | null;
}
