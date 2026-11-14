const { makeApp, registerUser, authed, balanceOf, newKey } = require('./helpers');

async function setup(aliceFunds = 100_000) {
  const ctx = makeApp();
  const alice = await registerUser(ctx.app, 'Alice');
  const bob = await registerUser(ctx.app, 'Bob');
  if (aliceFunds) await authed(ctx.app, alice).post('/api/wallet/topup', { amountMinor: aliceFunds });
  return { ...ctx, alice, bob };
}
const send = (app, from, to, amountMinor, key = newKey(), note = '') =>
  authed(app, from).post('/api/transfers', { toEmail: to.email, amountMinor, note }, { 'Idempotency-Key': key });

describe('wallet top-up', () => {
  test('adds test money and records a topup transaction', async () => {
    const { app, alice } = await setup(0);
    const res = await authed(app, alice).post('/api/wallet/topup', { amountMinor: 50_000 });
    expect(res.status).toBe(201);
    expect(res.body.balanceMinor).toBe(50_000);
    expect(res.body.transaction.type).toBe('topup');
  });

  test.each([[0], [-5], [1.5], ['100']])('rejects invalid amount %p', async (amount) => {
    const { app, alice } = await setup(0);
    const res = await authed(app, alice).post('/api/wallet/topup', { amountMinor: amount });
    expect(res.status).toBe(400);
  });

  test('rejects amounts above the limit', async () => {
    const { app, alice, config } = await setup(0);
    const res = await authed(app, alice).post('/api/wallet/topup', { amountMinor: config.limits.maxTopupMinor + 1 });
    expect(res.status).toBe(400);
  });
});

describe('transfers', () => {
  test('moves money from sender to recipient', async () => {
    const { app, alice, bob } = await setup(100_000);
    const res = await send(app, alice, bob, 30_000, undefined, 'lunch');
    expect(res.status).toBe(201);
    expect(res.body.balanceMinor).toBe(70_000);
    expect(res.body.transaction).toMatchObject({ direction: 'out', amountMinor: 30_000, note: 'lunch' });
    expect(await balanceOf(app, alice)).toBe(70_000);
    expect(await balanceOf(app, bob)).toBe(30_000);
  });

  test('insufficient funds returns 402 and changes nothing', async () => {
    const { app, alice, bob } = await setup(1_000);
    const res = await send(app, alice, bob, 5_000);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await balanceOf(app, alice)).toBe(1_000);
    expect(await balanceOf(app, bob)).toBe(0);
  });

  test('cannot send to yourself', async () => {
    const { app, alice } = await setup();
    const res = await send(app, alice, alice, 100);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_TRANSFER');
  });

  test('unknown recipient returns 404', async () => {
    const { app, alice } = await setup();
    const res = await send(app, alice, { email: 'ghost@example.com' }, 100);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RECIPIENT_NOT_FOUND');
  });

  test.each([[0], [-1], [10.5], ['5']])('rejects invalid amount %p', async (amount) => {
    const { app, alice, bob } = await setup();
    const res = await send(app, alice, bob, amount);
    expect(res.status).toBe(400);
  });

  test('an Idempotency-Key header is required', async () => {
    const { app, alice, bob } = await setup();
    const res = await authed(app, alice).post('/api/transfers', { toEmail: bob.email, amountMinor: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  test('a failed transfer rolls back completely (no half-moved money)', async () => {
    const { app, db, alice, bob } = await setup(10_000);
    // Force a failure AFTER the debit by making the ledger insert fail.
    db.exec(`CREATE TRIGGER boom BEFORE INSERT ON transactions WHEN NEW.type = 'transfer' BEGIN SELECT RAISE(ABORT, 'boom'); END;`);
    const res = await send(app, alice, bob, 4_000);
    expect(res.status).toBe(500);
    expect(await balanceOf(app, alice)).toBe(10_000);
    expect(await balanceOf(app, bob)).toBe(0);
  });
});

describe('idempotency', () => {
  test('retrying with the same key sends the money only once and replays the response', async () => {
    const { app, alice, bob } = await setup(100_000);
    const key = newKey();
    const first = await send(app, alice, bob, 20_000, key);
    const second = await send(app, alice, bob, 20_000, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.headers['idempotent-replayed']).toBe('false');
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
    expect(await balanceOf(app, alice)).toBe(80_000);
    expect(await balanceOf(app, bob)).toBe(20_000);
  });

  test('reusing a key with a different request returns 422', async () => {
    const { app, alice, bob } = await setup(100_000);
    const key = newKey();
    await send(app, alice, bob, 20_000, key);
    const res = await send(app, alice, bob, 99_999, key);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await balanceOf(app, alice)).toBe(80_000);
  });

  test('a failed request does not consume its key, so it can be retried after topping up', async () => {
    const { app, alice, bob } = await setup(1_000);
    const key = newKey();
    expect((await send(app, alice, bob, 5_000, key)).status).toBe(402);
    await authed(app, alice).post('/api/wallet/topup', { amountMinor: 10_000 });
    expect((await send(app, alice, bob, 5_000, key)).status).toBe(201);
  });

  test('keys are scoped per user', async () => {
    const { app, alice, bob } = await setup(100_000);
    await authed(app, bob).post('/api/wallet/topup', { amountMinor: 100_000 });
    const key = newKey();
    expect((await send(app, alice, bob, 100, key)).headers['idempotent-replayed']).toBe('false');
    expect((await send(app, bob, alice, 100, key)).headers['idempotent-replayed']).toBe('false');
  });
});

describe('concurrency', () => {
  test('50 simultaneous transfers competing for limited funds never overdraw or lose money', async () => {
    const { app, alice, bob } = await setup(100_000); // 1,000.00
    const amount = 3_000; // 30.00 each -> only 33 can succeed (99,000), 1,000 left

    const results = await Promise.all(Array.from({ length: 50 }, () => send(app, alice, bob, amount)));
    const ok = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 402).length;

    expect(ok).toBe(33);
    expect(rejected).toBe(17);
    expect(await balanceOf(app, alice)).toBe(1_000);
    expect(await balanceOf(app, bob)).toBe(99_000);
    // Conservation of money: nothing created, nothing destroyed.
    expect((await balanceOf(app, alice)) + (await balanceOf(app, bob))).toBe(100_000);
  });

  test('20 simultaneous requests with the SAME idempotency key move the money exactly once', async () => {
    const { app, alice, bob } = await setup(100_000);
    const key = newKey();
    const results = await Promise.all(Array.from({ length: 20 }, () => send(app, alice, bob, 10_000, key)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(results.filter((r) => r.headers['idempotent-replayed'] === 'false')).toHaveLength(1);
    expect(await balanceOf(app, alice)).toBe(90_000);
    expect(await balanceOf(app, bob)).toBe(10_000);
  });

  test('concurrent transfers in both directions keep the total constant', async () => {
    const { app, alice, bob } = await setup(50_000);
    await authed(app, bob).post('/api/wallet/topup', { amountMinor: 50_000 });
    const jobs = [];
    for (let i = 0; i < 25; i++) {
      jobs.push(send(app, alice, bob, 1_000));
      jobs.push(send(app, bob, alice, 700));
    }
    await Promise.all(jobs);
    expect((await balanceOf(app, alice)) + (await balanceOf(app, bob))).toBe(100_000);
  });
});
