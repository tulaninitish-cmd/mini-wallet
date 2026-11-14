const { AppError } = require('../errors');
const { evaluateTransfer } = require('./fraud');

/**
 * Moves money from one wallet to another and records it.
 * MUST run inside a database transaction (callers guarantee this), so the
 * debit, the credit and the ledger row either all happen or none do.
 */
function executeTransfer(db, config, { fromUserId, toUserId, amountMinor, note = '', now = Date.now() }) {
  if (!db.inTransaction) {
    throw new Error('executeTransfer must be called inside a transaction');
  }
  if (fromUserId === toUserId) {
    throw new AppError(400, 'SELF_TRANSFER', 'You cannot send money to yourself.');
  }

  // Conditional UPDATE: the balance check and the debit are ONE atomic statement,
  // so there is no gap between "check" and "debit" for another request to slip into.
  const debit = db
    .prepare('UPDATE wallets SET balance_minor = balance_minor - ? WHERE user_id = ? AND balance_minor >= ?')
    .run(amountMinor, fromUserId, amountMinor);
  if (debit.changes !== 1) {
    throw new AppError(402, 'INSUFFICIENT_FUNDS', 'Your wallet balance is too low for this transfer.');
  }
  db.prepare('UPDATE wallets SET balance_minor = balance_minor + ? WHERE user_id = ?').run(amountMinor, toUserId);

  // Fraud context is computed BEFORE inserting this transfer.
  const { recentCount } = db
    .prepare(
      `SELECT COUNT(*) AS recentCount FROM transactions
       WHERE type = 'transfer' AND from_user_id = ? AND created_at >= ?`
    )
    .get(fromUserId, now - config.fraud.velocityWindowMs);
  const { priorToSameRecipient } = db
    .prepare(
      `SELECT COUNT(*) AS priorToSameRecipient FROM transactions
       WHERE type = 'transfer' AND from_user_id = ? AND to_user_id = ?`
    )
    .get(fromUserId, toUserId);

  const verdict = evaluateTransfer(
    { amountMinor, recentTransferCount: recentCount, isNewRecipient: priorToSameRecipient === 0 },
    config.fraud
  );

  const info = db
    .prepare(
      `INSERT INTO transactions (type, from_user_id, to_user_id, amount_minor, note, flagged, flag_reasons, created_at)
       VALUES ('transfer', ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(fromUserId, toUserId, amountMinor, note, verdict.flagged ? 1 : 0, JSON.stringify(verdict.reasons), now);

  return Number(info.lastInsertRowid);
}

function executeTopup(db, { userId, amountMinor, now = Date.now() }) {
  db.prepare('UPDATE wallets SET balance_minor = balance_minor + ? WHERE user_id = ?').run(amountMinor, userId);
  const info = db
    .prepare(`INSERT INTO transactions (type, from_user_id, to_user_id, amount_minor, created_at) VALUES ('topup', NULL, ?, ?, ?)`)
    .run(userId, amountMinor, now);
  return Number(info.lastInsertRowid);
}

const TX_SELECT = `
  SELECT t.*, fu.email AS from_email, fu.name AS from_name, tu.email AS to_email, tu.name AS to_name
  FROM transactions t
  LEFT JOIN users fu ON fu.id = t.from_user_id
  JOIN users tu ON tu.id = t.to_user_id`;

// Shapes a row from one user's viewpoint. Fraud flags are only shown to the sender.
function presentTransaction(row, viewerId) {
  const outgoing = row.from_user_id === viewerId;
  const counterparty = outgoing
    ? { name: row.to_name, email: row.to_email }
    : row.from_user_id
    ? { name: row.from_name, email: row.from_email }
    : null;
  return {
    id: row.id,
    type: row.type,
    direction: outgoing ? 'out' : 'in',
    amountMinor: row.amount_minor,
    note: row.note,
    counterparty,
    flagged: outgoing ? !!row.flagged : false,
    flagReasons: outgoing ? JSON.parse(row.flag_reasons) : [],
    createdAt: row.created_at,
  };
}

function getTransactionForUser(db, id, viewerId) {
  const row = db.prepare(`${TX_SELECT} WHERE t.id = ?`).get(id);
  return presentTransaction(row, viewerId);
}

module.exports = { executeTransfer, executeTopup, presentTransaction, getTransactionForUser, TX_SELECT };
