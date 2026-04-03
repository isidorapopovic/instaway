const { query } = require('../db');

function safeParseJson(value, fallback = null) {
    if (value == null) return fallback;
    if (Array.isArray(value) || typeof value === 'object') return value;

    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
}

function normaliseConversationRow(row) {
    if (!row) return null;

    return {
        ...row,
        offered_slots: safeParseJson(row.offered_slots, []),
    };
}

async function getConversation(userId) {
    const { rows } = await query(
        'SELECT * FROM conversations WHERE instagram_user_id = $1',
        [userId]
    );

    return normaliseConversationRow(rows[0] || null);
}

async function upsertConversation(userId, data) {
    const {
        state,
        selectedSlot,
        clientName,
        offeredSlots,
    } = data;

    await query(
        `
    INSERT INTO conversations (
        instagram_user_id,
        state,
        selected_slot,
        client_name,
        offered_slots,
        updated_at
    )
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (instagram_user_id)
    DO UPDATE SET
        state = EXCLUDED.state,
        selected_slot = EXCLUDED.selected_slot,
        client_name = EXCLUDED.client_name,
        offered_slots = EXCLUDED.offered_slots,
        updated_at = NOW()
    `,
        [
            userId,
            state ?? null,
            selectedSlot ?? null,
            clientName ?? null,
            offeredSlots != null ? JSON.stringify(offeredSlots) : null,
        ]
    );
}

async function deleteConversation(userId) {
    await query(
        'DELETE FROM conversations WHERE instagram_user_id = $1',
        [userId]
    );
}

async function purgeStaleConversations(hours = 24) {
    const safeHours = Number(hours) || 24;

    const { rowCount } = await query(
        `
        DELETE FROM conversations
        WHERE updated_at < NOW() - ($1::text || ' hours')::interval
        `,
        [String(safeHours)]
    );

    if (rowCount > 0) {
        console.log(
            `[conversationState] Purged ${rowCount} stale conversation(s).`
        );
    }
}

module.exports = {
    getConversation,
    upsertConversation,
    deleteConversation,
    purgeStaleConversations,
};