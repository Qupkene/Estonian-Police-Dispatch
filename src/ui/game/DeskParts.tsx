// Sektorid (sector co-op, src/sim/desks.ts): the game screen's desk parts. Whose an event or a crew is, the
// neighbouring desks' free crews to ask for, this desk's free crews to offer, and the lend requests between desks.
// Nothing here renders outside a sector room.
import { useEffect, useRef } from 'react';
import { useGame } from '@/store/game';
import { useCoop, useMyDesk, usePending } from '@/store/coop';
import { useLang, useT, useTx } from '@/i18n';
import { Button, Icon, PriorityChip } from '@/ui/components';
import { colleagueName } from '@/sim/colleagues';
import { holderNames, incidentDesk, unitDesk, type LendRequest } from '@/sim/desks';
import { sectorById } from '@/sim/sectors';
import { recommendUnits } from '@/sim/selectors';
import type { Incident, SimState, Text, Unit } from '@/sim/types';
import { answerLend, requestLend, selectIncident } from './actions';
import { fmtKm } from './format';
import { Section, StatusDot, UnitTypeIcon } from './bits';
import { soft } from './data';
import { useGameUi } from './uiStore';

const NO_TEXT: Text = { et: '', en: '' };

/** A desk's sector name. */
export function deskName(id: string): Text {
  return sectorById(id)?.name ?? (id ? { et: id, en: id } : NO_TEXT);
}

/** Who runs a desk now: its players, else its AI colleague. */
export function useDeskWho(): (sim: SimState, desk: string) => string {
  const t = useT();
  return (sim, desk) => {
    const c = sim.coop;
    const names = c ? holderNames(c, desk) : '';
    if (names) return names;
    const sec = sectorById(desk);
    return sec ? t('desk.colleague', { name: colleagueName(sec) }) : '';
  };
}

/** A neighbouring desk's event or crew (or a shared on-call crew): whose it is and what this desk can do. */
export function DeskNote({ sim, inc, unit }: { sim: SimState; inc?: Incident; unit?: Unit }) {
  const t = useT();
  const tx = useTx();
  const who = useDeskWho();
  const mine = useMyDesk();
  if (mine === null) return null;
  if (unit && !unitDesk(sim, unit)) {
    return (
      <div className="gm-helpnote gm-desknote" role="note" data-testid="desk-note">
        <Icon name="users" size={16} />
        <p>{t('desk.note.shared')}</p>
      </div>
    );
  }
  const desk = inc ? incidentDesk(sim, inc) : unit ? unitDesk(sim, unit) : '';
  if (!desk || desk === mine) return null;
  return (
    <div className="gm-helpnote gm-desknote" role="note" data-testid="desk-note">
      <Icon name="users" size={16} />
      <p>
        {t(inc ? 'desk.note.incident' : 'desk.note.unit', { desk: tx(deskName(desk)), who: who(sim, desk) })}
      </p>
    </div>
  );
}

/** Free crews worth lending for an incident: available, fitting, nearest first. */
function lendCandidates(
  sim: SimState,
  inc: Incident,
  from: (d: string) => boolean,
): { unit: Unit; km: number; eta: number }[] {
  return soft(
    'lendRecs',
    () =>
      recommendUnits(sim, inc.id)
        .filter(
          (r) =>
            r.unit.status === 'available' &&
            !r.unit.incidentId &&
            !r.unit.onCall &&
            r.fit !== 'unreachable' &&
            from(unitDesk(sim, r.unit)),
        )
        .slice(0, 4)
        .map((r) => ({ unit: r.unit, km: r.km, eta: r.etaMin })),
    [],
  );
}

