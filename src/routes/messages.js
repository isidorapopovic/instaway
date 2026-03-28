const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM messages ORDER BY created_at DESC');
        return res.status(200).json(result.rows);
    } catch (error) {
        console.error('Messages route error:', error);
        return res.status(500).json({
            error: 'Failed to fetch messages',
            details: error.message
        });
    }
});

module.exports = router;