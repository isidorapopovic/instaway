CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  instagram_sender_id TEXT,
  instagram_recipient_id TEXT,
  message_text TEXT,
  message_mid TEXT,
  event_timestamp BIGINT,
  raw_payload JSONB,
  sender TEXT,
  recipient TEXT,
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);