function LendRow({
  sim,
  inc,
  unit,
  km,
  label,
  title,
}: {
  sim: SimState;
  inc: Incident;
  unit: Unit;
  km: number;
  label: string;
  title: string;
}) {
  const t = useT();
  const lang = useLang();
  const tx = useTx();
  const sending = usePending('lend', inc.id);
  const open = sim.coop?.sec?.lends.find((r) => r.state === 'open' && r.inc === inc.id && r.unit === unit.id);
  return (
    <div className="gm-rec gm-lend" data-testid="lend-row" data-unit={unit.id}>
      <span className="gm-rec__cs mono" title={unit.callsign}>
        <StatusDot status={unit.status} />
        <span>{unit.callsign}</span>
      </span>
      <span className="gm-rec__type" title={t(`game.utype.${unit.type}`)}>
        <UnitTypeIcon type={unit.type} size={12} />
        {t(`game.ushort.${unit.type}`)}
      </span>
      <span className="gm-rec__km mono">{fmtKm(km, lang)}</span>
      <span className="gm-lend__desk">{tx(deskName(unitDesk(sim, unit)))}</span>
      {open ? (
        <span className="gm-lend__state">{t('desk.lend.state.open')}</span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          icon="send"
          disabled={sending}
          title={title}
          onClick={() => requestLend(inc.id, unit.id)}
        >
          {sending ? t('desk.lend.sending') : label}
        </Button>
      )}
    </div>
  );
}

