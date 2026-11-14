const express = require('express');
const { z } = require('zod');
const { AppError } = require('../errors');
const { executeTransfer, getTransactionForUser } = require('../services/ledger');

module.exports = function requestRoutes({ db, config, limiters }) {
  const router = express.Router();

  const createSchema = z.object({
    fromEmail: z.string().trim().toLowerCase().email('Enter a valid email'),
    amountMinor: z
      .number({ error: 'Amount must be a number' })
      .int('Amount must be in whole paise')
      .positive('Amount must be more than zero')
      .max(config.limits.maxTransferMinor, 'Amount is above the transfer limit'),
    note: z.string().trim().max(140).optional().default(''),
  });

  const SELECT = `
    SELECT r.*, rq.name AS requester_name, rq.email AS requester_email, p.name AS payer_name, p.email AS payer_email
    FROM payment_requests r
    JOIN users rq ON rq.id = r.requester_id
    JOIN users p ON p.id = r.payer_id`;

  const present = (r) => ({
    id: r.id,
    amountMinor: r.amount_minor,
    note: r.note,
    status: r.status,
    requester: { name: r.requester_name, email: r.requester_email },
    payer: { name: r.payer_name, email: r.payer_email },
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  });
  const byId = (id) => present(db.prepare(`${SELECT} WHERE r.id = ?`).get(id));

  const idParam = (req) => z.coerce.number().int().positive().parse(req.params.id);

  // Ask another user for money.
  router.post('/', limiters.money, (req, res) => {
    const body = createSchema.parse(req.body);
    const payer = db.prepare('SELECT id FROM users WHERE email = ?').get(body.fromEmail);
    if (!payer) throw new AppError(404, 'USER_NOT_FOUND', 'No MiniPay user has that email.');
    if (payer.id === req.user.id) throw new AppError(400, 'SELF_REQUEST', 'You cannot request money from yourself.');

    const info = db
      .prepare('INSERT INTO payment_requests (requester_id, payer_id, amount_minor, note, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, payer.id, body.amountMinor, body.note, Date.now());
    res.status(201).json({ request: byId(Number(info.lastInsertRowid)) });
  });

  // GET /api/requests?box=incoming|outgoing
  router.get('/', (req, res) => {
    const { box } = z.object({ box: z.enum(['incoming', 'outgoing']).default('incoming') }).parse(req.query);
    const col = box === 'incoming' ? 'r.payer_id' : 'r.requester_id';
    const rows = db.prepare(`${SELECT} WHERE ${col} = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 100`).all(req.user.id);
    res.json({ items: rows.map(present) });
  });

  // Pay a request someone sent you. Payment and status change are one transaction,
  // and a request can only be paid while it is 'pending', so paying twice is impossible.
  router.post('/:id/pay', limiters.money, (req, res) => {
    const id = idParam(req);
    const run = db.transaction(() => {
      const r = db.prepare('SELECT * FROM payment_requests WHERE id = ? AND payer_id = ?').get(id, req.user.id);
      if (!r) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Payment request not found.');
      if (r.status !== 'pending') throw new AppError(409, 'REQUEST_NOT_PENDING', `This request is already ${r.status}.`);

      const txId = executeTransfer(db, config, {
        fromUserId: req.user.id,
        toUserId: r.requester_id,
        amountMinor: r.amount_minor,
        note: r.note || `Payment for request #${r.id}`,
      });
      db.prepare("UPDATE payment_requests SET status = 'paid', transaction_id = ?, resolved_at = ? WHERE id = ?").run(
        txId,
        Date.now(),
        id
      );
      return txId;
    });
    const txId = run.immediate();
    res.json({ request: byId(id), transaction: getTransactionForUser(db, txId, req.user.id) });
  });

  const resolve = (role, from, to) => (req, res) => {
    const id = idParam(req);
    const run = db.transaction(() => {
      const r = db.prepare(`SELECT * FROM payment_requests WHERE id = ? AND ${role} = ?`).get(id, req.user.id);
      if (!r) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Payment request not found.');
      if (r.status !== from) throw new AppError(409, 'REQUEST_NOT_PENDING', `This request is already ${r.status}.`);
      db.prepare('UPDATE payment_requests SET status = ?, resolved_at = ? WHERE id = ?').run(to, Date.now(), id);
    });
    run.immediate();
    res.json({ request: byId(id) });
  };

  router.post('/:id/decline', resolve('payer_id', 'pending', 'declined'));
  router.post('/:id/cancel', resolve('requester_id', 'pending', 'cancelled'));

  return router;
};
