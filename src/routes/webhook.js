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
        // Standard Messenger / Instagram Messaging webhook shape
        if (Array.isArray(entry.messaging)) {
            for (const event of entry.messaging) {
                events.push(event);
            }
        }

        // Defensive fallback in case a different webhook structure is received
        if (Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
                const value = change?.value;

                if (Array.isArray(value?.messaging)) {
                    for (const event of value.messaging) {
                        events.push(event);
                    }
                }

                if (Array.isArray(value?.messages)) {
                    for (const msg of value.messages) {
                        events.push({
                            sender: { id: value?.from?.id || value?.sender?.id || null },
                            recipient: { id: value?.to?.id || value?.recipient?.id || null },
                            timestamp: value?.timestamp || msg?.timestamp || null,
                            message: {
                                mid: msg?.id || msg?.mid || null,
                                text: msg?.text || null,
                            },
                            rawChange: change,
                        });
                    }
                }
            }
        }
    }

    return events;
}

router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
        console.log('[webhook] Verified');
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

router.post('/', async (req, res) => {
    const body = req.body;

    console.log('[webhook] Incoming webhook body:');
    console.log(JSON.stringify(body, null, 2));

    // Acknowledge Meta immediately
    res.sendStatus(200);

    try {
        const messagingEvents = extractMessagingEvents(body);
        console.log(`[webhook] Extracted ${messagingEvents.length} messaging event(s)`);

        if (messagingEvents.length === 0) {
            console.warn('[webhook] No messaging events found in payload');
            return;
        }

        for (const event of messagingEvents) {
            const senderId = event.sender?.id || null;
            const recipientId = event.recipient?.id || null;
            const timestamp = event.timestamp || null;
            const message = event.message || null;

            if (!message) {
                console.log('[webhook] Skipping event because event.message is missing');
                continue;
            }

            if (message.is_echo) {
                console.log('[webhook] Skipping echo message');
                continue;
            }

            if (senderId && recipientId && senderId === recipientId) {
                console.log('[webhook] Skipping event because senderId === recipientId');
                continue;
            }

            console.log('[webhook] About to save message:', {
                mid: message.mid || null,
                senderId,
                recipientId,
                text: message.text || null,
                timestamp,
            });

            const saved = await saveMessage({
                senderId,
                recipientId,
                text: message.text || null,
                mid: message.mid || null,
                timestamp,
                rawPayload: event,
            });

            console.log('[webhook] saveMessage result:', saved ? saved.id : null);

            if (senderId && message.text) {
                console.log('[webhook] Passing text to handleIncomingMessage');
                await handleIncomingMessage(senderId, message.text);
            }
        }
    } catch (error) {
        console.error('[webhook] POST /webhook error:', error.message);
        console.error(error.stack);
    }
});

module.exports = router;