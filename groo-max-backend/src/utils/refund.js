const pool = require('../config/db');
const { slotStartMs, capStatus } = require('./helpers');

// ---------- Refund ka niyam (.env se badal sakte ho) ----------
// REFUND_FULL_HOURS=2      appointment se itne ghante pehle cancel karo to poora paisa wapas
// REFUND_LATE_PERCENT=50   isse der se cancel karo to itne percent wapas
// Owner reject ya cancel kare to hamesha poora paisa wapas.
const envNum = (name, fallback) => {
  const n = Number(process.env[name]);
  return process.env[name] !== undefined && process.env[name] !== '' && Number.isFinite(n) ? n : fallback;
};
const policy = () => ({
  fullHours: Math.max(0, envNum('REFUND_FULL_HOURS', 2)),
  latePercent: Math.min(100, Math.max(0, Math.round(envNum('REFUND_LATE_PERCENT', 50))))
});

// payment_status me in me se kuch bhi ho to paisa mil chuka maana jata hai
const PAID = ['paid', 'success', 'succeeded', 'captured'];
const isPaid = (s) => PAID.includes(String(s || '').toLowerCase());

// Customer ke cancel par kitna wapas milega
function customerRefundFor({ totalPrice, paymentStatus, dateStr, slot, now = Date.now() }) {
  const total = Number(totalPrice) || 0;
  if (!isPaid(paymentStatus) || total <= 0) return { paid: false, amount: 0, percent: 0 };

  const start = slotStartMs(dateStr, slot);
  const { fullHours, latePercent } = policy();
  const hoursLeft = start === null ? 0 : (start - now) / 36e5;
  const percent = hoursLeft >= fullHours ? 100 : latePercent;
  return { paid: true, amount: Math.round(total * percent) / 100, percent };
}

// ---------- Gateway ----------
// PAYMENT_PROVIDER=none (default)  -> refund "Pending" rehta hai, admin haath se bhejta hai
// PAYMENT_PROVIDER=razorpay        -> RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET chahiye, aur booking me gateway ki payment_id save honi chahiye
async function sendToGateway({ paymentId, amount, refundId, bookingId }) {
  const provider = (process.env.PAYMENT_PROVIDER || 'none').toLowerCase();
  if (provider === 'none') {
    return { ok: false, manual: true, error: 'PAYMENT_PROVIDER none hai: ye refund admin ko haath se bhejna hai.' };
  }
  if (provider === 'razorpay') {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return { ok: false, error: 'Razorpay ki keys .env me nahi hain.' };
    if (!paymentId) return { ok: false, error: 'Is booking ki gateway payment_id save nahi hai, isliye automatic refund nahi ho sakta.' };

    const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: Math.round(Number(amount) * 100), // Razorpay paise me leta hai
        speed: 'normal',
        receipt: `refund_${refundId}`,
        notes: { booking_id: String(bookingId) }
      }),
      signal: AbortSignal.timeout(10000)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (body && body.error && body.error.description) || `Razorpay ${res.status}` };
    return { ok: true, gatewayRefundId: body.id || null };
  }
  return { ok: false, error: `Payment provider "${provider}" support nahi hai.` };
}

// booking ki payment_status refund ke hisaab se
const setBookingRefundStatus = (bookingId, status) =>
  pool.query('UPDATE bookings SET payment_status = $1 WHERE id = $2', [status, bookingId]);