/** One of this desk's incidents: the neighbouring desks' free crews, to ask for one. */
export function LendAskBlock({ sim, inc }: { sim: SimState; inc: Incident }) {
  const t = useT();
  const tx = useTx();
  const mine = useMyDesk();
  if (!mine || inc.state === 'closed') return null;
  const list = lendCandidates(sim, inc, (d) => !!d && d !== mine);
  return (
    <Section title={t('desk.lend.title')} icon="users" className="gm-sec--lend">
      {list.length === 0 ? (
        <div className="gm-muted-line">{t('desk.lend.none')}</div>
      ) : (
        <div className="gm-recs" data-testid="lend-ask">
          {list.map((c) => (
            <LendRow
              key={c.unit.id}
              sim={sim}
              inc={inc}
              unit={c.unit}
              km={c.km}
              label={t('desk.lend.ask')}
              title={t('desk.lend.askTitle', {
                cs: c.unit.callsign,
                desk: tx(deskName(unitDesk(sim, c.unit))),
              })}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

/** A neighbouring desk's incident: this desk's free crews, to offer one. */
export function LendOfferBlock({ sim, inc }: { sim: SimState; inc: Incident }) {
  const t = useT();
  const tx = useTx();
  const mine = useMyDesk();
  if (!mine || inc.state === 'closed' || sim.flags[`hidden:${inc.id}`]) return null;
  const list = lendCandidates(sim, inc, (d) => d === mine);
  return (
    <Section title={t('desk.lend.offerTitle')} icon="send" className="gm-sec--lend">
      {list.length === 0 ? (
        <div className="gm-muted-line">{t('desk.lend.none')}</div>
      ) : (
        <div className="gm-recs" data-testid="lend-offer">
          {list.map((c) => (
            <LendRow
              key={c.unit.id}
              sim={sim}
              inc={inc}
              unit={c.unit}
              km={c.km}
              label={t('desk.lend.offer')}
              title={t('desk.lend.offerHint', {
                cs: c.unit.callsign,
                desk: tx(deskName(incidentDesk(sim, inc))),
              })}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

/** The lend requests that wait for this desk's answer, and this desk's own latest ones (the co-op panel). */
export function LendRequests({ sim }: { sim: SimState }) {
  const t = useT();
  const tx = useTx();
  const mine = useMyDesk();
  const seat = useCoop((s) => s.seat);
  const pending = useCoop((s) => s.pending);
  const lends = sim.coop?.sec?.lends ?? [];
  useLendToasts(sim, mine);
  if (!mine) return null;
  const incoming = lends.filter((r) => r.state === 'open' && r.to === mine);
  const own = lends.filter((r) => r.seat === seat).slice(-3);
  if (!incoming.length && !own.length) return null;
  const busy = (r: LendRequest) => pending.some((p) => p.k === 'lendans' && p.a[0] === r.id);
  const label = (r: LendRequest) => {
    const inc = sim.incidents[r.inc];
    const u = sim.units[r.unit];
    return t(r.kind === 'ask' ? 'desk.req.ask' : 'desk.req.offer', {
      desk: tx(deskName(r.from)),
      cs: u?.callsign ?? r.unit,
      code: inc ? `P${inc.priority} ${inc.code}` : '',
      title: inc ? tx(inc.title) : '',
    });
  };
  return (
    <div className="gm-coop__lends" data-testid="lend-requests">
      <span className="gm-coop__lendsHead">{t('desk.req.title')}</span>
      {incoming.map((r) => (
        <div key={r.id} className="gm-coop__lend is-open" data-testid="lend-request">
          <button
            type="button"
            className="gm-coop__lendText"
            onClick={() => selectIncident(r.inc, { focus: true })}
          >
            {sim.incidents[r.inc] && <PriorityChip p={sim.incidents[r.inc].priority} compact />}
            <span>{label(r)}</span>
          </button>
          <span className="gm-coop__lendBtns">
            <Button
              size="sm"
              variant="primary"
              disabled={busy(r)}
              onClick={() => answerLend(r.id, true)}
              data-testid="lend-yes"
            >
              {t(r.kind === 'ask' ? 'desk.req.give' : 'desk.req.take')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy(r)} onClick={() => answerLend(r.id, false)}>
              {t('desk.req.no')}
            </Button>
          </span>
        </div>
      ))}
      {own.map((r) => (
        <div
          key={r.id}
          className={`gm-coop__lend is-${r.state}`}
          data-testid="lend-mine"
          data-state={r.state}
        >
          <span>
            {t('desk.req.mine', {
              cs: sim.units[r.unit]?.callsign ?? r.unit,
              desk: tx(deskName(r.to)),
              state: t(`desk.lend.state.${r.state}`),
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A toast when a lend request reaches this desk. */
function useLendToasts(sim: SimState, mine: string | null) {
  const tx = useTx();
  const t = useT();
  const seen = useRef<number>(-1);
  const lends = sim.coop?.sec?.lends;
  const last = lends?.[lends.length - 1]?.id ?? 0;
  useEffect(() => {
    if (!lends || !mine) return;
    if (seen.current < 0) {
      seen.current = last;
      return;
    }
    for (const r of lends) {
      if (r.id <= seen.current || r.state !== 'open' || r.to !== mine) continue;
      const u = sim.units[r.unit];
      const inc = sim.incidents[r.inc];
      useGameUi.getState().pushToast({
        kind: 'backup',
        title: 'desk.req.toast',
        text: t(r.kind === 'ask' ? 'desk.req.ask' : 'desk.req.offer', {
          desk: tx(deskName(r.from)),
          cs: u?.callsign ?? r.unit,
          code: inc ? `P${inc.priority} ${inc.code}` : '',
          title: inc ? tx(inc.title) : '',
        }),
        incidentId: r.inc,
      });
    }
    seen.current = last;
  }, [last, mine]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The neighbouring desks' open events in the queue: dimmed, read-only, one click shows them. */
export function NeighbourRows({ sim, list }: { sim: SimState; list: Incident[] }) {
  const t = useT();
  const tx = useTx();
  const open = useGameUi((s) => s.showNeighbours);
  const setUi = useGameUi((s) => s.set);
  const selected = useGame((s) => s.selection.incidentId);
  if (!list.length) return null;
  return (
    <div className="gm-closed gm-neigh" data-testid="neighbour-queue">
      <button type="button" className="gm-closed__toggle" onClick={() => setUi({ showNeighbours: !open })}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
        {t('desk.queue.neighbours', { n: list.length })}
      </button>
      {open &&
        list.map((inc) => (
          <button
            key={inc.id}
            type="button"
            className={`gm-closed__row gm-neigh__row${inc.id === selected ? ' is-selected' : ''}`}
            onClick={() => selectIncident(inc.id)}
            data-testid="neighbour-row"
          >
            <PriorityChip p={inc.priority} compact />
            <span className="gm-closed__code mono">{inc.code}</span>
            <span className="gm-closed__title">{tx(inc.title)}</span>
            <span className="gm-closed__res">{tx(deskName(incidentDesk(sim, inc)))}</span>
          </button>
        ))}
    </div>
  );
}
