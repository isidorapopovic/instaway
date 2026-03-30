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
        console.warn('[messageService] Skipping insert because message_mid is missing');
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
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (message_mid) DO NOTHING
    RETURNING *;
  `;

    const values = [
        senderId,
        recipientId,
        text,
        mid,
        timestamp,
        rawPayload ? JSON.stringify(rawPayload) : null,
    ];

    try {
        const result = await db.query(sql, values);

        if (result.rows.length === 0) {
            console.log('[messageService] Message already existed, nothing inserted:', mid);
            return null;
        }

        console.log('[messageService] Inserted message row:', result.rows[0]);
        return result.rows[0];
    } catch (err) {
        console.error('[messageService] saveMessage failed:', err.message);
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