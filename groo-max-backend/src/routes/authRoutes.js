const express = require('express');
const router = express.Router();
const { registerUser, loginUser, me, updateProfile } = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/security');

router.post('/register', authLimiter, registerUser);
router.post('/login', authLimiter, loginUser);
router.get('/me', verifyToken, me);
router.put('/profile', verifyToken, updateProfile);

module.exports = router;
