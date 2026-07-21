export type PostStatus = "draft" | "scheduled" | "posted" | "failed";

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
