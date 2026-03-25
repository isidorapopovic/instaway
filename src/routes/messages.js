const express = require('express');
const { getMessages } = require('../services/messageService');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const limitParam = parseInt(req.query.limit, 10);
        const limit = Number.isNaN(limitParam) ? 50 : Math.min(limitParam, 200);

        const messages = await getMessages(limit);
        return res.status(200).json(messages);
    } catch (error) {
        console.error('GET /messages error:', error);
        return res.status(500).json({
            error: 'Failed to fetch messages'
        });
    }
});

module.exports = router;