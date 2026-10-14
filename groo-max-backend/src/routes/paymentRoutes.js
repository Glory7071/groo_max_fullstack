const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const pool = require('../config/db');
const { parseId } = require('../utils/helpers');
const { isPaid } = require('../utils/refund');
const { notifyUser } = require('../utils/notify');

// SERVER.JS ME:
//   app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));   // webhook ke liye
//   app.use('/api/payments', require('./routes/paymentRoutes'));
//
// .env:
//   PAYMENT_PROVIDER=none        (default) test mode: asli paisa nahi, "Test payment" button se Paid ho jata hai
//   PAYMENT_PROVIDER=razorpay    RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (aur webhook ke liye RAZORPAY_WEBHOOK_SECRET)

const fail = (res, status, msg) => res.status(status).json({ success: false, error: msg, message: msg });
const serverError = (res, label, err) => {
  console.error(label, err.message);
  return fail(res, 500, 'Server error. Thodi der baad try karein.');
};

const provider = () => (process.env.PAYMENT_PROVIDER || 'none').toLowerCase();
const razorpayAuth = () =>
  `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`;

const safeEqualHex = (a, b) => {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const hmac = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex');

// Customer ki apni booking jo abhi chal rahi ho (pending / confirmed)
async function ownBooking(bookingId, userId) {
  const r = await pool.query(
    `SELECT b.id, b.customer_id, b.status, b.total_price, b.payment_status, b.payment_method, b.payment_id,
            b.payment_order_id, b.service_type, b.service_name, b.service_id, s.salon_name, s.owner_id
     FROM bookings b JOIN salons s ON s.id = b.salon_id
     WHERE b.id = $1 AND b.customer_id = $2`,
    [bookingId, userId]
  );
  return r.rows[0] || null;
}
const isLive = (b) => ['pending', 'confirmed'].includes(String(b.status || '').toLowerCase());

// Booking ko Paid mark karo. Ek hi payment_id do baar ya do alag payment ek booking par nahi.
// Wapas: { ok, already, conflict }
async function markPaid({ bookingId, paymentId, orderId, method = 'online' }) {
  const done = await pool.query(
    `UPDATE bookings
     SET payment_status = 'Paid', payment_id = $2, payment_method = $4, payment_order_id = COALESCE($3, payment_order_id)
     WHERE id = $1 AND lower(COALESCE(payment_status, 'unpaid')) NOT IN ('paid', 'success', 'succeeded', 'captured', 'refunded', 'partially refunded')
     RETURNING id`,
    [bookingId, paymentId, orderId || null, method]
  );
  if (done.rows.length > 0) return { ok: true, already: false };

  const now = await pool.query('SELECT payment_id, payment_status FROM bookings WHERE id = $1', [bookingId]);
  if (now.rows.length && now.rows[0].payment_id === paymentId) return { ok: true, already: true };
  return { ok: false, conflict: true };
}

async function tellOwnerPaid(b) {
  await notifyUser({
    userId: b.owner_id,
    title: 'Payment mil gaya',
    message: `Booking #${b.id} (${b.service_name}) ka ₹${Number(b.total_price)} online payment ho gaya.`,
    sms: false,
    whatsapp: false
  });
}

// 0. Frontend ko batao: test mode hai ya asli gateway (sirf PUBLIC key id, secret kabhi nahi)
router.get('/config', (req, res) => {
  const p = provider();
  return res.status(200).json({
    success: true,
    provider: p,
    keyId: p === 'razorpay' ? process.env.RAZORPAY_KEY_ID || null : null,
    testModeAllowed: p === 'none' && process.env.NODE_ENV !== 'production'
  });
});

// 1. CHECKOUT KA HISAAB: salon, service, base price, home charge, total (sab database se)
router.get('/summary/:bookingId', verifyToken, async (req, res) => {
  try {
    const id = parseId(req.params.bookingId);
    if (id === null) return fail(res, 400, 'Booking ID valid nahi hai.');
    const r = await pool.query(
      `SELECT b.id, b.status, b.service_type, b.service_name, b.total_price, b.payment_status, b.payment_method,
              b.time_slot, to_char(b.booking_date, 'YYYY-MM-DD') AS booking_date,
              s.salon_name, sv.price AS base_price
       FROM bookings b
       JOIN salons s ON s.id = b.salon_id
       LEFT JOIN services sv ON sv.id = b.service_id
       WHERE b.id = $1 AND b.customer_id = $2`,
      [id, req.user.id]
    );
    if (r.rows.length === 0) return fail(res, 404, 'Booking nahi mili.');
    const b = r.rows[0];
    const total = Number(b.total_price) || 0;
    const base = b.base_price !== null && b.base_price !== undefined ? Number(b.base_price) : total;
    const homeCharge = b.service_type === 'doorstep' ? Math.max(0, total - base) : 0;
    return res.status(200).json({
      success: true,
      booking: {
        id: b.id,
        status: b.status,
        salonName: b.salon_name,
        serviceName: b.service_name,
        visitType: b.service_type === 'doorstep' ? 'home' : 'salon',
        date: b.booking_date,
        slot: b.time_slot,
        basePrice: total - homeCharge,
        homeCharge,
        total,
        paymentStatus: b.payment_status || 'Unpaid',
        paymentMethod: b.payment_method || null,
        paid: isPaid(b.payment_status)
      }
    });
  } catch (error) {
    return serverError(res, 'Payment summary error:', error);
  }
});

// 2. ONLINE PAYMENT SHURU: gateway par order banao. Amount hamesha database ke total_price se, client se nahi.
router.post('/create-order', verifyToken, async (req, res) => {
  try {
    const id = parseId(req.body.booking_id);
    if (id === null) return fail(res, 400, 'Booking ID valid nahi hai.');
    const b = await ownBooking(id, req.user.id);
    if (!b) return fail(res, 404, 'Booking nahi mili.');
    if (!isLive(b)) return fail(res, 400, `Ye booking ${b.status} hai, payment nahi ho sakta.`);
    if (isPaid(b.payment_status)) return fail(res, 409, 'Is booking ka payment ho chuka hai.');
    const amount = Number(b.total_price);
    if (!(amount > 0)) return fail(res, 400, 'Booking ki amount valid nahi hai.');

    const p = provider();
    if (p === 'none') {
      return res.status(200).json({ success: true, provider: 'none', amount, testModeAllowed: process.env.NODE_ENV !== 'production' });
    }
    if (p !== 'razorpay') return fail(res, 500, 'Payment provider sahi set nahi hai.');
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return fail(res, 500, 'Razorpay ki keys .env me nahi hain.');

    const rz = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: razorpayAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // paise
        currency: 'INR',
        receipt: `booking_${b.id}`,
        notes: { booking_id: String(b.id) }
      }),
      signal: AbortSignal.timeout(10000)
    });
    const order = await rz.json().catch(() => ({}));
    if (!rz.ok || !order.id) {
      console.error('Razorpay order error:', rz.status, order && order.error && order.error.description);
      return fail(res, 502, 'Payment gateway abhi jawab nahi de raha. Thodi der baad try karein.');
    }

    await pool.query(`UPDATE bookings SET payment_order_id = $2, payment_method = 'online' WHERE id = $1`, [b.id, order.id]);
    return res.status(200).json({
      success: true,
      provider: 'razorpay',
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: Math.round(amount * 100),
      currency: 'INR'
    });
  } catch (error) {
    return serverError(res, 'Create order error:', error);
  }
});

