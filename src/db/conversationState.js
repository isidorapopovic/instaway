const { query } = require('../db');

async function getConversation(userId) {
    const { rows } = await query(
        'SELECT * FROM conversations WHERE instagram_user_id = $1',
        [userId]
    );
    return rows[0] || null;
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
            selected_slot = COALESCE(EXCLUDED.selected_slot, conversations.selected_slot),
            client_name = COALESCE(EXCLUDED.client_name, conversations.client_name),
            offered_slots = COALESCE(EXCLUDED.offered_slots, conversations.offered_slots),
            updated_at = NOW()
        `,
        [
            userId,
            state,
            selectedSlot ?? null,
            clientName ?? null,
            offeredSlots ? JSON.stringify(offeredSlots) : null,
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