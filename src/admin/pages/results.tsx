// Leaderboard and daily challenge results: the tables and the add/edit dialogs, shared by the Edetabel and Päeva
// väljakutse pages and an account's page.
import { useState, type FormEvent } from 'react';
import { api, findUser, type Daily, type Score } from '../api';
import {
  DIFFICULTIES,
  GRADES,
  MODES,
  REGIONS,
  fromLocalInput,
  label,
  tallinnToday,
  toLocalInput,
  when,
} from '../labels';
import { Confirm, Modal, errorText, useAction, useNotice } from '../ui';

const GRADE_OPTIONS = Object.fromEntries(GRADES.map((g) => [g, g]));

// ---------------------------------------------------------------- leaderboard

export function ScoreTable({
  rows,
  showName,
  onChanged,
}: {
  rows: Score[];
  showName: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Score | null>(null);
  const [deleting, setDeleting] = useState<Score | null>(null);
  const run = useAction();
  return (
    <div className="pn-scroll">
      <table className="pn-table">
        <thead>
          <tr>
            {showName && <th>Mängija</th>}
            <th className="num">Skoor</th>
            <th>Hinne</th>
            <th>Piirkond</th>
            <th>Režiim</th>
            <th>Raskus</th>
            <th className="num">Sündmusi</th>
            <th className="num">Vahistamisi</th>
            <th>Aeg</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              {showName && (
                <td>
                  <a href={`#/kontod/${s.userId}`}>{s.name}</a>
                </td>
              )}
              <td className="num strong">{s.score}</td>
              <td className="mono">{s.grade}</td>
              <td>{label(REGIONS, s.regionId)}</td>
              <td>{label(MODES, s.mode)}</td>
              <td>{label(DIFFICULTIES, s.difficulty)}</td>
              <td className="num">{s.incidents}</td>
              <td className="num">{s.arrests}</td>
              <td className="mono">{when(s.at)}</td>
              <td className="pn-rowact">
                <button type="button" className="pn-btn pn-btn--small" onClick={() => setEditing(s)}>
                  Muuda
                </button>
                <button
                  type="button"
                  className="pn-btn pn-btn--small pn-btn--ghostbad"
                  onClick={() => setDeleting(s)}
                >
                  Kustuta
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={showName ? 10 : 9} className="pn-empty">
                Tulemusi ei ole.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {editing && <ScoreDialog score={editing} onClose={() => setEditing(null)} onSaved={onChanged} />}
      {deleting && (
        <Confirm
          title="Kustuta tulemus"
          text={
            <p>
              Kustutan {deleting.name ? <b>{deleting.name}</b> : 'mängija'} tulemuse {deleting.score} (
              {label(REGIONS, deleting.regionId)}, {when(deleting.at)}). Edetabelist kaob see kohe.
            </p>
          }
          button="Kustuta"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const ok = await run(() => api('DELETE', `/admin/scores/${deleting.id}`), 'Tulemus kustutatud.');
            if (ok) onChanged();
            return ok;
          }}
        />
      )}
    </div>
  );
}

