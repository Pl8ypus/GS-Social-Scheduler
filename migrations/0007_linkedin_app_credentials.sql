CREATE TABLE IF NOT EXISTS linkedin_app_credentials (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  client_id TEXT NOT NULL,
  client_secret_encrypted TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
