// One account: its details and every action on it (rename, admin, block, password, sessions, login limit, delete),
// then its results, daily runs, cloud saves, rooms and what the admins did to it.
import { useRef, useState, type FormEvent } from 'react';
import { api, readSave, writeSave, type AdminUser, type UserDetail } from '../api';
import { REGIONS, ROOM_MODES, ROOM_STATES, SAVE_SLOTS, ago, bytes, label, when } from '../labels';
import { Confirm, LoadState, Modal, SecretBox, errorText, useAction, useLoad } from '../ui';
import { go } from '../nav';
import { UserBadges } from './Users';
import { DailyDialog, DailyTable, ScoreDialog, ScoreTable } from './results';
import { LogTable } from './LogPage';

type Tab = 'scores' | 'daily' | 'saves' | 'rooms' | 'log';
type Ask = 'password' | 'logout' | 'delete' | 'block' | 'admin' | null;

export function UserPage({ id, me }: { id: number; me: AdminUser }) {
  const loaded = useLoad(() => api<UserDetail>('GET', `/admin/users/${id}`), `user:${id}`);
  const [tab, setTab] = useState<Tab>('scores');
  const [ask, setAsk] = useState<Ask>(null);
  const [adding, setAdding] = useState<'score' | 'daily' | null>(null);
  const run = useAction();
  const d = loaded.data;
  const self = d?.user.id === me.id;

  const patch = async (body: Record<string, unknown>, ok: string) => {
    const done = await run(() => api('PATCH', `/admin/users/${id}`, body), ok);
    if (done) loaded.reload();
    return done;
  };

  return (
    <section>
      <div className="pn-crumbs">
        <a href="#/kontod">Kontod</a> / {d?.user.name ?? id}
      </div>
      <LoadState loaded={loaded}>
        {d && (
          <>
            <div className="pn-head">
              <h1>
                {d.user.name} <UserBadges user={d.user} />
              </h1>
            </div>
            <div className="pn-grid2">
              <div className="pn-panel">
                <h2>Konto</h2>
                <dl className="pn-dl">
                  <dt>ID</dt>
                  <dd className="mono">{d.user.id}</dd>
                  <dt>Loodud</dt>
                  <dd className="mono">{when(d.user.created)}</dd>
                  <dt>Viimati sees</dt>
                  <dd className="mono">
                    {when(d.user.lastLogin)} {d.user.lastLogin ? `(${ago(d.user.lastLogin)})` : ''}
                  </dd>
                  <dt>Vahetusi edetabelis</dt>
                  <dd className="mono">{d.scores.length}</dd>
                  <dt>Päeva väljakutseid</dt>
                  <dd className="mono">{d.daily.length}</dd>
                  <dt>Katseid piirangu arvestuses (15 min)</dt>
                  <dd className="mono">{d.loginAttempts}</dd>
                </dl>
                <Rename user={d.user} onSave={(name) => patch({ name }, 'Nimi muudetud.')} />
              </div>
              <div className="pn-panel">
                <h2>Tegevused</h2>
                <div className="pn-acts">
                  <Act
                    title="Uus parool"
                    text="Määra parool ise või lase serveril teha. Kõik selle konto seansid lõpevad."
                    onClick={() => setAsk('password')}
                  />
                  <Act
                    title="Logi kõikjalt välja"
                    text={
                      self
                        ? 'Lõpetab ka selle seansi: pead uuesti sisse logima.'
                        : 'Lõpetab konto kõik seansid kõigis seadmetes.'
                    }
                    onClick={() => setAsk('logout')}
                  />
                  <Act
                    title="Tühista sisselogimise piirang"
                    text={
                      d.loginAttempts
                        ? `${d.loginAttempts} katset viimase 15 minuti jooksul (10 järel peab ootama).`
                        : 'Piirangusse arvestatud katseid ei ole.'
                    }
                    disabled={d.loginAttempts === 0}
                    onClick={async () => {
                      if (await run(() => api('POST', `/admin/users/${id}/unlimit`), 'Piirang tühistatud.'))
                        loaded.reload();
                    }}
                  />
                  <Act
                    title={d.user.disabled ? 'Luba konto' : 'Blokeeri konto'}
                    text={
                      self
                        ? 'Iseennast ei saa blokeerida.'
                        : d.user.disabled
                          ? 'Konto saab jälle sisse logida.'
                          : 'Konto ei saa sisse logida ja kõik seansid lõpevad.'
                    }
                    disabled={self && !d.user.disabled}
                    danger={!d.user.disabled}
                    onClick={() =>
                      d.user.disabled ? void patch({ disabled: false }, 'Konto lubatud.') : setAsk('block')
                    }
                  />
                  <Act
                    title={d.user.admin ? 'Võta admini õigused' : 'Tee adminiks'}
                    text={
                      self
                        ? 'Enda õigusi ei saa ära võtta.'
                        : d.user.admin
                          ? 'Konto jääb alles tavalise kontona.'
                          : 'Saab avada selle paneeli ja muuta kõike.'
                    }
                    disabled={self}
                    onClick={() => setAsk('admin')}
                  />
                  <Act
                    title="Kustuta konto"
                    text={
                      self
                        ? 'Iseennast siit kustutada ei saa.'
                        : 'Konto, salvestused, tulemused ja ruumikohad kaovad jäädavalt.'
                    }
                    disabled={self}
                    danger
                    onClick={() => setAsk('delete')}
                  />
                </div>
              </div>
            </div>

            <div className="pn-tabs" role="tablist">
              {(
                [
                  ['scores', `Edetabel (${d.scores.length})`],
                  ['daily', `Päeva väljakutse (${d.daily.length})`],
                  ['saves', `Salvestused (${d.saves.filter((s) => !s.deleted).length})`],
                  ['rooms', `Ruumid (${d.rooms.length})`],
                  ['log', `Logi (${d.log.length})`],
                ] as [Tab, string][]
              ).map(([t, text]) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={tab === t ? 'is-on' : undefined}
                  onClick={() => setTab(t)}
                >
                  {text}
                </button>
              ))}
            </div>
            <div className="pn-panel pn-panel--tab">
              {tab === 'scores' && (
                <>
                  <div className="pn-tabhead">
                    <button
                      type="button"
                      className="pn-btn pn-btn--small pn-btn--primary"
                      onClick={() => setAdding('score')}
                    >
                      Lisa tulemus
                    </button>
                  </div>
                  <ScoreTable rows={d.scores} showName={false} onChanged={loaded.reload} />
                </>
              )}
              {tab === 'daily' && (
                <>
                  <div className="pn-tabhead">
                    <button
                      type="button"
                      className="pn-btn pn-btn--small pn-btn--primary"
                      onClick={() => setAdding('daily')}
                    >
                      Lisa päeva tulemus
                    </button>
                  </div>
                  <DailyTable rows={d.daily} showName={false} onChanged={loaded.reload} />
                </>
              )}
              {tab === 'saves' && <Saves user={d.user} saves={d.saves} onChanged={loaded.reload} />}
              {tab === 'rooms' && <UserRooms rooms={d.rooms} />}
              {tab === 'log' && <LogTable rows={d.log} />}
            </div>

            {adding === 'score' && (
              <ScoreDialog userId={d.user.id} onClose={() => setAdding(null)} onSaved={loaded.reload} />
            )}
            {adding === 'daily' && (
              <DailyDialog userId={d.user.id} onClose={() => setAdding(null)} onSaved={loaded.reload} />
            )}
            {ask === 'password' && (
              <PasswordDialog user={d.user} onClose={() => setAsk(null)} onDone={loaded.reload} />
            )}
            {ask === 'logout' && (
              <Confirm
                title="Logi kõikjalt välja"
                text={<p>Konto {d.user.name} kõik seansid lõpevad. Mängija saab kohe uuesti sisse logida.</p>}
                button="Logi välja"
                onClose={() => setAsk(null)}
                onConfirm={() =>
                  run(() => api('POST', `/admin/users/${id}/logout`), 'Kõik seansid lõpetatud.')
                }
              />
            )}
            {ask === 'block' && (
              <Confirm
                title="Blokeeri konto"
                text={
                  <p>
                    {d.user.name} ei saa enam sisse logida ja tema seansid lõpevad kohe. Andmed jäävad alles;
                    konto saad hiljem uuesti lubada.
                  </p>
                }
                button="Blokeeri"
                onClose={() => setAsk(null)}
                onConfirm={() => patch({ disabled: true }, 'Konto blokeeritud.')}
              />
            )}
            {ask === 'admin' && (
              <Confirm
                title={d.user.admin ? 'Võta admini õigused' : 'Tee adminiks'}
                text={
                  d.user.admin ? (
                    <p>{d.user.name} ei saa enam admini paneeli avada.</p>
                  ) : (
                    <p>
                      {d.user.name} saab avada admini paneeli ja muuta kõiki kontosid, tulemusi ja salvestusi.
                      Anna õigused ainult inimesele, keda usaldad.
                    </p>
                  )
                }
                button={d.user.admin ? 'Võta ära' : 'Tee adminiks'}
                danger={!d.user.admin}
                onClose={() => setAsk(null)}
                onConfirm={() =>
                  patch(
                    { admin: !d.user.admin },
                    d.user.admin ? 'Admini õigused võetud.' : `${d.user.name} on nüüd admin.`,
                  )
                }
              />
            )}
            {ask === 'delete' && (
              <Confirm
                title="Kustuta konto"
                text={
                  <p>
                    Konto <b>{d.user.name}</b> kustub koos salvestuste, edetabeli ja päeva tulemuste ning
                    ruumikohtadega. Seda ei saa tagasi võtta (ainult varukoopiast).
                  </p>
                }
                typeToConfirm={d.user.name}
                button="Kustuta jäädavalt"
                onClose={() => setAsk(null)}
                onConfirm={async () => {
                  const ok = await run(
                    () => api('DELETE', `/admin/users/${id}`),
                    `Konto ${d.user.name} kustutatud.`,
                  );
                  if (ok) go('kontod');
                  return ok;
                }}
              />
            )}
          </>
        )}
      </LoadState>
    </section>
  );
}

