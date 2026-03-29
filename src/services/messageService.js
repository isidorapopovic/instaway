const db = require('../db');

async function saveMessage({
    senderId = null,
    recipientId = null,
    text = null,
    mid = null,
    timestamp = null,
    rawPayload,
}) {
    const sql = `
    INSERT INTO messages (
      instagram_sender_id,
      instagram_recipient_id,
      message_text,
      message_mid,
      event_timestamp,
      raw_payload
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (message_mid) DO NOTHING
    RETURNING *;
  `;

    const values = [senderId, recipientId, text, mid, timestamp, rawPayload];

    try {
        console.log('[messageService] attempting insert', {
            senderId,
            recipientId,
            text,
            mid,
            timestamp,
        });

        const result = await db.query(sql, values);

        if (result.rows[0]) {
            console.log('[messageService] inserted row id:', result.rows[0].id);
        } else {
            console.log('[messageService] no row inserted (likely duplicate mid)');
        }

        return result.rows[0] || null;
    } catch (err) {
        console.error('[messageService] saveMessage failed:', err.message);
        console.error(err.stack);
        throw err;
    }
}

async function getMessages(limit = 50) {
    const safeLimit = Number.isInteger(limit) ? limit : 50;

    const sql = `
    SELECT
      id,
      instagram_sender_id,
      instagram_recipient_id,
      message_text,
      message_mid,
      event_timestamp,
      raw_payload,
      created_at
    FROM messages
    ORDER BY created_at DESC
    LIMIT $1;
  `;

    const result = await db.query(sql, [safeLimit]);
    return result.rows;
}

module.exports = { saveMessage, getMessages };