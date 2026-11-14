const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

-- One wallet per user. The CHECK makes a negative balance impossible,
-- even if application code has a bug.
CREATE TABLE IF NOT EXISTS wallets (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id),
  balance_minor INTEGER NOT NULL DEFAULT 0 CHECK (balance_minor >= 0)
);

CREATE TABLE IF NOT EXISTS transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL CHECK (type IN ('topup', 'transfer')),
  from_user_id  INTEGER REFERENCES users(id),
  to_user_id    INTEGER NOT NULL REFERENCES users(id),
  amount_minor  INTEGER NOT NULL CHECK (amount_minor > 0),
  note          TEXT NOT NULL DEFAULT '',
  flagged       INTEGER NOT NULL DEFAULT 0,
  flag_reasons  TEXT NOT NULL DEFAULT '[]',
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_from ON transactions(from_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tx_to   ON transactions(to_user_id, created_at);

CREATE TABLE IF NOT EXISTS payment_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id   INTEGER NOT NULL REFERENCES users(id),
  payer_id       INTEGER NOT NULL REFERENCES users(id),
  amount_minor   INTEGER NOT NULL CHECK (amount_minor > 0),
  note           TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'paid', 'declined', 'cancelled')),
  transaction_id INTEGER REFERENCES transactions(id),
  created_at     INTEGER NOT NULL,
  resolved_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_req_payer     ON payment_requests(payer_id, status);
CREATE INDEX IF NOT EXISTS idx_req_requester ON payment_requests(requester_id, status);

-- Stores the response of a completed request so a retry with the same
-- Idempotency-Key returns the same result instead of moving money twice.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id       INTEGER NOT NULL REFERENCES users(id),
  key           TEXT NOT NULL,
  request_hash  TEXT NOT NULL,
  status_code   INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
`;

function openDb(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb };
