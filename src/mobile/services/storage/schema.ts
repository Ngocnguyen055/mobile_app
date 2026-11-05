/** Initial schema. Existing installations are upgraded in database.ts. */
export const CREATE_SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  scope TEXT NOT NULL,
  message_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  group_id TEXT,
  timestamp INTEGER NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY(scope,message_id,sender_id,receiver_id)
);
CREATE INDEX IF NOT EXISTS messages_order ON messages(scope,timestamp);

CREATE TABLE IF NOT EXISTS storage_migrations (name TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS reminders (
  task_id TEXT PRIMARY KEY,
  notification_ids TEXT NOT NULL,
  signature TEXT
);
CREATE TABLE IF NOT EXISTS event_reminders (
  event_id TEXT PRIMARY KEY,
  notification_ids TEXT NOT NULL,
  signature TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS direct_chat_preferences (
  scope TEXT NOT NULL,
  user_id TEXT NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(scope,user_id)
);
CREATE TABLE IF NOT EXISTS direct_chat_contacts (
  scope TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(scope,user_id)
);

CREATE TABLE IF NOT EXISTS chat_outbox (
  scope TEXT NOT NULL,
  id TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(scope,id)
);
CREATE INDEX IF NOT EXISTS chat_outbox_order ON chat_outbox(scope,created_at,id);
CREATE TABLE IF NOT EXISTS chat_sync_state (
  scope TEXT PRIMARY KEY,
  cursor TEXT
);

CREATE TABLE IF NOT EXISTS attachment_cache (
  scope TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  local_uri TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL,
  last_accessed_at INTEGER NOT NULL,
  PRIMARY KEY(scope,attachment_id)
);
CREATE INDEX IF NOT EXISTS attachment_cache_lru
  ON attachment_cache(scope,last_accessed_at,attachment_id);
`;
