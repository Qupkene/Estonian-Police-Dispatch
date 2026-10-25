import { useGame } from '@/store/game';
import { useT, useTx } from '@/i18n';
import { Avatar, Badge, Button, Empty, Icon, Meter, PriorityChip, StatusChip } from '@/ui/components';
import { hhmm } from '@/sim/time';
import type { Officer, SimState, Unit } from '@/sim/types';
import { STATUS_CODE } from '@/sim/types';
import { dispatch, recallUnit, selectIncident, setUnitBreak } from './actions';
import { deskCan, useCan, useDeskCan, useMyDesk } from '@/store/coop';
import { DeskNote } from './DeskParts';
import { requestLend } from './actions';
import { selRegion } from './data';
import { countdown, unitEtaMin } from './format';
import { Section, UnitTypeIcon, useMsg, useSim } from './bits';
import { useSelectedIncident } from './IncidentParts';
import { useGameUi } from './uiStore';
import { officerFace } from '@/gen/face';

export function UnitPanel() {
  const sim = useSim();
  const t = useT();
  const id = useGame((s) => s.selection.unitId);
  const selInc = useSelectedIncident(sim);
  if (!sim) return null;
  const u = id ? sim.units[id] : undefined;
  if (!u) {
    return (
      <div className="gm-pane-empty">
        <Empty icon="car">
          <strong>{t('game.unit.none')}</strong>
          <br />
          <span className="muted">{t('game.unit.noneHint')}</span>
        </Empty>
      </div>
    );
  }
  return <UnitDetail key={u.id} sim={sim} u={u} selIncId={selInc && selInc.state !== 'closed' ? selInc.id : undefined} />;
}

function CrewCard({ o, fatigue }: { o: Officer; fatigue: number }) {
  const t = useT();
  const tx = useTx();
  return (
    <div className={`gm-crew${o.injured ? ' is-injured' : ''}`}>
      <Avatar seed={o.avatarSeed} face={officerFace(o)} size={52} gender={o.gender} age={Math.min(62, 22 + o.years)} uniform />
      <div className="gm-crew__body">
        <div className="gm-crew__name">
          {o.firstName} {o.lastName}
          {o.injured && <Badge tone="danger">{t('game.unit.injured')}</Badge>}
        </div>
        <div className="gm-crew__rank">
          {tx(o.rank)}
          {o.title ? ` · ${tx(o.title)}` : ''}
        </div>
        <div className="gm-crew__meta mono">
          <span>{t('game.unit.badge', { b: o.badge })}</span>
          <span>{t('game.unit.years', { n: o.years })}</span>
        </div>
        <div className="gm-crew__meters">
          <label>
            <span>{t('game.unit.skill')}</span>
            <Meter value={o.skill} tone="accent" label={t('game.unit.skill')} />
          </label>
          <label>
            <span>{t('game.unit.fatigue')}</span>
            <Meter value={fatigue} tone={fatigue > 0.8 ? 'danger' : fatigue > 0.55 ? 'warn' : 'ok'} label={t('game.unit.fatigue')} />
          </label>
          <label>
            <span>{t('game.unit.stress')}</span>
            <Meter value={o.stress} tone={o.stress > 0.7 ? 'danger' : o.stress > 0.45 ? 'warn' : 'ok'} label={t('game.unit.stress')} />
          </label>
        </div>
      </div>
    </div>
  );
}

