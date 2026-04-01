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
    buildGeneralBookingHelpMessage,
    buildSlotTakenMessage,
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

const RESET_KEYWORDS = [
    'reset',
    'start over',
    'start again',
    'book again',
    'new booking',
    'cancel',
    'cancel booking',
    'ponovo',
    'ispočetka',
    'ispocetka',
];

function normaliseText(text) {
    return String(text || '').trim();
}

function isSchedulingIntent(text) {
    const lower = normaliseText(text).toLowerCase();
    return SCHEDULING_KEYWORDS.some(kw => lower.includes(kw));
}

function isResetIntent(text) {
    const lower = normaliseText(text).toLowerCase();
    return RESET_KEYWORDS.some(kw => lower.includes(kw));
}

async function safeSendMessage(userId, text) {
    try {
        return await sendMessage(userId, text);
    } catch (err) {
        if (err.code === 'IG_TOKEN_INVALID') {
            console.error(
                `[messageHandler] Cannot send message to ${userId}: Instagram token expired or invalid`
            );
            return null;
        }

        throw err;
    }
}

async function handleIdle(userId, text) {
    if (!isSchedulingIntent(text)) {
        await safeSendMessage(userId, buildGeneralBookingHelpMessage());
        return;
    }

    const slots = await getAvailableSlots();

    if (!slots || slots.length === 0) {
        await safeSendMessage(userId, buildNoSlotsMessage());
        return;
    }

    const slotLabels = slots.map(formatSlot);

    await upsertConversation(userId, {
        state: 'awaiting_slot_choice',
        offeredSlots: slots.map(s => (s instanceof Date ? s.toISOString() : s)),
    });

    await safeSendMessage(userId, buildSlotOfferMessage(slotLabels));
}

async function handleAwaitingSlotChoice(userId, text, conversation) {
    const offeredSlots = conversation?.offered_slots || [];

    if (!offeredSlots.length) {
        console.warn(
            `[messageHandler] No offered slots stored for ${userId}, resetting conversation.`
        );
        await deleteConversation(userId);
        await safeSendMessage(
            userId,
            "I couldn't find your offered slots any more, so I've reset the conversation. Send a booking message and I'll show you the latest availability."
        );
        return;
    }

    const choice = parseInt(normaliseText(text), 10);

    if (Number.isNaN(choice) || choice < 1 || choice > offeredSlots.length) {
        await safeSendMessage(userId, buildInvalidChoiceMessage(offeredSlots.length));
        return;
    }

    const selectedSlot = offeredSlots[choice - 1];
    const slotLabel = formatSlot(selectedSlot);

    await upsertConversation(userId, {
        state: 'awaiting_name',
        offeredSlots,
        selectedSlot,
    });

    await safeSendMessage(userId, buildAskNameMessage(slotLabel));
}

async function handleAwaitingName(userId, text, conversation) {
    const clientName = normaliseText(text);
    const selectedSlot = conversation?.selected_slot;

    if (!clientName || clientName.length < 2) {
        await safeSendMessage(
            userId,
            'Could you share your full name so I can confirm the booking?'
        );
        return;
    }

    if (!selectedSlot) {
        console.error(`[messageHandler] Missing selectedSlot for ${userId}, resetting.`);
        await deleteConversation(userId);
        await safeSendMessage(
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

        const message = /taken|exists|conflict|busy|overlap/i.test(err.message)
            ? buildSlotTakenMessage()
            : "I'm sorry, I had trouble saving your booking right now. Please try again in a moment.";

        await safeSendMessage(userId, message);
        return;
    }

    await safeSendMessage(userId, buildConfirmationMessage(clientName, slotLabel));
    await deleteConversation(userId);
}

async function handleIncomingMessage(userId, text) {
    const cleanText = normaliseText(text);

    if (!cleanText) return;

    let conversation;

    try {
        conversation = await getConversation(userId);
    } catch (err) {
        console.error('[messageHandler] DB error:', err.message);

        try {
            await safeSendMessage(
                userId,
                "I'm having a temporary database issue at the moment. Please try again shortly."
            );
        } catch (_) { }

        return;
    }

    if (isResetIntent(cleanText)) {
        try {
            await deleteConversation(userId);
            await safeSendMessage(
                userId,
                "I've reset our conversation. Send a booking message whenever you're ready and I'll show you the next available slots."
            );
        } catch (err) {
            console.error(`[messageHandler] Reset failed for user ${userId}:`, err.message);
        }
        return;
    }

    const state = conversation?.state || 'idle';

    console.log(
        `[messageHandler] user=${userId} state=${state} text="${cleanText.substring(0, 60)}"`
    );

    try {
        switch (state) {
            case 'idle':
                await handleIdle(userId, cleanText);
                break;

            case 'awaiting_slot_choice':
                await handleAwaitingSlotChoice(userId, cleanText, conversation);
                break;

            case 'awaiting_name':
                await handleAwaitingName(userId, cleanText, conversation);
                break;

            default:
                console.warn(`[messageHandler] Unknown state "${state}", resetting.`);
                await deleteConversation(userId);
                await handleIdle(userId, cleanText);
                break;
        }
    } catch (err) {
        if (err.code === 'IG_TOKEN_INVALID') {
            console.error(
                `[messageHandler] Stopping reply flow for user ${userId}: Instagram token expired or invalid`
            );
            return;
        }

        console.error(`[messageHandler] Error for user ${userId}:`, err.message);

        try {
            await safeSendMessage(
                userId,
                "Something went wrong while processing your message. Please try again."
            );
        } catch (_) { }
    }
}

module.exports = { handleIncomingMessage };