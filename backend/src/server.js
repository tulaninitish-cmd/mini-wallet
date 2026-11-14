const config = require('./config');
const { openDb } = require('./db');
const { createApp } = require('./app');

const db = openDb(config.dbFile);
const app = createApp({ db, config });

const server = app.listen(config.port, () => {
  console.log(`MiniPay API listening on http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
