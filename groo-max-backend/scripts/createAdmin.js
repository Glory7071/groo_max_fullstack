// Admin SIRF yahan se banta hai (server par, terminal se). Website se kabhi nahi.
// Use:  ADMIN_EMAIL=you@x.com ADMIN_PASSWORD='Strong#Pass123' ADMIN_NAME='Owner' node scripts/createAdmin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

(async () => {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = process.env.ADMIN_NAME || 'Groo Max Admin';
  if (!email || password.length < 10) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ chars) in the command.');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (full_name, email, password, role, mobile)
     VALUES ($1,$2,$3,'admin','9000000000')
     ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, role = 'admin', is_active = TRUE`,
    [name, email, hash]
  );
  console.log('Admin ready:', email);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
