import { useState } from 'react';
import { api, setToken } from '../api';
import Notice from '../components/Notice';

export default function Auth({ onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = mode === 'login' ? { email: form.email, password: form.password } : form;
      const data = await api(`/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body });
      setToken(data.token);
      onSignedIn(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <section className="auth-intro">
        <h1 className="brand-large">MiniPay</h1>
        <p className="lede">Send, request and track money between friends. Everything here uses test money, so nothing real moves.</p>
        <p className="demo-hint">
          Want to look around first? Run <code>npm run seed</code> in the backend, then sign in as <code>asha@example.com</code> with
          password <code>password123</code>.
        </p>
      </section>

      <form className="card auth-form" onSubmit={submit} noValidate>
        <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
        {mode === 'register' && (
          <label>
            Name
            <input value={form.name} onChange={set('name')} autoComplete="name" required />
          </label>
        )}
        <label>
          Email
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={8}
            required
          />
          {mode === 'register' && <span className="hint">At least 8 characters.</span>}
        </label>
        <Notice>{error}</Notice>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Please wait' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          className="btn-link"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
        >
          {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      </form>
    </main>
  );
}
