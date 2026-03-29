const fs = require('fs');
const path = require('path');
const db = require('../db');

async function initDb() {
    const schemaPath = path.join(__dirname, '../schemna.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await db.query(sql);
    console.log('[initDb] Database schema ensured');
}

module.exports = { initDb };