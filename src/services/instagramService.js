// src/services/instagramService.js
// Sends replies back to Instagram users via the Graph API.

const axios = require('axios');

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

/**
 * Send a plain-text DM to an Instagram user.
 * @param {string} recipientId - Instagram-scoped user ID
 * @param {string} text        - Message content
 * @returns {Promise<void>}
 */
async function sendMessage(recipientId, text) {
    try {
        await axios.post(
            `${GRAPH_API_BASE}/me/messages`,
            {
                recipient: { id: recipientId },
                message: { text },
            },
            {
                params: { access_token: process.env.IG_ACCESS_TOKEN },
            }
        );
        console.log(`[instagramService] Sent message to ${recipientId}`);
    } catch (err) {
        const detail = err.response?.data || err.message;
        console.error('[instagramService] Failed to send message:', detail);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Pre-built message templates
// Keep wording here so it's easy to update copy without touching logic.
// ---------------------------------------------------------------------------

/**
 * Greeting when scheduling intent is detected.
 * @param {string[]} slotLabels - Human-readable slot strings, e.g. ["Monday, 31 Mar at 10:00", ...]
 * @returns {string}
 */
function buildSlotOfferMessage(slotLabels) {
    const numbered = slotLabels
        .map((label, i) => `  ${i + 1}. ${label}`)
        .join('\n');

    return (
        `Hi! 👋 I'd love to book you in for a treatment.\n` +
        `Here are my next available slots:\n\n` +
        `${numbered}\n\n` +
        `Just reply with the number of the slot that works best for you.`
    );
}

/**
 * Ask for the client's name after they pick a slot.
 * @param {string} slotLabel
 * @returns {string}
 */
function buildAskNameMessage(slotLabel) {
    return (
        `Great choice! 🗓 I've reserved ${slotLabel} for you.\n` +
        `Could you please tell me your name so I can confirm the booking?`
    );
}

/**
 * Confirmation message after name is received.
 * @param {string} clientName
 * @param {string} slotLabel
 * @returns {string}
 */
function buildConfirmationMessage(clientName, slotLabel) {
    return (
        `You're all set, ${clientName}! ✅\n` +
        `Your treatment is confirmed for ${slotLabel}.\n` +
        `See you then! If anything changes, feel free to message me. 💙`
    );
}

/**
 * Fallback when no slots are available.
 * @returns {string}
 */
function buildNoSlotsMessage() {
    return (
        `Hi! Thank you for reaching out. 😊\n` +
        `Unfortunately I don't have any free slots in the next 7 days.\n` +
        `Please check back soon or send me a message and we'll figure something out!`
    );
}

/**
 * Invalid choice response.
 * @param {number} max - number of slots offered
 * @returns {string}
 */
function buildInvalidChoiceMessage(max) {
    return `Please reply with a number between 1 and ${max} to pick a slot. 🙏`;
}

module.exports = {
    sendMessage,
    buildSlotOfferMessage,
    buildAskNameMessage,
    buildConfirmationMessage,
    buildNoSlotsMessage,
    buildInvalidChoiceMessage,
};