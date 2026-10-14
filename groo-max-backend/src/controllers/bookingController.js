const pool = require('../config/db');
const { normSlot, slotStartMs, istToday } = require('../utils/helpers');

// Strict positive integer parser. 2 ya "2" -> 2. "", "abc", "2abc", 0, -1, null -> null
const parseId = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!/^[1-9]\d*$/.test(str)) return null;
  const n = Number(str);
  return Number.isSafeInteger(n) ? n : null;
};

const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// YYYY-MM-DD aur asli calendar date (jaise 2026-02-31 galat hai)
const isValidDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime()) && toDateStr(d) === s;
};

const fail = (res, status, msg) =>
  res.status(status).json({ success: false, error: msg, message: msg });

// 1. Create a New Booking (validation + date-aware slot conflict check + server-side price)
const createBooking = async (req, res) => {
  try {
    const customer_id = req.user.id;

    const salonId = parseId(req.body.salon_id);
    const serviceId = parseId(req.body.service_id);
    const serviceType = req.body.service_type;
    const timeSlot = normSlot(req.body.time_slot); // '9:00 am' -> '09:00 AM'
    const bookingDate = req.body.booking_date;
    const address = typeof req.body.address === 'string' ? req.body.address.trim() : '';

    // Input validation. Koi default ya fallback salon nahi.
    if (salonId === null) return fail(res, 400, 'Salon ID valid nahi hai.');
    if (serviceId === null) return fail(res, 400, 'Service ID valid nahi hai.');
    if (!['salon_visit', 'doorstep'].includes(serviceType)) return fail(res, 400, 'Service type galat hai.');
    if (!timeSlot) return fail(res, 400, 'Time slot galat hai.');
    if (!isValidDate(bookingDate)) return fail(res, 400, 'Booking date galat hai.');
    if (bookingDate < istToday()) return fail(res, 400, 'Purani date par booking nahi ho sakti.');
    const slotStart = slotStartMs(bookingDate, timeSlot);
    if (slotStart !== null && slotStart <= Date.now()) return fail(res, 400, 'Ye time nikal chuka hai. Aage ka slot chuniye.');

    // Salon exist karta ho aur approved ho
    const salonRes = await pool.query(
      'SELECT id, status, is_home_service, home_service_charge FROM salons WHERE id = $1',
      [salonId]
    );
    if (salonRes.rows.length === 0) return fail(res, 404, 'Salon nahi mila.');
    const salon = salonRes.rows[0];
    if (salon.status !== 'approved') return fail(res, 400, 'Ye salon abhi booking ke liye available nahi hai.');

    // Salon ki chhutti ka din
    const holiday = await pool.query('SELECT 1 FROM salon_holidays WHERE salon_id = $1 AND holiday_date = $2', [salonId, bookingDate]);
    if (holiday.rows.length > 0) return fail(res, 400, 'Salon is din band rahega. Dusri date chuniye.');

    // Slot owner ke apne active slots me se hona chahiye (hardcoded list nahi)
    const slotRes = await pool.query(
      'SELECT 1 FROM salon_slots WHERE salon_id = $1 AND time_slot = $2 AND is_active = TRUE',
      [salonId, timeSlot]
    );
    if (slotRes.rows.length === 0) {
      const any = await pool.query('SELECT 1 FROM salon_slots WHERE salon_id = $1 AND is_active = TRUE LIMIT 1', [salonId]);
      return fail(res, 400, any.rows.length === 0
        ? 'Is salon ne abhi time slots set nahi kiye. Salon se baat karein.'
        : 'Ye time slot is salon me available nahi hai.');
    }

    if (serviceType === 'doorstep') {
      if (!salon.is_home_service) return fail(res, 400, 'Is salon me home service nahi hai.');
      if (address.length < 6) return fail(res, 400, 'Home service ke liye poora address bharein.');
    }

    // Service isi salon ki ho. Naam aur price database se, client se nahi.
    const svcRes = await pool.query(
      'SELECT id, name, price FROM services WHERE id = $1 AND salon_id = $2 AND is_active = true',
      [serviceId, salonId]
    );
    if (svcRes.rows.length === 0) return fail(res, 400, 'Ye service is salon ki nahi hai.');
    const svc = svcRes.rows[0];

    const homeCharge = serviceType === 'doorstep' ? Number(salon.home_service_charge || 0) : 0;
    const totalPrice = Number(svc.price) + homeCharge;

    // Same salon, same date, same slot par pehle se active booking to nahi.
    // status ka case (Pending / pending) kuch bhi ho, cancelled aur rejected ginti me nahi aate.
    const conflict = await pool.query(
      `SELECT id FROM bookings
       WHERE salon_id = $1 AND booking_date = $2 AND time_slot = $3
         AND lower(status::text) NOT IN ('cancelled', 'rejected')`,
      [salonId, bookingDate, timeSlot]
    );
    if (conflict.rows.length > 0) {
      return fail(res, 409, 'Ye time slot is date par pehle se booked hai. Dusra slot chuniye.');
    }

    const inserted = await pool.query(
      `INSERT INTO bookings
         (customer_id, salon_id, service_id, service_name, service_type, booking_date, time_slot, address, total_price, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Pending')
       RETURNING *`,
      [
        customer_id,
        salonId,
        svc.id,
        String(svc.name).trim(),
        serviceType,
        bookingDate,
        timeSlot,
        serviceType === 'doorstep' ? address : null,
        totalPrice
      ]
    );

    // DATE column ko string hi wapas bhejo, taaki timezone se din na badle
    const booking = { ...inserted.rows[0], booking_date: bookingDate };

    res.status(201).json({
      success: true,
      message: 'Booking created successfully!',
      booking
    });
  } catch (err) {
    // Do log ek saath request kar de to unique index (uniq_active_booking_slot) duplicate rok deta hai
    if (err.code === '23505') {
      return fail(res, 409, 'Ye time slot abhi kisi aur ne book kar liya. Dusra slot chuniye.');
    }
    console.error(err.message);
    fail(res, 500, 'Server error during booking creation');
  }
};

