const OpenAI = require('openai');

const {
    getConversation,
    upsertConversation,
    deleteConversation,
} = require('../db/conversationState');

const {
    getAvailableSlots,
    createBookingEvent,
    formatSlot,
    isSlotStillAvailable,
    getUserUpcomingBookings,
    cancelNextBookingForUser,
    rescheduleNextBookingForUser,
} = require('../services/googleCalendarService');

const { sendMessage } = require('../services/instagramService');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

const RESET_KEYWORDS = [
    'reset',
    'start over',
    'start again',
    'book again',
    'new booking',
    'cancel flow',
    'clear',
    'ponovo',
    'ispočetka',
    'ispocetka',
];

function normaliseText(text) {
    return String(text || '').trim();
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

function buildSystemPrompt(conversation) {
    const state = conversation?.state || 'idle';
    const offeredSlots = conversation?.offered_slots || [];
    const selectedSlot = conversation?.selected_slot || null;

    const offeredSlotsText = offeredSlots.length
        ? offeredSlots.map((slot, idx) => `${idx + 1}. ${formatSlot(slot)} | ${new Date(slot).toISOString()}`).join('\n')
        : 'None';

    const selectedSlotText = selectedSlot
        ? `${formatSlot(selectedSlot)} | ${new Date(selectedSlot).toISOString()}`
        : 'None';

    return `
You are an Instagram DM booking assistant for a beauty/treatment business.

Your job:
- help users check availability
- help them choose a slot
- ask for their full name before booking
- create the booking
- answer questions about their next booking
- cancel or reschedule their next booking if they ask

Important rules:
- Never invent slots, times, bookings, or confirmations.
- Use tools whenever calendar data is needed.
- Keep replies short, friendly, and natural.
- If the user is choosing from offered slots, prefer the slot numbers shown below.
- If a user has selected a slot but has not yet given their full name, ask for their full name unless the current message clearly contains it.
- If a user wants to cancel, cancel only their next upcoming booking.
- If a user wants to reschedule, move only their next upcoming booking.
- If anything is unclear, ask one concise follow-up question.

Current conversation state:
- state: ${state}
- offered slots:
${offeredSlotsText}
- selected slot:
${selectedSlotText}

Interpretation hints:
- "first", "1", "the first one", "number 1" all mean choiceNumber=1
- "second", "2", "the second one" all mean choiceNumber=2
- If state=awaiting_name and the message looks like a person's name, call create_booking_from_selected_slot
- If state=idle and the user asks for booking/availability, call get_available_slots
`.trim();
}

const tools = [
    {
        type: 'function',
        function: {
            name: 'get_available_slots',
            description: 'Get available appointment slots from Google Calendar.',
            parameters: {
                type: 'object',
                properties: {
                    date: {
                        type: 'string',
                        description: 'Optional date in YYYY-MM-DD format if the user specified a date.'
                    },
                    period: {
                        type: 'string',
                        enum: ['morning', 'afternoon', 'evening'],
                        description: 'Optional time-of-day preference.'
                    }
                },
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'select_offered_slot',
            description: 'Select one of the currently offered slots by number.',
            parameters: {
                type: 'object',
                properties: {
                    choiceNumber: {
                        type: 'integer',
                        minimum: 1
                    }
                },
                required: ['choiceNumber'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_booking_from_selected_slot',
            description: 'Create a booking for the currently selected slot using the user full name.',
            parameters: {
                type: 'object',
                properties: {
                    clientName: {
                        type: 'string',
                        description: 'The user full name.'
                    }
                },
                required: ['clientName'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_my_bookings',
            description: 'Get the user upcoming bookings.',
            parameters: {
                type: 'object',
                properties: {},
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'cancel_my_next_booking',
            description: 'Cancel the user next upcoming booking.',
            parameters: {
                type: 'object',
                properties: {},
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'reschedule_my_next_booking',
            description: 'Reschedule the user next booking to a new start time.',
            parameters: {
                type: 'object',
                properties: {
                    newSlotIso: {
                        type: 'string',
                        description: 'The new slot start time in ISO 8601 format.'
                    }
                },
                required: ['newSlotIso'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'reset_booking_flow',
            description: 'Clear the current booking flow if the user wants to start over.',
            parameters: {
                type: 'object',
                properties: {},
                additionalProperties: false
            }
        }
    }
];

function parseToolArgs(toolCall) {
    try {
        const parsed = JSON.parse(toolCall.function.arguments || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
        throw new Error(`Invalid tool arguments for ${toolCall.function.name}`);
    }
}

async function runModel(messages) {
    const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.2,
        tools,
        tool_choice: 'auto',
        messages,
    });

    return response.choices[0].message;
}

async function executeToolCall(userId, conversation, toolCall) {
    const args = parseToolArgs(toolCall);
    const state = conversation?.state || 'idle';
    const offeredSlots = conversation?.offered_slots || [];
    const selectedSlot = conversation?.selected_slot || null;

    switch (toolCall.function.name) {
        case 'get_available_slots': {
            const date = typeof args.date === 'string' ? args.date : undefined;
            const period = ['morning', 'afternoon', 'evening'].includes(args.period)
                ? args.period
                : undefined;

            const slots = await getAvailableSlots({ date, period });

            if (!slots.length) {
                await upsertConversation(userId, {
                    state: 'idle',
                    offeredSlots: [],
                    selectedSlot: null,
                });

                return {
                    ok: true,
                    action: 'get_available_slots',
                    slots: [],
                    text: "There are no available slots at the moment.",
                };
            }

            await upsertConversation(userId, {
                state: 'awaiting_slot_choice',
                offeredSlots: slots.map(s => (s instanceof Date ? s.toISOString() : s)),
                selectedSlot: null,
            });

            return {
                ok: true,
                action: 'get_available_slots',
                slots: slots.map((slot, idx) => ({
                    number: idx + 1,
                    iso: new Date(slot).toISOString(),
                    label: formatSlot(slot),
                })),
                text: slots.map((slot, idx) => `${idx + 1}. ${formatSlot(slot)}`).join('\n'),
            };
        }

        case 'select_offered_slot': {
            const choiceNumber = Number(args.choiceNumber);

            if (!Number.isInteger(choiceNumber) || choiceNumber < 1 || choiceNumber > offeredSlots.length) {
                return {
                    ok: false,
                    action: 'select_offered_slot',
                    text: offeredSlots.length
                        ? `Invalid slot choice. The valid range is 1 to ${offeredSlots.length}.`
                        : 'There are no currently offered slots to choose from.',
                };
            }

            const chosen = offeredSlots[choiceNumber - 1];

            await upsertConversation(userId, {
                state: 'awaiting_name',
                offeredSlots,
                selectedSlot: chosen,
            });

            return {
                ok: true,
                action: 'select_offered_slot',
                selectedSlotIso: new Date(chosen).toISOString(),
                selectedSlotLabel: formatSlot(chosen),
                text: `Selected slot ${choiceNumber}: ${formatSlot(chosen)}. Ask the user for their full name before booking.`,
            };
        }

        case 'create_booking_from_selected_slot': {
            const clientName = normaliseText(args.clientName);

            if (!clientName || clientName.length < 2) {
                return {
                    ok: false,
                    action: 'create_booking_from_selected_slot',
                    text: 'Client name is missing or too short.',
                };
            }

            if (!selectedSlot) {
                return {
                    ok: false,
                    action: 'create_booking_from_selected_slot',
                    text: 'No selected slot exists in the current conversation.',
                };
            }

            const stillAvailable = await isSlotStillAvailable(selectedSlot);

            if (!stillAvailable) {
                await deleteConversation(userId);

                return {
                    ok: false,
                    action: 'create_booking_from_selected_slot',
                    text: 'That slot is no longer available. Ask the user to request fresh availability.',
                };
            }

            const booking = await createBookingEvent({
                startTime: new Date(selectedSlot),
                clientName,
                instagramUserId: userId,
            });

            await deleteConversation(userId);

            return {
                ok: true,
                action: 'create_booking_from_selected_slot',
                bookingId: booking.id,
                bookedSlotIso: new Date(selectedSlot).toISOString(),
                bookedSlotLabel: formatSlot(selectedSlot),
                clientName,
                text: `Booking created successfully for ${clientName} on ${formatSlot(selectedSlot)}.`,
            };
        }

        case 'get_my_bookings': {
            const bookings = await getUserUpcomingBookings({ instagramUserId: userId });

            if (!bookings.length) {
                return {
                    ok: true,
                    action: 'get_my_bookings',
                    bookings: [],
                    text: 'No upcoming bookings found for this user.',
                };
            }

            return {
                ok: true,
                action: 'get_my_bookings',
                bookings: bookings.map((b, idx) => ({
                    number: idx + 1,
                    id: b.id,
                    startIso: new Date(b.start.dateTime || b.start.date).toISOString(),
                    label: formatSlot(b.start.dateTime || b.start.date),
                    summary: b.summary || 'Booking',
                })),
                text: bookings
                    .map((b, idx) => `${idx + 1}. ${formatSlot(b.start.dateTime || b.start.date)}${b.summary ? ` — ${b.summary}` : ''}`)
                    .join('\n'),
            };
        }

        case 'cancel_my_next_booking': {
            const result = await cancelNextBookingForUser({ instagramUserId: userId });

            return {
                ok: result.ok,
                action: 'cancel_my_next_booking',
                cancelled: result.cancelled || null,
                text: result.ok
                    ? `Cancelled booking on ${formatSlot(result.cancelled.start)}.`
                    : 'No upcoming booking was found to cancel.',
            };
        }

        case 'reschedule_my_next_booking': {
            const newSlotIso = normaliseText(args.newSlotIso);

            if (!newSlotIso) {
                return {
                    ok: false,
                    action: 'reschedule_my_next_booking',
                    text: 'Missing newSlotIso.',
                };
            }

            const result = await rescheduleNextBookingForUser({
                instagramUserId: userId,
                newStartTime: newSlotIso,
            });

            return {
                ok: result.ok,
                action: 'reschedule_my_next_booking',
                oldSlot: result.oldStart ? formatSlot(result.oldStart) : null,
                newSlot: result.newStart ? formatSlot(result.newStart) : null,
                text: result.ok
                    ? `Rescheduled booking from ${formatSlot(result.oldStart)} to ${formatSlot(result.newStart)}.`
                    : (result.message || 'Could not reschedule the booking.'),
            };
        }

        case 'reset_booking_flow': {
            await deleteConversation(userId);

            return {
                ok: true,
                action: 'reset_booking_flow',
                text: 'Booking flow reset successfully.',
            };
        }

        default:
            throw new Error(`Unknown tool: ${toolCall.function.name}`);
    }
}

async function handleIncomingMessage(userId, text) {
    const cleanText = normaliseText(text);
    if (!cleanText) return;

    if (!process.env.OPENAI_API_KEY) {
        console.error('[messageHandler] Missing OPENAI_API_KEY');
        await safeSendMessage(
            userId,
            "I'm missing my AI configuration right now. Please try again later."
        );
        return;
    }

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
                "I've reset our conversation. Send me a booking message whenever you're ready."
            );
        } catch (err) {
            console.error(`[messageHandler] Reset failed for user ${userId}:`, err.message);
        }
        return;
    }

    const state = conversation?.state || 'idle';

    console.log(
        `[messageHandler] user=${userId} state=${state} text="${cleanText.substring(0, 80)}"`
    );

    const messages = [
        {
            role: 'system',
            content: buildSystemPrompt(conversation),
        },
        {
            role: 'user',
            content: cleanText,
        },
    ];

    try {
        let assistantMessage = await runModel(messages);

        if (assistantMessage.tool_calls?.length) {
            messages.push(assistantMessage);

            for (const toolCall of assistantMessage.tool_calls) {
                let toolResult;

                try {
                    toolResult = await executeToolCall(userId, conversation, toolCall);

                    // refresh conversation after each tool call in case state changed
                    conversation = await getConversation(userId);
                } catch (toolErr) {
                    console.error(
                        `[messageHandler] Tool ${toolCall.function.name} failed:`,
                        toolErr.message
                    );

                    toolResult = {
                        ok: false,
                        action: toolCall.function.name,
                        text: 'Tool execution failed.',
                    };
                }

                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(toolResult),
                });
            }

            assistantMessage = await runModel(messages);
        }

        const reply =
            normaliseText(assistantMessage.content) ||
            "I'm sorry, I couldn't process that properly. Could you try again?";

        await safeSendMessage(userId, reply);
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