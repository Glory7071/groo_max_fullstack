const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/adminMiddleware');
const { verifyToken } = require('../middleware/authMiddleware');
const pool = require('../config/db');
const { notifyUser } = require('../utils/notify');

// Admin ke liye REFUND, REVIEW aur COMPLAINT ke routes alag files me hain:
//   /api/bookings/admin/refunds   (bookingActionsRoutes.js)
//   /api/reviews/admin/all        (reviewRoutes.js)
//   /api/complaints/admin/all     (complaintRoutes.js)

const fail = (res, status, msg) => res.status(status).json({ success: false, error: msg, message: msg });
const serverError = (res, label, err) => {
  console.error(label, err.message);
  return fail(res, 500, 'Server error. Thodi der baad try karein.');
};
const parseId = (v) => {
  const s = String(v ?? '').trim();
  return /^[1-9]\d*$/.test(s) && Number.isSafeInteger(Number(s)) ? Number(s) : null;
};

// Platform ka commission: COMMISSION_PERCENT (default 10) completed bookings ki rakam par
const commissionPercent = () => {
  const n = Number(process.env.COMMISSION_PERCENT);
  return process.env.COMMISSION_PERCENT !== undefined && process.env.COMMISSION_PERCENT !== '' && Number.isFinite(n)
    ? Math.min(100, Math.max(0, n))
    : 10;
};

// 1. SALON APPROVE / REJECT / WAPAS PENDING
router.patch('/salons/:id/status', verifyToken, adminMiddleware, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { status } = req.body; // 'approved', 'rejected' ya 'pending'
    if (id === null) return fail(res, 400, 'Salon ID valid nahi hai.');
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return fail(res, 400, 'Invalid status. Use "approved", "rejected" ya "pending".');
    }

    const result = await pool.query('UPDATE salons SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
    if (result.rows.length === 0) return fail(res, 404, 'Salon not found.');

    const salon = result.rows[0];
    if (salon.owner_id) {
      const text = {
        approved: ['Salon approve ho gaya', `${salon.salon_name} approve ho gaya. Ab customers aapko dekh aur book kar sakte hain.`],
        rejected: ['Salon approve nahi hua', `${salon.salon_name} abhi approve nahi hua. Details check karke dobara bhejein.`],
        pending: ['Salon review me hai', `${salon.salon_name} ko admin ne review ke liye rok diya hai.`]
      }[status];
      await notifyUser({ userId: salon.owner_id, title: text[0], message: text[1], sms: false, whatsapp: false });
    }
    return res.status(200).json({ success: true, message: `Salon successfully ${status}.`, salon });
  } catch (error) {
    return serverError(res, 'Admin salon status error:', error);
  }
});

// 2. DASHBOARD KE ASLI AANKDE
router.get('/overview', verifyToken, adminMiddleware, async (req, res) => {
  try {
    const q = (sql) => pool.query(sql).then((r) => r.rows[0]);
    const [users, salons, bookings, money, refunds, complaints] = await Promise.all([
      q(`SELECT COUNT(*) FILTER (WHERE role = 'customer')::int AS customers,
                COUNT(*) FILTER (WHERE role = 'salon_owner')::int AS owners FROM users`),
      q(`SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
                COUNT(*) FILTER (WHERE status = 'approved')::int AS approved FROM salons`),
      q(`SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE lower(status::text) = 'pending')::int AS pending,
                COUNT(*) FILTER (WHERE lower(status::text) = 'confirmed')::int AS confirmed,
                COUNT(*) FILTER (WHERE lower(status::text) = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE lower(status::text) IN ('cancelled', 'rejected'))::int AS cancelled,
                COUNT(*) FILTER (WHERE service_type = 'doorstep')::int AS home_bookings
         FROM bookings`),
      q(`SELECT COALESCE(SUM(total_price) FILTER (WHERE lower(status::text) = 'completed'), 0)::float AS gross,
                COALESCE(SUM(total_price) FILTER (WHERE lower(payment_status) IN ('paid', 'success', 'succeeded', 'captured')), 0)::float AS online_paid
         FROM bookings`),
      q(`SELECT COUNT(*) FILTER (WHERE status IN ('Pending', 'Failed'))::int AS to_send,
                COALESCE(SUM(amount) FILTER (WHERE status IN ('Pending', 'Failed')), 0)::float AS to_send_amount FROM refunds`),
      q(`SELECT COUNT(*) FILTER (WHERE status = 'Open')::int AS open FROM complaints`)
    ]);

    const pct = commissionPercent();
    const gross = money.gross;
    return res.status(200).json({
      success: true,
      data: {
        customers: users.customers,
        owners: users.owners,
        salons: salons,
        bookings,
        gross,
        online_paid: money.online_paid,
        commission_percent: pct,
        commission: Math.round((gross * pct)) / 100,
        refunds_to_send: refunds.to_send,
        refunds_to_send_amount: refunds.to_send_amount,
        open_complaints: complaints.open
      }
    });
  } catch (error) {
    return serverError(res, 'Admin overview error:', error);
  }
});

