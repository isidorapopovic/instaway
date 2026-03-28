const { google } = require('googleapis');
const dotenv = require('dotenv');

dotenv.config();

console.log('Google client present:', {
    clientId: !!process.env.GOOGLE_CLIENT_ID,
    clientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: !!process.env.GOOGLE_REFRESH_TOKEN,
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary'
});

function getCalendarClient() {
    if (
        !process.env.GOOGLE_CLIENT_ID ||
        !process.env.GOOGLE_CLIENT_SECRET ||
        !process.env.GOOGLE_REFRESH_TOKEN
    ) {
        throw new Error('Missing Google Calendar environment variables');
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });
}

// ---------------------------------------------------------------------------
// Existing function (unchanged)
// ---------------------------------------------------------------------------

async function getUpcomingEvents({
    calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary',
    maxResults = 10
} = {}) {
    const calendar = getCalendarClient();

    const response = await calendar.events.list({
        calendarId,
        timeMin: new Date().toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime'
    });

    return response.data.items || [];
}

// ---------------------------------------------------------------------------
// Scheduling automation – configuration
// Adjust these to match your working hours and treatment length.
// ---------------------------------------------------------------------------

const WORK_START_HOUR = 9;    // 09:00
const WORK_END_HOUR = 18;   // 18:00
const SLOT_DURATION_MINUTES = 60;  // 1-hour treatments
const SEARCH_DAYS_AHEAD = 7;    // look 7 days into the future
const MAX_SLOTS_TO_OFFER = 5;    // max options shown to the user

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateCandidateSlots() {
    const slots = [];
    const now = new Date();

    for (let d = 1; d <= SEARCH_DAYS_AHEAD; d++) {
        const day = new Date(now);
        day.setDate(now.getDate() + d);

        if (day.getDay() === 0) continue; // skip Sundays

        for (let h = WORK_START_HOUR; h < WORK_END_HOUR; h++) {
            const slot = new Date(day);
            slot.setHours(h, 0, 0, 0);
            slots.push(slot);
        }
    }
    return slots;
}

function isSlotBusy(slotStart, busyPeriods) {
    const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MINUTES * 60_000);

    return busyPeriods.some(({ start, end }) => {
        const busyStart = new Date(start);
        const busyEnd = new Date(end);
        return slotStart < busyEnd && slotEnd > busyStart;
    });
}

// ---------------------------------------------------------------------------
// New scheduling functions
// ---------------------------------------------------------------------------

/**
 * Returns up to MAX_SLOTS_TO_OFFER free slots from Google Calendar.
 * @returns {Promise<Date[]>}
 */
async function getAvailableSlots() {
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    const now = new Date();
    const end = new Date(now);
    end.setDate(now.getDate() + SEARCH_DAYS_AHEAD);

    const response = await calendar.freebusy.query({
        requestBody: {
            timeMin: now.toISOString(),
            timeMax: end.toISOString(),
            items: [{ id: calendarId }],
        },
    });

    const busyPeriods = response.data.calendars[calendarId]?.busy || [];
    const candidates = generateCandidateSlots();

    return candidates
        .filter(slot => !isSlotBusy(slot, busyPeriods))
        .slice(0, MAX_SLOTS_TO_OFFER);
}

/**
 * Creates a calendar event for a confirmed booking.
 * @param {{ startTime: Date, clientName: string, instagramUserId: string }} params
 * @returns {Promise<string>} HTML link to the created event
 */
async function createBookingEvent({ startTime, clientName, instagramUserId }) {
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    const endTime = new Date(startTime.getTime() + SLOT_DURATION_MINUTES * 60_000);

    const event = await calendar.events.insert({
        calendarId,
        requestBody: {
            summary: `Treatment – ${clientName}`,
            description: `Booked via Instagram DM. Instagram user ID: ${instagramUserId}`,
            start: {
                dateTime: startTime.toISOString(),
                timeZone: process.env.TIMEZONE || 'Europe/Belgrade',
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: process.env.TIMEZONE || 'Europe/Belgrade',
            },
        },
    });

    console.log(`[googleCalendarService] Event created: ${event.data.htmlLink}`);
    return event.data.htmlLink;
}

/**
 * Formats a Date into a readable string for DM messages.
 * Example: "Monday, 31 Mar at 10:00"
 * @param {Date|string} date
 * @returns {string}
 */
function formatSlot(date) {
    return new Date(date).toLocaleString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: process.env.TIMEZONE || 'Europe/Belgrade',
    });
}

module.exports = {
    getUpcomingEvents,       // existing
    getAvailableSlots,       // new
    createBookingEvent,      // new
    formatSlot,              // new
};