import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PostForm, { type PostFormValues } from "../components/PostForm";
import type { Post } from "../types/post";
import { parseApiResponse } from "../utils/api";

async function fetchPost(id: string): Promise<Post> {
  const response = await fetch(`/api/posts/${id}`);
  const data = await parseApiResponse<{ post: Post }>(
    response,
    "Failed to load post.",
  );
  return data.post;
}

async function updatePost(id: string, values: PostFormValues): Promise<Post> {
  const response = await fetch(`/api/posts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });

  const data = await parseApiResponse<{ post: Post }>(
    response,
    "Failed to update post.",
  );
  return data.post;
}

export default function EditPost() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setError("Invalid post id.");
      setIsLoading(false);
      return;
    }

    fetchPost(id)
      .then((loaded) => {
        if (loaded.status !== "draft" && loaded.status !== "scheduled") {
          setError("Only draft or scheduled posts can be edited.");
          return;
        }
        setPost(loaded);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load post.");
      })
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) {
    return <p className="loading-state">Loading…</p>;
  }

  if (error || !post || !id) {
    return (
      <>
        <p className="alert alert-error" role="alert">{error || "Post not found."}</p>
        <p><Link to="/posts" className="btn btn--ghost">Back to posts</Link></p>
      </>
    );
  }

  return (
    <>
      <header className="page-header">
        <p className="page-eyebrow">Edit</p>
        <h1 className="page-title">Update post</h1>
        <p className="page-description">
          Change content, reschedule, or uncheck scheduling to save as a draft.
        </p>
      </header>
      <PostForm
        initialContent={post.content}
        initialLinkUrl={post.link_url ?? ""}
        initialImageUrl={post.image_url}
        initialScheduledAt={post.scheduled_at}
        onSubmit={async (values) => {
          const updated = await updatePost(id, values);
          setPost(updated);
          if (updated.status === "scheduled") {
            return { successMessage: `Schedule updated (id: ${updated.id}).` };
          }
          return { successMessage: `Draft updated (id: ${updated.id}).` };
        }}
      />
    </>
  );
}
