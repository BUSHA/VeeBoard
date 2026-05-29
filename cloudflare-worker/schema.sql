CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  data TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS board_users (
  board_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  avatar_key TEXT DEFAULT '',
  is_admin INTEGER DEFAULT 0,
  is_approved INTEGER DEFAULT 1,
  updated_at TEXT,
  PRIMARY KEY (board_id, email)
);

CREATE TABLE IF NOT EXISTS board_user_credentials (
  board_id TEXT NOT NULL,
  email TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  updated_at TEXT,
  PRIMARY KEY (board_id, email)
);

CREATE TABLE IF NOT EXISTS board_sessions (
  token TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS board_notifications (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  actor_email TEXT DEFAULT '',
  type TEXT NOT NULL,
  card_id TEXT DEFAULT '',
  comment_id TEXT DEFAULT '',
  title TEXT DEFAULT '',
  body TEXT DEFAULT '',
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  read_at TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_board_users_board_id ON board_users(board_id);
CREATE INDEX IF NOT EXISTS idx_board_user_credentials_board_id ON board_user_credentials(board_id);
CREATE INDEX IF NOT EXISTS idx_board_sessions_board_id ON board_sessions(board_id);
CREATE INDEX IF NOT EXISTS idx_board_notifications_recipient ON board_notifications(board_id, recipient_email, created_at);
CREATE INDEX IF NOT EXISTS idx_board_notifications_unread ON board_notifications(board_id, recipient_email, read_at);
