require('dotenv').config();

const express = require('express');
const webhookRoutes = require('./routes/webhook');
const messagesRoutes = require('./routes/messages');
const { initDb } = require('./db/initDb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/webhook', webhookRoutes);
app.use('/messages', messagesRoutes);

app.get('/', (req, res) => {
    res.send('instaway is running');
});

async function start() {
    try {
        console.log('[server] cwd =', process.cwd());
        console.log('[server] DATABASE_URL exists =', !!process.env.DATABASE_URL);
        console.log('[server] DATABASE_URL value =', process.env.DATABASE_URL || 'MISSING');
        console.log('[server] PG_SSL =', process.env.PG_SSL || 'MISSING');

        await initDb();

        app.listen(PORT, () => {
            console.log(`[server] instaway listening on port ${PORT}`);
        });
    } catch (error) {
        console.error('[server] Failed to start:', error);
    }
}

start();