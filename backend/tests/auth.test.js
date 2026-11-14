const request = require('supertest');
const { makeApp, registerUser } = require('./helpers');

describe('auth', () => {
  test('register creates a user with an empty wallet and returns a token', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/auth/register').send({ name: 'Asha', email: 'ASHA@Example.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('asha@example.com'); // normalised to lower case
    expect(res.body.token).toBeTruthy();
    const wallet = await request(app).get('/api/wallet').set('Authorization', `Bearer ${res.body.token}`);
    expect(wallet.body.balanceMinor).toBe(0);
  });

  test('password is stored hashed, never in plain text', async () => {
    const { app, db } = makeApp();
    await registerUser(app, 'Asha');
    const row = db.prepare('SELECT password_hash FROM users').get();
    expect(row.password_hash).not.toContain('password123');
    expect(row.password_hash.startsWith('$2')).toBe(true);
  });

  test('duplicate email is rejected with 409', async () => {
    const { app } = makeApp();
    const body = { name: 'Asha', email: 'dup@example.com', password: 'password123' };
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  test('validation errors list the bad fields', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/auth/register').send({ name: '', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(['email', 'name', 'password']);
  });

  test('login works and wrong password gives the same error as unknown email', async () => {
    const { app } = makeApp();
    await request(app).post('/api/auth/register').send({ name: 'Asha', email: 'a@example.com', password: 'password123' });
    const ok = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'password123' });
    expect(ok.status).toBe(200);
    const wrongPw = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'wrong-password' });
    const noUser = await request(app).post('/api/auth/login').send({ email: 'x@example.com', password: 'password123' });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body.error.message).toBe(noUser.body.error.message);
  });

  test('protected routes need a valid token', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/wallet')).status).toBe(401);
    expect((await request(app).get('/api/wallet').set('Authorization', 'Bearer garbage')).status).toBe(401);
  });

  test('unknown routes return a JSON 404', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
