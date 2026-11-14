const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { AppError } = require('./errors');
const { requireAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { createLimiters } = require('./middleware/rateLimit');

// The app is built from its dependencies (db, config) so tests can pass an in-memory database.
function createApp({ db, config }) {
  const app = express();
  const limiters = createLimiters(config);
  const deps = { db, config, limiters };
  const auth = requireAuth(config);

  app.set('trust proxy', 1); // running behind Render/Vercel proxies
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, exposedHeaders: ['Idempotent-Replayed'] }));
  app.use(express.json({ limit: '10kb' }));
  app.use(limiters.global);

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', require('./routes/auth')(deps));
  app.use('/api/wallet', auth, require('./routes/wallet')(deps));
  app.use('/api/transfers', auth, require('./routes/transfers')(deps));
  app.use('/api/transactions', auth, require('./routes/transactions')(deps));
  app.use('/api/requests', auth, require('./routes/requests')(deps));

  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'No such endpoint.')));
  app.use(errorHandler());
  return app;
}

module.exports = { createApp };
