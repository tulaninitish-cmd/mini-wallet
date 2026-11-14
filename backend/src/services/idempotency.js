const crypto = require('crypto');
const { AppError } = require('../errors');

function hashRequest(scope, payload) {
  return crypto.createHash('sha256').update(JSON.stringify([scope, payload])).digest('hex');
}

/**
 * Runs `work` at most once per (user, key).
 *
 * The lookup, the money movement and the saving of the response all happen in
 * ONE immediate database transaction. So:
 *  - a retry after a timeout replays the saved response (no second transfer);
 *  - two simultaneous requests with the same key cannot both execute;
 *  - if `work` throws, everything rolls back and the key is not consumed.
 */
function runIdempotent(db, userId, key, requestHash, work, now = Date.now()) {
  const tx = db.transaction(() => {
    const saved = db
      .prepare('SELECT request_hash, status_code, response_body FROM idempotency_keys WHERE user_id = ? AND key = ?')
      .get(userId, key);

    if (saved) {
      if (saved.request_hash !== requestHash) {
        throw new AppError(
          422,
          'IDEMPOTENCY_KEY_REUSED',
          'This Idempotency-Key was already used with a different request.'
        );
      }
      return { replayed: true, status: saved.status_code, body: JSON.parse(saved.response_body) };
    }

    const result = work(); // { status, body }
    db.prepare(
      'INSERT INTO idempotency_keys (user_id, key, request_hash, status_code, response_body, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, key, requestHash, result.status, JSON.stringify(result.body), now);
    return { replayed: false, ...result };
  });
  return tx.immediate();
}

module.exports = { hashRequest, runIdempotent };
