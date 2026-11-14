import { useEffect, useState } from 'react';
import { api } from '../api';
import Ledger from '../components/Ledger';
import Notice from '../components/Notice';

const PAGE = 15;

export default function Activity({ refreshKey }) {
  const [filters, setFilters] = useState({ type: 'all', direction: 'all', flagged: 'all' });
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ total: 0, items: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    const q = new URLSearchParams({ limit: PAGE, offset: page * PAGE, type: filters.type, direction: filters.direction });
    if (filters.flagged !== 'all') q.set('flagged', filters.flagged);
    api(`/transactions?${q}`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [filters, page, refreshKey]);

  const change = (k) => (e) => {
    setFilters({ ...filters, [k]: e.target.value });
    setPage(0);
  };
  const pages = Math.max(1, Math.ceil(data.total / PAGE));

  return (
    <section className="panel">
      <h2>Activity</h2>
      <div className="filters">
        <label>
          Type
          <select value={filters.type} onChange={change('type')}>
            <option value="all">All</option>
            <option value="transfer">Transfers</option>
            <option value="topup">Top-ups</option>
          </select>
        </label>
        <label>
          Direction
          <select value={filters.direction} onChange={change('direction')}>
            <option value="all">Money in and out</option>
            <option value="in">Money in</option>
            <option value="out">Money out</option>
          </select>
        </label>
        <label>
          Review flags
          <select value={filters.flagged} onChange={change('flagged')}>
            <option value="all">All</option>
            <option value="true">Flagged only</option>
            <option value="false">Not flagged</option>
          </select>
        </label>
      </div>
      <Notice>{error}</Notice>
      <Ledger items={data.items} empty="Nothing matches these filters." />
      <div className="pager">
        <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page + 1} of {pages}
        </span>
        <button className="btn" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </section>
  );
}
