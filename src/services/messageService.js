const db = require('../db');

async function saveMessage({
    senderId = null,
    recipientId = null,
    text = null,
    mid = null,
    timestamp = null,
    rawPayload = null,
}) {
    if (!mid) {
        console.warn('[messageService] Missing mid, skipping insert');
        return null;
    }

    const sql = `
    INSERT INTO messages (
      instagram_sender_id,
      instagram_recipient_id,
      message_text,
      message_mid,
      event_timestamp,
      raw_payload
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    ON CONFLICT (message_mid) DO NOTHING
    RETURNING *;
  `;

    const values = [
        senderId,
        recipientId,
        text,
        mid,
        timestamp,
        JSON.stringify(rawPayload || {}),
    ];

    try {
        const result = await db.query(sql, values);

        if (result.rows.length === 0) {
            console.log('[messageService] Message already exists, skipped:', mid);
            return null;
        }

        console.log('[messageService] Inserted message:', result.rows[0].id);
        return result.rows[0];
    } catch (err) {
        console.error('[messageService] Failed to insert message:', err.message);
        throw err;
    }
}

async function getMessages(limit = 50) {
    const result = await db.query(
        `SELECT * FROM messages ORDER BY created_at DESC LIMIT $1`,
        [limit]
    );
    return result.rows;
}

module.exports = {
    saveMessage,
    getMessages,
};