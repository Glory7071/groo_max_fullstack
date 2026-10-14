const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. GET ALL SALONS (Optional Area Filter)
router.get('/', async (req, res) => {
  try {
    const { area } = req.query;
    let query = 'SELECT * FROM salons WHERE status = \'approved\'';
    let params = [];

    if (area && area !== 'All Areas') {
      query += ' AND area = $1';
      params.push(area);
    }

    const result = await pool.query(query, params);
    return res.status(200).json({
      success: true,
      count: result.rows.length,
      salons: result.rows
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 2. GET SINGLE SALON DETAILS + SERVICES + SLOTS
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // salonRoutes.js me GET /api/salons/:id ke andar:
const salonQuery = await pool.query('SELECT * FROM salons WHERE id = $1 AND status = \'approved\'', [id]);
if (salonQuery.rows.length === 0) {
  return res.status(403).json({ success: false, message: 'Salon is pending approval or not found.' });
}
    const salon = salonQuery.rows[0];

    // Services fetch karein
    const servicesQuery = await pool.query('SELECT * FROM services WHERE salon_id = $1 AND is_active = TRUE', [id]);

    // Slots fetch karein
    const slotsQuery = await pool.query('SELECT * FROM salon_slots WHERE salon_id = $1 AND is_active = TRUE', [id]);

    return res.status(200).json({
      success: true,
      data: {
        ...salon,
        services: servicesQuery.rows,
        slots: slotsQuery.rows
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;