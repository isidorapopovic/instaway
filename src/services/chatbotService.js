// src/services/chatbotService.js
const {
    getAvailableSlots,
    createBookingEvent,
    cancelBookingEvent,
    rescheduleBookingEvent,
    formatSlot,
} = require('./googleCalendarService');

async function processUserMessage({ userId, text, conversation }) {
    const lower = text.toLowerCase();

    if (lower.includes('available') || lower.includes('free') || lower.includes('slot')) {
        const slots = await getAvailableSlots();
        if (!slots.length) {
            return {
                reply: 'I do not have any available appointments at the moment.',
                nextState: 'idle',
            };
        }

        return {
            reply:
                'Here are the next available appointments:\n' +
                slots.slice(0, 5).map((slot, i) => `${i + 1}. ${formatSlot(slot)}`).join('\n'),
            nextState: 'awaiting_slot_choice',
            meta: { offeredSlots: slots.map(s => new Date(s).toISOString()) },
        };
    }

    if (lower.includes('book') || lower.includes('appointment') || lower.includes('schedule')) {
        const slots = await getAvailableSlots();
        if (!slots.length) {
            return {
                reply: 'I do not have any available appointments right now.',
                nextState: 'idle',
            };
        }

        return {
            reply:
                'Sure — here are the next available slots:\n' +
                slots.slice(0, 5).map((slot, i) => `${i + 1}. ${formatSlot(slot)}`).join('\n') +
                '\nReply with the number of the slot you want.',
            nextState: 'awaiting_slot_choice',
            meta: { offeredSlots: slots.map(s => new Date(s).toISOString()) },
        };
    }

    if (lower.includes('cancel')) {
        return {
            reply: 'Please send me the date and time of the booking you want to cancel.',
            nextState: 'awaiting_cancellation_details',
        };
    }

    if (lower.includes('reschedule') || lower.includes('move my appointment')) {
        return {
            reply: 'Please send me your current booking date and the new date you want.',
            nextState: 'awaiting_reschedule_details',
        };
    }

    return {
        reply: 'I can help with bookings, availability, rescheduling, and cancellations. What would you like to do?',
        nextState: 'idle',
    };
}

module.exports = { processUserMessage };