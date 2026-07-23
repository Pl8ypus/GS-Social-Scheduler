CREATE TABLE IF NOT EXISTS linkedin_connections (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,
  refresh_token_expires_at TEXT,
  scope TEXT,
  member_urn TEXT,
  profile_name TEXT,
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS linkedin_oauth_states (
  state TEXT PRIMARY KEY,
  redirect_uri TEXT NOT NULL,
  created_at TEXT NOT NULL
);