// 3. PAYMENT KE BAAD: signature check karke Paid mark karo. Signature galat to kuch nahi hota.
router.post('/verify', verifyToken, async (req, res) => {
  try {
    if (provider() !== 'razorpay') return fail(res, 400, 'Online payment abhi chalu nahi hai.');
    const id = parseId(req.body.booking_id);
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    if (id === null || !orderId || !paymentId || !signature) return fail(res, 400, 'Payment ki jaankari poori nahi hai.');

    const b = await ownBooking(id, req.user.id);
    if (!b) return fail(res, 404, 'Booking nahi mili.');
    if (!b.payment_order_id || b.payment_order_id !== orderId) return fail(res, 400, 'Ye payment is booking ka nahi hai.');

    const expected = hmac(process.env.RAZORPAY_KEY_SECRET || '', `${orderId}|${paymentId}`);
    if (!safeEqualHex(expected, signature)) return fail(res, 400, 'Payment verify nahi ho paya. Paise kat gaye hon to support se baat karein.');

    const out = await markPaid({ bookingId: b.id, paymentId, orderId });
    if (!out.ok) return fail(res, 409, 'Is booking par pehle se alag payment darj hai. Support se baat karein.');
    if (!out.already) await tellOwnerPaid(b);
    return res.status(200).json({ success: true, message: 'Payment ho gaya.', already: out.already });
  } catch (error) {
    if (error.code === '23505') return fail(res, 409, 'Ye payment pehle hi kisi booking par darj hai.');
    return serverError(res, 'Verify payment error:', error);
  }
});

