// Logi: what the admins did, newest first (admin_log, server/lib/admin.php).
import { useState } from 'react';
import { api, qs, type LogEntry } from '../api';
import { ACTIONS, label, when } from '../labels';
import { LoadState, Pager, Select, useLoad } from '../ui';

const LIMIT = 100;

export function LogPage() {
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);
  const path = `/admin/log${qs({ action, limit: LIMIT, offset })}`;
  const loaded = useLoad(() => api<{ total: number; log: LogEntry[] }>('GET', path), path);
  return (
    <section>
      <div className="pn-head">
        <h1>Logi</h1>
        <button type="button" className="pn-btn pn-btn--small" onClick={loaded.reload}>
          Värskenda
        </button>
      </div>
      <p className="pn-hint">
        Iga admini muudatus jääb siia: kes, millal, mida ja millise IP-aadressiga. Logi ei saa paneelist muuta
        ega kustutada.
      </p>
      <div className="pn-filters">
        <Select
          label="Tegevus"
          value={action}
          options={ACTIONS}
          all="Kõik tegevused"
          onChange={(v) => {
            setAction(v);
            setOffset(0);
          }}
        />
      </div>
      <LoadState loaded={loaded}>
        {loaded.data && (
          <>
            <LogTable rows={loaded.data.log} />
            <Pager total={loaded.data.total} limit={LIMIT} offset={offset} onOffset={setOffset} />
          </>
        )}
      </LoadState>
    </section>
  );
}

/** "user:12" -> a link to the account, "room:ABC234" to the room. */
function Target({ target }: { target: string }) {
  const [kind, id] = target.split(':');
  if (kind === 'user' && id) return <a href={`#/kontod/${id}`}>konto {id}</a>;
  if (kind === 'room' && id) return <a href={`#/ruumid/${id}`}>ruum {id}</a>;
  return <span className="mono">{target}</span>;
}

function Detail({ detail }: { detail: unknown }) {
  if (detail === null || detail === undefined) return null;
  if (typeof detail !== 'object') return <span className="mono">{String(detail)}</span>;
  return (
    <span className="pn-kv">
      {Object.entries(detail as Record<string, unknown>).map(([k, v]) => (
        <span key={k}>
          <i>{k}</i> {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}
        </span>
      ))}
    </span>
  );
}

export function LogTable({ rows }: { rows: LogEntry[] }) {
  return (
    <div className="pn-scroll">
      <table className="pn-table">
        <thead>
          <tr>
            <th>Aeg</th>
            <th>Admin</th>
            <th>Tegevus</th>
            <th>Mille kallal</th>
            <th>Üksikasjad</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} className={l.action === 'unlock_failed' ? 'is-bad' : undefined}>
              <td className="mono">{when(l.at)}</td>
              <td>{l.adminId ? <a href={`#/kontod/${l.adminId}`}>{l.admin}</a> : l.admin}</td>
              <td>{label(ACTIONS, l.action)}</td>
              <td>{l.target && <Target target={l.target} />}</td>
              <td>
                <Detail detail={l.detail} />
              </td>
              <td className="mono">{l.ip}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="pn-empty">
                Logi on tühi.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
