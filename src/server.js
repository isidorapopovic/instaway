require('dotenv').config();

const express = require('express');
const webhookRouter = require('./routes/webhook');
const { purgeStaleConversations } = require('./db/conversationState');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Stale conversation cleanup – runs every hour
setInterval(() => {
    purgeStaleConversations(24).catch(err =>
        console.error('[server] Purge error:', err.message)
    );
}, 60 * 60 * 1000);

app.get('/', (_req, res) => res.send('instaway is running ✅'));

app.use('/webhook', webhookRouter);

app.use(express.static('.'));

app.listen(PORT, () => {
    console.log(`[server] instaway listening on port ${PORT}`);
});