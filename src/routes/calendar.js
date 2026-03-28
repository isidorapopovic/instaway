const express = require('express');
const { getUpcomingEvents } = require('../services/googleCalendarService');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const limitParam = parseInt(req.query.limit, 10);
        const limit = Number.isNaN(limitParam) ? 10 : Math.min(limitParam, 50);

        const events = await getUpcomingEvents({ maxResults: limit });

        return res.status(200).json(events);
    } catch (error) {
        console.error('GET /calendar error:', error);
        return res.status(500).json({
            error: 'Failed to fetch calendar events',
            details: error.message
        });
    }
});

module.exports = router;