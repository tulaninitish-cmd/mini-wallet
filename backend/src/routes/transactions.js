const express = require('express');
const { z } = require('zod');
const { presentTransaction, TX_SELECT } = require('../services/ledger');

const querySchema = z.object({
  type: z.enum(['all', 'topup', 'transfer']).default('all'),
  direction: z.enum(['all', 'in', 'out']).default('all'),
  flagged: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

module.exports = function transactionRoutes({ db }) {
  const router = express.Router();

  // GET /api/transactions?type=transfer&direction=out&flagged=true&limit=25&offset=0
  router.get('/', (req, res) => {
    const q = querySchema.parse(req.query);
    const uid = req.user.id;

    const where = [];
    if (q.direction === 'out') where.push('t.from_user_id = @uid');
    else if (q.direction === 'in') where.push('t.to_user_id = @uid');
    else where.push('(t.from_user_id = @uid OR t.to_user_id = @uid)');
    if (q.type !== 'all') where.push('t.type = @type');
    // Flags belong to the sender, so this filter only matches the user's own outgoing transfers.
    if (q.flagged === 'true') where.push('t.flagged = 1 AND t.from_user_id = @uid');
    if (q.flagged === 'false') where.push('(t.flagged = 0 OR t.from_user_id != @uid OR t.from_user_id IS NULL)');

    const clause = where.join(' AND ');
    const params = { uid, type: q.type, limit: q.limit, offset: q.offset };

    const rows = db
      .prepare(`${TX_SELECT} WHERE ${clause} ORDER BY t.created_at DESC, t.id DESC LIMIT @limit OFFSET @offset`)
      .all(params);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM transactions t WHERE ${clause}`).get({
      uid,
      type: q.type,
    });

    res.json({ total, items: rows.map((r) => presentTransaction(r, uid)) });
  });

  return router;
};