// Purana analytics route (agar kahin use ho raha ho): ab asli aankde deta hai
router.get('/analytics', verifyToken, adminMiddleware, async (req, res) => {
  try {
    const s = await pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'pending')::int AS pending FROM salons`);
    const b = await pool.query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(total_price) FILTER (WHERE lower(status::text) = 'completed'), 0)::float AS revenue FROM bookings`);
    const u = await pool.query('SELECT COUNT(*)::int AS total FROM users');
    return res.status(200).json({
      success: true,
      data: {
        totalSalons: s.rows[0].total,
        pendingSalons: s.rows[0].pending,
        totalBookings: b.rows[0].total,
        totalUsers: u.rows[0].total,
        totalRevenue: b.rows[0].revenue
      }
    });
  } catch (error) {
    return serverError(res, 'Admin analytics error:', error);
  }
});

// 3. SAARE SALONS (owner ke saath)
router.get('/salons', verifyToken, adminMiddleware, async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const r = await pool.query(
      `SELECT s.id, s.salon_name, s.area, s.address, s.category, s.status, s.is_home_service,
              u.full_name AS owner_name, u.mobile AS owner_phone, u.email AS owner_email,
              (SELECT COUNT(*)::int FROM bookings b WHERE b.salon_id = s.id) AS bookings_count
       FROM salons s LEFT JOIN users u ON u.id = s.owner_id
       WHERE ($1 = '' OR s.status = $1)
       ORDER BY (s.status = 'pending') DESC, s.id DESC`,
      [status]
    );
    return res.status(200).json({ success: true, salons: r.rows });
  } catch (error) {
    return serverError(res, 'Admin salons error:', error);
  }
});

// 4. SAARE USERS (password kabhi nahi bheja jata)
router.get('/users', verifyToken, adminMiddleware, async (req, res) => {
  try {
    const role = typeof req.query.role === 'string' ? req.query.role : '';
    const r = await pool.query(
      `SELECT id, full_name, email, mobile, role, created_at
       FROM users WHERE ($1 = '' OR role = $1) ORDER BY id DESC LIMIT 500`,
      [role]
    );
    return res.status(200).json({ success: true, users: r.rows });
  } catch (error) {
    return serverError(res, 'Admin users error:', error);
  }
});

// 5. PLATFORM KI SAARI BOOKINGS
router.get('/bookings', verifyToken, adminMiddleware, async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : '';
    const r = await pool.query(
      `SELECT b.id, b.status, b.service_name, b.service_type, b.time_slot, b.total_price, b.payment_status, b.payment_method,
              to_char(b.booking_date, 'YYYY-MM-DD') AS booking_date,
              u.full_name AS customer_name, u.mobile AS customer_phone, s.salon_name
       FROM bookings b
       LEFT JOIN users u ON u.id = b.customer_id
       LEFT JOIN salons s ON s.id = b.salon_id
       WHERE ($1 = '' OR lower(b.status::text) = $1)
       ORDER BY b.id DESC LIMIT 300`,
      [status]
    );
    return res.status(200).json({ success: true, bookings: r.rows });
  } catch (error) {
    return serverError(res, 'Admin bookings error:', error);
  }
});

module.exports = router;