// Ek refund ko gateway se bhejo. Ek hi refund do baar na jaye, isliye pehle row ko 'Processing' kar ke "claim" karte hain.
async function processRefund(refundId) {
  const provider = (process.env.PAYMENT_PROVIDER || 'none').toLowerCase();
  const cur = await pool.query('SELECT * FROM refunds WHERE id = $1', [refundId]);
  if (cur.rows.length === 0) return null;
  if (provider === 'none') return cur.rows[0]; // haath se bhejna hai, kuch nahi karna

  const claim = await pool.query(
    `UPDATE refunds SET status = 'Processing' WHERE id = $1 AND status IN ('Pending', 'Failed') RETURNING *`,
    [refundId]
  );
  if (claim.rows.length === 0) return cur.rows[0]; // kisi aur ne le liya ya pehle hi ho chuka
  const refund = claim.rows[0];

  const pay = await pool.query('SELECT payment_id FROM bookings WHERE id = $1', [refund.booking_id]);
  let out;
  try {
    out = await sendToGateway({
      paymentId: pay.rows[0] && pay.rows[0].payment_id,
      amount: refund.amount,
      refundId: refund.id,
      bookingId: refund.booking_id
    });
  } catch (err) {
    out = { ok: false, error: err.message };
  }

  if (out.ok) {
    const done = await pool.query(
      `UPDATE refunds SET status = 'Processed', gateway_refund_id = $2, error = NULL, processed_at = NOW()
       WHERE id = $1 RETURNING *`,
      [refund.id, out.gatewayRefundId]
    );
    await setBookingRefundStatus(refund.booking_id, refund.percent >= 100 ? 'Refunded' : 'Partially Refunded');
    return done.rows[0];
  }
  const failed = await pool.query(
    `UPDATE refunds SET status = 'Failed', error = $2 WHERE id = $1 RETURNING *`,
    [refund.id, String(out.error || 'Refund fail ho gaya').slice(0, 500)]
  );
  await setBookingRefundStatus(refund.booking_id, 'Refund Failed');
  return failed.rows[0];
}

// Admin ne khud paisa bhej diya (UPI / bank se). Reference optional.
async function markRefundSent(refundId, reference) {
  const done = await pool.query(
    `UPDATE refunds SET status = 'Processed', gateway_refund_id = COALESCE($2, 'manual'), error = NULL, processed_at = NOW()
     WHERE id = $1 AND status IN ('Pending', 'Failed') RETURNING *`,
    [refundId, reference ? String(reference).slice(0, 100) : null]
  );
  if (done.rows.length === 0) return null;
  const r = done.rows[0];
  await setBookingRefundStatus(r.booking_id, r.percent >= 100 ? 'Refunded' : 'Partially Refunded');
  return r;
}

// Customer ya owner booking cancel / reject kare. Status badalna aur refund ka hisaab ek hi transaction me hota hai,
// taaki "booking cancel ho gayi par refund ka record nahi bana" jaisa kuch na ho. Gateway ko call transaction ke baad jata hai.
//   by = 'customer' | 'owner',  newStatus = 'Cancelled' | 'Rejected'
async function cancelBooking({ bookingId, by, userId, newStatus, now = Date.now() }) {
  const client = await pool.connect();
  let refundRow = null;
  let row;
  let info;
  let updated;
  try {
    await client.query('BEGIN');
    const who = by === 'customer' ? 'b.customer_id = $2' : 's.owner_id = $2';
    const cur = await client.query(
      `SELECT b.*, to_char(b.booking_date, 'YYYY-MM-DD') AS date_str, s.salon_name, s.owner_id
       FROM bookings b JOIN salons s ON s.id = b.salon_id
       WHERE b.id = $1 AND ${who}
       FOR UPDATE OF b`,
      [bookingId, userId]
    );
    if (cur.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, message: 'Booking nahi mili.' };
    }
    row = cur.rows[0];

    const from = String(row.status || '').toLowerCase();
    const allowed = newStatus === 'Rejected' ? ['pending'] : ['pending', 'confirmed'];
    if (!allowed.includes(from)) {
      await client.query('ROLLBACK');
      return { ok: false, status: 409, message: `Ye booking abhi ${capStatus(row.status)} hai, isse ${newStatus} nahi kiya ja sakta.` };
    }

    if (by === 'customer') {
      const start = slotStartMs(row.date_str, row.time_slot);
      if (start !== null && now >= start) {
        await client.query('ROLLBACK');
        return { ok: false, status: 400, message: 'Appointment ka time ho chuka hai, ab cancel nahi ho sakta.' };
      }
      info = customerRefundFor({ totalPrice: row.total_price, paymentStatus: row.payment_status, dateStr: row.date_str, slot: row.time_slot, now });
    } else {
      const total = Number(row.total_price) || 0;
      info = isPaid(row.payment_status) && total > 0
        ? { paid: true, amount: Math.round(total * 100) / 100, percent: 100 }
        : { paid: false, amount: 0, percent: 0 };
    }

    const upd = await client.query(
      `UPDATE bookings
       SET status = $1, cancelled_by = $2, cancelled_at = NOW(),
           payment_status = CASE WHEN $3::boolean THEN 'Refund Pending' ELSE payment_status END
       WHERE id = $4
       RETURNING *`,
      [newStatus, by, info.amount > 0, bookingId]
    );
    updated = upd.rows[0];

    if (info.amount > 0) {
      const reason = by === 'customer' ? 'Customer ne cancel kiya' : `Owner ne ${newStatus === 'Rejected' ? 'reject' : 'cancel'} kiya`;
      const ins = await client.query(
        'INSERT INTO refunds (booking_id, amount, percent, reason) VALUES ($1, $2, $3, $4) RETURNING *',
        [bookingId, info.amount, info.percent, reason]
      );
      refundRow = ins.rows[0];
    }
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* connection pehle hi band */ }
    throw err;
  } finally {
    client.release();
  }

  if (refundRow) {
    try {
      refundRow = (await processRefund(refundRow.id)) || refundRow;
    } catch (err) {
      console.error('Refund process error:', err.message);
    }
  }

  return {
    ok: true,
    booking: { ...updated, booking_date: row.date_str },
    refund: refundRow,
    info,
    context: {
      salon_name: row.salon_name,
      owner_id: row.owner_id,
      customer_id: row.customer_id,
      service_name: row.service_name,
      time_slot: row.time_slot,
      date_str: row.date_str
    }
  };
}

