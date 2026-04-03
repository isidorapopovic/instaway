// src/services/toolExecutor.js
const {
    getAvailableSlots,
    createBookingEvent,
    cancelBookingEvent,
    rescheduleBookingEvent,
} = require('./googleCalendarService');

async function executeToolCall(toolCall) {
    const name = toolCall.function.name;
    let args;

    try {
        args = JSON.parse(toolCall.function.arguments || '{}');
    } catch (err) {
        throw new Error('Invalid JSON arguments from model');
    }

    switch (name) {
        case 'get_available_slots':
            return await getAvailableSlots(args);

        case 'create_booking':
            return await createBookingEvent(args);

        case 'cancel_booking':
            return await cancelBookingEvent(args);

        case 'reschedule_booking':
            return await rescheduleBookingEvent(args);

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

module.exports = { executeToolCall };