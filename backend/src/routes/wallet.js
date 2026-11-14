const express = require('express');
const { z } = require('zod');
const { executeTopup, getTransactionForUser } = require('../services/ledger');

module.exports = function walletRoutes({ db, config, limiters }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const w = db.prepare('SELECT balance_minor FROM wallets WHERE user_id = ?').get(req.user.id);
    res.json({ balanceMinor: w.balance_minor, currency: 'INR' });
  });

  // Test money only: lets a user fund their own wallet, like a sandbox.
  router.post('/topup', limiters.money, (req, res) => {
    const { amountMinor } = z
      .object({
        amountMinor: z
          .number({ error: 'Amount must be a number' })
          .int('Amount must be in whole paise')
          .positive('Amount must be more than zero')
          .max(config.limits.maxTopupMinor, 'Amount is above the top-up limit'),
      })
      .parse(req.body);

    const run = db.transaction(() => {
      const id = executeTopup(db, { userId: req.user.id, amountMinor });
      const balance = db.prepare('SELECT balance_minor FROM wallets WHERE user_id = ?').get(req.user.id).balance_minor;
      return { id, balance };
    });
    const { id, balance } = run.immediate();
    res.status(201).json({ balanceMinor: balance, transaction: getTransactionForUser(db, id, req.user.id) });
  });

  return router;
};
