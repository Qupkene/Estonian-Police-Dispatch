import { useMemo, useState, type ReactNode } from 'react';
import { useGame } from '@/store/game';
import { useT, useTx } from '@/i18n';
import { Icon, Panel } from '@/ui/components';
import { haversineKm } from '@/sim/geo';
import type { SimState, Unit, UnitType } from '@/sim/types';
import { selectIncident, selectUnit } from './actions';
import { selRecs, selRegion, soft } from './data';
import { countdown, sortUnits, unitEtaMin, type UnitSortKey } from './format';
import { StatusCode, StatusDot, UnitTypeIcon, useSim } from './bits';

type StatusFilter = 'all' | 'free' | 'committed';

const COLS: { key: UnitSortKey | null; label: string; cls: string }[] = [
  { key: 'status', label: 'game.board.status', cls: 'st' },
  { key: 'callsign', label: 'game.board.callsign', cls: 'cs' },
  { key: 'type', label: 'game.board.type', cls: 'ty' },
  { key: null, label: 'game.board.task', cls: 'task' },
  { key: 'eta', label: 'game.board.eta', cls: 'eta' },
  { key: 'fatigue', label: 'game.board.fatigue', cls: 'fat' },
];

export function UnitBoard() {
  const sim = useSim();
  const t = useT();
  const selectedUnit = useGame((s) => s.selection.unitId);
  const selectedInc = useGame((s) => s.selection.incidentId);
  const [sort, setSort] = useState<{ key: UnitSortKey; dir: 1 | -1 }>({ key: 'status', dir: 1 });
  const [status, setStatus] = useState<StatusFilter>('all');
  const [type, setType] = useState<UnitType | 'all'>('all');

  const types = useMemo(() => {
    if (!sim) return [] as UnitType[];
    return Array.from(new Set(sim.unitOrder.map((id) => sim.units[id]?.type).filter(Boolean))) as UnitType[];
    // unit roster does not change during a shift
  }, [sim]);

  if (!sim) return null;
  const all = sim.unitOrder.map((id) => sim.units[id]).filter((u): u is Unit => !!u && u.status !== 'offduty');
  const free = all.filter((u) => u.status === 'available').length;
  const filtered = all.filter(
    (u) =>
      (type === 'all' || u.type === type) &&
      (status === 'all' || (status === 'free' ? u.status === 'available' : u.status !== 'available' && u.status !== 'break')),
  );
  const rows = sortUnits(filtered, sort.key, sort.dir, sim.now);
  const recIds = new Set(
    selectedInc && sim.incidents[selectedInc]?.state !== 'closed'
      ? soft('boardRecs', () => selRecs(sim, selectedInc).filter((r) => r.fit === 'ideal' || r.fit === 'need').slice(0, 3).map((r) => r.unit.id), [])
      : [],
  );

  const head = (
    <div className="gm-board__filters">
      <div className="gm-seg" role="group">
        {(['all', 'free', 'committed'] as StatusFilter[]).map((f) => (
          <button key={f} type="button" className={`gm-seg__btn${status === f ? ' is-active' : ''}`} onClick={() => setStatus(f)}>
            {f === 'all' ? t('game.board.allStatus') : f === 'free' ? `${t('game.board.free')} ${free}` : t('game.board.committed')}
          </button>
        ))}
      </div>
      <select className="gm-board__type" value={type} onChange={(e) => setType(e.target.value as UnitType | 'all')} aria-label={t('game.board.type')}>
        <option value="all">{t('game.board.allTypes')}</option>
        {types.map((ty) => (
          <option key={ty} value={ty}>
            {t(`game.utype.${ty}`)}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Panel className="gm-board" bodyClassName="gm-board__body" icon="car" title={`${t('game.board.title')} · ${free}/${all.length}`} actions={head}>
      <table className="gm-table">
        <thead>
          <tr>
            {COLS.map((c) => (
              <th
                key={c.cls}
                className={`gm-table__${c.cls}${c.key && sort.key === c.key ? ' is-sorted' : ''}`}
                onClick={() => c.key && setSort({ key: c.key, dir: sort.key === c.key ? (sort.dir === 1 ? -1 : 1) : 1 })}
                aria-sort={c.key && sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
              >
                {t(c.label)}
                {c.key && sort.key === c.key && <Icon name={sort.dir === 1 ? 'chevron-down' : 'chevron-right'} size={10} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLS.length} className="gm-table__empty">
                {t('game.board.empty')}
              </td>
            </tr>
          )}
          {rows.map((u) => (
            <BoardRow key={u.id} sim={sim} u={u} selected={u.id === selectedUnit} recommended={recIds.has(u.id)} />
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function BoardRow({ sim, u, selected, recommended }: { sim: SimState; u: Unit; selected: boolean; recommended: boolean }) {
  const t = useT();
  const tx = useTx();
  const inc = u.incidentId ? sim.incidents[u.incidentId] : undefined;
  const eta = unitEtaMin(u, sim.now);
  const fat = u.fatigue;
  let task: ReactNode;
  if (inc) {
    task = (
      <button
        type="button"
        className={`gm-board__inc gm-board__inc--p${inc.priority}`}
        onClick={(e) => {
          e.stopPropagation();
          selectIncident(inc.id);
        }}
      >
        <b className="mono">{inc.code}</b> {inc.location.address}
      </button>
    );
  } else if (u.move) {
    task = <span className="muted">{t(`game.move.${u.move.purpose}`)}</span>;
  } else {
    const region = selRegion(sim);
    const st = region.stations.find((s) => s.id === u.stationId);
    const atBase = st ? haversineKm(st.coord, u.pos) < 0.3 : false;
    task = (
      <span className="muted">
        {u.onCall ? t('game.unit.onCall') : atBase ? `${st?.short ?? ''} · ${t('game.board.atBase')}` : t('game.board.patrolNear', { p: st?.short ?? tx(st?.name) })}
      </span>
    );
  }
  return (
    <tr
      className={`gm-row gm-row--${u.status}${selected ? ' is-selected' : ''}${recommended ? ' is-rec' : ''}`}
      onClick={() => selectUnit(u.id)}
      onDoubleClick={() => selectUnit(u.id, { focus: true })}
    >
      <td className="gm-table__st">
        <StatusCode status={u.status} />
        <span className="gm-row__stlabel">
          <StatusDot status={u.status} />
          {t(`game.status.${u.status}`)}
        </span>
      </td>
      <td className="gm-table__cs mono">
        {u.callsign}
        {recommended && <Icon name="target" size={10} className="gm-row__rec" />}
      </td>
      <td className="gm-table__ty" title={t(`game.utype.${u.type}`)}>
        <UnitTypeIcon type={u.type} size={12} />
        <span>{t(`game.ushort.${u.type}`)}</span>
      </td>
      <td className="gm-table__task">{task}</td>
      <td className="gm-table__eta mono">{eta !== null ? countdown(eta) : ''}</td>
      <td className="gm-table__fat">
        <span className={`gm-fat${fat > 0.8 ? ' is-high' : fat > 0.55 ? ' is-mid' : ''}`}>
          <i style={{ width: `${Math.round(Math.min(1, fat) * 100)}%` }} />
        </span>
      </td>
    </tr>
  );
}
