const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { AppError } = require('../errors');
const { requireAuth } = require('../middleware/auth');

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters').max(72),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(72),
});

module.exports = function authRoutes({ db, config, limiters }) {
  const router = express.Router();
  // Compared against when the email is unknown, so response time does not reveal which emails exist.
  const dummyHash = bcrypt.hashSync('not-a-real-password', config.bcryptRounds);

  const sign = (user) =>
    jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

  router.post('/register', limiters.auth, (req, res) => {
    const { name, email, password } = registerSchema.parse(req.body);
    const hash = bcrypt.hashSync(password, config.bcryptRounds);

    const create = db.transaction(() => {
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
        throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
      }
      const info = db
        .prepare('INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .run(email, name, hash, Date.now());
      const id = Number(info.lastInsertRowid);
      db.prepare('INSERT INTO wallets (user_id, balance_minor) VALUES (?, 0)').run(id);
      return { id, name, email };
    });

    const user = create.immediate();
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  });

  router.post('/login', limiters.auth, (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const ok = bcrypt.compareSync(password, user ? user.password_hash : dummyHash);
    if (!user || !ok) {
      throw new AppError(401, 'BAD_CREDENTIALS', 'Email or password is incorrect.');
    }
    res.json({ token: sign(user), user: publicUser(user) });
  });

  router.get('/me', requireAuth(config), (req, res) => {
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.user.id);
    if (!user) throw new AppError(401, 'INVALID_TOKEN', 'Your session expired. Sign in again.');
    res.json({ user });
  });

  return router;
};
