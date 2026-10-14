const pool = require('../config/db');

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Salon owner apna salon register kare (identity token se, body se kabhi nahi)
const registerSalon = async (req, res) => {
  try {
    if (req.user.role !== 'salon_owner') {
      return res.status(403).json({ error: 'Only salon owners can register a salon.' });
    }
    const salon_name = clean(req.body.salon_name, 150);
    const address = clean(req.body.address, 300);
    if (salon_name.length < 2 || address.length < 5) {
      return res.status(400).json({ error: 'Salon name and address are required.' });
    }
    const owner_id = req.user.id;
    const existing = await pool.query('SELECT id FROM salons WHERE owner_id = $1', [owner_id]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You have already registered a salon.' });
    }
    const r = await pool.query(
      `INSERT INTO salons (owner_id, salon_name, address, area, status)
       VALUES ($1, $2, $3, 'Lucknow', 'pending') RETURNING id, salon_name, address, status`,
      [owner_id, salon_name, address]
    );
    res.status(201).json({ message: 'Salon registered and pending admin approval.', salon: r.rows[0] });
  } catch (err) {
    console.error('registerSalon:', err.message);
    res.status(500).json({ error: 'Server error during salon registration' });
  }
};

// Public list: owner ka mobile/email yahan NAHI dikhta (privacy + spam se bachav)
const getApprovedSalons = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.id, s.salon_name, s.address, s.status, u.full_name AS owner_name
       FROM salons s JOIN users u ON s.owner_id = u.id
       WHERE s.status = 'approved'`
    );
    res.json(r.rows);
  } catch (err) {
    console.error('getApprovedSalons:', err.message);
    res.status(500).json({ error: 'Server error while fetching salons' });
  }
};

module.exports = { registerSalon, getApprovedSalons };
