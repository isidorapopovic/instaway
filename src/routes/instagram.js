const express = require('express');
const router = express.Router();

router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
        console.log('Instagram webhook verified');
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

router.post('/webhook', async (req, res) => {
    try {
        console.log('Incoming Instagram webhook:', JSON.stringify(req.body, null, 2));

        // We will add real processing here next
        return res.sendStatus(200);
    } catch (error) {
        console.error('Instagram webhook error:', error);
        return res.sendStatus(200);
    }
});

module.exports = router;