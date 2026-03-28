const express = require('express');
const { saveMessage } = require('../services/messageService');

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
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

router.post('/', async (req, res) => {
    const body = req.body;
    console.log('Incoming webhook body:', JSON.stringify(body, null, 2));

    res.sendStatus(200);

    try {
        const messagingEvents = extractMessagingEvents(body);

        for (const event of messagingEvents) {
            const senderId = event.sender?.id || null;
            const recipientId = event.recipient?.id || null;
            const timestamp = event.timestamp || null;

            if (event.message) {
                await saveMessage({
                    senderId,
                    recipientId,
                    text: event.message.text || null,
                    mid: event.message.mid || null,
                    timestamp,
                    rawPayload: event
                });
            } else {
                await saveMessage({
                    senderId,
                    recipientId,
                    text: null,
                    mid: null,
                    timestamp,
                    rawPayload: event
                });
            }
        }
    } catch (error) {
        console.error('POST /webhook error:', error);
    }
});

module.exports = router;