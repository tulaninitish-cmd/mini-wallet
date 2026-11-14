const express = require('express');
const { z } = require('zod');
const { AppError } = require('../errors');
const { executeTransfer, getTransactionForUser } = require('../services/ledger');
const { hashRequest, runIdempotent } = require('../services/idempotency');

const keySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'must be 8-64 characters: letters, digits, - or _');

module.exports = function transferRoutes({ db, config, limiters }) {
  const router = express.Router();

  const bodySchema = z.object({
    toEmail: z.string().trim().toLowerCase().email('Enter a valid email'),
    amountMinor: z
      .number({ error: 'Amount must be a number' })
      .int('Amount must be in whole paise')
      .positive('Amount must be more than zero')
      .max(config.limits.maxTransferMinor, 'Amount is above the transfer limit'),
    note: z.string().trim().max(140).optional().default(''),
  });

  // POST /api/transfers   Header: Idempotency-Key: <unique string per user action>
  router.post('/', limiters.money, (req, res) => {
    const keyResult = keySchema.safeParse(req.get('Idempotency-Key'));
    if (!keyResult.success) {
      throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header (8-64 characters: letters, digits, - or _).');
    }
    const key = keyResult.data;
    const body = bodySchema.parse(req.body);
    const hash = hashRequest('POST /transfers', body);

    const result = runIdempotent(db, req.user.id, key, hash, () => {
      const recipient = db.prepare('SELECT id FROM users WHERE email = ?').get(body.toEmail);
      if (!recipient) {
        throw new AppError(404, 'RECIPIENT_NOT_FOUND', 'No MiniPay user has that email.');
      }
      const txId = executeTransfer(db, config, {
        fromUserId: req.user.id,
        toUserId: recipient.id,
        amountMinor: body.amountMinor,
        note: body.note,
      });
      const balance = db.prepare('SELECT balance_minor FROM wallets WHERE user_id = ?').get(req.user.id).balance_minor;
      return { status: 201, body: { balanceMinor: balance, transaction: getTransactionForUser(db, txId, req.user.id) } };
    });

    res.set('Idempotent-Replayed', String(result.replayed)).status(result.status).json(result.body);
  });

  return router;
};
