const request = require('supertest');
const baseConfig = require('../src/config');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

let counter = 0;

function makeApp(overrides = {}) {
  const config = { ...baseConfig, rateLimitEnabled: false, bcryptRounds: 4, ...overrides };
  const db = openDb(':memory:');
  const app = createApp({ db, config });
  return { app, db, config };
}

async function registerUser(app, name) {
  counter += 1;
  const email = `${name.toLowerCase()}${counter}@example.com`;
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'password123' });
  if (res.status !== 201) throw new Error('register failed: ' + JSON.stringify(res.body));
  return { email, token: res.body.token, id: res.body.user.id };
}

const authed = (app, user) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${user.token}`),
  post: (url, body, headers = {}) => {
    let r = request(app).post(url).set('Authorization', `Bearer ${user.token}`);
    for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
    return r.send(body);
  },
});

const balanceOf = async (app, user) => (await authed(app, user).get('/api/wallet')).body.balanceMinor;

let keyN = 0;
const newKey = () => `test-key-${Date.now()}-${++keyN}`;

module.exports = { makeApp, registerUser, authed, balanceOf, newKey };
