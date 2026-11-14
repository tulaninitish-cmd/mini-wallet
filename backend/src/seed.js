// Creates three demo users with test money. Run: npm run seed
const bcrypt = require('bcryptjs');
const config = require('./config');
const { openDb } = require('./db');
const { executeTopup } = require('./services/ledger');

const db = openDb(config.dbFile);
const demo = [
  ['Asha Verma', 'asha@example.com', 500_000],
  ['Rahul Singh', 'rahul@example.com', 250_000],
  ['Meera Nair', 'meera@example.com', 100_000],
];

db.transaction(() => {
  for (const [name, email, topup] of demo) {
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) continue;
    const id = Number(
      db
        .prepare('INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .run(email, name, bcrypt.hashSync('password123', config.bcryptRounds), Date.now()).lastInsertRowid
    );
    db.prepare('INSERT INTO wallets (user_id, balance_minor) VALUES (?, 0)').run(id);
    executeTopup(db, { userId: id, amountMinor: topup });
  }
}).immediate();

console.log('Seeded demo users (password: password123): ' + demo.map((d) => d[1]).join(', '));
db.close();