// 2. Get Bookings for Logged-in Customer (salon ki poori details ke saath)
const getCustomerBookings = async (req, res) => {
  try {
    const customer_id = req.user.id;

    const bookings = await pool.query(
      `SELECT b.*,
              s.salon_name,
              s.address AS salon_address,
              u.mobile AS salon_phone,
              u.full_name AS owner_name,
              rf.amount AS refund_amount,
              rf.status AS refund_status
       FROM bookings b
       JOIN salons s ON b.salon_id = s.id
       LEFT JOIN users u ON s.owner_id = u.id
       LEFT JOIN refunds rf ON rf.booking_id = b.id
       WHERE b.customer_id = $1 AND COALESCE(b.hidden_by_customer, FALSE) = FALSE
       ORDER BY b.id DESC`,
      [customer_id]
    );

    const rows = bookings.rows.map((r) => {
      // pg DATE ko JS Date bana deta hai, jo JSON me UTC ban kar ek din peeche dikh sakta hai. String bana do.
      const date = r.booking_date instanceof Date ? toDateStr(r.booking_date) : r.booking_date || null;
      return {
        ...r, // purane naam (snake_case) jaise the waise
        booking_date: date,
        // frontend ke liye seedhe naam
        salonName: r.salon_name,
        salonAddress: r.salon_address,
        salonPhone: r.salon_phone,
        ownerName: r.owner_name,
        serviceName: r.service_name,
        serviceType: r.service_type,
        price: r.total_price !== null && r.total_price !== undefined ? Number(r.total_price) : null,
        date,
        slot: r.time_slot,
        paymentStatus: r.payment_status,
        refundAmount: r.refund_amount !== null && r.refund_amount !== undefined ? Number(r.refund_amount) : null,
        refundStatus: r.refund_status,
        cancelledBy: r.cancelled_by
      };
    });

    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error while fetching bookings' });
  }
};

module.exports = { createBooking, getCustomerBookings };
