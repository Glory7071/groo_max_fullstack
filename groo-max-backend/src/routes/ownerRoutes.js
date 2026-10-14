const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const pool = require('../config/db');
const { notifyUser } = require('../utils/notify');
const { cancelBooking, refundText } = require('../utils/refund');
const { normSlot, slotSortKey, isValidDate, istToday, parseId: parseIdH } = require('../utils/helpers');

// Strict positive integer parser. "2" -> 2. "abc", "2abc", 0, -1 -> null
const parseId = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!/^[1-9]\d*$/.test(str)) return null;
  const n = Number(str);
  return Number.isSafeInteger(n) ? n : null;
};

const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOnly = (v) => (v instanceof Date ? toDateStr(v) : v ? String(v).slice(0, 10) : null);
const fmtShort = (s) => {
  if (!s) return '';
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

// DB me status kabhi 'confirmed' kabhi 'Confirmed' mil sakta hai. Frontend ko hamesha 'Confirmed' jaisa bhejo.
const capStatus = (s) => {
  const k = String(s || '').toLowerCase();
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Pending';
};

const fail = (res, status, msg) =>
  res.status(status).json({ success: false, error: msg, message: msg });

const serverError = (res, label, error) => {
  console.error(label, error.message);
  return fail(res, 500, 'Server error. Thodi der baad try karein.');
};

// 1. OWNER KA SALON + SERVICES + BOOKINGS (customer ki details ke saath)
// Owner ki pehchaan hamesha token se. URL ka :ownerId ignore hota hai (usse dusre owner ka data nahi khulta).
router.get('/salon/:ownerId', verifyToken, async (req, res) => {
  try {
    const ownerId = req.user.id;

    const salonQuery = await pool.query('SELECT * FROM salons WHERE owner_id = $1', [ownerId]);

    let salon;
    if (salonQuery.rows.length === 0) {
      // Customer ya admin ke liye salon nahi banta. Naye owner ke liye default pending salon banta hai.
      const u = await pool.query('SELECT role FROM users WHERE id = $1', [ownerId]);
      const role = u.rows[0] && u.rows[0].role;
      if (!u.rows.length || role === 'customer' || role === 'admin') {
        return fail(res, 403, 'Ye page sirf salon owner ke liye hai.');
      }
      const insertDefault = await pool.query(
        `INSERT INTO salons (owner_id, salon_name, area, address, status)
         VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
        [ownerId, 'My New Salon', 'Gomti Nagar', 'Lucknow']
      );
      salon = insertDefault.rows[0];
    } else {
      salon = salonQuery.rows[0];
    }

    const servicesQuery = await pool.query('SELECT * FROM services WHERE salon_id = $1 ORDER BY id', [salon.id]);

    // Customer ka naam, phone, email users table se judta hai (pehle sirf customer_id dikhti thi)
    const bookingsQuery = await pool.query(
      `SELECT b.*,
              u.full_name AS customer_name,
              u.mobile AS customer_phone,
              u.email AS customer_email
       FROM bookings b
       LEFT JOIN users u ON u.id = b.customer_id
       WHERE b.salon_id = $1 AND COALESCE(b.hidden_by_owner, FALSE) = FALSE
       ORDER BY b.id DESC`,
      [salon.id]
    );

    // Earnings ka hisaab saari bookings se (jo list se hata di gayi unse bhi), taaki "Clear" karne se paisa ghata hua na dikhe
    const statsQuery = await pool.query(
      `SELECT COUNT(*)::int AS total_bookings,
              COUNT(*) FILTER (WHERE lower(status::text) = 'completed')::int AS completed_bookings,
              COALESCE(SUM(total_price) FILTER (WHERE lower(status::text) IN ('confirmed', 'completed')), 0) AS gross
       FROM bookings WHERE salon_id = $1`,
      [salon.id]
    );
    const st = statsQuery.rows[0];
    const stats = {
      total_bookings: st.total_bookings,
      completed_bookings: st.completed_bookings,
      gross: Number(st.gross)
    };

    const bookings = bookingsQuery.rows.map((b) => ({
      ...b,
      status: capStatus(b.status),
      booking_date: dateOnly(b.booking_date)
    }));

    return res.status(200).json({
      success: true,
      data: {
        salon,
        services: servicesQuery.rows,
        bookings,
        stats
      }
    });
  } catch (error) {
    return serverError(res, 'Owner salon fetch error:', error);
  }
});

// 2. ADD NEW SERVICE FOR SALON
// salon hamesha token wale owner ka apna. Client ki bheji salon_id par bharosa nahi.
router.post('/services', verifyToken, async (req, res) => {
  try {
    const owner_id = req.user.id;
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const category = typeof req.body.category === 'string' && req.body.category.trim() ? req.body.category.trim() : 'General';
    const price = Number(req.body.price);
    const duration = typeof req.body.duration === 'string' && req.body.duration.trim() ? req.body.duration.trim() : '30 mins';

    if (name.length < 2 || name.length > 150) return fail(res, 400, 'Service ka naam 2 se 150 akshar ka hona chahiye.');
    if (!Number.isFinite(price) || price <= 0 || price > 100000) return fail(res, 400, 'Price 1 se 1,00,000 ke beech honi chahiye.');
    if (category.length > 50 || duration.length > 50) return fail(res, 400, 'Category ya duration bahut lambi hai.');

    const salonLookup = await pool.query('SELECT id FROM salons WHERE owner_id = $1', [owner_id]);
    if (salonLookup.rows.length === 0) {
      return fail(res, 404, 'Is owner ka salon nahi mila.');
    }
    const salon_id = salonLookup.rows[0].id;

    const result = await pool.query(
      `INSERT INTO services (salon_id, name, category, price, duration, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING *`,
      [salon_id, name, category, price, duration]
    );

    return res.status(201).json({
      success: true,
      message: 'Service added successfully.',
      service: result.rows[0]
    });
  } catch (error) {
    return serverError(res, 'Add Service Error:', error);
  }
});

// 3. TOGGLE SERVICE STATUS (sirf apne salon ki service)
router.patch('/services/:id/toggle', verifyToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fail(res, 400, 'Service ID valid nahi hai.');

    const result = await pool.query(
      `UPDATE services SET is_active = NOT is_active
       WHERE id = $1 AND salon_id IN (SELECT id FROM salons WHERE owner_id = $2)
       RETURNING *`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) return fail(res, 404, 'Service nahi mili.');

    return res.status(200).json({
      success: true,
      message: 'Service status updated.',
      service: result.rows[0]
    });
  } catch (error) {
    return serverError(res, 'Toggle service error:', error);
  }
});

// 4. DELETE SERVICE (sirf apne salon ki service)
router.delete('/services/:id', verifyToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fail(res, 400, 'Service ID valid nahi hai.');

    const result = await pool.query(
      `DELETE FROM services
       WHERE id = $1 AND salon_id IN (SELECT id FROM salons WHERE owner_id = $2)
       RETURNING id`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) return fail(res, 404, 'Service nahi mili.');

    return res.status(200).json({
      success: true,
      message: 'Service deleted permanently.'
    });
  } catch (error) {
    return serverError(res, 'Delete service error:', error);
  }
});

// 5. BOOKING STATUS BADLO + CUSTOMER KO NOTIFICATION (app me, aur SMS / WhatsApp agar chalu ho)
// Sirf us salon ka owner badal sakta hai jiski ye booking hai, aur sirf sahi order me:
//   Pending -> Confirmed / Rejected / Cancelled,   Confirmed -> Completed / Cancelled
// Rejected / Cancelled par agar customer ne online paisa diya tha to poore paise ka refund apne aap banta hai.
const TRANSITIONS = {
  pending: ['Confirmed', 'Rejected', 'Cancelled'],
  confirmed: ['Completed', 'Cancelled']
};
const VALID_STATUSES = ['Confirmed', 'Completed', 'Rejected', 'Cancelled'];

router.patch('/bookings/:id/status', verifyToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const status = req.body.status;

    if (id === null) return fail(res, 400, 'Booking ID valid nahi hai.');
    if (!VALID_STATUSES.includes(status)) return fail(res, 400, 'Invalid booking status.');

    let booking;
    let row;        // customer ko message banane ke liye
    let refundNote = '';

    if (status === 'Rejected' || status === 'Cancelled') {
      const out = await cancelBooking({ bookingId: id, by: 'owner', userId: req.user.id, newStatus: status });
      if (!out.ok) return fail(res, out.status, out.message);
      booking = { ...out.booking, status };
      row = {
        customer_id: out.context.customer_id,
        service_name: out.context.service_name,
        time_slot: out.context.time_slot,
        booking_date: out.context.date_str,
        salon_name: out.context.salon_name
      };
      refundNote = refundText(out.info, out.refund);
    } else {
      // Booking is owner ke salon ki honi chahiye
      const cur = await pool.query(
        `SELECT b.id, b.status, b.customer_id, b.service_name, b.time_slot, b.booking_date, s.salon_name
         FROM bookings b
         JOIN salons s ON s.id = b.salon_id
         WHERE b.id = $1 AND s.owner_id = $2`,
        [id, req.user.id]
      );
      if (cur.rows.length === 0) return fail(res, 404, 'Booking nahi mili.');

      row = cur.rows[0];
      const from = String(row.status || '').toLowerCase();
      if (!(TRANSITIONS[from] || []).includes(status)) {
        return fail(res, 409, `Ye booking abhi ${capStatus(row.status)} hai, isse ${status} nahi kiya ja sakta.`);
      }

      // from wala check do owner/tabs ke ek saath click karne par dobara badalne se rokta hai
      const upd = await pool.query(
        `UPDATE bookings SET status = $1
         WHERE id = $2 AND lower(status::text) = $3
         RETURNING *`,
        [status, id, from]
      );
      if (upd.rows.length === 0) {
        return fail(res, 409, 'Booking ka status abhi kisi aur ne badal diya. Page refresh karein.');
      }
      booking = { ...upd.rows[0], status, booking_date: dateOnly(upd.rows[0].booking_date) };
    }

    // Customer ko khabar
    const when = [fmtShort(dateOnly(row.booking_date)), row.time_slot].filter(Boolean).join(' ');
    const what = `${row.service_name}${when ? `, ${when}` : ''}`;
    const texts = {
      Confirmed: ['Booking confirm ho gayi', `${row.salon_name} ne aapki booking confirm kar di hai (${what}).`],
      Rejected: ['Booking accept nahi hui', `${row.salon_name} aapki booking (${what}) accept nahi kar paya. Aap dusra slot ya salon chun sakte hain.${refundNote}`],
      Completed: ['Service poori hui', `${row.service_name} ${row.salon_name} me poori hui. Apna review likhna na bhoolein.`],
      Cancelled: ['Booking cancel ho gayi', `${row.salon_name} ne aapki booking (${what}) cancel kar di hai.${refundNote}`]
    };
    const [title, message] = texts[status];
    const notification = await notifyUser({ userId: row.customer_id, title, message });

    return res.status(200).json({
      success: true,
      message: `Booking ${status} ho gayi.`,
      booking,
      notification
    });
  } catch (error) {
    return serverError(res, 'Booking status error:', error);
  }
});

// 5b. KHATAM BOOKING LIST SE HATAO (owner). Record database me rehta hai, earnings ka hisaab nahi ghatta.
const FINISHED = "('completed', 'cancelled', 'rejected')";

router.patch('/bookings/:id/hide', verifyToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fail(res, 400, 'Booking ID valid nahi hai.');

    const result = await pool.query(
      `UPDATE bookings SET hidden_by_owner = TRUE
       WHERE id = $1 AND salon_id IN (SELECT id FROM salons WHERE owner_id = $2)
         AND lower(status::text) IN ${FINISHED}
       RETURNING id`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return fail(res, 404, 'Booking nahi mili, ya abhi chal rahi hai. Sirf khatam ho chuki booking hata sakte ho.');
    }
    return res.status(200).json({ success: true, message: 'Booking list se hata di gayi.' });
  } catch (error) {
    return serverError(res, 'Owner hide error:', error);
  }
});

router.post('/bookings/clear-finished', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bookings SET hidden_by_owner = TRUE
       WHERE salon_id IN (SELECT id FROM salons WHERE owner_id = $1)
         AND lower(status::text) IN ${FINISHED}
         AND COALESCE(hidden_by_owner, FALSE) = FALSE
       RETURNING id`,
      [req.user.id]
    );
    return res.status(200).json({ success: true, count: result.rows.length, message: `${result.rows.length} booking list se hata di gayi.` });
  } catch (error) {
    return serverError(res, 'Owner clear error:', error);
  }
});

// 6. HOME SERVICE SETTINGS (sirf apne salon ke)
router.patch('/home-service', verifyToken, async (req, res) => {
  try {
    const { is_home_service, home_service_charge, service_radius_km } = req.body;
    const charge = Number(home_service_charge ?? 0);
    const radius = Number(service_radius_km ?? 5);

    if (typeof is_home_service !== 'boolean') return fail(res, 400, 'is_home_service true ya false hona chahiye.');
    if (!Number.isFinite(charge) || charge < 0 || charge > 10000) return fail(res, 400, 'Home service charge 0 se 10,000 ke beech ho.');
    if (!Number.isInteger(radius) || radius < 1 || radius > 100) return fail(res, 400, 'Service radius 1 se 100 km ke beech ho.');

    const result = await pool.query(
      `UPDATE salons
       SET is_home_service = $1, home_service_charge = $2, service_radius_km = $3
       WHERE owner_id = $4
       RETURNING *`,
      [is_home_service, charge, radius, req.user.id]
    );
    if (result.rows.length === 0) return fail(res, 404, 'Salon nahi mila.');

    return res.status(200).json({
      success: true,
      message: 'Home service settings updated successfully.',
      salon: result.rows[0]
    });
  } catch (error) {
    return serverError(res, 'Home service error:', error);
  }
});

// 7. SALON PROFILE UPDATE YA CREATE (UPSERT)
router.put('/salon', verifyToken, async (req, res) => {
  try {
    const owner_id = req.user.id;
    const clean = (v, fallback, max) => {
      const s = typeof v === 'string' ? v.trim() : '';
      return (s || fallback).slice(0, max);
    };
    const name = clean(req.body.name, 'My Salon', 150);
    const area = clean(req.body.area, 'Lucknow', 100);
    const address = clean(req.body.address, 'Lucknow', 500);
    const openingHours = clean(req.body.openingHours, '09:00 AM - 09:00 PM', 100);

    const checkSalon = await pool.query('SELECT id FROM salons WHERE owner_id = $1', [owner_id]);

    let result;
    if (checkSalon.rows.length > 0) {
      result = await pool.query(
        `UPDATE salons
         SET salon_name = $1, area = $2, address = $3, openinghours = $4
         WHERE owner_id = $5
         RETURNING *`,
        [name, area, address, openingHours, owner_id]
      );
    } else {
      result = await pool.query(
        `INSERT INTO salons (owner_id, salon_name, area, address, openinghours, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING *`,
        [owner_id, name, area, address, openingHours]
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Salon profile successfully created/updated in database!',
      salon: result.rows[0]
    });
  } catch (error) {
    return serverError(res, 'Salon Profile Update Error:', error);
  }
});

// 8. OWNER KE APNE TIME SLOTS (customer booking page inhi slots se chalta hai)
const DEFAULT_SLOTS = ['10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM'];

const ownerSalonId = async (userId) => {
  const r = await pool.query('SELECT id FROM salons WHERE owner_id = $1', [userId]);
  return r.rows.length ? r.rows[0].id : null;
};

router.get('/my-slots', verifyToken, async (req, res) => {
  try {
    const salonId = await ownerSalonId(req.user.id);
    if (salonId === null) return fail(res, 404, 'Is owner ka salon nahi mila.');
    const result = await pool.query('SELECT id, time_slot, is_active FROM salon_slots WHERE salon_id = $1', [salonId]);
    const slots = result.rows.sort((a, b) => slotSortKey(a.time_slot) - slotSortKey(b.time_slot));
    return res.status(200).json({ success: true, slots });
  } catch (error) {
    return serverError(res, 'My slots error:', error);
  }
});

router.post('/my-slots', verifyToken, async (req, res) => {
  try {
    const timeSlot = normSlot(req.body.time_slot);
    if (!timeSlot) return fail(res, 400, 'Time slot aise likhein: 10:00 AM');

    const salonId = await ownerSalonId(req.user.id);
    if (salonId === null) return fail(res, 404, 'Is owner ka salon nahi mila.');

    const result = await pool.query(
      `INSERT INTO salon_slots (salon_id, time_slot, is_active) VALUES ($1, $2, TRUE)
       ON CONFLICT (salon_id, time_slot) DO NOTHING
       RETURNING id, time_slot, is_active`,
      [salonId, timeSlot]
    );
    if (result.rows.length === 0) return fail(res, 409, 'Ye time slot pehle se hai.');
    return res.status(201).json({ success: true, message: 'Time slot add ho gaya.', slot: result.rows[0] });
  } catch (error) {
    return serverError(res, 'Add slot error:', error);
  }
});

// Ek click me 10 AM se 7 PM tak har ghante ke slots (jo pehle se hain unhe chhod deta hai)
router.post('/my-slots/defaults', verifyToken, async (req, res) => {
  try {
    const salonId = await ownerSalonId(req.user.id);
    if (salonId === null) return fail(res, 404, 'Is owner ka salon nahi mila.');

    const result = await pool.query(
      `INSERT INTO salon_slots (salon_id, time_slot, is_active)
       SELECT $1, t, TRUE FROM unnest($2::text[]) AS t
       ON CONFLICT (salon_id, time_slot) DO NOTHING
       RETURNING id`,
      [salonId, DEFAULT_SLOTS]
    );
    return res.status(201).json({ success: true, count: result.rows.length, message: `${result.rows.length} slots add ho gaye.` });
  } catch (error) {
    return serverError(res, 'Default slots error:', error);
  }
});

router.patch('/my-slots/:id/toggle', verifyToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fail(res, 400, 'Slot ID valid nahi hai.');
    const result = await pool.query(
      `UPDATE salon_slots SET is_active = NOT is_active
       WHERE id = $1 AND salon_id IN (SELECT id FROM salons WHERE owner_id = $2)
       RETURNING id, time_slot, is_active`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) return fail(res, 404, 'Slot nahi mila.');
    return res.status(200).json({ success: true, slot: result.rows[0] });
  } catch (error) {
    return serverError(res, 'Toggle slot error:', error);
  }
});

router.delete('/my-slots/:id', verifyToken, async (req, res) => {
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
    return res.status(200).json({ success: true, message: 'Slot hata diya gaya.' });
  } catch (error) {
    return serverError(res, 'Delete slot error:', error);
  }
});

