-- Conversation state tracking for Instagram scheduling automation
CREATE TABLE IF NOT EXISTS conversations (
  instagram_user_id TEXT PRIMARY KEY,
  state             TEXT NOT NULL DEFAULT 'idle',
  -- 'idle' | 'awaiting_slot_choice' | 'awaiting_name' | 'confirmed'
  selected_slot     TIMESTAMPTZ,
  client_name       TEXT,
  offered_slots     JSONB,          -- array of ISO strings offered to the user
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup jobs (remove stale conversations older than 24h)
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx
  ON conversations (updated_at);