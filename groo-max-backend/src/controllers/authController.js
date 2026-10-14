const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const BCRYPT_COST = 12;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
// Dummy hash: user na milne par bhi same time lagta hai (user enumeration/timing se bachav)
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

// Public registration me SIRF ye roles allowed hain. 'admin' kabhi nahi.
const ROLE_MAP = { customer: 'customer', owner: 'salon_owner', salon_owner: 'salon_owner' };

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE_RE = /^[6-9]\d{9}$/;

const signToken = (user) =>
  jwt.sign({ id: user.id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '12h' });

const publicUser = (u) => ({ id: u.id, full_name: u.full_name, email: u.email, mobile: u.mobile, address: u.address || '', role: u.role });

const registerUser = async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const full_name = clean(req.body.full_name, 100);
    const email = clean(req.body.email, 150).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const mobile = clean(req.body.mobile, 15).replace(/\D/g, '').slice(-10);
    const role = ROLE_MAP[clean(req.body.role, 20)];
    const salon_name = clean(req.body.salon_name, 150) || 'My Salon';
    const address = clean(req.body.address, 300) || 'Lucknow';

    if (!role) return res.status(400).json({ success: false, error: 'Invalid account type.' });
    if (full_name.length < 2) return res.status(400).json({ success: false, error: 'Please enter your name.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ success: false, error: 'Enter a valid email.' });
    if (!MOBILE_RE.test(mobile)) return res.status(400).json({ success: false, error: 'Enter a valid 10-digit mobile number.' });
    if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return res.status(400).json({ success: false, error: 'Password must be 8+ characters with letters and numbers.' });
    }

    const hash = await bcrypt.hash(password, BCRYPT_COST);
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO users (full_name, email, password, role, mobile)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, full_name, email, mobile, role`,
      [full_name, email, hash, role, mobile]
    );
    const user = ins.rows[0];
    if (role === 'salon_owner') {
      await client.query(
        `INSERT INTO salons (owner_id, salon_name, address, area, status) VALUES ($1,$2,$3,'Lucknow','pending')`,
        [user.id, salon_name, address]
      );
    }
    await client.query('COMMIT');
    // Register par token nahi dete: user ko login karna hoga.
    return res.status(201).json({ success: true, message: 'Registered successfully. Please login.', user: publicUser(user) });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'This email is already registered.' });
    }
    console.error('register:', err.message);
    return res.status(500).json({ success: false, error: 'Could not register. Please try again.' });
  } finally {
    if (client) client.release();
  }
};

const loginUser = async (req, res) => {
  const bad = () => res.status(401).json({ success: false, error: 'Invalid email or password.' });
  try {
    const email = clean(req.body.email, 150).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password.slice(0, 72) : '';
    if (!email || !password) return bad();

    const r = await pool.query(
      'SELECT id, full_name, email, mobile, address, password, role, is_active, failed_logins, locked_until FROM users WHERE email = $1',
      [email]
    );
    const u = r.rows[0];

    if (u && u.locked_until && new Date(u.locked_until) > new Date()) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(429).json({ success: false, error: 'Too many failed attempts. Try again in a few minutes.' });
    }

    const ok = await bcrypt.compare(password, u ? u.password : DUMMY_HASH);
    if (!u || !ok || u.is_active === false) {
      if (u) {
        await pool.query(
          `UPDATE users SET failed_logins = failed_logins + 1,
             locked_until = CASE WHEN failed_logins + 1 >= $2 THEN NOW() + ($3 || ' minutes')::interval ELSE locked_until END
           WHERE id = $1`,
          [u.id, MAX_FAILS, String(LOCK_MINUTES)]
        );
      }
      return bad();
    }
    await pool.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [u.id]);

    // Role hamesha DB se. Client ka bheja hua role ignore.
    return res.json({ success: true, message: 'Login successful', token: signToken(u), user: publicUser(u) });
  } catch (err) {
    console.error('login:', err.message);
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
};

// Token se current user (frontend isse role confirm karta hai)
const me = async (req, res) => {
  try {
    const r = await pool.query('SELECT id, full_name, email, mobile, address, role FROM users WHERE id=$1', [req.user.id]);
    if (!r.rows[0]) return res.status(401).json({ success: false, error: 'Account not available.' });
    res.json({ success: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Profile update: sirf apna (id token se). Email/role yahan se kabhi nahi badalte.
const updateProfile = async (req, res) => {
  try {
    const full_name = clean(req.body.full_name, 100);
    const mobile = clean(req.body.mobile, 15).replace(/\D/g, '').slice(-10);
    const address = clean(req.body.address, 300);
    if (full_name.length < 2) return res.status(400).json({ success: false, error: 'Please enter your name.' });
    if (!MOBILE_RE.test(mobile)) return res.status(400).json({ success: false, error: 'Enter a valid 10-digit mobile number.' });
    const r = await pool.query(
      `UPDATE users SET full_name = $1, mobile = $2, address = $3 WHERE id = $4
       RETURNING id, full_name, email, mobile, address, role`,
      [full_name, mobile, address, req.user.id]
    );
    return res.json({ success: true, message: 'Profile updated.', user: r.rows[0] });
  } catch (err) {
    console.error('updateProfile:', err.message);
    return res.status(500).json({ success: false, error: 'Could not update profile.' });
  }
};

module.exports = { registerUser, loginUser, me, updateProfile };
