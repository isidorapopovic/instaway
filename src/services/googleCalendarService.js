const { google } = require('googleapis');

function getCalendarClient() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    return google.calendar({
        version: 'v3',
        auth: oauth2Client
    });
}

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

module.exports = {
    getUpcomingEvents
};