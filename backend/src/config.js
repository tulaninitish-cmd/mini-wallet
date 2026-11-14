require('dotenv').config();

// All money is stored as integer minor units (paise). Never use floats for money.
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 4000,
  dbFile: process.env.DB_FILE || './minipay.db',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: '2h',
  bcryptRounds: 10,
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim()),
  rateLimitEnabled: true,
  limits: {
    maxTopupMinor: 5_000_000, // 50,000.00
    maxTransferMinor: 10_000_000, // 100,000.00
  },
  fraud: {
    largeAmountMinor: 2_500_000, // 25,000.00
    newRecipientLargeMinor: 1_000_000, // 10,000.00
    velocityWindowMs: 60_000,
    velocityMaxTransfers: 5, // the 6th transfer inside the window is flagged
  },
};
