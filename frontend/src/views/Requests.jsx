import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { formatMinor, parseToMinor } from '../money';
import Notice from '../components/Notice';

function RequestRow({ r, box, onAction, busyId }) {
  const other = box === 'incoming' ? r.requester : r.payer;
  const pending = r.status === 'pending';
  return (
    <li className="req-row">
      <div className="req-main">
        <span className="ledger-title">
          {box === 'incoming' ? `${other.name} asks for` : `You asked ${other.name} for`} {formatMinor(r.amountMinor)}
        </span>
        {r.note && <span className="ledger-note">{r.note}</span>}
      </div>
      {pending ? (
        <div className="req-actions">
          {box === 'incoming' ? (
            <>
              <button className="btn btn-primary" disabled={busyId === r.id} onClick={() => onAction(r.id, 'pay')}>
                Pay {formatMinor(r.amountMinor)}
              </button>
              <button className="btn" disabled={busyId === r.id} onClick={() => onAction(r.id, 'decline')}>
                Decline
              </button>
            </>
          ) : (
            <button className="btn" disabled={busyId === r.id} onClick={() => onAction(r.id, 'cancel')}>
              Cancel request
            </button>
          )}
        </div>
      ) : (
        <span className={`status status-${r.status}`}>{r.status[0].toUpperCase() + r.status.slice(1)}</span>
      )}
    </li>
  );
}

export default function Requests({ onChange }) {
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [f, setF] = useState({ fromEmail: '', amount: '', note: '' });
  const [state, setState] = useState({ error: '', ok: '', busy: false });
  const [listError, setListError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [i, o] = await Promise.all([api('/requests?box=incoming'), api('/requests?box=outgoing')]);
      setIncoming(i.items);
      setOutgoing(o.items);
    } catch (e) {
      setListError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    const amountMinor = parseToMinor(f.amount);
    if (!amountMinor) return setState({ error: 'Enter an amount like 250 or 250.50.', ok: '', busy: false });
    setState({ error: '', ok: '', busy: true });
    try {
      await api('/requests', { method: 'POST', body: { fromEmail: f.fromEmail, amountMinor, note: f.note } });
      setF({ fromEmail: '', amount: '', note: '' });
      setState({ error: '', ok: `Requested ${formatMinor(amountMinor)}.`, busy: false });
      load();
    } catch (err) {
      setState({ error: err.message, ok: '', busy: false });
    }
  }

  async function act(id, action) {
    setBusyId(id);
    setListError('');
    try {
      await api(`/requests/${id}/${action}`, { method: 'POST', body: {} });
      await load();
      if (action === 'pay') onChange();
    } catch (err) {
      setListError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <form className="card card-wide" onSubmit={create} noValidate>
        <h2>Request money</h2>
        <div className="row-fields">
          <label>
            From (email)
            <input type="email" value={f.fromEmail} onChange={(e) => setF({ ...f, fromEmail: e.target.value })} required />
          </label>
          <label>
            Amount (INR)
            <input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="250.00" required />
          </label>
          <label>
            Note <span className="hint">optional</span>
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={140} />
          </label>
        </div>
        <Notice>{state.error}</Notice>
        <Notice kind="ok">{state.ok}</Notice>
        <button className="btn btn-primary" disabled={state.busy}>
          {state.busy ? 'Sending request' : 'Request money'}
        </button>
      </form>

      <Notice>{listError}</Notice>
      <div className="grid-2">
        <section className="panel">
          <h2>Requests to you</h2>
          {incoming.length ? (
            <ul className="req-list">
              {incoming.map((r) => (
                <RequestRow key={r.id} r={r} box="incoming" onAction={act} busyId={busyId} />
              ))}
            </ul>
          ) : (
            <p className="empty">No one has asked you for money.</p>
          )}
        </section>
        <section className="panel">
          <h2>Requests you made</h2>
          {outgoing.length ? (
            <ul className="req-list">
              {outgoing.map((r) => (
                <RequestRow key={r.id} r={r} box="outgoing" onAction={act} busyId={busyId} />
              ))}
            </ul>
          ) : (
            <p className="empty">You have not asked anyone for money yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
