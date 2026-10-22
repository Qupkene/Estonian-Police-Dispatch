// Kontod: search, sort, page through the accounts; make a new one.
import { useState, type FormEvent } from 'react';
import { api, qs, type AdminUser, type UserRow } from '../api';
import { ago, bytes, when } from '../labels';
import { Badge, LoadState, Modal, Pager, SearchInput, SecretBox, Select, errorText, useLoad } from '../ui';
import { go } from '../nav';

const LIMIT = 50;
const SORTS: Record<string, string> = {
  created: 'Uuemad ees',
  login: 'Viimati sees',
  name: 'Nimi',
  best: 'Parim tulemus',
  shifts: 'Vahetusi',
};

export function Users() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('created');
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const dir = sort === 'name' ? 'asc' : 'desc';
  const path = `/admin/users${qs({ q, sort, dir, limit: LIMIT, offset })}`;
  const loaded = useLoad(() => api<{ total: number; users: UserRow[] }>('GET', path), path);
  return (
    <section>
      <div className="ad-head">
        <h1>Kontod</h1>
        <button type="button" className="ad-btn ad-btn--primary" onClick={() => setCreating(true)}>
          Uus konto
        </button>
      </div>
      <div className="ad-filters">
        <SearchInput
          value={q}
          placeholder="Otsi nime järgi"
          onChange={(v) => {
            setQ(v);
            setOffset(0);
          }}
        />
        <Select
          label="Järjekord"
          value={sort}
          options={SORTS}
          onChange={(v) => {
            setSort(v);
            setOffset(0);
          }}
        />
      </div>
      <LoadState loaded={loaded}>
        {loaded.data && (
          <>
            <div className="ad-scroll">
              <table className="ad-table ad-table--click">
                <thead>
                  <tr>
                    <th>Nimi</th>
                    <th>Loodud</th>
                    <th>Viimati sees</th>
                    <th className="num">Vahetusi</th>
                    <th className="num">Parim</th>
                    <th className="num">Päeva</th>
                    <th className="num">Salvestus</th>
                    <th>Olek</th>
                  </tr>
                </thead>
                <tbody>
                  {loaded.data.users.map((u) => (
                    <tr key={u.id} onClick={() => go(`kontod/${u.id}`)}>
                      <td>
                        <a href={`#/kontod/${u.id}`} onClick={(e) => e.stopPropagation()}>
                          {u.name}
                        </a>
                      </td>
                      <td className="mono">{when(u.created)}</td>
                      <td className="mono" title={when(u.lastLogin)}>
                        {ago(u.lastLogin)}
                      </td>
                      <td className="num">{u.shifts}</td>
                      <td className="num">{u.best ?? ''}</td>
                      <td className="num">{u.daily}</td>
                      <td className="num">{u.saveBytes ? bytes(u.saveBytes) : ''}</td>
                      <td>
                        <UserBadges user={u} />
                      </td>
                    </tr>
                  ))}
                  {loaded.data.users.length === 0 && (
                    <tr>
                      <td colSpan={8} className="ad-empty">
                        Ühtegi kontot ei leitud.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager total={loaded.data.total} limit={LIMIT} offset={offset} onOffset={setOffset} />
          </>
        )}
      </LoadState>
      {creating && <CreateUser onClose={() => setCreating(false)} onMade={loaded.reload} />}
    </section>
  );
}

export function UserBadges({ user }: { user: AdminUser }) {
  return (
    <span className="ad-badges">
      {user.admin && <Badge kind="acc">admin</Badge>}
      {user.disabled && <Badge kind="bad">blokeeritud</Badge>}
      {!user.admin && !user.disabled && <Badge kind="dim">tavaline</Badge>}
    </span>
  );
}

function CreateUser({ onClose, onMade }: { onClose: () => void; onMade: () => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ user: AdminUser; password?: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ user: AdminUser; password?: string }>('POST', '/admin/users', {
        name,
        password,
        admin,
      });
      setMade(r);
      onMade();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };
  return (
    <Modal title="Uus konto" onClose={onClose}>
      {made ? (
        <div className="ad-form">
          {made.password ? (
            <SecretBox name={made.user.name} password={made.password} />
          ) : (
            <p>
              Konto <b>{made.user.name}</b> on loodud sinu antud parooliga.
            </p>
          )}
          <div className="ad-actions">
            <button type="button" className="ad-btn" onClick={onClose}>
              Sulge
            </button>
            <button
              type="button"
              className="ad-btn ad-btn--primary"
              onClick={() => go(`kontod/${made.user.id}`)}
            >
              Ava konto
            </button>
          </div>
        </div>
      ) : (
        <form className="ad-form" onSubmit={submit}>
          <label className="ad-field">
            <span>Kasutajanimi</span>
            <input
              className="ad-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              autoComplete="off"
            />
            <small>3 kuni 24 märki: tähed, numbrid ja _ . -</small>
          </label>
          <label className="ad-field">
            <span>Parool</span>
            <input
              className="ad-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Tühi: server teeb tugeva parooli"
            />
          </label>
          <label className="ad-check">
            <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> Admini
            õigustega
          </label>
          {error && <p className="ad-error">{error}</p>}
          <div className="ad-actions">
            <button type="button" className="ad-btn" onClick={onClose}>
              Loobu
            </button>
            <button type="submit" className="ad-btn ad-btn--primary" disabled={busy}>
              Loo konto
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
