-- Add `publishing` status for two-phase scheduler claims (idempotent publish).
PRAGMA foreign_keys = OFF;

CREATE TABLE posts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  link_url TEXT,
  image_url TEXT,
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'publishing', 'posted', 'failed')),
  linkedin_post_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO posts_new (
  id, content, link_url, image_url, scheduled_at, status,
  linkedin_post_id, error_message, created_at
)
SELECT
  id, content, link_url, image_url, scheduled_at, status,
  linkedin_post_id, error_message, created_at
FROM posts;

DROP TABLE posts;

ALTER TABLE posts_new RENAME TO posts;

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_at ON posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_posts_publishing ON posts(status)
  WHERE status = 'publishing';

PRAGMA foreign_keys = ON;
