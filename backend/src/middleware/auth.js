const jwt = require('jsonwebtoken');
const { AppError } = require('../errors');

function requireAuth(config) {
  return (req, _res, next) => {
    const header = req.get('Authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next(new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.'));
    }
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      req.user = { id: payload.sub, email: payload.email };
      next();
    } catch {
      next(new AppError(401, 'INVALID_TOKEN', 'Your session expired. Sign in again.'));
    }
  };
}

module.exports = { requireAuth };
