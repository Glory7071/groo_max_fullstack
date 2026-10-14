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

// 1. GET ALL NOTIFICATIONS FOR LOGGED-IN USER
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId]
    );

    return res.status(200).json({
      success: true,
      notifications: result.rows
    });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ success: false, error: 'Notifications load nahi ho payi.' });
  }
});

// 2. MARK ALL AS READ (/:id/read se alag path hai, isliye order ki dikkat nahi)
router.patch('/read-all', verifyToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
      [req.user.id]
    );
    return res.status(200).json({ success: true, message: 'Saari notifications read ho gayi.' });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ success: false, error: 'Update nahi ho paya.' });
  }
});

// 3. MARK NOTIFICATION AS READ (sirf apni notification)
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Notification ID valid nahi hai.' });
    }

    // user_id ka check zaroori hai, warna koi bhi dusre ki notification read kar sakta hai
    const result = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      notification: result.rows[0]
    });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ success: false, error: 'Update nahi ho paya.' });
  }
});

module.exports = router;
