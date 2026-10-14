const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // Cloud DB (Neon/Supabase/Render) ke liye .env me DB_SSL=true
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  // Idle connection toot jaye to server band mat karo; pool khud naya bana lega
  console.error('Unexpected error on idle client', err.message);
});

// Poora pool export hota hai: query + connect (transactions: cancel/refund/reschedule/register) + end
module.exports = pool;
