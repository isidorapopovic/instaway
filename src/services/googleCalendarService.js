const { google } = require('googleapis');
const dotenv = require('dotenv');

dotenv.config();

const WORK_START_HOUR = Number(process.env.WORK_START_HOUR || 9);
const WORK_END_HOUR = Number(process.env.WORK_END_HOUR || 18);
const SLOT_DURATION_MINUTES = Number(process.env.SLOT_DURATION_MINUTES || 60);
const SEARCH_DAYS_AHEAD = Number(process.env.SEARCH_DAYS_AHEAD || 7);
const MAX_SLOTS_TO_OFFER = Number(process.env.MAX_SLOTS_TO_OFFER || 5);
const TIMEZONE = process.env.TIMEZONE || 'Europe/Belgrade';

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
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || undefined
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });
}

function getCalendarId() {
    return process.env.GOOGLE_CALENDAR_ID || 'primary';
}

function getSlotEnd(slotStart) {
    return new Date(new Date(slotStart).getTime() + SLOT_DURATION_MINUTES * 60_000);
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

function parseDateOnly(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    return new Date(`${dateStr}T00:00:00`);
}

function getHoursForPeriod(period) {
    switch (period) {
        case 'morning':
            return { startHour: 9, endHour: 12 };
        case 'afternoon':
            return { startHour: 12, endHour: 17 };
        case 'evening':
            return { startHour: 17, endHour: WORK_END_HOUR };
        default:
            return { startHour: WORK_START_HOUR, endHour: WORK_END_HOUR };
    }
}

function generateCandidateSlots({ date, period } = {}) {
    const slots = [];
    const now = new Date();
    const targetDate = parseDateOnly(date);
    const { startHour, endHour } = getHoursForPeriod(period);

    const datesToCheck = [];

    if (targetDate) {
        datesToCheck.push(targetDate);
    } else {
        for (let d = 1; d <= SEARCH_DAYS_AHEAD; d++) {
            const day = new Date(now);
            day.setDate(now.getDate() + d);
            datesToCheck.push(day);
        }
    }

    for (const day of datesToCheck) {
        const dayCopy = new Date(day);

        // Skip Sundays
        if (dayCopy.getDay() === 0) continue;

        for (let h = startHour; h < endHour; h++) {
            const slot = new Date(dayCopy);
            slot.setHours(h, 0, 0, 0);

            if (slot > now) {
                slots.push(slot);
            }
        }
    }

    return slots.sort((a, b) => a - b);
}

async function getBusyPeriods({
    timeMin,
    timeMax,
    calendarId = getCalendarId(),
}) {
    const calendar = getCalendarClient();

    const response = await calendar.freebusy.query({
        requestBody: {
            timeMin: new Date(timeMin).toISOString(),
            timeMax: new Date(timeMax).toISOString(),
            timeZone: TIMEZONE,
            items: [{ id: calendarId }],
        },
    });

    return response.data.calendars?.[calendarId]?.busy || [];
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

async function getAvailableSlots({ date, period, limit = MAX_SLOTS_TO_OFFER } = {}) {
    const candidates = generateCandidateSlots({ date, period });

    if (!candidates.length) return [];

    const timeMin = candidates[0];
    const timeMax = getSlotEnd(candidates[candidates.length - 1]);

    const busyPeriods = await getBusyPeriods({ timeMin, timeMax });

    return candidates
        .filter(slot => !isSlotBusy(slot, busyPeriods))
        .slice(0, limit);
}

async function getUpcomingEvents({
    calendarId = getCalendarId(),
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

async function createBookingEvent({ startTime, clientName, instagramUserId }) {
    const calendar = getCalendarClient();
    const calendarId = getCalendarId();
    const start = new Date(startTime);
    const endTime = getSlotEnd(start);

    const available = await isSlotStillAvailable(start);
    if (!available) {
        throw new Error('Selected slot is already taken');
    }

    const event = await calendar.events.insert({
        calendarId,
        requestBody: {
            summary: `Treatment – ${clientName}`,
            description: `Booked via Instagram DM.\nInstagram user ID: ${instagramUserId}`,
            extendedProperties: {
                private: {
                    instagramUserId: String(instagramUserId),
                    clientName: String(clientName),
                    source: 'instagram-dm',
                },
            },
            start: {
                dateTime: start.toISOString(),
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
        startTime: start,
        endTime,
    };
}

function bookingBelongsToUser(event, instagramUserId) {
    const fromExtended =
        event?.extendedProperties?.private?.instagramUserId &&
        String(event.extendedProperties.private.instagramUserId) === String(instagramUserId);

    const fromDescription =
        typeof event?.description === 'string' &&
        event.description.includes(`Instagram user ID: ${instagramUserId}`);

    return Boolean(fromExtended || fromDescription);
}

async function getUserUpcomingBookings({
    instagramUserId,
    maxResults = 20,
    calendarId = getCalendarId(),
} = {}) {
    const calendar = getCalendarClient();

    const response = await calendar.events.list({
        calendarId,
        timeMin: new Date().toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
    });

    const items = response.data.items || [];

    return items.filter(event => bookingBelongsToUser(event, instagramUserId));
}

async function cancelNextBookingForUser({ instagramUserId, calendarId = getCalendarId() }) {
    const calendar = getCalendarClient();
    const bookings = await getUserUpcomingBookings({ instagramUserId, maxResults: 10, calendarId });

    if (!bookings.length) {
        return { ok: false };
    }

    const nextBooking = bookings[0];

    await calendar.events.delete({
        calendarId,
        eventId: nextBooking.id,
    });

    return {
        ok: true,
        cancelled: {
            id: nextBooking.id,
            start: nextBooking.start?.dateTime || nextBooking.start?.date,
        },
    };
}

async function rescheduleNextBookingForUser({
    instagramUserId,
    newStartTime,
    calendarId = getCalendarId(),
}) {
    const calendar = getCalendarClient();
    const bookings = await getUserUpcomingBookings({ instagramUserId, maxResults: 10, calendarId });

    if (!bookings.length) {
        return {
            ok: false,
            message: 'No upcoming booking was found.',
        };
    }

    const newStart = new Date(newStartTime);

    if (Number.isNaN(newStart.getTime())) {
        return {
            ok: false,
            message: 'The new slot format is invalid.',
        };
    }

    const available = await isSlotStillAvailable(newStart);

    if (!available) {
        return {
            ok: false,
            message: 'That new slot is not available.',
        };
    }

    const booking = bookings[0];
    const newEnd = getSlotEnd(newStart);

    await calendar.events.patch({
        calendarId,
        eventId: booking.id,
        requestBody: {
            start: {
                dateTime: newStart.toISOString(),
                timeZone: TIMEZONE,
            },
            end: {
                dateTime: newEnd.toISOString(),
                timeZone: TIMEZONE,
            },
        },
    });

    return {
        ok: true,
        oldStart: booking.start?.dateTime || booking.start?.date,
        newStart: newStart.toISOString(),
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
    getUserUpcomingBookings,
    cancelNextBookingForUser,
    rescheduleNextBookingForUser,
};