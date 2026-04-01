const db = require('../db');

async function saveBooking({
    instagramUserId,
    clientName,
    calendarEventId,
    calendarEventLink = null,
    startTime,
    endTime,
    status = 'confirmed',
}) {
    const sql = `
    INSERT INTO bookings (
      instagram_user_id,
      client_name,
      calendar_event_id,
      calendar_event_link,
      start_time,
      end_time,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;

    const values = [
        instagramUserId,
        clientName,
        calendarEventId,
        calendarEventLink,
        startTime,
        endTime,
        status,
    ];

    const result = await db.query(sql, values);
    return result.rows[0];
}

async function getLatestBookingByUser(instagramUserId) {
    const sql = `
    SELECT *
    FROM bookings
    WHERE instagram_user_id = $1
    ORDER BY created_at DESC
    LIMIT 1;
  `;

    const result = await db.query(sql, [instagramUserId]);
    return result.rows[0] || null;
}

module.exports = {
    saveBooking,
    getLatestBookingByUser,
};