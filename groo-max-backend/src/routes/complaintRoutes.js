const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const pool = require('../config/db');
const { parseId } = require('../utils/helpers');
const { notifyUser } = require('../utils/notify');

// SERVER.JS ME: app.use('/api/complaints', require('./routes/complaintRoutes'));

const fail = (res, status, msg) => res.status(status).json({ success: false, error: msg, message: msg });
const serverError = (res, label, err) => {
  console.error(label, err.message);
  return fail(res, 500, 'Server error. Thodi der baad try karein.');
};

// 1. CUSTOMER: shikayat / support request (booking ke saath ya bina)
router.post('/', verifyToken, async (req, res) => {
  try {
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (message.length < 5) return fail(res, 400, 'Problem thodi detail me likhein (kam se kam 5 akshar).');
    if (message.length > 1000) return fail(res, 400, 'Message 1000 akshar se chhota rakhein.');

    let bookingId = null;
    if (req.body.booking_id !== undefined && req.body.booking_id !== null && req.body.booking_id !== '') {
      bookingId = parseId(req.body.booking_id);
      if (bookingId === null) return fail(res, 400, 'Booking ID valid nahi hai.');
      const own = await pool.query('SELECT 1 FROM bookings WHERE id = $1 AND customer_id = $2', [bookingId, req.user.id]);
      if (own.rows.length === 0) return fail(res, 404, 'Booking nahi mili.');
    }

    // Ek hi booking par bahut saari open shikayatein na bharein
    const open = await pool.query(
      `SELECT COUNT(*)::int AS n FROM complaints WHERE user_id = $1 AND status = 'Open'`,
      [req.user.id]
    );
    if (open.rows[0].n >= 5) return fail(res, 429, 'Aapki 5 shikayatein pehle se open hain. Unke hal hone tak rukein.');

    const ins = await pool.query(
      'INSERT INTO complaints (user_id, booking_id, message) VALUES ($1, $2, $3) RETURNING id, status, created_at',
      [req.user.id, bookingId, message]
    );

    const admins = await pool.query(`SELECT id FROM users WHERE role = 'admin'`);
    for (const a of admins.rows) {
      await notifyUser({
        userId: a.id,
        title: 'Nayi shikayat',
        message: `Shikayat #${ins.rows[0].id}${bookingId ? ` (booking #${bookingId})` : ''}: ${message.slice(0, 120)}`,
        sms: false,
        whatsapp: false
      });
    }
    return res.status(201).json({ success: true, message: 'Aapki shikayat darj ho gayi. Team jald dekhegi.', complaint: ins.rows[0] });
  } catch (error) {
    return serverError(res, 'Complaint create error:', error);
  }
});

// 2. CUSTOMER: apni shikayatein
router.get('/mine', verifyToken, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, booking_id, message, status, admin_note, created_at FROM complaints WHERE user_id = $1 ORDER BY id DESC LIMIT 50',
      [req.user.id]
    );
    return res.status(200).json({ success: true, complaints: r.rows });
  } catch (error) {
    return serverError(res, 'My complaints error:', error);
  }
});

// 3. ADMIN: saari shikayatein
router.get('/admin/all', verifyToken, adminMiddleware, async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const r = await pool.query(
      `SELECT c.id, c.booking_id, c.message, c.status, c.admin_note, c.created_at, c.resolved_at,
              u.full_name AS customer_name, u.mobile AS customer_phone, s.salon_name
       FROM complaints c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN bookings b ON b.id = c.booking_id
       LEFT JOIN salons s ON s.id = b.salon_id
       WHERE ($1 = '' OR c.status = $1)
       ORDER BY (c.status = 'Open') DESC, c.id DESC LIMIT 200`,
      [status]
    );
    return res.status(200).json({ success: true, complaints: r.rows });
  } catch (error) {
    return serverError(res, 'Admin complaints error:', error);
  }
});

// 4. ADMIN: jawab likho / band karo.  body: { status: 'Resolved' | 'Open', admin_note? }
router.patch('/admin/:id', verifyToken, adminMiddleware, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fail(res, 400, 'Shikayat ID valid nahi hai.');
    const status = req.body.status;
    if (!['Resolved', 'Open'].includes(status)) return fail(res, 400, 'status Resolved ya Open hona chahiye.');
    const note = typeof req.body.admin_note === 'string' ? req.body.admin_note.trim().slice(0, 500) : null;

    const r = await pool.query(
      `UPDATE complaints
       SET status = $2::varchar, admin_note = COALESCE($3::text, admin_note),
           resolved_at = CASE WHEN $2::text = 'Resolved' THEN NOW() ELSE NULL END
       WHERE id = $1 RETURNING id, user_id, status, admin_note`,
      [id, status, note]
    );
    if (r.rows.length === 0) return fail(res, 404, 'Shikayat nahi mili.');

    if (status === 'Resolved') {
      await notifyUser({
        userId: r.rows[0].user_id,
        title: 'Aapki shikayat hal ho gayi',
        message: `Shikayat #${id} band kar di gayi.${r.rows[0].admin_note ? ` Team ka jawab: ${r.rows[0].admin_note}` : ''}`,
        sms: false,
        whatsapp: false
      });
    }
    return res.status(200).json({ success: true, complaint: r.rows[0] });
  } catch (error) {
    return serverError(res, 'Admin complaint action error:', error);
  }
});

module.exports = router;
