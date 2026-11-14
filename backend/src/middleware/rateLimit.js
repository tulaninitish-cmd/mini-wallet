const rateLimit = require('express-rate-limit');

const passThrough = (_req, _res, next) => next();

function limiter(enabled, opts) {
  if (!enabled) return passThrough;
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Wait a moment and try again.' } }),
    ...opts,
  });
}

function createLimiters(config) {
  const on = config.rateLimitEnabled;
  return {
    global: limiter(on, { windowMs: 60_000, limit: 120 }),
    auth: limiter(on, { windowMs: 15 * 60_000, limit: 30 }),
    // Money endpoints are limited per signed-in user, not per IP.
    money: limiter(on, { windowMs: 60_000, limit: 30, keyGenerator: (req) => `u${req.user?.id ?? req.ip}` }),
  };
}

module.exports = { createLimiters };
