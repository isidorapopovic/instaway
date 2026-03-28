const express = require('express');
const { saveMessage } = require('../services/messageService');
const { handleIncomingMessage } = require('../handlers/messageHandler');

const router = express.Router();

function extractMessagingEvents(body) {
    const events = [];

    if (!body || !Array.isArray(body.entry)) {
        return events;
    }

    for (const entry of body.entry) {
        if (!Array.isArray(entry.messaging)) continue;
        for (const event of entry.messaging) events.push(event);
    }

    return events;
}

router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
        console.log('[webhook] Verified.');
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

router.post('/', async (req, res) => {
    const body = req.body;
    console.log('Incoming webhook body:', JSON.stringify(body, null, 2));

    // Acknowledge immediately
    res.sendStatus(200);

    try {
        const messagingEvents = extractMessagingEvents(body);

        for (const event of messagingEvents) {
            const senderId = event.sender?.id || null;
            const recipientId = event.recipient?.id || null;
            const timestamp = event.timestamp || null;

            // Skip echo messages (sent by the page itself)
            if (event.message?.is_echo) continue;
            if (senderId && recipientId && senderId === recipientId) continue;

            // 1. Always save the raw message to the DB (existing behaviour)
            await saveMessage({
                senderId,
                recipientId,
                text: event.message?.text || null,
                mid: event.message?.mid || null,
                timestamp,
                rawPayload: event
            });

            // 2. If it's a text message from a real user, run the scheduling handler
            if (senderId && event.message?.text) {
                handleIncomingMessage(senderId, event.message.text).catch(err =>
                    console.error('[webhook] handleIncomingMessage error:', err.message)
                );
            }
        }
    } catch (error) {
        console.error('POST /webhook error:', error);
    }
});

module.exports = router;