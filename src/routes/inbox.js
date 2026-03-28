const express = require('express');
const db = require('../db');

const router = express.Router();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimestamp(value) {
  if (!value) return 'No timestamp';

  const num = Number(value);
  if (!Number.isNaN(num)) {
    const date = new Date(num);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString('en-GB');
    }
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString('en-GB');
  }

  return 'Invalid timestamp';
}

router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id,
        instagram_sender_id,
        instagram_recipient_id,
        message_text,
        event_timestamp,
        created_at
      FROM messages
      ORDER BY created_at DESC
      LIMIT 100
    `);

    const rowsHtml = result.rows.map((row) => `
      <div class="message-card">
        <div><strong>From:</strong> ${escapeHtml(row.instagram_sender_id || 'Unknown')}</div>
        <div><strong>To:</strong> ${escapeHtml(row.instagram_recipient_id || 'Unknown')}</div>
        <div><strong>Time:</strong> ${escapeHtml(formatTimestamp(row.event_timestamp || row.created_at))}</div>
        <div><strong>Text:</strong> ${escapeHtml(row.message_text || '[No text]')}</div>
      </div>
    `).join('');

    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Instagram Inbox</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 24px;
            background: #f5f5f5;
            color: #222;
          }
          h1 {
            margin-top: 0;
          }
          .message-list {
            display: grid;
            gap: 16px;
          }
          .message-card {
            background: white;
            border-radius: 10px;
            padding: 16px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          }
          .empty {
            background: white;
            border-radius: 10px;
            padding: 16px;
          }
        </style>
      </head>
      <body>
        <h1>Instagram Messages</h1>
        <p>Showing the latest saved messages from the database.</p>
        <div class="message-list">
          ${rowsHtml || '<div class="empty">No messages found.</div>'}
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('GET /inbox error:', error);
    return res.status(500).send(`
      <h1>Error</h1>
      <p>Failed to load inbox.</p>
      <pre>${escapeHtml(error.message)}</pre>
    `);
  }
});

module.exports = router;