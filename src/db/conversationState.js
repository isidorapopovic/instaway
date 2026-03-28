// src/db/conversationState.js
// Manages per-user conversation state in PostgreSQL

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
});

/**
 * Retrieve the current conversation state for a user.
 * Returns null if no active conversation exists.
 * @param {string} userId - Instagram user ID
 * @returns {Promise<object|null>}
 */
async function getConversation(userId) {
    const { rows } = await pool.query(
        'SELECT * FROM conversations WHERE instagram_user_id = $1',
        [userId]
    );
    return rows[0] || null;
}

/**
 * Create or fully replace a conversation record.
 * @param {string} userId
 * @param {object} data - { state, selectedSlot?, clientName?, offeredSlots? }
 */
async function upsertConversation(userId, data) {
    const {
        state,
        selectedSlot = null,
        clientName = null,
        offeredSlots = null,
    } = data;

    await pool.query(
        `INSERT INTO conversations
       (instagram_user_id, state, selected_slot, client_name, offered_slots, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (instagram_user_id)
     DO UPDATE SET
       state          = EXCLUDED.state,
       selected_slot  = EXCLUDED.selected_slot,
       client_name    = EXCLUDED.client_name,
       offered_slots  = EXCLUDED.offered_slots,
       updated_at     = NOW()`,
        [userId, state, selectedSlot, clientName, JSON.stringify(offeredSlots)]
    );
}

/**
 * Delete a conversation (reset to idle cleanly).
 * @param {string} userId
 */
async function deleteConversation(userId) {
    await pool.query(
        'DELETE FROM conversations WHERE instagram_user_id = $1',
        [userId]
    );
}

/**
 * Purge conversations that haven't been updated in more than `hours` hours.
 * Call this on a cron/interval to keep the table clean.
 * @param {number} hours
 */
async function purgeStaleConversations(hours = 24) {
    const { rowCount } = await pool.query(
        `DELETE FROM conversations
     WHERE updated_at < NOW() - INTERVAL '${hours} hours'`
    );
    if (rowCount > 0) {
        console.log(`[conversationState] Purged ${rowCount} stale conversation(s).`);
    }
}

module.exports = {
    pool,
    getConversation,
    upsertConversation,
    deleteConversation,
    purgeStaleConversations,
};