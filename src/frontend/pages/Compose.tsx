import PostForm, { type PostFormValues } from "../components/PostForm";
import type { Post } from "../types/post";

async function createPost(values: PostFormValues): Promise<Post> {
  const response = await fetch("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to save post (${response.status})`);;
  }

  const data = (await response.json()) as { post: Post };
  return data.post;
}

export default function Compose() {
  return (
    <>
      <header className="page-header">
        <p className="page-eyebrow">Compose</p>
        <h1 className="page-title">New post</h1>
        <p className="page-description">
          Save as a draft or pick a time to schedule for later.
        </p>
      </header>
      <PostForm
        onSubmit={async (values) => {
          const post = await createPost(values);
          if (post.status === "scheduled") {
            return { successMessage: `Post scheduled (id: ${post.id}).` };
          }
          return { successMessage: `Draft saved (id: ${post.id}).` };
        }}
      />
    </>
  );
}
