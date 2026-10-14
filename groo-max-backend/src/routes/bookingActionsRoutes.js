const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const pool = require('../config/db');
const { parseId, normSlot, isValidDate, istToday, slotSortKey, slotStartMs } = require('../utils/helpers');
const { cancelBooking, cancelPreview, processRefund, markRefundSent, refundText } = require('../utils/refund');
const { notifyUser } = require('../utils/notify');

// SERVER.JS ME EK LINE (existing '/api/bookings' wali line ke neeche):
//   app.use('/api/bookings', require('./routes/bookingActionsRoutes'));

const fail = (res, status, msg) =>
  res.status(status).json({ success: false, error: msg, message: msg });

const serverError = (res, label, err) => {
  console.error(label, err.message);
  return fail(res, 500, 'Server error. Thodi der baad try karein.');
};

const FINISHED = "('completed', 'cancelled', 'rejected')";

// 1. SALON KE SLOTS (public): is date par kaun sa slot khali hai, kaun sa book ho chuka
router.get('/availability/:salonId', async (req, res) => {
  try {
    const salonId = parseId(req.params.salonId);
    const date = req.query.date;
    if (salonId === null) return fail(res, 400, 'Salon ID valid nahi hai.');
    if (!isValidDate(date)) return fail(res, 400, 'Date YYYY-MM-DD format me bhejein.');

    // Salon ki chhutti ho to us din koi slot nahi
    const hol = await pool.query('SELECT reason FROM salon_holidays WHERE salon_id = $1 AND holiday_date = $2', [salonId, date]);
    if (hol.rows.length > 0) {
      return res.status(200).json({ success: true, date, today: istToday(), holiday: true, reason: hol.rows[0].reason || null, slots: [] });
    }

    const result = await pool.query(
      `SELECT sl.id, sl.time_slot,
              EXISTS (
                SELECT 1 FROM bookings b
                WHERE b.salon_id = sl.salon_id AND b.booking_date = $2 AND b.time_slot = sl.time_slot
                  AND lower(b.status::text) NOT IN ('cancelled', 'rejected')
              ) AS booked
       FROM salon_slots sl
       WHERE sl.salon_id = $1 AND sl.is_active = TRUE`,
      [salonId, date]
    );

    const now = Date.now();
    const slots = result.rows
      .sort((a, b) => slotSortKey(a.time_slot) - slotSortKey(b.time_slot))
      .map((r) => {
        const start = slotStartMs(date, r.time_slot);
        const past = start !== null && start <= now; // aaj ka nikal chuka time
        return { id: r.id, time_slot: r.time_slot, booked: r.booked, past, available: !r.booked && !past };
      });

    return res.status(200).json({ success: true, date, today: istToday(), slots });
  } catch (error) {
    return serverError(res, 'Availability error:', error);
  }
});

// 2. CANCEL KARNE SE PEHLE: kitna refund milega (customer)
router.get('/:id/cancel-preview', verifyToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fail(res, 400, 'Booking ID valid nahi hai.');
    const out = await cancelPreview({ bookingId: id, userId: req.user.id });
    if (!out.ok) return fail(res, out.status, out.message);
    return res.status(200).json({ success: true, ...out });
  } catch (error) {
    return serverError(res, 'Cancel preview error:', error);
  }
});

