const rateLimit = require('express-rate-limit');

const json429 = (msg) => ({ success: false, error: msg });

// Login/register: brute-force roko
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: json429('Too many attempts. Please try again later.'),
});
// Poore API par general limit
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false,
  message: json429('Too many requests. Slow down.'),
});
// Paise wale / spam-prone routes
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: json429('Too many requests. Slow down.'),
});

// Start hone se pehle zaroori env check: weak/missing secret par server chalega hi nahi
function assertEnv() {
  const s = process.env.JWT_SECRET || '';
  if (s.length < 32 || /secret|changeme|password/i.test(s)) {
    console.error('FATAL: JWT_SECRET missing/weak. Set a random 32+ char value in .env');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production') {
    if ((process.env.PAYMENT_PROVIDER || 'none') === 'none') {
      console.error('FATAL: PAYMENT_PROVIDER=none is not allowed in production.');
      process.exit(1);
    }
    if (!process.env.CORS_ORIGINS) {
      console.error('FATAL: set CORS_ORIGINS (your website URL) in production.');
      process.exit(1);
    }
  }
}

function corsOptions() {
  const list = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return {
    origin: (origin, cb) => (!origin || list.includes(origin) ? cb(null, true) : cb(new Error('CORS blocked'))),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
}

module.exports = { authLimiter, apiLimiter, sensitiveLimiter, assertEnv, corsOptions };
