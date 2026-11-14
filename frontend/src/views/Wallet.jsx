import { useEffect, useRef, useState } from 'react';
import { api, newIdempotencyKey } from '../api';
import { formatMinor, parseToMinor } from '../money';
import Notice from '../components/Notice';
import Ledger from '../components/Ledger';

function SendForm({ onDone }) {
  const [f, setF] = useState({ toEmail: '', amount: '', note: '' });
  const [state, setState] = useState({ error: '', ok: '', busy: false });
  // One key per user action. It is reused if the same form is submitted again after a network
  // failure (so the server never sends twice), and replaced as soon as the user edits anything.
  const keyRef = useRef(null);
  useEffect(() => {
    keyRef.current = null;
  }, [f.toEmail, f.amount, f.note]);

  async function submit(e) {
    e.preventDefault();
    const amountMinor = parseToMinor(f.amount);
    if (!amountMinor) return setState({ error: 'Enter an amount like 250 or 250.50.', ok: '', busy: false });
    keyRef.current ??= newIdempotencyKey();
    setState({ error: '', ok: '', busy: true });
    try {
      const res = await api('/transfers', {
        method: 'POST',
        body: { toEmail: f.toEmail, amountMinor, note: f.note },
        headers: { 'Idempotency-Key': keyRef.current },
      });
      keyRef.current = null;
      setF({ toEmail: '', amount: '', note: '' });
      setState({ error: '', ok: `Sent ${formatMinor(amountMinor)} to ${res.transaction.counterparty.name}.`, busy: false });
      onDone();
    } catch (err) {
      setState({ error: err.message, ok: '', busy: false });
    }
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>Send money</h2>
      <label>
        To (email)
        <input type="email" value={f.toEmail} onChange={(e) => setF({ ...f, toEmail: e.target.value })} required />
      </label>
      <label>
        Amount (INR)
        <input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="250.00" required />
      </label>
      <label>
        Note <span className="hint">optional</span>
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={140} />
      </label>
      <Notice>{state.error}</Notice>
      <Notice kind="ok">{state.ok}</Notice>
      <button className="btn btn-primary" disabled={state.busy}>
        {state.busy ? 'Sending' : 'Send money'}
      </button>
    </form>
  );
}

function TopupForm({ onDone }) {
  const [amount, setAmount] = useState('');
  const [state, setState] = useState({ error: '', ok: '', busy: false });

  async function submit(e) {
    e.preventDefault();
    const amountMinor = parseToMinor(amount);
    if (!amountMinor) return setState({ error: 'Enter an amount like 500 or 500.50.', ok: '', busy: false });
    setState({ error: '', ok: '', busy: true });
    try {
      await api('/wallet/topup', { method: 'POST', body: { amountMinor } });
      setAmount('');
      setState({ error: '', ok: `Added ${formatMinor(amountMinor)} of test money.`, busy: false });
      onDone();
    } catch (err) {
      setState({ error: err.message, ok: '', busy: false });
    }
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>Add test money</h2>
      <label>
        Amount (INR)
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500.00" required />
      </label>
      <Notice>{state.error}</Notice>
      <Notice kind="ok">{state.ok}</Notice>
      <button className="btn" disabled={state.busy}>
        {state.busy ? 'Adding' : 'Add money'}
      </button>
    </form>
  );
}

export default function Wallet({ balanceMinor, refreshKey, onChange, goActivity }) {
  const [recent, setRecent] = useState([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api('/transactions?limit=5')
      .then((d) => setRecent(d.items))
      .catch((e) => setLoadError(e.message));
  }, [refreshKey]);

  return (
    <>
      <section className="balance" aria-label="Wallet balance">
        <p className="balance-label">Wallet balance</p>
        <p className="balance-figure">{balanceMinor === null ? '\u2013' : formatMinor(balanceMinor)}</p>
      </section>

      <div className="grid-2">
        <SendForm onDone={onChange} />
        <TopupForm onDone={onChange} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Recent activity</h2>
          <button className="btn-link" onClick={goActivity}>
            See all activity
          </button>
        </div>
        <Notice>{loadError}</Notice>
        <Ledger items={recent} empty="No activity yet. Add test money to get started." />
      </section>
    </>
  );
}