// ---------- CHHUTTI (HOLIDAY): is din customer booking nahi kar payega ----------
router.get('/my-holidays', verifyToken, async (req, res) => {
  try {
    const salonId = await ownerSalonId(req.user.id);
    if (salonId === null) return fail(res, 404, 'Is owner ka salon nahi mila.');
    const r = await pool.query(
      `SELECT id, to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date, reason
       FROM salon_holidays WHERE salon_id = $1 AND holiday_date >= $2::date ORDER BY holiday_date`,
      [salonId, istToday()]
    );
    return res.status(200).json({ success: true, holidays: r.rows });
  } catch (error) {
    return serverError(res, 'My holidays error:', error);
  }
});

router.post('/my-holidays', verifyToken, async (req, res) => {
  try {
    const salonId = await ownerSalonId(req.user.id);
    if (salonId === null) return fail(res, 404, 'Is owner ka salon nahi mila.');
    const date = req.body.holiday_date;
    if (!isValidDate(date)) return fail(res, 400, 'Date YYYY-MM-DD format me bhejein.');
    if (date < istToday()) return fail(res, 400, 'Purani date par chhutti nahi lag sakti.');
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 120) : null;

    const ins = await pool.query(
      `INSERT INTO salon_holidays (salon_id, holiday_date, reason) VALUES ($1, $2, $3)
       ON CONFLICT (salon_id, holiday_date) DO NOTHING RETURNING id`,
      [salonId, date, reason || null]
    );
    if (ins.rows.length === 0) return fail(res, 409, 'Is din ki chhutti pehle se lagi hai.');

    // Is din pehle se jo bookings hain unki jaankari (owner khud inhe cancel / reject kare)
    const aff = await pool.query(
      `SELECT COUNT(*)::int AS n FROM bookings
       WHERE salon_id = $1 AND booking_date = $2 AND lower(status::text) IN ('pending', 'confirmed')`,
      [salonId, date]
    );
    const n = aff.rows[0].n;
    return res.status(201).json({
      success: true,
      affected_bookings: n,
      message: n > 0
        ? `Chhutti lag gayi. Par is din ${n} booking pehle se hai. Unhe Bookings me jaakar cancel / reject karein.`
        : 'Chhutti lag gayi. Is din booking nahi hogi.'
    });
  } catch (error) {
    return serverError(res, 'Add holiday error:', error);
  }
});

router.delete('/my-holidays/:id', verifyToken, async (req, res) => {
  try {
    const id = parseIdH(req.params.id);
    if (id === null) return fail(res, 400, 'ID valid nahi hai.');
    const salonId = await ownerSalonId(req.user.id);
    if (salonId === null) return fail(res, 404, 'Is owner ka salon nahi mila.');
    const r = await pool.query('DELETE FROM salon_holidays WHERE id = $1 AND salon_id = $2 RETURNING id', [id, salonId]);
    if (r.rows.length === 0) return fail(res, 404, 'Chhutti nahi mili.');
    return res.status(200).json({ success: true, message: 'Chhutti hata di gayi.' });
  } catch (error) {
    return serverError(res, 'Delete holiday error:', error);
  }
});

module.exports = router;