/** Add (no `score`; `userId` or a name to look up) or edit a leaderboard result. */
export function ScoreDialog({
  score,
  userId,
  userName,
  onClose,
  onSaved,
}: {
  score?: Score;
  userId?: number;
  userName?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const now = Date.now();
  const [who, setWho] = useState(userName ?? '');
  const [f, setF] = useState({
    regionId: score?.regionId ?? 'pohja',
    mode: score?.mode ?? 'career',
    difficulty: score?.difficulty ?? 'normal',
    score: String(score?.score ?? 70),
    grade: score?.grade ?? 'B',
    incidents: String(score?.incidents ?? 20),
    arrests: String(score?.arrests ?? 0),
    at: toLocalInput(score?.at ?? now),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const notice = useNotice();
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const at = fromLocalInput(f.at);
    if (at === null) return setError('Vigane aeg.');
    const body = {
      regionId: f.regionId,
      mode: f.mode,
      difficulty: f.difficulty,
      score: Number(f.score),
      grade: f.grade,
      incidents: Number(f.incidents),
      arrests: Number(f.arrests),
      at,
    };
    setBusy(true);
    try {
      if (score) {
        await api('PATCH', `/admin/scores/${score.id}`, body);
      } else {
        const uid = userId ?? (await findUser(who))?.id;
        if (!uid) {
          setBusy(false);
          return setError(`Kontot "${who}" ei ole.`);
        }
        await api('POST', '/admin/scores', { ...body, userId: uid, start: at });
      }
    } catch (err) {
      setBusy(false);
      return setError(errorText(err));
    }
    notice('ok', score ? 'Tulemus muudetud.' : 'Tulemus lisatud.');
    onSaved();
    onClose();
  };
  return (
    <Modal
      title={score ? `Muuda tulemust (${score.name ?? 'mängija'})` : 'Lisa tulemus edetabelisse'}
      onClose={onClose}
    >
      <form className="pn-form pn-form--grid" onSubmit={submit}>
        {!score && userId === undefined && (
          <Field label="Mängija (kasutajanimi)" wide>
            <input
              className="pn-input"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              required
              autoFocus
            />
          </Field>
        )}
        <Field label="Skoor (0 kuni 100)">
          <input
            className="pn-input"
            type="number"
            min={0}
            max={100}
            value={f.score}
            onChange={(e) => set('score')(e.target.value)}
            required
          />
        </Field>
        <Field label="Hinne">
          <Pick value={f.grade} options={GRADE_OPTIONS} onChange={set('grade')} />
        </Field>
        <Field label="Piirkond">
          <Pick value={f.regionId} options={REGIONS} onChange={set('regionId')} />
        </Field>
        <Field label="Režiim">
          <Pick value={f.mode} options={MODES} onChange={set('mode')} />
        </Field>
        <Field label="Raskus">
          <Pick value={f.difficulty} options={DIFFICULTIES} onChange={set('difficulty')} />
        </Field>
        <Field label="Aeg">
          <input
            className="pn-input"
            type="datetime-local"
            value={f.at}
            onChange={(e) => set('at')(e.target.value)}
            required
          />
        </Field>
        <Field label="Sündmusi">
          <input
            className="pn-input"
            type="number"
            min={0}
            max={100000}
            value={f.incidents}
            onChange={(e) => set('incidents')(e.target.value)}
            required
          />
        </Field>
        <Field label="Vahistamisi">
          <input
            className="pn-input"
            type="number"
            min={0}
            max={100000}
            value={f.arrests}
            onChange={(e) => set('arrests')(e.target.value)}
            required
          />
        </Field>
        {(f.mode === 'director' || f.mode === 'tutorial') && (
          <p className="pn-hint pn-wide">Režissööri ja õppevahetuse tulemusi avalik edetabel ei näita.</p>
        )}
        {error && <p className="pn-error pn-wide">{error}</p>}
        <div className="pn-actions pn-wide">
          <button type="button" className="pn-btn" onClick={onClose}>
            Loobu
          </button>
          <button type="submit" className="pn-btn pn-btn--primary" disabled={busy}>
            {score ? 'Salvesta' : 'Lisa'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- daily challenge

export function DailyTable({
  rows,
  showName,
  onChanged,
}: {
  rows: Daily[];
  showName: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Daily | null>(null);
  const [deleting, setDeleting] = useState<Daily | null>(null);
  const run = useAction();
  return (
    <div className="pn-scroll">
      <table className="pn-table">
        <thead>
          <tr>
            <th>Päev</th>
            {showName && <th>Mängija</th>}
            <th className="num">Skoor</th>
            <th>Hinne</th>
            <th>Piirkond</th>
            <th>Sektor</th>
            <th className="num">Sündmusi</th>
            <th className="num">Vahistamisi</th>
            <th>Saadetud</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td className="mono">{d.day}</td>
              {showName && (
                <td>
                  <a href={`#/kontod/${d.userId}`}>{d.name}</a>
                </td>
              )}
              <td className="num strong">{d.score}</td>
              <td className="mono">{d.grade}</td>
              <td>{label(REGIONS, d.regionId)}</td>
              <td className="mono">{d.sector}</td>
              <td className="num">{d.incidents}</td>
              <td className="num">{d.arrests}</td>
              <td className="mono">{when(d.at)}</td>
              <td className="pn-rowact">
                <button type="button" className="pn-btn pn-btn--small" onClick={() => setEditing(d)}>
                  Muuda
                </button>
                <button
                  type="button"
                  className="pn-btn pn-btn--small pn-btn--ghostbad"
                  onClick={() => setDeleting(d)}
                >
                  Kustuta
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={showName ? 10 : 9} className="pn-empty">
                Tulemusi ei ole.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {editing && <DailyDialog daily={editing} onClose={() => setEditing(null)} onSaved={onChanged} />}
      {deleting && (
        <Confirm
          title="Kustuta päeva tulemus"
          text={
            <p>
              Kustutan {deleting.name ? <b>{deleting.name}</b> : 'mängija'} päeva {deleting.day} tulemuse{' '}
              {deleting.score}. Mängija saab selle päeva väljakutset siis uuesti mängida.
            </p>
          }
          button="Kustuta"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const ok = await run(
              () => api('DELETE', `/admin/daily/${deleting.id}`),
              'Päeva tulemus kustutatud.',
            );
            if (ok) onChanged();
            return ok;
          }}
        />
      )}
    </div>
  );
}

export function DailyDialog({
  daily,
  userId,
  userName,
  onClose,
  onSaved,
}: {
  daily?: Daily;
  userId?: number;
  userName?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [who, setWho] = useState(userName ?? '');
  const [f, setF] = useState({
    day: daily?.day ?? tallinnToday(),
    regionId: daily?.regionId ?? 'pohja',
    sector: daily?.sector ?? '',
    score: String(daily?.score ?? 70),
    grade: daily?.grade ?? 'B',
    incidents: String(daily?.incidents ?? 20),
    arrests: String(daily?.arrests ?? 0),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const notice = useNotice();
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const body = {
      day: f.day,
      regionId: f.regionId,
      sector: f.sector.trim(),
      score: Number(f.score),
      grade: f.grade,
      incidents: Number(f.incidents),
      arrests: Number(f.arrests),
    };
    setBusy(true);
    try {
      if (daily) {
        await api('PATCH', `/admin/daily/${daily.id}`, body);
      } else {
        const uid = userId ?? (await findUser(who))?.id;
        if (!uid) {
          setBusy(false);
          return setError(`Kontot "${who}" ei ole.`);
        }
        await api('POST', '/admin/daily', { ...body, userId: uid });
      }
    } catch (err) {
      setBusy(false);
      return setError(errorText(err));
    }
    notice('ok', daily ? 'Päeva tulemus muudetud.' : 'Päeva tulemus lisatud.');
    onSaved();
    onClose();
  };
  return (
    <Modal
      title={daily ? `Muuda päeva tulemust (${daily.name ?? 'mängija'})` : 'Lisa päeva väljakutse tulemus'}
      onClose={onClose}
    >
      <form className="pn-form pn-form--grid" onSubmit={submit}>
        {!daily && userId === undefined && (
          <Field label="Mängija (kasutajanimi)" wide>
            <input
              className="pn-input"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              required
              autoFocus
            />
          </Field>
        )}
        <Field label="Päev">
          <input
            className="pn-input"
            type="date"
            value={f.day}
            onChange={(e) => set('day')(e.target.value)}
            required
          />
        </Field>
        <Field label="Skoor (0 kuni 100)">
          <input
            className="pn-input"
            type="number"
            min={0}
            max={100}
            value={f.score}
            onChange={(e) => set('score')(e.target.value)}
            required
          />
        </Field>
        <Field label="Hinne">
          <Pick value={f.grade} options={GRADE_OPTIONS} onChange={set('grade')} />
        </Field>
        <Field label="Piirkond">
          <Pick value={f.regionId} options={REGIONS} onChange={set('regionId')} />
        </Field>
        <Field label="Sektor (valikuline)">
          <input
            className="pn-input"
            value={f.sector}
            onChange={(e) => set('sector')(e.target.value)}
            placeholder="nt pohja-kesklinn"
            pattern="[a-z0-9][a-z0-9\-]{0,47}"
          />
        </Field>
        <Field label="Sündmusi">
          <input
            className="pn-input"
            type="number"
            min={0}
            max={100000}
            value={f.incidents}
            onChange={(e) => set('incidents')(e.target.value)}
            required
          />
        </Field>
        <Field label="Vahistamisi">
          <input
            className="pn-input"
            type="number"
            min={0}
            max={100000}
            value={f.arrests}
            onChange={(e) => set('arrests')(e.target.value)}
            required
          />
        </Field>
        {error && <p className="pn-error pn-wide">{error}</p>}
        <div className="pn-actions pn-wide">
          <button type="button" className="pn-btn" onClick={onClose}>
            Loobu
          </button>
          <button type="submit" className="pn-btn pn-btn--primary" disabled={busy}>
            {daily ? 'Salvesta' : 'Lisa'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- bits

function Field({
  label: text,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`pn-field${wide ? ' pn-wide' : ''}`}>
      <span>{text}</span>
      {children}
    </label>
  );
}

function Pick({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <select className="pn-input" value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(options).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}
