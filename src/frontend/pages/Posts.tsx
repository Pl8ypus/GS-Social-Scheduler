import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SchedulerHealthCard from "../components/SchedulerHealthCard";
import StatusBadge from "../components/StatusBadge";
import type { SchedulerHealth } from "../types/reporting";
import { previewContent, type Post } from "../types/post";
import { formatScheduledAt } from "../utils/datetime";

async function fetchPosts(): Promise<Post[]> {
  const response = await fetch("/api/posts");

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to load posts (${response.status})`);
  }

  const data = (await response.json()) as { posts: Post[] };
  return data.posts;
}

async function fetchSchedulerHealth(): Promise<SchedulerHealth> {
  const response = await fetch("/api/reporting/health");

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to load scheduler health (${response.status})`);
  }

  const data = (await response.json()) as { health: SchedulerHealth };
  return data.health;
}

async function deletePost(id: number): Promise<void> {
  const response = await fetch(`/api/posts/${id}`, { method: "DELETE" });

  if (response.status === 204) return;

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to delete post (${response.status})`);
  }
}

async function cancelSchedule(id: number): Promise<void> {
  const response = await fetch(`/api/posts/${id}/cancel`, { method: "POST" });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to cancel schedule (${response.status})`);
  }
}

async function fetchDeletedPosts(): Promise<Post[]> {
  const response = await fetch("/api/posts/deleted");

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to load deleted posts (${response.status})`);
  }

  const data = (await response.json()) as { posts: Post[] };
  return data.posts;
}

async function restorePost(id: number): Promise<void> {
  const response = await fetch(`/api/posts/${id}/restore`, { method: "POST" });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to restore post (${response.status})`);
  }
}

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [health, setHealth] = useState<SchedulerHealth | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isHealthLoading, setIsHealthLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [deletedPosts, setDeletedPosts] = useState<Post[]>([]);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const failedCount =
    health?.failed_posts_count ??
    posts.filter((post) => post.status === "failed").length;

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setPosts(await fetchPosts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load posts.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    setIsHealthLoading(true);
    try {
      setHealth(await fetchSchedulerHealth());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load scheduler health.",
      );
    } finally {
      setIsHealthLoading(false);
    }
  }, []);

  const loadDeleted = useCallback(async () => {
    try {
      setDeletedPosts(await fetchDeletedPosts());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load deleted posts.",
      );
    }
  }, []);

  useEffect(() => {
    void loadPosts();
    void loadHealth();
    void loadDeleted();
  }, [loadPosts, loadHealth, loadDeleted]);

  async function handleConfirmDelete(id: number) {
    setDeletingId(id);
    setError("");
    try {
      await deletePost(id);
      setConfirmDeleteId(null);
      await Promise.all([loadPosts(), loadHealth(), loadDeleted()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete post.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRestore(id: number) {
    setRestoringId(id);
    setError("");
    try {
      await restorePost(id);
      await Promise.all([loadPosts(), loadHealth(), loadDeleted()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore post.");
    } finally {
      setRestoringId(null);
    }
  }

  async function handleConfirmCancel(id: number) {
    setCancellingId(id);
    setError("");
    try {
      await cancelSchedule(id);
      setConfirmCancelId(null);
      await loadPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel schedule.");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <p className="page-eyebrow">Queue</p>
            <h1 className="page-title">Posts</h1>
            <p className="page-description">
              Drafts, scheduled posts, and publish history — newest first.
            </p>
          </div>
          {failedCount > 0 && (
            <span className="queue-failed-badge" role="status">
              {failedCount} failed
            </span>
          )}
        </div>
      </header>

      <div className="queue-stack">
        <SchedulerHealthCard health={health} isLoading={isHealthLoading} />

        {!isLoading && failedCount > 0 && (
          <div className="queue-alert" role="alert">
            <div className="queue-alert-copy">
              <strong>
                {failedCount} post{failedCount === 1 ? "" : "s"} failed to publish
              </strong>
              <p>
                Review failed rows below. Error details are stored on each post;
                publish attempts are logged in the append-only event trail.
              </p>
            </div>
            <StatusBadge status="failed" />
          </div>
        )}

        {isLoading && <p className="loading-state">Loading…</p>}
        {error && <p className="alert alert-error" role="alert">{error}</p>}

        {!isLoading && posts.length === 0 && (
          <p className="empty-state">No posts yet.</p>
        )}

        {!isLoading && posts.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Content</th>
                  <th>Status</th>
                  <th>Scheduled</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr
                    key={post.id}
                    className={post.status === "failed" ? "data-table-row--failed" : undefined}
                  >
                    <td className="content-cell">
                      {previewContent(post.content)}
                      {post.status === "failed" && post.error_message && (
                        <p className="row-error-detail">{post.error_message}</p>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={post.status} />
                    </td>
                    <td className="date-cell">{formatScheduledAt(post.scheduled_at)}</td>
                    <td className="date-cell">{formatScheduledAt(post.created_at)}</td>
                    <td>
                      <div className="actions-cell">
                        {(post.status === "draft" || post.status === "scheduled") && (
                          <Link to={`/posts/${post.id}/edit`} className="btn btn--ghost btn--sm">
                            Edit
                          </Link>
                        )}
                        {post.status === "scheduled" && confirmCancelId === post.id ? (
                          <div className="confirm-inline">
                            <span>Cancel schedule?</span>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => void handleConfirmCancel(post.id)}
                              disabled={cancellingId === post.id}
                            >
                              {cancellingId === post.id ? "Cancelling…" : "Confirm"}
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => setConfirmCancelId(null)}
                              disabled={cancellingId === post.id}
                            >
                              Back
                            </button>
                          </div>
                        ) : post.status === "scheduled" ? (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setConfirmCancelId(post.id)}
                          >
                            Cancel schedule
                          </button>
                        ) : null}
                        {confirmDeleteId === post.id ? (
                          <div className="confirm-inline">
                            <span>Delete this post?</span>
                            <button
                              type="button"
                              className="btn btn--danger btn--sm"
                              onClick={() => void handleConfirmDelete(post.id)}
                              disabled={deletingId === post.id}
                            >
                              {deletingId === post.id ? "Deleting…" : "Confirm"}
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={deletingId === post.id}
                            >
                              Back
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setConfirmDeleteId(post.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {deletedPosts.length > 0 && (
          <details className="deleted-posts">
            <summary>Recently deleted ({deletedPosts.length})</summary>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Content</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedPosts.map((post) => (
                    <tr key={post.id}>
                      <td className="content-cell">{previewContent(post.content)}</td>
                      <td>
                        <StatusBadge status={post.status} />
                      </td>
                      <td className="date-cell">{post.created_at}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => void handleRestore(post.id)}
                          disabled={restoringId === post.id}
                        >
                          {restoringId === post.id ? "Restoring…" : "Restore"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </>
  );
}
