const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Token verify karta hai AUR DB se user ki asli role/status leta hai.
// Isse purana/chori hua token role badal kar kaam nahi karega.
const verifyToken = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, error: 'Please login first.' });
    }
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (e) {
      return res.status(401).json({ success: false, error: 'Session expired. Please login again.' });
    }
    const r = await pool.query(
      'SELECT id, role, is_active FROM users WHERE id = $1',
      [payload.id]
    );
    const u = r.rows[0];
    if (!u || u.is_active === false) {
      return res.status(401).json({ success: false, error: 'Account not available.' });
    }
    req.user = { id: u.id, role: u.role }; // role DB se, token se nahi
    next();
  } catch (err) {
    console.error('verifyToken:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Not allowed.' });
  }
  next();
};

module.exports = { verifyToken, requireRole };
