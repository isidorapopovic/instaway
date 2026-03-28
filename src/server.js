const express = require('express');
const dotenv = require('dotenv');
const webhookRouter = require('./routes/webhook');
const messagesRouter = require('./routes/messages');
const inboxRouter = require('./routes/inbox');
const db = require('./db');

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

app.get('/', async (req, res) => {
    try {
        await db.query('SELECT 1');
        return res.status(200).json({
            ok: true,
            message: 'Server is running'
        });
    } catch (error) {
        console.error('Health check DB error:', error);
        return res.status(500).json({
            ok: false,
            message: 'Server is running, but DB is not reachable'
        });
    }
});

app.use('/webhook', webhookRouter);
app.use('/messages', messagesRouter);
app.use('/inbox', inboxRouter);

app.use((req, res) => {
    return res.status(404).json({
        error: 'Route not found'
    });
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});