// Cancel dabane se pehle customer ko dikhane ke liye: kitna wapas milega
async function cancelPreview({ bookingId, userId, now = Date.now() }) {
  const cur = await pool.query(
    `SELECT b.id, b.status, b.total_price, b.payment_status, b.time_slot, to_char(b.booking_date, 'YYYY-MM-DD') AS date_str
     FROM bookings b WHERE b.id = $1 AND b.customer_id = $2`,
    [bookingId, userId]
  );
  if (cur.rows.length === 0) return { ok: false, status: 404, message: 'Booking nahi mili.' };
  const b = cur.rows[0];

  const from = String(b.status || '').toLowerCase();
  if (!['pending', 'confirmed'].includes(from)) {
    return { ok: true, canCancel: false, reason: `Ye booking ${capStatus(b.status)} hai, cancel nahi ho sakti.`, paid: false, amount: 0, percent: 0 };
  }
  const start = slotStartMs(b.date_str, b.time_slot);
  if (start !== null && now >= start) {
    return { ok: true, canCancel: false, reason: 'Appointment ka time ho chuka hai.', paid: false, amount: 0, percent: 0 };
  }
  const info = customerRefundFor({ totalPrice: b.total_price, paymentStatus: b.payment_status, dateStr: b.date_str, slot: b.time_slot, now });
  return { ok: true, canCancel: true, ...info, fullHours: policy().fullHours, latePercent: policy().latePercent };
}

// Customer ko dikhane wala refund message
function refundText(info, refundRow) {
  if (!info || !info.paid) return '';
  if (info.amount <= 0) return ' Is cancel par refund nahi milega.';
  const amt = `₹${Number(info.amount)}${info.percent < 100 ? ` (${info.percent}%)` : ''}`;
  if (refundRow && refundRow.status === 'Processed') return ` ${amt} refund bhej diya gaya hai. Aapke payment method me 5 se 7 din me aa jayega.`;
  if (refundRow && refundRow.status === 'Failed') return ` ${amt} ka refund abhi atka hai, support team dekh rahi hai.`;
  return ` ${amt} ka refund process ho raha hai.`;
}

module.exports = {
  isPaid, policy, customerRefundFor, cancelBooking, cancelPreview, processRefund, markRefundSent, refundText
};
