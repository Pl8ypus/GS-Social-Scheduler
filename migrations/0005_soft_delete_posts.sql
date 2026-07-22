-- L1: soft delete. Deleting a post now stamps `deleted_at` instead of removing
-- the row, so deletion is recoverable. Normal queries filter `deleted_at IS NULL`.
ALTER TABLE posts ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_posts_deleted_at ON posts(deleted_at);
