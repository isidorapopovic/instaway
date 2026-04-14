require('dotenv').config();

const { createBookingEvent } = require('./src/services/googleCalendarService');

async function main() {
    // Change these values for your test
    const year = 2026;
    const month = 4;   // April
    const day = 15;
    const hour = 16;
    const minute = 0;

    const testStart = new Date(year, month - 1, day, hour, minute, 0, 0);

    console.log('[test] Attempting to create Google Calendar event...');
    console.log('[test] GOOGLE_CALENDAR_ID =', process.env.GOOGLE_CALENDAR_ID || 'primary');
    console.log('[test] Local test date =', testStart.toString());
    console.log('[test] ISO test date =', testStart.toISOString());

    const result = await createBookingEvent({
        startTime: testStart,
        clientName: 'TEST BOOKING INSTAGRAM',
        instagramUserId: 'test-user-123',
    });

    console.log('\n[test] Success');
    console.log('[test] Event ID:', result.id);
    console.log('[test] Event Link:', result.htmlLink);
    console.log('[test] Start:', result.startTime);
    console.log('[test] End:', result.endTime);
}

main().catch((err) => {
    console.error('\n[test] Failed to create event');
    console.error('[test] Error message:', err.message);

    if (err.response?.data) {
        console.error('[test] Google response:', JSON.stringify(err.response.data, null, 2));
    }

    process.exit(1);
});