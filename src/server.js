// src/server.js
// Express server – handles Instagram webhook verification + incoming message events.

require('dotenv').config();

const express = require('express');
const { handleIncomingMessage } = require('./handlers/messageHandler');
const { purgeStaleConversations } = require('./db/conversationState');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());

// ---------------------------------------------------------------------------
// Stale conversation cleanup – runs every hour
// ---------------------------------------------------------------------------
setInterval(() => {
    purgeStaleConversations(24).catch(err =>
        console.error('[server] Purge error:', err.message)
    );
}, 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/', (_req, res) => res.send('instaway is running ✅'));

// ---------------------------------------------------------------------------
// Instagram Webhook – GET (verification challenge)
// ---------------------------------------------------------------------------
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
        console.log('[server] Webhook verified.');
        return res.status(200).send(challenge);
    }

    console.warn('[server] Webhook verification failed.');
    res.sendStatus(403);
});

// ---------------------------------------------------------------------------
// Instagram Webhook – POST (incoming events)
// ---------------------------------------------------------------------------
app.post('/webhook', async (req, res) => {
    // Acknowledge immediately – Instagram expects a fast 200
    res.sendStatus(200);

    const body = req.body;

    if (body.object !== 'instagram') {
        console.log('[server] Non-Instagram webhook event, ignoring.');
        return;
    }

    for (const entry of body.entry || []) {
        for (const messagingEvent of entry.messaging || []) {
            const senderId = messagingEvent.sender?.id;
            const message = messagingEvent.message;

            // Skip messages sent by the page itself (echoes)
            if (messagingEvent.sender?.id === messagingEvent.recipient?.id) continue;
            if (message?.is_echo) continue;

            if (senderId && message?.text) {
                // Fire-and-forget; errors are caught inside handleIncomingMessage
                handleIncomingMessage(senderId, message.text).catch(err =>
                    console.error('[server] handleIncomingMessage error:', err.message)
                );
            }
        }
    }
});

// ---------------------------------------------------------------------------
// Static pages (required by Meta app review)
// ---------------------------------------------------------------------------
app.use(express.static('.'));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`[server] instaway listening on port ${PORT}`);
});