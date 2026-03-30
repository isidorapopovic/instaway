const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const useSsl = process.env.PG_SSL === 'true';

console.log('[db] DATABASE_URL exists:', !!connectionString);
console.log('[db] PG_SSL:', process.env.PG_SSL);

if (!connectionString) {
    throw new Error('DATABASE_URL is missing');
}

const pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.on('connect', () => {
    console.log('[db] Connected to PostgreSQL');
});

pool.on('error', (err) => {
    console.error('[db] Unexpected PostgreSQL error:', err);
});

async function query(text, params = []) {
    return pool.query(text, params);
}

module.exports = { pool, query };