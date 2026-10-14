const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { createBooking, getCustomerBookings } = require('../controllers/bookingController');

// Saara logic bookingController.js me hai (validation, slot check, server se price, double booking se bachav).
// Pehle yahan alag se purana code likha tha, isliye naya controller kabhi chalta hi nahi tha.

// 1. NAYI BOOKING (customer)
router.post('/', verifyToken, createBooking);

// 2. CUSTOMER KI APNI BOOKINGS (salon ki poori detail ke saath)
router.get('/my-bookings', verifyToken, getCustomerBookings);

module.exports = router;
