const axios = require('axios');

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

const axios = require('axios');

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

async function sendMessage(recipientId, text) {
    const token = process.env.IG_ACCESS_TOKEN;
    const pageId = process.env.FB_PAGE_ID;

    console.log('[instagramService] token exists:', !!token);
    console.log('[instagramService] pageId exists:', !!pageId);
    console.log('[instagramService] recipientId:', recipientId);
    console.log('[instagramService] text:', text);

    if (!recipientId) {
        throw new Error('recipientId is required');
    }

    if (!text || !text.trim()) {
        throw new Error('text is required');
    }

    if (!token) {
        throw new Error('IG_ACCESS_TOKEN is missing from environment variables');
    }

    if (!pageId) {
        throw new Error('FB_PAGE_ID is missing from environment variables');
    }

    try {
        const response = await axios.post(
            `${GRAPH_API_BASE}/${pageId}/messages`,
            {
                recipient: { id: recipientId },
                message: { text: text.trim() },
            },
            {
                params: { access_token: token },
                timeout: 10000,
            }
        );

        console.log('[instagramService] Meta response:', response.data);
        console.log(`[instagramService] Sent message to ${recipientId}`);
        return response.data;
    } catch (err) {
        const metaError = err.response?.data?.error;

        if (metaError) {
            console.error('[instagramService] Meta API error:', {
                message: metaError.message,
                type: metaError.type,
                code: metaError.code,
                error_subcode: metaError.error_subcode,
                fbtrace_id: metaError.fbtrace_id,
            });

            if (metaError.code === 190 || metaError.error_subcode === 463) {
                const tokenError = new Error('Instagram access token expired or invalid');
                tokenError.code = 'IG_TOKEN_INVALID';
                tokenError.meta = metaError;
                throw tokenError;
            }

            const apiError = new Error(metaError.message || 'Instagram API request failed');
            apiError.code = 'IG_API_ERROR';
            apiError.meta = metaError;
            throw apiError;
        }

        console.error('[instagramService] Request failed:', err.message);
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
