import { useEffect, useRef } from 'react';
import { useGame } from '@/store/game';
import { useLang, useT, useTx } from '@/i18n';
import { Button, Empty, Icon, Kbd, PriorityChip, Tabs } from '@/ui/components';
import type { Agency, Incident, SimState } from '@/sim/types';
import { acknowledge, closeIncident, selectIncident, sendBackup } from './actions';
import { deskCan, useCan, useMyDesk, usePending } from '@/store/coop';
import { desksTakenInto } from '@/sim/desks';
import { deskName, NeighbourRows } from './DeskParts';
import { activeBackup, recentClosed, selAgeMin, selPendingRadio, selQueue, selSlaMin } from './data';
import { ageText, countdown, helpSectorId, matchesQueueFilter, slaTone, type QueueFilter } from './format';
import { HelpTag, SourceTag, StatusDot, useSim } from './bits';
import { MenuButton, type MenuItem } from './Menu';
import { useGameUi } from './uiStore';

export const AGENCIES: Agency[] = ['kiirabi', 'paaste', 'sotsiaal', 'kov', 'keskkonnaamet', 'transpordiamet', 'merepaaste', 'tolliamet', 'veterinaar', 'kapo'];

/** The queue as currently filtered (shared with the hotkey hook for ↑/↓ navigation). Sector co-op: this desk's. */
export function visibleQueue(s: SimState, f: QueueFilter): Incident[] {
  return selQueue(s).filter((i) => matchesQueueFilter(i, f) && deskCan(s, { incident: i }));
}

export function useRejectItems(incidentId: string): MenuItem[] {
  const t = useT();
  return [
    {
      id: 'refer',
      icon: 'send',
      label: t('game.reject.refer'),
      submenu: AGENCIES.map((a) => ({ id: a, label: t(`game.agency.${a}`), onSelect: () => closeIncident(incidentId, 'referral', a) })),
    },
    { id: 'phone', icon: 'phone', label: t('game.reject.phone'), onSelect: () => closeIncident(incidentId, 'phone') },
    { id: 'dup', icon: 'layers', label: t('game.reject.duplicate'), onSelect: () => closeIncident(incidentId, 'duplicate') },
    { id: 'prank', icon: 'phone-off', label: t('game.reject.prank'), tone: 'danger', onSelect: () => closeIncident(incidentId, 'prank') },
  ];
}

export function RejectMenu({ incidentId, className }: { incidentId: string; className?: string }) {
  const t = useT();
  const items = useRejectItems(incidentId);
  return (
    <MenuButton items={items} className={className} backLabel={t('game.reject.back')} title={t('game.queue.rejectTitle')}>
      {t('game.queue.reject')}
    </MenuButton>
  );
}