function UnitDetail({ sim, u, selIncId }: { sim: SimState; u: Unit; selIncId?: string }) {
  const t = useT();
  const tx = useTx();
  const msg = useMsg();
  const g = useGame.getState();
  const region = selRegion(sim);
  const station = region.stations.find((s) => s.id === u.stationId);
  const inc = u.incidentId ? sim.incidents[u.incidentId] : undefined;
  const selInc = selIncId ? sim.incidents[selIncId] : undefined;
  const eta = unitEtaMin(u, sim.now);
  const err = selIncId ? useGameUi.getState().dispatchError[selIncId] : undefined;
  const onBreak = u.status === 'break';
  const canBreak = u.status === 'available' || onBreak;
  // Co-op: crews are sent and recalled by the dispatcher, breaks given by the radio desk (src/sim/coop.ts). Sector
  // co-op: only the crew's own desk (src/sim/desks.ts); a crew lent to this desk's event can be recalled from it.
  const ownDesk = useDeskCan({ unit: u });
  const sectorRoom = useMyDesk() !== null;
  const lentHere = sectorRoom && !!inc && deskCan(sim, { incident: inc });
  const canDispatch = useCan('dispatch') && ownDesk;
  const canRadio = useCan('radio') && ownDesk;
  const alreadyThere = selInc ? selInc.assigned.includes(u.id) : false;
  // Across a border: ask for a neighbour's free crew on this desk's event, or offer this desk's crew to a neighbour's.
  const selOwn = !!selInc && deskCan(sim, { incident: selInc });
  const lend =
    sectorRoom && selInc && selInc.state !== 'closed' && u.status === 'available' && !u.incidentId && !u.onCall && ownDesk !== selOwn
      ? ownDesk
        ? 'offer'
        : 'ask'
      : null;

  let task: string;
  if (u.move) task = t(`game.move.${u.move.purpose}`);
  else if (u.onCall && u.status === 'available') task = t('game.unit.onCall');
  else if (u.status === 'available') task = t('game.unit.idle');
  else task = t(`game.status.${u.status}`);

  return (
    <div className={`gm-unit gm-unit--${u.status}`}>
      <header className="gm-unit__head">
        <div className="gm-unit__badge">
          <UnitTypeIcon type={u.type} size={22} />
        </div>
        <div className="gm-unit__id">
          <h2 className="mono">{u.callsign}</h2>
          <span>{t(`game.utype.${u.type}`)}</span>
        </div>
        <div className="gm-unit__status">
          <span className={`gm-scode gm-scode--${u.status} gm-scode--lg mono`}>{STATUS_CODE[u.status]}</span>
          <StatusChip status={u.status} label={t(`game.status.${u.status}`)} />
          <span className="gm-unit__since mono">{t('game.unit.since', { t: hhmm(u.statusSince) })}</span>
        </div>
      </header>

      <dl className="gm-unit__facts">
        <div>
          <dt>{t('game.unit.vehicle')}</dt>
          <dd>{u.vehicle}</dd>
        </div>
        <div>
          <dt>{t('game.unit.station')}</dt>
          <dd>{station ? tx(station.name) : u.stationId}</dd>
        </div>
        <div>
          <dt>{t('game.unit.fatigue')}</dt>
          <dd className="mono">{Math.round(u.fatigue * 100)}%</dd>
        </div>
        <div>
          <dt>{t('game.shift')}</dt>
          <dd className="mono">
            {t('game.unit.handled', { n: u.handled })} · {t('game.unit.breaks', { n: u.breaks })}
          </dd>
        </div>
      </dl>

      <Section title={t('game.unit.task')} icon="route">
        <div className="gm-unit__task">
          <span className="gm-unit__task-label">{task}</span>
          {eta !== null && <span className="gm-unit__eta mono">{t('game.eta', { t: countdown(eta) })}</span>}
          {u.busyUntil && u.busyUntil > sim.now && u.status === 'busy' && (
            <span className="gm-unit__eta mono">{t('game.unit.busyUntil', { t: hhmm(u.busyUntil) })}</span>
          )}
        </div>
        {inc && (
          <button type="button" className="gm-unit__inc" onClick={() => selectIncident(inc.id)}>
            <PriorityChip p={inc.priority} />
            <span className="mono">{inc.code}</span>
            <span className="gm-unit__inc-title">{tx(inc.title)}</span>
            <span className="gm-unit__inc-addr">{inc.location.address}</span>
            <Icon name="chevron-right" size={13} />
          </button>
        )}
      </Section>

      <DeskNote sim={sim} unit={u} />
      <div className="gm-unit__actions">
        {lend && selInc ? (
          <Button variant="primary" icon="send" onClick={() => requestLend(selInc.id, u.id)} data-testid="unit-lend">
            {t(lend === 'ask' ? 'desk.lend.ask' : 'desk.lend.offer')}: {selInc.code} · {selInc.number.split('-').pop()}
          </Button>
        ) : (
          <Button
            variant="primary"
            icon="send"
            disabled={!canDispatch || !selInc || alreadyThere || u.status === 'offduty' || (sectorRoom && !selOwn)}
            title={selInc ? undefined : t('game.unit.sendHint')}
            onClick={() => selInc && dispatch(selInc.id, [u.id])}
          >
            {selInc ? t('game.unit.sendTo', { n: `${selInc.code} · ${selInc.number.split('-').pop()}` }) : t('game.inc.send')}
          </Button>
        )}
        {u.incidentId && (canDispatch || lentHere) && (
          <Button size="sm" icon="x" onClick={() => recallUnit(u.id)}>
            {t('game.inc.recall')}
          </Button>
        )}
        <Button size="sm" icon={onBreak ? 'play' : 'pause'} disabled={!canBreak || !canRadio} onClick={() => setUnitBreak(u.id, !onBreak)}>
          {onBreak ? t('game.unit.endBreak') : t('game.unit.break')}
        </Button>
        <Button size="sm" icon="map" onClick={() => g.focusMap(u.pos, 15)}>
          {t('game.inc.showOnMap')}
        </Button>
      </div>
      {err && (
        <div className="gm-error" role="alert">
          <Icon name="warning" size={13} />
          {msg(err)}
        </div>
      )}

      <Section title={t('game.unit.crew')} icon="users">
        {u.crew.length === 0 ? (
          <div className="gm-muted-line">{t('game.unit.crewless')}</div>
        ) : (
          <div className="gm-crewlist">
            {u.crew.map((o) => (
              <CrewCard key={o.id} o={o} fatigue={u.fatigue} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
