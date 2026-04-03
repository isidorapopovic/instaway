// src/services/toolRegistry.js
const tools = [
    {
        type: 'function',
        function: {
            name: 'get_available_slots',
            description: 'Get available appointment slots from Google Calendar',
            parameters: {
                type: 'object',
                properties: {
                    date: { type: 'string', description: 'Requested date in YYYY-MM-DD format if known' },
                    period: {
                        type: 'string',
                        enum: ['morning', 'afternoon', 'evening'],
                        description: 'Preferred part of day if mentioned'
                    }
                },
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_booking',
            description: 'Create a booking in Google Calendar',
            parameters: {
                type: 'object',
                properties: {
                    slotIso: { type: 'string', description: 'ISO datetime for selected slot' },
                    clientName: { type: 'string' },
                    instagramUserId: { type: 'string' }
                },
                required: ['slotIso', 'clientName', 'instagramUserId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'cancel_booking',
            description: 'Cancel an existing booking in Google Calendar',
            parameters: {
                type: 'object',
                properties: {
                    bookingId: { type: 'string' }
                },
                required: ['bookingId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'reschedule_booking',
            description: 'Move an existing booking to a new slot',
            parameters: {
                type: 'object',
                properties: {
                    bookingId: { type: 'string' },
                    newSlotIso: { type: 'string' }
                },
                required: ['bookingId', 'newSlotIso'],
                additionalProperties: false
            }
        }
    }
];

module.exports = { tools };