// 2b. RESCHEDULE (customer): date / time badalna. Naya time owner ko dobara confirm karna padta hai (status Pending ho jata hai).
const MAX_RESCHEDULES = 2;
router.patch('/:id/reschedule', verifyToken, async (req, res) => {
  const id = parseId(req.params.id);
  const newDate = req.body.booking_date;
  const newSlot = normSlot(req.body.time_slot);
  if (id === null) return fail(res, 400, 'Booking ID valid nahi hai.');
  if (!isValidDate(newDate)) return fail(res, 400, 'Nayi date galat hai.');
  if (!newSlot) return fail(res, 400, 'Naya time slot galat hai.');
  if (newDate < istToday()) return fail(res, 400, 'Purani date par booking nahi ho sakti.');
  const newStart = slotStartMs(newDate, newSlot);
  if (newStart !== null && newStart <= Date.now()) return fail(res, 400, 'Ye time nikal chuka hai. Aage ka slot chuniye.');

  const client = await pool.connect();
  let ctx = null;
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT b.id, b.salon_id, b.status, b.time_slot, b.service_name, b.reschedule_count,
              to_char(b.booking_date, 'YYYY-MM-DD') AS date_str, s.owner_id, s.salon_name
       FROM bookings b JOIN salons s ON s.id = b.salon_id
       WHERE b.id = $1 AND b.customer_id = $2 FOR UPDATE OF b`,
      [id, req.user.id]
    );
    if (cur.rows.length === 0) { await client.query('ROLLBACK'); return fail(res, 404, 'Booking nahi mili.'); }
    const b = cur.rows[0];

    if (!['pending', 'confirmed'].includes(String(b.status).toLowerCase())) {
      await client.query('ROLLBACK');
      return fail(res, 400, `Ye booking ${b.status} hai, time nahi badal sakte.`);
    }
    const oldStart = slotStartMs(b.date_str, b.time_slot);
    if (oldStart !== null && oldStart <= Date.now()) { await client.query('ROLLBACK'); return fail(res, 400, 'Appointment ka time ho chuka hai.'); }
    if (Number(b.reschedule_count) >= MAX_RESCHEDULES) {
      await client.query('ROLLBACK');
      return fail(res, 400, `Time sirf ${MAX_RESCHEDULES} baar badal sakte hain. Cancel karke nayi booking karein.`);
    }
    if (b.date_str === newDate && b.time_slot === newSlot) { await client.query('ROLLBACK'); return fail(res, 400, 'Ye wahi date aur time hai.'); }

    const slotOk = await client.query('SELECT 1 FROM salon_slots WHERE salon_id = $1 AND time_slot = $2 AND is_active = TRUE', [b.salon_id, newSlot]);
    if (slotOk.rows.length === 0) { await client.query('ROLLBACK'); return fail(res, 400, 'Ye time slot is salon me available nahi hai.'); }
    const hol = await client.query('SELECT 1 FROM salon_holidays WHERE salon_id = $1 AND holiday_date = $2', [b.salon_id, newDate]);
    if (hol.rows.length > 0) { await client.query('ROLLBACK'); return fail(res, 400, 'Salon is din band rahega. Dusri date chuniye.'); }

    const clash = await client.query(
      `SELECT 1 FROM bookings WHERE salon_id = $1 AND booking_date = $2 AND time_slot = $3 AND id <> $4
         AND lower(status::text) NOT IN ('cancelled', 'rejected')`,
      [b.salon_id, newDate, newSlot, id]
    );
    if (clash.rows.length > 0) { await client.query('ROLLBACK'); return fail(res, 409, 'Ye time slot is date par pehle se booked hai.'); }

    const upd = await client.query(
      `UPDATE bookings SET booking_date = $2, time_slot = $3, status = 'Pending', reschedule_count = reschedule_count + 1
       WHERE id = $1 RETURNING id, status, time_slot, reschedule_count`,
      [id, newDate, newSlot]
    );
    await client.query('COMMIT');
    ctx = { b, booking: { ...upd.rows[0], booking_date: newDate } };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* already closed */ }
    if (error.code === '23505') return fail(res, 409, 'Ye time slot abhi kisi aur ne book kar liya. Dusra chuniye.');
    return serverError(res, 'Reschedule error:', error);
  } finally {
    client.release();
  }

  await notifyUser({
    userId: ctx.b.owner_id,
    title: 'Customer ne time badla',
    message: `Booking #${id} (${ctx.b.service_name}) ka time ${ctx.b.date_str} ${ctx.b.time_slot} se badal kar ${newDate} ${newSlot} ho gaya. Kripya dobara confirm karein.`,
    sms: false,
    whatsapp: false
  });
  return res.status(200).json({
    success: true,
    message: 'Time badal gaya. Salon owner naya time dobara confirm karega.',
    booking: ctx.booking
  });
});

// 3. BOOKING CANCEL (customer, sirf apni). Paisa mila hua ho to refund ka hisaab bhi banta hai.
router.patch('/:id/cancel', verifyToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fail(res, 400, 'Booking ID valid nahi hai.');

    const out = await cancelBooking({ bookingId: id, by: 'customer', userId: req.user.id, newStatus: 'Cancelled' });
    if (!out.ok) return fail(res, out.status, out.message);

    // Owner ko app me khabar (SMS / WhatsApp nahi)
    const c = out.context;
    const when = [c.date_str, c.time_slot].filter(Boolean).join(' ');
    await notifyUser({
      userId: c.owner_id,
      title: 'Customer ne booking cancel ki',
      message: `Booking #${id} (${c.service_name}, ${when}) customer ne cancel kar di. Ye slot ab khali hai.`,
      sms: false,
      whatsapp: false
    });

    return res.status(200).json({
      success: true,
      message: `Booking cancel ho gayi.${refundText(out.info, out.refund)}`,
      booking: out.booking,
      refund: out.refund
        ? { amount: Number(out.refund.amount), percent: out.refund.percent, status: out.refund.status }
        : null
    });
  } catch (error) {
    return serverError(res, 'Customer cancel error:', error);
  }
});

