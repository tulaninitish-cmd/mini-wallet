const { evaluateTransfer } = require('../src/services/fraud');
const config = require('../src/config');
const { makeApp, registerUser, authed, newKey } = require('./helpers');

describe('fraud rules (unit)', () => {
  const rules = config.fraud;
  const base = { amountMinor: 100, recentTransferCount: 0, isNewRecipient: false };

  test('normal transfer is not flagged', () => {
    expect(evaluateTransfer(base, rules)).toEqual({ flagged: false, reasons: [] });
  });
  test('large amount is flagged', () => {
    expect(evaluateTransfer({ ...base, amountMinor: rules.largeAmountMinor }, rules).reasons).toContain('LARGE_AMOUNT');
  });
  test('large amount to a new recipient is flagged, to a known recipient is not', () => {
    const amountMinor = rules.newRecipientLargeMinor;
    expect(evaluateTransfer({ ...base, amountMinor, isNewRecipient: true }, rules).reasons).toContain('NEW_RECIPIENT_LARGE_AMOUNT');
    expect(evaluateTransfer({ ...base, amountMinor, isNewRecipient: false }, rules).flagged).toBe(false);
  });
  test('velocity rule flags after the allowed number of recent transfers', () => {
    expect(evaluateTransfer({ ...base, recentTransferCount: rules.velocityMaxTransfers - 1 }, rules).flagged).toBe(false);
    expect(evaluateTransfer({ ...base, recentTransferCount: rules.velocityMaxTransfers }, rules).reasons).toContain('HIGH_VELOCITY');
  });
});

describe('fraud flags (integration)', () => {
  const send = (app, from, to, amountMinor) =>
    authed(app, from).post('/api/transfers', { toEmail: to.email, amountMinor }, { 'Idempotency-Key': newKey() });

  test('6th transfer within a minute is flagged for the sender only', async () => {
    const { app } = makeApp();
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');
    await authed(app, alice).post('/api/wallet/topup', { amountMinor: 100_000 });

    const results = [];
    for (let i = 0; i < 6; i++) results.push(await send(app, alice, bob, 100));
    expect(results.slice(0, 5).every((r) => !r.body.transaction.flagged)).toBe(true);
    expect(results[5].body.transaction.flagged).toBe(true);
    expect(results[5].body.transaction.flagReasons).toEqual(['HIGH_VELOCITY']);

    const aliceFlagged = await authed(app, alice).get('/api/transactions?flagged=true');
    expect(aliceFlagged.body.total).toBe(1);
    const bobView = await authed(app, bob).get('/api/transactions?direction=in');
    expect(bobView.body.items.every((t) => t.flagged === false)).toBe(true);
    expect((await authed(app, bob).get('/api/transactions?flagged=true')).body.total).toBe(0);
  });

  test('flagged transfers still go through (rules flag, they do not block)', async () => {
    const { app } = makeApp();
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');
    await authed(app, alice).post('/api/wallet/topup', { amountMinor: 5_000_000 });
    const res = await send(app, alice, bob, 3_000_000);
    expect(res.status).toBe(201);
    expect(res.body.transaction.flagReasons).toEqual(expect.arrayContaining(['LARGE_AMOUNT', 'NEW_RECIPIENT_LARGE_AMOUNT']));
  });
});