export function EventQueue() {
  const sim = useSim();
  const t = useT();
  const tx = useTx();
  const filter = useGameUi((s) => s.queueFilter);
  const cursor = useGameUi((s) => s.queueCursor);
  const showClosed = useGameUi((s) => s.showClosed);
  const focusN = useGameUi((s) => s.focusQueueN);
  const setUi = useGameUi((s) => s.set);
  const selectedId = useGame((s) => s.selection.incidentId);
  const listRef = useRef<HTMLDivElement>(null);
  const desk = useMyDesk();

  useEffect(() => {
    if (focusN) listRef.current?.focus();
  }, [focusN]);

  if (!sim) return null;
  // Sector co-op: this desk's own queue; the neighbours' events in their own section below (src/sim/desks.ts).
  const queueAll = selQueue(sim);
  const all = desk === null ? queueAll : queueAll.filter((i) => deskCan(sim, { incident: i }));
  const neighbours = desk === null ? [] : queueAll.filter((i) => !deskCan(sim, { incident: i }));
  const list = all.filter((i) => matchesQueueFilter(i, filter));
  const counts: Record<QueueFilter, number> = {
    all: all.length,
    p12: all.filter((i) => matchesQueueFilter(i, 'p12')).length,
    unassigned: all.filter((i) => matchesQueueFilter(i, 'unassigned')).length,
  };
  const incoming = all.filter((i) => i.state === 'incoming').length;
  const pending = selPendingRadio(sim);
  const closed = showClosed ? recentClosed(sim) : [];
  const closedCount = sim.stats?.closed ?? 0;

  return (
    <div className="gm-queue__inner">
      <header className="gm-queue__head">
        <Icon name="list" size={14} />
        <h2>{t('game.queue.title')}</h2>
        <span className="gm-queue__count mono">{all.length}</span>
        {incoming > 0 && <span className="gm-queue__new">{t('game.queue.newCount', { n: incoming })}</span>}
        <button type="button" className="gm-queue__close" onClick={() => setUi({ drawerOpen: false })} aria-label={t('game.close')}>
          <Icon name="close" size={14} />
        </button>
      </header>
      {desk !== null && (
        <div className={`gm-queue__desk${desk ? '' : ' is-away'}`} data-testid="my-desk">
          <Icon name="users" size={12} />
          <span>
            {desk
              ? t('desk.queue.mine', {
                  // A desk taken over runs under this one (docs/MULTIPLAYER.md section 12).
                  desk: [desk, ...(sim.coop?.sec ? desksTakenInto(sim.coop.sec, desk) : [])]
                    .map((d) => tx(deskName(d)))
                    .join(' + '),
                })
              : t('desk.queue.away')}
          </span>
        </div>
      )}
      <Tabs<QueueFilter>
        className="gm-queue__tabs"
        value={filter}
        onChange={(v) => setUi({ queueFilter: v })}
        tabs={[
          { id: 'all', label: t('game.queue.all'), badge: counts.all || undefined },
          { id: 'p12', label: t('game.queue.p12'), badge: counts.p12 || undefined },
          { id: 'unassigned', label: t('game.queue.unassigned'), badge: counts.unassigned || undefined },
        ]}
      />
      <div className="gm-queue__list" ref={listRef} tabIndex={-1} role="listbox" aria-label={t('game.queue.title')}>
        {list.length === 0 && (
          <Empty icon={all.length ? 'list' : 'shield'}>
            {all.length ? (
              t('game.queue.emptyFilter')
            ) : (
              <>
                <strong>{t('game.queue.empty')}</strong>
                <br />
                <span className="muted">{t('game.queue.emptyHint')}</span>
              </>
            )}
          </Empty>
        )}
        {list.map((inc) => (
          <QueueCard
            key={inc.id}
            sim={sim}
            inc={inc}
            selected={inc.id === selectedId}
            cursor={inc.id === cursor}
            pendingCount={pending.filter((m) => m.incidentId === inc.id).length}
          />
        ))}
        <NeighbourRows sim={sim} list={neighbours} />
        {closedCount > 0 && (
          <div className="gm-closed">
            <button type="button" className="gm-closed__toggle" onClick={() => setUi({ showClosed: !showClosed })}>
              <Icon name={showClosed ? 'chevron-down' : 'chevron-right'} size={12} />
              {t('game.queue.closed', { n: closedCount })}
            </button>
            {closed.map((inc) => (
              <ClosedRow key={inc.id} inc={inc} selected={inc.id === selectedId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClosedRow({ inc, selected }: { inc: Incident; selected: boolean }) {
  const t = useT();
  const tx = useTx();
  const score = inc.outcome?.score;
  const tone = score === undefined ? 'muted' : score >= 75 ? 'ok' : score >= 50 ? 'warn' : 'danger';
  return (
    <button type="button" className={`gm-closed__row${selected ? ' is-selected' : ''}`} onClick={() => selectIncident(inc.id)}>
      <PriorityChip p={inc.priority} compact />
      <span className="gm-closed__code mono">{inc.code}</span>
      <span className="gm-closed__title">{tx(inc.title)}</span>
      {helpSectorId(inc) !== null && <HelpTag inc={inc} short />}
      <span className="gm-closed__res">{inc.outcome ? t(`game.result.${inc.outcome.result}`) : inc.closedBy ? t(`game.closedBy.${inc.closedBy}`) : ''}</span>
      {score !== undefined && <span className={`gm-closed__score mono gm-tone--${tone}`}>{Math.round(score)}</span>}
    </button>
  );
}

function QueueCard({ sim, inc, selected, cursor, pendingCount }: { sim: SimState; inc: Incident; selected: boolean; cursor: boolean; pendingCount: number }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cursor) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const age = selAgeMin(sim, inc);
  const arrived = !!inc.firstArrivalAt;
  const sla = selSlaMin(sim, inc);
  const tone = slaTone(sla, inc.slaMin);
  const backup = activeBackup(sim, inc);
  const units = inc.assigned.map((id) => sim.units[id]).filter(Boolean);
  const incoming = inc.state === 'incoming';
  const canDispatch = useCan('dispatch');
  const acking = usePending('ack', inc.id);
  const pursuit = inc.pursuit && !inc.pursuit.ended;
  const work = inc.onSceneMin > 0 ? Math.min(1, inc.workDone / inc.onSceneMin) : 0;
  const place = inc.location.placeName;
  const area = inc.location.district || inc.location.city;

  const cls = [
    'gm-card',
    `gm-card--p${inc.priority}`,
    `gm-card--${inc.state}`,
    selected && 'is-selected',
    cursor && 'is-cursor',
    backup && 'is-backup',
    pursuit && 'is-pursuit',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={ref}
      className={cls}
      role="option"
      data-incident={inc.id}
      aria-selected={selected}
      tabIndex={-1}
      onClick={() => {
        selectIncident(inc.id);
        if (window.matchMedia('(max-width: 899px)').matches) useGameUi.getState().set({ mobileTab: 'panel' });
        else if (window.matchMedia('(max-width: 1199px)').matches) useGameUi.getState().set({ drawerOpen: false });
      }}
      onDoubleClick={() => selectIncident(inc.id, { focus: true })}
    >
      <div className="gm-card__row gm-card__row--top">
        <PriorityChip p={inc.priority} />
        <span className="gm-card__code mono">{inc.code}</span>
        <span className="gm-card__title">{tx(inc.title)}</span>
        <span className="gm-card__age mono" title={t('game.queue.age')}>
          {ageText(age, lang)}
        </span>
      </div>
      <div className="gm-card__addr">
        <Icon name="pin" size={11} />
        <span>
          {area && <b>{area}, </b>}
          {place && place !== inc.location.address ? `${place} · ` : ''}
          {inc.location.address}
        </span>
      </div>
      {helpSectorId(inc) !== null && (
        <div className="gm-card__help">
          <HelpTag inc={inc} />
        </div>
      )}
      <div className="gm-card__row gm-card__row--meta">
        <SourceTag source={inc.source} />
        {incoming && <span className="gm-card__newtag">{t('game.queue.new')}</span>}
        {!arrived ? (
          <span className={`gm-sla gm-sla--${tone} mono`} title={t('game.queue.slaTitle')}>
            <Icon name="timer" size={11} />
            {countdown(sla)}
          </span>
        ) : (
          <span className="gm-card__work" title={t('game.inc.work')}>
            <i style={{ width: `${(work * 100).toFixed(1)}%` }} />
          </span>
        )}
        {pendingCount > 0 && (
          <span className="gm-card__radio" title={t('game.inc.radioPending')}>
            <Icon name="radio" size={11} />
            {pendingCount}
          </span>
        )}
        {pursuit && <span className="gm-card__pursuit">{t('game.pursuit.title')}</span>}
        {inc.escalated && (
          <span title={t('game.inc.escTitle')}>
            <Icon name="warning" size={12} className="gm-card__esc" />
          </span>
        )}
        <span className="gm-card__units">
          {units.length === 0 && !incoming && <span className="gm-card__nounits">{t('game.queue.noUnits')}</span>}
          {units.slice(0, 4).map((u) => (
            <span key={u.id} className="gm-unitchip mono" title={t(`game.status.${u.status}`)}>
              <StatusDot status={u.status} />
              {u.callsign}
            </span>
          ))}
          {units.length > 4 && <span className="gm-unitchip mono">+{units.length - 4}</span>}
        </span>
      </div>
      {incoming && canDispatch && (
        <div className="gm-card__actions" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="primary" icon="check" disabled={acking} title={t('game.queue.acceptTitle')} onClick={(e) => {
            e.stopPropagation();
            acknowledge(inc.id);
            selectIncident(inc.id);
          }}>
            {t('game.queue.accept')}
            <Kbd>A</Kbd>
          </Button>
          <RejectMenu incidentId={inc.id} className="gm-card__reject" />
        </div>
      )}
      {backup && (
        <div className="gm-card__backup" onClick={(e) => e.stopPropagation()}>
          <Icon name="siren" size={14} />
          <span className="gm-card__backup-label">{t('game.queue.backup')}</span>
          {backup.remainingMin !== null && <span className="mono gm-card__backup-cd">{countdown(backup.remainingMin)}</span>}
          {backup.enroute.length ? (
            <span className="gm-helpenroute mono" title={backup.enroute.map((e) => e.unit.callsign).join(', ')}>
              <Icon name="siren" size={11} />
              {t('game.queue.helpEnrouteShort', { t: backup.enroute[0].etaMin !== null ? countdown(backup.enroute[0].etaMin) : '' })}
            </span>
          ) : canDispatch ? (
            <Button size="sm" variant="danger" onClick={() => sendBackup(inc.id)}>
              {t('game.queue.sendHelp')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
