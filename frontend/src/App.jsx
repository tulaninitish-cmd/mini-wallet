import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import Auth from './views/Auth';
import Wallet from './views/Wallet';
import Activity from './views/Activity';
import Requests from './views/Requests';

const TABS = [
  ['wallet', 'Wallet'],
  ['activity', 'Activity'],
  ['requests', 'Requests'],
];

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(!!getToken());
  const [view, setView] = useState('wallet');
  const [balanceMinor, setBalanceMinor] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Restore the session if a valid token is stored.
  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!user) return;
    api('/wallet').then((w) => setBalanceMinor(w.balanceMinor)).catch(() => {});
  }, [user, refreshKey]);

  function signOut() {
    setToken(null);
    setUser(null);
    setBalanceMinor(null);
    setView('wallet');
  }

  if (booting) return null;
  if (!user) return <Auth onSignedIn={setUser} />;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">MiniPay</span>
        <nav aria-label="Main">
          {TABS.map(([id, label]) => (
            <button key={id} className={`tab ${view === id ? 'tab-on' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="who">
          <span className="who-name">{user.name}</span>
          <button className="btn-link" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="page">
        {view === 'wallet' && <Wallet balanceMinor={balanceMinor} refreshKey={refreshKey} onChange={refresh} goActivity={() => setView('activity')} />}
        {view === 'activity' && <Activity refreshKey={refreshKey} />}
        {view === 'requests' && <Requests onChange={refresh} />}
      </main>
      <footer className="foot">Test money only. MiniPay is a portfolio project and does not handle real payments.</footer>
    </div>
  );
}
