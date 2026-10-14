const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const pool = require('../config/db');

// Strict positive integer parser
const parseId = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!/^[1-9]\d*$/.test(str)) return null;
  const n = Number(str);
  return Number.isSafeInteger(n) ? n : null;
};

const fail = (res, status, msg) =>
  res.status(status).json({ success: false, error: msg, message: msg });

// 1. ADD NEW TIME SLOT (sirf apne salon me. salon_id client se nahi, token wale owner ke salon se)
router.post('/slots', verifyToken, async (req, res) => {
  try {
    const timeSlot = typeof req.body.time_slot === 'string' ? req.body.time_slot.trim().toUpperCase() : '';
    if (!/^(0?[1-9]|1[0-2]):[0-5]\d (AM|PM)$/.test(timeSlot)) {
      return fail(res, 400, 'Time slot aise likhein: 10:00 AM');
    }

    const salon = await pool.query('SELECT id FROM salons WHERE owner_id = $1', [req.user.id]);
    if (salon.rows.length === 0) return fail(res, 404, 'Is owner ka salon nahi mila.');
    const salonId = salon.rows[0].id;

    const exists = await pool.query(
      'SELECT id FROM salon_slots WHERE salon_id = $1 AND time_slot = $2',
      [salonId, timeSlot]
    );
    if (exists.rows.length > 0) return fail(res, 409, 'Ye time slot pehle se hai.');

    const result = await pool.query(
      `INSERT INTO salon_slots (salon_id, time_slot, is_active)
       VALUES ($1, $2, TRUE)
       RETURNING *`,
      [salonId, timeSlot]
    );

    return res.status(201).json({
      success: true,
      message: 'Time slot added successfully.',
      slot: result.rows[0]
    });
  } catch (error) {
    console.error(error.message);
    return fail(res, 500, 'Slot add nahi ho paya.');
  }
});

// 2. GET ALL SLOTS FOR A SALON (public)
router.get('/slots/:salonId', async (req, res) => {
  try {
    const salonId = parseId(req.params.salonId);
    if (salonId === null) return fail(res, 400, 'Salon ID valid nahi hai.');

    const result = await pool.query('SELECT * FROM salon_slots WHERE salon_id = $1 ORDER BY id', [salonId]);

    return res.status(200).json({
      success: true,
      slots: result.rows
    });
  } catch (error) {
    console.error(error.message);
    return fail(res, 500, 'Slots load nahi ho paye.');
  }
});

// 3. DELETE SLOT (sirf apne salon ka)
router.delete('/slots/:id', verifyToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fail(res, 400, 'Slot ID valid nahi hai.');

    const result = await pool.query(
      `DELETE FROM salon_slots
       WHERE id = $1 AND salon_id IN (SELECT id FROM salons WHERE owner_id = $2)
       RETURNING id`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) return fail(res, 404, 'Slot nahi mila.');

    return res.status(200).json({
      success: true,
      message: 'Slot deleted successfully.'
    });
  } catch (error) {
    console.error(error.message);
    return fail(res, 500, 'Slot delete nahi ho paya.');
  }
});

module.exports = router;
