const {
    getConversation,
    upsertConversation,
    deleteConversation,
} = require('../db/conversationState');

const {
    getAvailableSlots,
    createBookingEvent,
    formatSlot,
} = require('../services/googleCalendarService');

const {
    sendMessage,
    buildSlotOfferMessage,
    buildAskNameMessage,
    buildConfirmationMessage,
    buildNoSlotsMessage,
    buildInvalidChoiceMessage,
} = require('../services/instagramService');

const SCHEDULING_KEYWORDS = [
    'book',
    'booking',
    'schedule',
    'appointment',
    'treatment',
    'available',
    'availability',
    'slot',
    'reserve',
    'reservation',
    'when can',
    'free time',
    'come in',
    'visit',
    'rezerv',
    'termin',
    'zakazati',
    'zakazivanje',
    'slobodan',
    'tretman',
    'dolazak',
];

function isSchedulingIntent(text) {
    const lower = text.toLowerCase();
    return SCHEDULING_KEYWORDS.some(kw => lower.includes(kw));
}

async function handleIdle(userId, text) {
    if (!isSchedulingIntent(text)) {
        await sendMessage(
            userId,
            "Hi! I can help with bookings. Send a message like 'book an appointment' or 'when is your next free slot?'."
        );
        return;
    }

    const slots = await getAvailableSlots();

    if (slots.length === 0) {
        await sendMessage(userId, buildNoSlotsMessage());
        return;
    }

    const slotLabels = slots.map(formatSlot);

    await upsertConversation(userId, {
        state: 'awaiting_slot_choice',
        offeredSlots: slots.map(s => (s instanceof Date ? s.toISOString() : s)),
    });

    await sendMessage(userId, buildSlotOfferMessage(slotLabels));
}

async function handleAwaitingSlotChoice(userId, text, conversation) {
    const offeredSlots = conversation.offered_slots || [];
    const choice = parseInt(text.trim(), 10);

    if (isNaN(choice) || choice < 1 || choice > offeredSlots.length) {
        await sendMessage(userId, buildInvalidChoiceMessage(offeredSlots.length));
        return;
    }

    const selectedSlot = offeredSlots[choice - 1];
    const slotLabel = formatSlot(selectedSlot);

    await upsertConversation(userId, {
        state: 'awaiting_name',
        offeredSlots,
        selectedSlot,
    });

    await sendMessage(userId, buildAskNameMessage(slotLabel));
}

async function handleAwaitingName(userId, text, conversation) {
    const clientName = text.trim();
    const selectedSlot = conversation.selected_slot;

    if (!clientName || clientName.length < 2) {
        await sendMessage(
            userId,
            'Could you share your full name so I can confirm the booking?'
        );
        return;
    }

    if (!selectedSlot) {
        console.error(`[messageHandler] Missing selectedSlot for ${userId}, resetting.`);
        await deleteConversation(userId);
        await sendMessage(
            userId,
            "Something went wrong on my end. Let's start over — send 'book an appointment' and I'll show you the next slots."
        );
        return;
    }

    const slotLabel = formatSlot(selectedSlot);

    try {
        await createBookingEvent({
            startTime: new Date(selectedSlot),
            clientName,
            instagramUserId: userId,
        });
    } catch (err) {
        console.error('[messageHandler] Failed to create calendar event:', err.message);
        await sendMessage(
            userId,
            "I'm sorry, I had trouble saving your booking right now. Please try again in a moment."
        );
        return;
    }

    await sendMessage(userId, buildConfirmationMessage(clientName, slotLabel));
    await deleteConversation(userId);
}

async function handleIncomingMessage(userId, text) {
    if (!text || !text.trim()) return;

    let conversation;

    try {
        conversation = await getConversation(userId);
    } catch (err) {
        console.error('[messageHandler] DB error:', err.message);
        await sendMessage(
            userId,
            "I'm having a temporary database issue at the moment. Please try again shortly."
        );
        return;
    }

    const state = conversation?.state || 'idle';

    console.log(`[messageHandler] user=${userId} state=${state} text="${text.substring(0, 60)}"`);

    try {
        switch (state) {
            case 'idle':
                await handleIdle(userId, text);
                break;
            case 'awaiting_slot_choice':
                await handleAwaitingSlotChoice(userId, text, conversation);
                break;
            case 'awaiting_name':
                await handleAwaitingName(userId, text, conversation);
                break;
            default:
                console.warn(`[messageHandler] Unknown state "${state}", resetting.`);
                await deleteConversation(userId);
                await handleIdle(userId, text);
                break;
        }
    } catch (err) {
        console.error(`[messageHandler] Error for user ${userId}:`, err.message);
        try {
            await sendMessage(
                userId,
                "Something went wrong while processing your message. Please try again."
            );
        } catch (_) { }
    }
}

module.exports = { handleIncomingMessage };