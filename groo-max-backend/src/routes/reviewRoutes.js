const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const pool = require('../config/db');

// Strict positive integer parser. "2" -> 2. "abc", "2abc", 0, -1 -> null
const parseId = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!/^[1-9]\d*$/.test(str)) return null;
  const n = Number(str);
  return Number.isSafeInteger(n) ? n : null;
};

const fail = (res, status, msg) =>
  res.status(status).json({ success: false, error: msg, message: msg });

// 1. ELIGIBLE BOOKINGS (Customer): jin booking par review diya ja sakta hai.
// Ye route '/:salonId' se PEHLE hona zaroori hai, warna 'eligible' ko salonId samajh liya jayega.
// Eligible = apni booking, confirmed ya completed, appointment ki date aaj ya beet chuki, aur review abhi tak nahi diya.
router.get('/eligible', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.id AS booking_id, b.salon_id, b.service_name, b.time_slot,
              to_char(b.booking_date, 'YYYY-MM-DD') AS booking_date,
              s.salon_name
       FROM bookings b
       JOIN salons s ON s.id = b.salon_id
       WHERE b.customer_id = $1
         AND (
           lower(b.status::text) = 'completed'
           OR (lower(b.status::text) = 'confirmed' AND b.booking_date IS NOT NULL
               AND b.booking_date <= (NOW() AT TIME ZONE 'Asia/Kolkata')::date)
         )
         AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id)
       ORDER BY b.booking_date DESC, b.id DESC`,
      [req.user.id]
    );
    return res.status(200).json({ success: true, bookings: result.rows });
  } catch (error) {
    console.error('Eligible reviews error:', error.message);
    const msg = 'Eligible bookings load nahi ho payi.';
    // Development me asli kaaran bhi dikhao (jaise: column r.booking_id does not exist => migration_all.sql chalao)
    return res.status(500).json({
      success: false, error: msg, message: msg,
      ...(process.env.NODE_ENV === 'production' ? {} : { detail: error.message })
    });
  }
});

// 2. GET ALL REVIEWS FOR A SPECIFIC SALON (Public - for SalonDetailsPage)
// customer_id jaisi private cheez public ko nahi bhejte. user aur date wahi naam jo SalonDetailsPage padhta hai.
router.get('/:salonId', async (req, res) => {
  try {
    const salonId = parseId(req.params.salonId);
    if (salonId === null) return fail(res, 400, 'Salon ID valid nahi hai.');

    const result = await pool.query(
      `SELECT id,
              user_name AS "user",
              user_name,
              rating,
              comment,
              to_char(created_at, 'DD Mon YYYY') AS "date",
              created_at
       FROM reviews
       WHERE salon_id = $1 AND status = 'Visible'
       ORDER BY created_at DESC`,
      [salonId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      reviews: result.rows
    });
  } catch (error) {
    console.error(error.message);
    return fail(res, 500, 'Reviews load nahi ho paye.');
  }
});

// 3. ADD A NEW REVIEW (Customer - for CustomerReviewsPage)
// salon_id client se nahi aati. Booking se nikalti hai, aur booking customer ki apni honi chahiye.
router.post('/', verifyToken, async (req, res) => {
  try {
    const bookingId = parseId(req.body.booking_id);
    const rating = Number(req.body.rating);
    const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';

    if (bookingId === null) return fail(res, 400, 'Booking ID valid nahi hai.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail(res, 400, 'Rating 1 se 5 ke beech honi chahiye.');
    if (comment.length < 3 || comment.length > 1000) return fail(res, 400, 'Review 3 se 1000 akshar ke beech likhein.');

    const bookingRes = await pool.query(
      `SELECT id, salon_id, status,
              (lower(status::text) = 'completed'
               OR (lower(status::text) = 'confirmed' AND booking_date IS NOT NULL
                   AND booking_date <= (NOW() AT TIME ZONE 'Asia/Kolkata')::date)) AS can_review
       FROM bookings
       WHERE id = $1 AND customer_id = $2`,
      [bookingId, req.user.id]
    );
    if (bookingRes.rows.length === 0) return fail(res, 404, 'Booking nahi mili.');

    const booking = bookingRes.rows[0];
    if (!booking.can_review) {
      return fail(res, 400, 'Review sirf us booking par de sakte ho jo ho chuki ho (service poori hui ho ya appointment ki date aa chuki ho).');
    }

    // Naam token se nahi, users table se
    const userRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const userName = (userRes.rows[0] && userRes.rows[0].full_name) || 'Customer';

    const result = await pool.query(
      `INSERT INTO reviews (salon_id, customer_id, booking_id, user_name, rating, comment, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Visible')
       RETURNING id, salon_id, booking_id, user_name, rating, comment, status, created_at`,
      [booking.salon_id, req.user.id, booking.id, userName, rating, comment]
    );

    return res.status(201).json({
      success: true,
      message: 'Review published successfully.',
      review: result.rows[0]
    });
  } catch (error) {
    // Ek booking par do review: unique index (uniq_review_per_booking) rok deta hai
    if (error.code === '23505') return fail(res, 409, 'Is booking ka review aap pehle hi de chuke ho.');
    console.error(error.message);
    return fail(res, 500, 'Review save nahi ho paya.');
  }
});

// 4. GET ALL REVIEWS (Admin - for AdminPanel Moderation)
router.get('/admin/all', verifyToken, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, s.salon_name
      FROM reviews r
      LEFT JOIN salons s ON r.salon_id = s.id
      ORDER BY r.created_at DESC;
    `);

    return res.status(200).json({
      success: true,
      reviews: result.rows
    });
  } catch (error) {
    console.error(error.message);
    return fail(res, 500, 'Reviews load nahi ho paye.');
  }
});

// 5. REMOVE / DELETE REVIEW (Admin Moderation - for AdminPanel)
router.delete('/:id', verifyToken, adminMiddleware, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fail(res, 400, 'Review ID valid nahi hai.');

    await pool.query('DELETE FROM reviews WHERE id = $1', [id]);

    return res.status(200).json({
      success: true,
      message: 'Review removed successfully by admin.'
    });
  } catch (error) {
    console.error(error.message);
    return fail(res, 500, 'Review delete nahi ho paya.');
  }
});

module.exports = router;
