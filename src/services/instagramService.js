const axios = require('axios');

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

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

function buildSlotOfferMessage(slotLabels) {
    const numbered = slotLabels
        .map((label, i) => `${i + 1}. ${label}`)
        .join('\n');

    return (
        `Hi! I'd love to book you in for a treatment.\n\n` +
        `Here are my next available slots:\n` +
        `${numbered}\n\n` +
        `Reply with the number of the slot that works best for you.`
    );
}

function buildAskNameMessage(slotLabel) {
    return (
        `Great choice. I've noted ${slotLabel} for you.\n` +
        `Please send me your full name so I can confirm the booking.`
    );
}

function buildConfirmationMessage(clientName, slotLabel) {
    return (
        `You're all set, ${clientName}. ✅\n` +
        `Your treatment is confirmed for ${slotLabel}.\n` +
        `See you then. If anything changes, just message me here.`
    );
}

function buildNoSlotsMessage() {
    return (
        `Hi! Thank you for reaching out.\n\n` +
        `I don't currently have any free slots in the next 7 days.\n` +
        `Please message again soon and I'll check again for you.`
    );
}

function buildInvalidChoiceMessage(max) {
    return `Please reply with a number between 1 and ${max} to choose a slot.`;
}

function buildGeneralBookingHelpMessage() {
    return (
        `Hi! I can help with bookings.\n\n` +
        `Send a message like:\n` +
        `• book an appointment\n` +
        `• I want a treatment\n` +
        `• when is your next free slot?`
    );
}

function buildSlotTakenMessage() {
    return (
        `I'm sorry — that slot has just been taken.\n` +
        `Please send another booking message and I'll show you the newest available times.`
    );
}

module.exports = {
    sendMessage,
    buildSlotOfferMessage,
    buildAskNameMessage,
    buildConfirmationMessage,
    buildNoSlotsMessage,
    buildInvalidChoiceMessage,
    buildGeneralBookingHelpMessage,
    buildSlotTakenMessage,
};