// 4. TEST MODE (sirf jab PAYMENT_PROVIDER=none aur production nahi): asli paisa nahi, bas flow check karne ke liye
router.post('/test-pay', verifyToken, async (req, res) => {
  try {
    if (provider() !== 'none' || process.env.NODE_ENV === 'production') return fail(res, 403, 'Test payment yahan allowed nahi hai.');
    const id = parseId(req.body.booking_id);
    if (id === null) return fail(res, 400, 'Booking ID valid nahi hai.');
    const b = await ownBooking(id, req.user.id);
    if (!b) return fail(res, 404, 'Booking nahi mili.');
    if (!isLive(b)) return fail(res, 400, `Ye booking ${b.status} hai.`);
    const out = await markPaid({ bookingId: b.id, paymentId: `test_${b.id}_${Date.now()}`, method: 'test' });
    if (!out.ok) return fail(res, 409, 'Is booking ka payment ho chuka hai.');
    await tellOwnerPaid(b);
    return res.status(200).json({ success: true, message: 'Test payment ho gaya (asli paisa nahi kata).' });
  } catch (error) {
    return serverError(res, 'Test pay error:', error);
  }
});

// 5. SALON PAR PAISA DENA: payment baad me hoga
router.post('/pay-at-salon', verifyToken, async (req, res) => {
  try {
    const id = parseId(req.body.booking_id);
    if (id === null) return fail(res, 400, 'Booking ID valid nahi hai.');
    const b = await ownBooking(id, req.user.id);
    if (!b) return fail(res, 404, 'Booking nahi mili.');
    if (!isLive(b)) return fail(res, 400, `Ye booking ${b.status} hai.`);
    if (isPaid(b.payment_status)) return fail(res, 409, 'Is booking ka payment ho chuka hai.');
    await pool.query(`UPDATE bookings SET payment_method = 'pay_at_salon', payment_status = 'Unpaid' WHERE id = $1`, [b.id]);
    return res.status(200).json({ success: true, message: 'Theek hai, payment salon par karna hoga.' });
  } catch (error) {
    return serverError(res, 'Pay at salon error:', error);
  }
});

// 6. RAZORPAY WEBHOOK: customer payment ke baad tab band kar de to bhi booking Paid ho jaye.
// Razorpay dashboard me URL: https://<aapka-domain>/api/payments/webhook  (event: payment.captured, order.paid)
router.post('/webhook', async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (provider() !== 'razorpay' || !secret) return res.status(200).json({ ok: true, ignored: true });
    const raw = req.rawBody;
    if (!raw) return fail(res, 400, 'Raw body nahi mili (server.js me express.json verify lagayein).');
    if (!safeEqualHex(hmac(secret, raw), req.headers['x-razorpay-signature'])) return fail(res, 400, 'Signature galat.');

    const event = req.body && req.body.event;
    if (!['payment.captured', 'order.paid'].includes(event)) return res.status(200).json({ ok: true, ignored: true });

    const pay = req.body.payload && req.body.payload.payment && req.body.payload.payment.entity;
    const orderId = pay ? pay.order_id : req.body.payload && req.body.payload.order && req.body.payload.order.entity.id;
    const paymentId = pay && pay.id;
    if (!orderId || !paymentId) return res.status(200).json({ ok: true, ignored: true });

    const r = await pool.query(
      `SELECT b.id, b.total_price, b.service_name, s.owner_id
       FROM bookings b JOIN salons s ON s.id = b.salon_id WHERE b.payment_order_id = $1`,
      [orderId]
    );
    if (r.rows.length === 0) return res.status(200).json({ ok: true, ignored: true });

    const out = await markPaid({ bookingId: r.rows[0].id, paymentId, orderId });
    if (out.ok && !out.already) await tellOwnerPaid(r.rows[0]);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return res.status(500).json({ ok: false });
  }
});

module.exports = router;
