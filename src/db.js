const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const useSsl = process.env.PG_SSL === 'true';

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: useSsl ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
	console.error('Unexpected PostgreSQL error:', err);
});

async function query(text, params = []) {
	return pool.query(text, params);
}

module.exports = {
	pool,
	query
};