function Act({
  title,
  text,
  onClick,
  disabled,
  danger,
}: {
  title: string;
  text: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`pn-act${danger ? ' pn-act--danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <b>{title}</b>
      <span>{text}</span>
    </button>
  );
}

function Rename({ user, onSave }: { user: AdminUser; onSave: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onSave(name.trim());
    setBusy(false);
  };
  return (
    <form className="pn-inline" onSubmit={submit}>
      <label className="pn-field">
        <span>Kasutajanimi</span>
        <input
          className="pn-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="off"
        />
      </label>
      <button type="submit" className="pn-btn" disabled={busy || name.trim() === user.name}>
        Nimeta ümber
      </button>
    </form>
  );
}

function PasswordDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<string | null | undefined>(undefined);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ password?: string }>('POST', `/admin/users/${user.id}/password`, { password });
      setMade(r.password ?? null);
      onDone();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };
  return (
    <Modal title={`Uus parool: ${user.name}`} onClose={onClose}>
      {made !== undefined ? (
        <div className="pn-form">
          {made ? (
            <SecretBox name={user.name} password={made} />
          ) : (
            <p>Parool on vahetatud. Kõik konto seansid lõppesid.</p>
          )}
          <div className="pn-actions">
            <button type="button" className="pn-btn pn-btn--primary" onClick={onClose}>
              Valmis
            </button>
          </div>
        </div>
      ) : (
        <form className="pn-form" onSubmit={submit}>
          <input type="text" name="username" value={user.name} autoComplete="username" readOnly hidden />
          <label className="pn-field">
            <span>Uus parool</span>
            <input
              className="pn-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Tühi: server teeb tugeva parooli"
              autoFocus
            />
            <small>Vähemalt 8 märki. Konto kõik seansid lõpevad ja sisselogimise piirang kaob.</small>
          </label>
          {error && <p className="pn-error">{error}</p>}
          <div className="pn-actions">
            <button type="button" className="pn-btn" onClick={onClose}>
              Loobu
            </button>
            <button type="submit" className="pn-btn pn-btn--primary" disabled={busy}>
              {password ? 'Määra parool' : 'Tee uus parool'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- cloud saves

function Saves({
  user,
  saves,
  onChanged,
}: {
  user: AdminUser;
  saves: UserDetail['saves'];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const run = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadSlot, setUploadSlot] = useState('');
  const bySlot = new Map(saves.map((s) => [s.slot, s]));
  return (
    <>
      <p className="pn-hint">
        Pilvesalvestused, nagu mäng need saatis. Muudetud salvestus jõuab mängija seadmetesse järgmisel
        sünkroonimisel. Enne suurt muudatust laadi koopia alla.
      </p>
      <div className="pn-scroll">
        <table className="pn-table">
          <thead>
            <tr>
              <th>Koht</th>
              <th>Muudetud</th>
              <th className="num">Maht</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {Object.entries(SAVE_SLOTS).map(([slot, name]) => {
              const s = bySlot.get(slot);
              const has = s && !s.deleted;
              return (
                <tr key={slot}>
                  <td>
                    {name} <span className="mono dim">{slot}</span>
                  </td>
                  <td className="mono">{s ? when(s.updated) : ''}</td>
                  <td className="num">{has ? bytes(s.bytes) : s ? 'kustutatud' : 'pole'}</td>
                  <td className="pn-rowact">
                    {has && (
                      <>
                        <button type="button" className="pn-btn pn-btn--small" onClick={() => setOpen(slot)}>
                          Vaata ja muuda
                        </button>
                        <button
                          type="button"
                          className="pn-btn pn-btn--small"
                          onClick={() =>
                            void run(async () => {
                              const r = await readSave(user.id, slot);
                              download(`${user.name}-${slot}.json`, r.text);
                            })
                          }
                        >
                          Laadi alla
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="pn-btn pn-btn--small"
                      onClick={() => {
                        setUploadSlot(slot);
                        fileRef.current?.click();
                      }}
                    >
                      Laadi fail üles
                    </button>
                    {has && (
                      <button
                        type="button"
                        className="pn-btn pn-btn--small pn-btn--ghostbad"
                        onClick={() => setDeleting(slot)}
                      >
                        Kustuta
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file || !uploadSlot) return;
          const text = await file.text();
          if (
            await run(
              () => writeSave(user.id, uploadSlot, text.trim()),
              `Fail salvestatud kohta ${label(SAVE_SLOTS, uploadSlot)}.`,
            )
          )
            onChanged();
        }}
      />
      {open && <SaveEditor user={user} slot={open} onClose={() => setOpen(null)} onSaved={onChanged} />}
      {deleting && (
        <Confirm
          title="Kustuta salvestus"
          text={
            <p>
              Kustutan konto {user.name} salvestuse <b>{label(SAVE_SLOTS, deleting)}</b>. Mängija seadmed
              näevad kustutamist järgmisel sünkroonimisel. Laadi enne koopia alla, kui seda võib vaja minna.
            </p>
          }
          button="Kustuta"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const ok = await run(
              () => api('DELETE', `/admin/users/${user.id}/saves/${deleting}`),
              'Salvestus kustutatud.',
            );
            if (ok) onChanged();
            return ok;
          }}
        />
      )}
    </>
  );
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SaveEditor({
  user,
  slot,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  slot: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const loaded = useLoad(() => readSave(user.id, slot), `save:${user.id}:${slot}`);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useAction();
  const value = text ?? (loaded.data ? pretty(loaded.data.text) : '');
  const save = async () => {
    setError('');
    let compact: string;
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        return setError('Salvestus peab olema JSON-objekt ({ ... }).');
      compact = JSON.stringify(parsed);
    } catch (e) {
      return setError(`Vigane JSON: ${e instanceof Error ? e.message : ''}`);
    }
    setBusy(true);
    const ok = await run(() => writeSave(user.id, slot, compact), 'Salvestus muudetud.');
    setBusy(false);
    if (ok) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal title={`${label(SAVE_SLOTS, slot)}: ${user.name}`} onClose={onClose} wide>
      <LoadState loaded={loaded}>
        <div className="pn-form">
          <p className="pn-hint">
            Versioon {loaded.data?.updated ? when(loaded.data.updated) : ''},{' '}
            {bytes(loaded.data?.text.length ?? 0)}. Muuda ainult välju, mille tähendust tead: vigane salvestus
            võib mängija karjääri rikkuda.
          </p>
          <textarea
            className="pn-input pn-code"
            value={value}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
          {error && <p className="pn-error">{error}</p>}
          <div className="pn-actions">
            <button type="button" className="pn-btn" onClick={() => setText(pretty(value))}>
              Vorminda
            </button>
            <span className="pn-spacer" />
            <button type="button" className="pn-btn" onClick={onClose}>
              Loobu
            </button>
            <button
              type="button"
              className="pn-btn pn-btn--primary"
              onClick={save}
              disabled={busy || text === null}
            >
              Salvesta
            </button>
          </div>
        </div>
      </LoadState>
    </Modal>
  );
}

/** Indented JSON for reading; a save too big to indent comfortably (over 1 MB) stays as it is. */
function pretty(text: string): string {
  if (text.length > 1024 * 1024) return text;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function UserRooms({ rooms }: { rooms: UserDetail['rooms'] }) {
  return (
    <div className="pn-scroll">
      <table className="pn-table">
        <thead>
          <tr>
            <th>Kood</th>
            <th>Režiim</th>
            <th>Olek</th>
            <th>Piirkond</th>
            <th>Loodud</th>
            <th className="num">Koht</th>
            <th className="num">Tulemus</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.code}>
              <td className="mono">
                <a href={`#/ruumid/${r.code}`}>{r.code}</a>
              </td>
              <td>{label(ROOM_MODES, r.mode)}</td>
              <td>
                {label(ROOM_STATES, r.state)}
                {r.left ? ', lahkus' : ''}
              </td>
              <td>{label(REGIONS, r.regionId)}</td>
              <td className="mono">{when(r.created)}</td>
              <td className="num">{r.seat + 1}</td>
              <td className="num">{r.score ?? ''}</td>
            </tr>
          ))}
          {rooms.length === 0 && (
            <tr>
              <td colSpan={7} className="pn-empty">
                Ruume ei ole.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
