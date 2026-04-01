const { google } = require('googleapis');
const dotenv = require('dotenv');

dotenv.config();

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
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });
}

const WORK_START_HOUR = Number(process.env.WORK_START_HOUR || 9);
const WORK_END_HOUR = Number(process.env.WORK_END_HOUR || 18);
const SLOT_DURATION_MINUTES = Number(process.env.SLOT_DURATION_MINUTES || 60);
const SEARCH_DAYS_AHEAD = Number(process.env.SEARCH_DAYS_AHEAD || 7);
const MAX_SLOTS_TO_OFFER = Number(process.env.MAX_SLOTS_TO_OFFER || 5);
const TIMEZONE = process.env.TIMEZONE || 'Europe/Belgrade';

async function getUpcomingEvents({
    calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary',
    maxResults = 10,
} = {}) {
    const calendar = getCalendarClient();

    const response = await calendar.events.list({
        calendarId,
        timeMin: new Date().toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
    });

    return response.data.items || [];
}

function generateCandidateSlots() {
    const slots = [];
    const now = new Date();

    for (let d = 1; d <= SEARCH_DAYS_AHEAD; d++) {
        const day = new Date(now);
        day.setDate(now.getDate() + d);

        if (day.getDay() === 0) {
            continue;
        }

        for (let h = WORK_START_HOUR; h < WORK_END_HOUR; h++) {
            const slot = new Date(day);
            slot.setHours(h, 0, 0, 0);
            slots.push(slot);
        }
    }

    return slots;
}

function getSlotEnd(slotStart) {
    return new Date(
        new Date(slotStart).getTime() + SLOT_DURATION_MINUTES * 60_000
    );
}

function overlaps(slotStart, slotEnd, busyStart, busyEnd) {
    return slotStart < busyEnd && slotEnd > busyStart;
}

function isSlotBusy(slotStart, busyPeriods) {
    const start = new Date(slotStart);
    const end = getSlotEnd(start);

    return busyPeriods.some(({ start, end }) => {
        const busyStart = new Date(start);
        const busyEnd = new Date(end);
        return overlaps(start, end, busyStart, busyEnd);
    });
}

async function getBusyPeriods({
    timeMin,
    timeMax,
    calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary',
}) {
    const calendar = getCalendarClient();

    const response = await calendar.freebusy.query({
        requestBody: {
            timeMin: new Date(timeMin).toISOString(),
            timeMax: new Date(timeMax).toISOString(),
            items: [{ id: calendarId }],
        },
    });

    return response.data.calendars[calendarId]?.busy || [];
}

async function isSlotStillAvailable(slotStart) {
    const start = new Date(slotStart);
    const end = getSlotEnd(start);

    const busyPeriods = await getBusyPeriods({
        timeMin: start,
        timeMax: end,
    });

    return !isSlotBusy(start, busyPeriods);
}

async function getAvailableSlots() {
    const now = new Date();
    const end = new Date(now);
    end.setDate(now.getDate() + SEARCH_DAYS_AHEAD);

    const busyPeriods = await getBusyPeriods({
        timeMin: now,
        timeMax: end,
    });

    const candidates = generateCandidateSlots();

    return candidates
        .filter(slot => !isSlotBusy(slot, busyPeriods))
        .slice(0, MAX_SLOTS_TO_OFFER);
}

async function createBookingEvent({ startTime, clientName, instagramUserId }) {
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    const endTime = getSlotEnd(startTime);

    const event = await calendar.events.insert({
        calendarId,
        requestBody: {
            summary: `Treatment – ${clientName}`,
            description: `Booked via Instagram DM.\nInstagram user ID: ${instagramUserId}`,
            start: {
                dateTime: new Date(startTime).toISOString(),
                timeZone: TIMEZONE,
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: TIMEZONE,
            },
        },
    });

    console.log(`[googleCalendarService] Event created: ${event.data.htmlLink}`);

    return {
        id: event.data.id,
        htmlLink: event.data.htmlLink,
        startTime: new Date(startTime),
        endTime,
    };
}

function formatSlot(date) {
    return new Date(date).toLocaleString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: TIMEZONE,
    });
}

module.exports = {
    getUpcomingEvents,
    getAvailableSlots,
    createBookingEvent,
    formatSlot,
    isSlotStillAvailable,
    getSlotEnd,
};