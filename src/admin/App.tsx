// The admin panel (politsei.eu/admin/): the gate (login, then the password again to unlock), the frame and the
// pages behind hash routes (nav.ts).
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminError, api, onSessionLost, type AdminUser } from './api';
import { errorText } from './ui';
import { readRoute } from './nav';
import { Dashboard } from './pages/Dashboard';
import { Users } from './pages/Users';
import { UserPage } from './pages/UserPage';
import { Scores } from './pages/Scores';
import { DailyPage } from './pages/DailyPage';
import { Rooms } from './pages/Rooms';
import { LogPage } from './pages/LogPage';
import { Backups } from './pages/Backups';

type Gate =
  | { kind: 'loading' }
  | { kind: 'login' }
  | { kind: 'notAdmin'; name: string }
  | { kind: 'locked'; user: AdminUser }
  | { kind: 'open'; user: AdminUser; until: number }
  | { kind: 'down'; text: string };

interface MeReply {
  user: AdminUser;
  unlocked: boolean;
  until: number | null;
}

const NAV: { path: string; label: string }[] = [
  { path: '', label: 'Ülevaade' },
  { path: 'kontod', label: 'Kontod' },
  { path: 'tulemused', label: 'Edetabel' },
  { path: 'paev', label: 'Päeva väljakutse' },
  { path: 'ruumid', label: 'Ruumid' },
  { path: 'logi', label: 'Logi' },
  { path: 'varu', label: 'Varukoopiad' },
];

export function App() {
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });
  const [route, setRoute] = useState(readRoute);

  const check = useCallback(async () => {
    try {
      const me = await api<MeReply>('GET', '/admin/me');
      setGate(
        me.unlocked && me.until
          ? { kind: 'open', user: me.user, until: me.until }
          : { kind: 'locked', user: me.user },
      );
    } catch (e) {
      if (e instanceof AdminError && e.status === 401) setGate({ kind: 'login' });
      else if (e instanceof AdminError && e.code === 'not_admin') {
        const me = await api<{ user: { name: string } | null }>('GET', '/me').catch(() => ({ user: null }));
        setGate(me.user ? { kind: 'notAdmin', name: me.user.name } : { kind: 'login' });
      } else setGate({ kind: 'down', text: errorText(e) });
    }
  }, []);

  useEffect(() => {
    void check();
    onSessionLost(() => void check());
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => {
      onSessionLost(null);
      window.removeEventListener('hashchange', onHash);
    };
  }, [check]);

  // The unlock runs out on the server after two hours: look again then.
  const until = gate.kind === 'open' ? gate.until : 0;
  useEffect(() => {
    if (!until) return;
    const t = window.setTimeout(() => void check(), Math.max(1000, until - Date.now() + 1000));
    return () => window.clearTimeout(t);
  }, [until, check]);

  if (gate.kind === 'loading')
    return (
      <div className="ad-gate">
        <p className="ad-empty">Laadin…</p>
      </div>
    );
  if (gate.kind === 'down')
    return (
      <GateFrame title="Server ei vasta">
        <p className="ad-gate__text">{gate.text}</p>
        <button type="button" className="ad-btn ad-btn--primary" onClick={() => void check()}>
          Proovi uuesti
        </button>
      </GateFrame>
    );
  if (gate.kind === 'login') return <LoginForm onDone={check} />;
  if (gate.kind === 'notAdmin')
    return (
      <GateFrame title="Ligipääs puudub">
        <p className="ad-gate__text">
          Konto <b>{gate.name}</b> ei ole admin. Admini õigused antakse serveris (docs/SERVER.md, Admin).
        </p>
        <div className="ad-actions">
          <a className="ad-btn" href="/">
            Mängu
          </a>
          <button
            type="button"
            className="ad-btn ad-btn--primary"
            onClick={async () => {
              await api('POST', '/logout').catch(() => {});
              void check();
            }}
          >
            Logi sisse teise kontoga
          </button>
        </div>
      </GateFrame>
    );
  if (gate.kind === 'locked') return <UnlockForm user={gate.user} onDone={check} />;

  const [section = '', id] = route;
  const lock = async () => {
    await api('POST', '/admin/lock').catch(() => {});
    void check();
  };
  return (
    <div className="ad-app">
      <header className="ad-top">
        <a className="ad-brand" href="#/">
          <span className="ad-brand__mark">EPD</span> admin
        </a>
        <nav className="ad-nav" aria-label="Admini paneel">
          {NAV.map((n) => (
            <a
              key={n.path}
              href={`#/${n.path}`}
              className={section === n.path ? 'is-on' : undefined}
              aria-current={section === n.path ? 'page' : undefined}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ad-top__me">
          <span
            className="ad-top__who"
            title={`Lukustub ${new Date(gate.until).toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' })}`}
          >
            {gate.user.name}
          </span>
          <a className="ad-btn ad-btn--small" href="/">
            Mängu
          </a>
          <button type="button" className="ad-btn ad-btn--small" onClick={lock}>
            Lukusta
          </button>
        </div>
      </header>
      <main className="ad-main">
        {section === '' && <Dashboard />}
        {section === 'kontod' && !id && <Users />}
        {section === 'kontod' && id && <UserPage key={id} id={Number(id)} me={gate.user} />}
        {section === 'tulemused' && <Scores />}
        {section === 'paev' && <DailyPage />}
        {section === 'ruumid' && <Rooms code={id} />}
        {section === 'logi' && <LogPage />}
        {section === 'varu' && <Backups />}
        {!NAV.some((n) => n.path === section) && <p className="ad-empty">Sellist lehte ei ole.</p>}
      </main>
    </div>
  );
}

function GateFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ad-gate">
      <div className="ad-gate__box">
        <div className="ad-brand ad-brand--big">
          <span className="ad-brand__mark">EPD</span> admin
        </div>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

function LoginForm({ onDone }: { onDone: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ user: { admin?: boolean } }>('POST', '/login', { name, password });
      // An admin's login also unlocks the panel: the password was just typed.
      if (r.user.admin) await api('POST', '/admin/unlock', { password });
      await onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };
  return (
    <GateFrame title="Logi sisse">
      <form className="ad-form" onSubmit={submit}>
        <label className="ad-field">
          <span>Kasutajanimi</span>
          <input
            className="ad-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>
        <label className="ad-field">
          <span>Parool</span>
          <input
            className="ad-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="ad-error">{error}</p>}
        <button type="submit" className="ad-btn ad-btn--primary" disabled={busy}>
          Logi sisse
        </button>
      </form>
    </GateFrame>
  );
}

function UnlockForm({ user, onDone }: { user: AdminUser; onDone: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('POST', '/admin/unlock', { password });
      await onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };
  return (
    <GateFrame title="Kinnita parool">
      <p className="ad-gate__text">
        Sisse logitud: <b>{user.name}</b>. Admini paneel avaneb kaheks tunniks, kui sisestad oma parooli
        uuesti.
      </p>
      <form className="ad-form" onSubmit={submit}>
        <input type="text" name="username" value={user.name} autoComplete="username" readOnly hidden />
        <label className="ad-field">
          <span>Parool</span>
          <input
            className="ad-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </label>
        {error && <p className="ad-error">{error}</p>}
        <button type="submit" className="ad-btn ad-btn--primary" disabled={busy}>
          Ava paneel
        </button>
      </form>
    </GateFrame>
  );
}
