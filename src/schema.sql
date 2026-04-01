CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  instagram_sender_id TEXT,
  instagram_recipient_id TEXT,
  message_text TEXT,
  message_mid TEXT UNIQUE,
  event_timestamp BIGINT,
  raw_payload JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
  instagram_user_id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'idle',
  selected_slot TIMESTAMPTZ,
  client_name TEXT,
  offered_slots JSONB,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  instagram_user_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  calendar_event_id TEXT NOT NULL,
  calendar_event_link TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);