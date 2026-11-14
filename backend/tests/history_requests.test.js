const { makeApp, registerUser, authed, balanceOf, newKey } = require('./helpers');

async function trio() {
  const ctx = makeApp();
  const alice = await registerUser(ctx.app, 'Alice');
  const bob = await registerUser(ctx.app, 'Bob');
  const carol = await registerUser(ctx.app, 'Carol');
  await authed(ctx.app, alice).post('/api/wallet/topup', { amountMinor: 100_000 });
  await authed(ctx.app, bob).post('/api/wallet/topup', { amountMinor: 100_000 });
  return { ...ctx, alice, bob, carol };
}

describe('transaction history', () => {
  test('lists a user\'s own transactions only, newest first, with filters and paging', async () => {
    const { app, alice, bob, carol } = await trio();
    const send = (from, to, amountMinor) =>
      authed(app, from).post('/api/transfers', { toEmail: to.email, amountMinor }, { 'Idempotency-Key': newKey() });
    await send(alice, bob, 1_000);
    await send(bob, alice, 500);
    await send(bob, carol, 700); // alice must not see this

    const all = await authed(app, alice).get('/api/transactions');
    expect(all.body.total).toBe(3); // topup + out + in
    expect(all.body.items[0]).toMatchObject({ direction: 'in', amountMinor: 500 });

    expect((await authed(app, alice).get('/api/transactions?type=transfer&direction=out')).body.total).toBe(1);
    expect((await authed(app, alice).get('/api/transactions?type=topup')).body.total).toBe(1);
    expect((await authed(app, alice).get('/api/transactions?limit=1&offset=1')).body.items).toHaveLength(1);
    expect((await authed(app, alice).get('/api/transactions?limit=0')).status).toBe(400);
  });
});

describe('payment requests', () => {
  test('request -> pay moves the money and closes the request', async () => {
    const { app, alice, bob } = await trio();
    const created = await authed(app, alice).post('/api/requests', { fromEmail: bob.email, amountMinor: 2_000, note: 'dinner' });
    expect(created.status).toBe(201);
    const id = created.body.request.id;

    expect((await authed(app, bob).get('/api/requests?box=incoming')).body.items).toHaveLength(1);
    expect((await authed(app, alice).get('/api/requests?box=outgoing')).body.items).toHaveLength(1);
    expect((await authed(app, alice).get('/api/requests?box=incoming')).body.items).toHaveLength(0);

    const paid = await authed(app, bob).post(`/api/requests/${id}/pay`, {});
    expect(paid.status).toBe(200);
    expect(paid.body.request.status).toBe('paid');
    expect(await balanceOf(app, bob)).toBe(98_000);
    expect(await balanceOf(app, alice)).toBe(102_000);
  });

  test('a request cannot be paid twice', async () => {
    const { app, alice, bob } = await trio();
    const { id } = (await authed(app, alice).post('/api/requests', { fromEmail: bob.email, amountMinor: 2_000 })).body.request;
    await Promise.all([authed(app, bob).post(`/api/requests/${id}/pay`, {}), authed(app, bob).post(`/api/requests/${id}/pay`, {})]);
    expect(await balanceOf(app, bob)).toBe(98_000);
    const again = await authed(app, bob).post(`/api/requests/${id}/pay`, {});
    expect(again.status).toBe(409);
  });

  test('only the payer can pay or decline; only the requester can cancel', async () => {
    const { app, alice, bob, carol } = await trio();
    const { id } = (await authed(app, alice).post('/api/requests', { fromEmail: bob.email, amountMinor: 2_000 })).body.request;
    expect((await authed(app, carol).post(`/api/requests/${id}/pay`, {})).status).toBe(404);
    expect((await authed(app, alice).post(`/api/requests/${id}/pay`, {})).status).toBe(404);
    expect((await authed(app, bob).post(`/api/requests/${id}/cancel`, {})).status).toBe(404);
    expect((await authed(app, bob).post(`/api/requests/${id}/decline`, {})).body.request.status).toBe('declined');
  });

  test('paying with too little money fails and leaves the request pending', async () => {
    const { app, alice, carol } = await trio(); // carol has 0
    const { id } = (await authed(app, alice).post('/api/requests', { fromEmail: carol.email, amountMinor: 2_000 })).body.request;
    const res = await authed(app, carol).post(`/api/requests/${id}/pay`, {});
    expect(res.status).toBe(402);
    expect((await authed(app, carol).get('/api/requests?box=incoming')).body.items[0].status).toBe('pending');
  });

  test('cannot request money from yourself or from an unknown user', async () => {
    const { app, alice } = await trio();
    expect((await authed(app, alice).post('/api/requests', { fromEmail: alice.email, amountMinor: 100 })).status).toBe(400);
    expect((await authed(app, alice).post('/api/requests', { fromEmail: 'ghost@example.com', amountMinor: 100 })).status).toBe(404);
  });
});
