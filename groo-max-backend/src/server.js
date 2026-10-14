const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const salonRoutes = require('./routes/salonRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const adminRoutes = require('./routes/adminRoutes');
const ownerRoutes = require('./routes/ownerRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const ownerSettingsRoutes = require('./routes/ownerSettingsRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const bookingActionsRoutes = require('./routes/bookingActionsRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const complaintRoutes = require('./routes/complaintRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
// rawBody: Razorpay webhook ki signature check karne ke liye zaroori
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// Database Connection Test Route
app.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({ 
      message: 'Groo Max Backend API is running successfully!', 
      dbTime: result.rows[0].now 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Routes Middleware
app.use('/api/auth', authRoutes);
app.use('/api/salons', salonRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/bookings', bookingActionsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/owner', ownerSettingsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/complaints', complaintRoutes);

// Server Listen
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});