// 4. LIST SE HATAO (customer): sirf khatam ho chuki booking (Completed / Cancelled / Rejected).
// Record database me rehta hai (review aur refund ka hisaab isi se judta hai), bas aapki list me nahi dikhta.
router.patch('/:id/hide', verifyToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fail(res, 400, 'Booking ID valid nahi hai.');

    const result = await pool.query(
      `UPDATE bookings SET hidden_by_customer = TRUE
       WHERE id = $1 AND customer_id = $2 AND lower(status::text) IN ${FINISHED}
       RETURNING id`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return fail(res, 404, 'Booking nahi mili, ya abhi chal rahi hai. Sirf khatam ho chuki booking hata sakte ho.');
    }
    return res.status(200).json({ success: true, message: 'Booking list se hata di gayi.' });
  } catch (error) {
    return serverError(res, 'Customer hide error:', error);
  }
});

// 5. SAARI KHATAM BOOKINGS EK SAATH HATAO (customer)
router.post('/clear-finished', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bookings SET hidden_by_customer = TRUE
       WHERE customer_id = $1 AND lower(status::text) IN ${FINISHED}
         AND COALESCE(hidden_by_customer, FALSE) = FALSE
       RETURNING id`,
      [req.user.id]
    );
    return res.status(200).json({ success: true, count: result.rows.length, message: `${result.rows.length} booking list se hata di gayi.` });
  } catch (error) {
    return serverError(res, 'Customer clear error:', error);
  }
});

// 6. ADMIN: saare refunds (bhejna baaki / fail / ho chuke)
router.get('/admin/refunds', verifyToken, adminMiddleware, async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const result = await pool.query(
      `SELECT r.*, b.payment_id, b.payment_method, b.service_name,
              to_char(b.booking_date, 'YYYY-MM-DD') AS booking_date, b.time_slot,
              u.full_name AS customer_name, u.mobile AS customer_phone, s.salon_name
       FROM refunds r
       JOIN bookings b ON b.id = r.booking_id
       LEFT JOIN users u ON u.id = b.customer_id
       LEFT JOIN salons s ON s.id = b.salon_id
       WHERE ($1 = '' OR r.status = $1)
       ORDER BY r.id DESC LIMIT 200`,
      [status]
    );
    return res.status(200).json({ success: true, refunds: result.rows });
  } catch (error) {
    return serverError(res, 'Admin refunds error:', error);
  }
});

// 7. ADMIN: refund par action.  body: { action: 'mark_sent', reference?: 'UPI ref' }  ya  { action: 'retry' }
router.patch('/admin/refunds/:id', verifyToken, adminMiddleware, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fail(res, 400, 'Refund ID valid nahi hai.');
    const action = req.body.action;
    if (!['mark_sent', 'retry'].includes(action)) return fail(res, 400, 'action mark_sent ya retry hona chahiye.');

    let refund;
    if (action === 'mark_sent') {
      refund = await markRefundSent(id, req.body.reference);
      if (!refund) return fail(res, 409, 'Ye refund pehle hi ho chuka hai ya nahi mila.');
    } else {
      const cur = await pool.query('SELECT status FROM refunds WHERE id = $1', [id]);
      if (cur.rows.length === 0) return fail(res, 404, 'Refund nahi mila.');
      if (!['Pending', 'Failed'].includes(cur.rows[0].status)) return fail(res, 409, `Ye refund ${cur.rows[0].status} hai, dobara nahi bheja ja sakta.`);
      refund = await processRefund(id);
    }

    // Refund bhej diya gaya ho to customer ko khabar
    if (refund && refund.status === 'Processed') {
      const b = await pool.query('SELECT customer_id FROM bookings WHERE id = $1', [refund.booking_id]);
      if (b.rows.length) {
        await notifyUser({
          userId: b.rows[0].customer_id,
          title: 'Refund bhej diya gaya',
          message: `Booking #${refund.booking_id} ka ₹${Number(refund.amount)} refund bhej diya gaya hai. Aapke payment method me 5 se 7 din me aa jayega.`,
          sms: true,
          whatsapp: true
        });
      }
    }
    return res.status(200).json({ success: true, refund });
  } catch (error) {
    return serverError(res, 'Admin refund action error:', error);
  }
});

module.exports = router;
