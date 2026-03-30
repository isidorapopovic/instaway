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
        if (!Array.isArray(entry.messaging)) {
            continue;
        }

        for (const event of entry.messaging) {
            events.push(event);
        }
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

    console.log('[webhook] Incoming webhook body:');
    console.log(JSON.stringify(body, null, 2));

    res.sendStatus(200);

    try {
        const messagingEvents = extractMessagingEvents(body);
        console.log('[webhook] Extracted events:', messagingEvents.length);

        for (const event of messagingEvents) {
            const senderId = event.sender?.id || null;
            const recipientId = event.recipient?.id || null;
            const timestamp = event.timestamp || null;

            if (event.message?.is_echo) {
                console.log('[webhook] Skipping echo message');
                continue;
            }

            if (!event.message) {
                console.log('[webhook] No event.message, skipping save');
                continue;
            }

            console.log('[webhook] About to save message mid:', event.message.mid || null);

            const saved = await saveMessage({
                senderId,
                recipientId,
                text: event.message.text || null,
                mid: event.message.mid || null,
                timestamp,
                rawPayload: event,
            });

            console.log('[webhook] saveMessage result:', saved ? saved.id : null);

            if (senderId && event.message.text) {
                await handleIncomingMessage(senderId, event.message.text);
            }
        }
    } catch (error) {
        console.error('[webhook] POST error:', error.message);
        console.error(error.stack);
    }
});

module.exports = router;