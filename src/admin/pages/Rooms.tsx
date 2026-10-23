// Ruumid: multiplayer rooms by state; one room's players and results, close it, delete it, drop a result.
import { useState } from 'react';
import { api, qs, type Room } from '../api';
import { DIFFICULTIES, REGIONS, ROOM_MODES, ROOM_STATES, ago, label, when } from '../labels';
import { Badge, Confirm, LoadState, Modal, Pager, Select, useAction, useLoad } from '../ui';
import { go } from '../nav';

const LIMIT = 50;

export function Rooms({ code }: { code?: string }) {
  const [state, setState] = useState('');
  const [offset, setOffset] = useState(0);
  const path = `/admin/rooms${qs({ state, limit: LIMIT, offset })}`;
  const loaded = useLoad(() => api<{ total: number; rooms: Room[] }>('GET', path), path);
  return (
    <section>
      <div className="pn-head">
        <h1>Ruumid</h1>
        <button type="button" className="pn-btn pn-btn--small" onClick={loaded.reload}>
          Värskenda
        </button>
      </div>
      <div className="pn-filters">
        <Select
          label="Olek"
          value={state}
          options={ROOM_STATES}
          all="Kõik olekud"
          onChange={(v) => {
            setState(v);
            setOffset(0);
          }}
        />
      </div>
      <LoadState loaded={loaded}>
        {loaded.data && (
          <>
            <div className="pn-scroll">
              <table className="pn-table pn-table--click">
                <thead>
                  <tr>
                    <th>Kood</th>
                    <th>Režiim</th>
                    <th>Olek</th>
                    <th>Piirkond</th>
                    <th>Võõrustaja</th>
                    <th className="num">Mängijaid</th>
                    <th>Loodud</th>
                    <th>Viimati muutus</th>
                  </tr>
                </thead>
                <tbody>
                  {loaded.data.rooms.map((r) => (
                    <tr key={r.code} onClick={() => go(`ruumid/${r.code}`)}>
                      <td className="mono">
                        <a href={`#/ruumid/${r.code}`} onClick={(e) => e.stopPropagation()}>
                          {r.code}
                        </a>
                      </td>
                      <td>{label(ROOM_MODES, r.mode)}</td>
                      <td>
                        <StateBadge state={r.state} />
                      </td>
                      <td>{label(REGIONS, r.regionId)}</td>
                      <td>{r.host ?? ''}</td>
                      <td className="num">{r.players ?? ''}</td>
                      <td className="mono">{when(r.created)}</td>
                      <td className="mono">{ago(r.updated)}</td>
                    </tr>
                  ))}
                  {loaded.data.rooms.length === 0 && (
                    <tr>
                      <td colSpan={8} className="pn-empty">
                        Ruume ei ole.
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
      {code && <RoomDialog code={code} onClose={() => go('ruumid')} onChanged={loaded.reload} />}
    </section>
  );
}

function StateBadge({ state }: { state: string }) {
  const kind = state === 'running' ? 'ok' : state === 'lobby' ? 'acc' : 'dim';
  return <Badge kind={kind}>{label(ROOM_STATES, state)}</Badge>;
}

interface RoomDetail {
  room: Room;
  players: {
    id: number;
    name: string;
    seat: number;
    ready: boolean;
    left: boolean;
    seen: number;
    role: string;
    desk: string;
  }[];
  results: {
    id: number;
    name: string;
    score: number;
    grade: string;
    incidents: number;
    arrests: number;
    xp: number;
    at: number;
    rank: number;
  }[];
}

function RoomDialog({
  code,
  onClose,
  onChanged,
}: {
  code: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const loaded = useLoad(() => api<RoomDetail>('GET', `/admin/rooms/${code}`), `room:${code}`);
  const [ask, setAsk] = useState<'close' | 'delete' | { id: number; name: string } | null>(null);
  const run = useAction();
  const d = loaded.data;
  const changed = () => {
    loaded.reload();
    onChanged();
  };
  return (
    <Modal title={`Ruum ${code}`} onClose={onClose} wide>
      <LoadState loaded={loaded}>
        {d && (
          <div className="pn-form">
            <dl className="pn-dl pn-dl--cols">
              <dt>Režiim</dt>
              <dd>{label(ROOM_MODES, d.room.mode)}</dd>
              <dt>Olek</dt>
              <dd>
                <StateBadge state={d.room.state} />
              </dd>
              <dt>Piirkond</dt>
              <dd>
                {label(REGIONS, d.room.regionId)}
                {d.room.sector ? `, ${d.room.sector}` : ''}
              </dd>
              <dt>Raskus, tunnid</dt>
              <dd>
                {label(DIFFICULTIES, d.room.difficulty)}, {d.room.hours} h
              </dd>
              <dt>Mootor</dt>
              <dd>
                {d.room.engine === 'mp'
                  ? 'mänguserver'
                  : d.room.mode === 'race'
                    ? 'iga mängija oma'
                    : 'brauserid'}
              </dd>
              <dt>Loodud</dt>
              <dd className="mono">{when(d.room.created)}</dd>
              <dt>Algas</dt>
              <dd className="mono">{when(d.room.started)}</dd>
              <dt>Võõrustaja</dt>
              <dd>{d.room.host ?? ''}</dd>
            </dl>
            <h3>Mängijad</h3>
            <div className="pn-scroll">
              <table className="pn-table">
                <thead>
                  <tr>
                    <th className="num">Koht</th>
                    <th>Mängija</th>
                    <th>Roll või laud</th>
                    <th>Valmis</th>
                    <th>Viimati nähtud</th>
                  </tr>
                </thead>
                <tbody>
                  {d.players.map((p) => (
                    <tr key={p.id} className={p.left ? 'is-dim' : undefined}>
                      <td className="num">{p.seat + 1}</td>
                      <td>
                        <a href={`#/kontod/${p.id}`}>{p.name}</a>
                        {p.left ? ' (lahkus)' : ''}
                      </td>
                      <td className="mono">{p.role || p.desk}</td>
                      <td>{p.ready ? 'jah' : ''}</td>
                      <td className="mono">{ago(p.seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Tulemused</h3>
            {d.results.length === 0 ? (
              <p className="pn-empty">Tulemusi pole.</p>
            ) : (
              <div className="pn-scroll">
                <table className="pn-table">
                  <thead>
                    <tr>
                      <th className="num">Koht</th>
                      <th>Mängija</th>
                      <th className="num">Skoor</th>
                      <th>Hinne</th>
                      <th className="num">Sündmusi</th>
                      <th className="num">XP</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.results.map((r) => (
                      <tr key={r.id}>
                        <td className="num">{r.rank}</td>
                        <td>{r.name}</td>
                        <td className="num strong">{r.score}</td>
                        <td className="mono">{r.grade}</td>
                        <td className="num">{r.incidents}</td>
                        <td className="num">{r.xp}</td>
                        <td className="pn-rowact">
                          <button
                            type="button"
                            className="pn-btn pn-btn--small pn-btn--ghostbad"
                            onClick={() => setAsk({ id: r.id, name: r.name })}
                          >
                            Kustuta
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pn-actions">
              {(d.room.state === 'lobby' || d.room.state === 'running') && (
                <button type="button" className="pn-btn" onClick={() => setAsk('close')}>
                  Sulge ruum
                </button>
              )}
              <button type="button" className="pn-btn pn-btn--danger" onClick={() => setAsk('delete')}>
                Kustuta ruum
              </button>
            </div>
          </div>
        )}
      </LoadState>
      {ask === 'close' && (
        <Confirm
          title="Sulge ruum"
          text={
            <p>
              Ruum {code} suletakse: ootel mängijad näevad seda kohe, käimasolev ühisvahetus lõpeb. Tulemused
              jäävad alles.
            </p>
          }
          button="Sulge"
          onClose={() => setAsk(null)}
          onConfirm={async () => {
            const ok = await run(() => api('POST', `/admin/rooms/${code}/close`), 'Ruum suletud.');
            if (ok) changed();
            return ok;
          }}
        />
      )}
      {ask === 'delete' && (
        <Confirm
          title="Kustuta ruum"
          text={<p>Ruum {code} kustub koos mängijate, tulemuste ja käikudega. Seda ei saa tagasi võtta.</p>}
          button="Kustuta"
          onClose={() => setAsk(null)}
          onConfirm={async () => {
            const ok = await run(() => api('DELETE', `/admin/rooms/${code}`), 'Ruum kustutatud.');
            if (ok) {
              onChanged();
              onClose();
            }
            return ok;
          }}
        />
      )}
      {ask && typeof ask === 'object' && (
        <Confirm
          title="Kustuta ruumi tulemus"
          text={
            <p>
              Kustutan mängija {ask.name} tulemuse ruumi {code} tabelist.
            </p>
          }
          button="Kustuta"
          onClose={() => setAsk(null)}
          onConfirm={async () => {
            const ok = await run(
              () => api('DELETE', `/admin/rooms/${code}/results/${ask.id}`),
              'Tulemus kustutatud.',
            );
            if (ok) changed();
            return ok;
          }}
        />
      )}
    </Modal>
  );
}
