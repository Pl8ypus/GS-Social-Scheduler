-- One row per cron / manual scheduler invocation.
CREATE TABLE IF NOT EXISTS scheduler_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  due_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  recovered_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_started_at ON scheduler_runs(started_at);

-- Append-only publish attempt log (separate from mutable posts rows).
CREATE TABLE IF NOT EXISTS publish_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
  result TEXT NOT NULL CHECK (result IN ('success', 'failed')),
  error_detail TEXT,
  linkedin_post_id TEXT,
  scheduler_run_id INTEGER,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (scheduler_run_id) REFERENCES scheduler_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_publish_events_post_id ON publish_events(post_id);
CREATE INDEX IF NOT EXISTS idx_publish_events_attempted_at ON publish_events(attempted_at);
CREATE INDEX IF NOT EXISTS idx_publish_events_result ON publish_events(result);
