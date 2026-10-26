// In-shift CAD screen (owned by ui-game): layout shell + map host + right context panel + dock.
import { memo, useCallback, useEffect, useMemo } from 'react';
import { shiftKeyOf, useGame, type RightTab } from '@/store/game';
import { useSettings } from '@/store/settings';
import { useLang, useT } from '@/i18n';
import { Button, Empty, Icon, Tabs, type TabDef } from '@/ui/components';
import { MapView } from '@/map/MapView';
import { RegistryPanel } from '@/ui/tools/RegistryPanel';
import { StatsPanel } from '@/ui/tools/StatsPanel';
import { BulletinsPanel } from '@/ui/tools/BulletinsPanel';
import { DirectorPanel } from '@/ui/tools/DirectorPanel';
import { CallTaker } from '@/ui/tools/CallTaker';
import { useDirector } from '@/ui/tools/directorStore';
import { deskCan, useMyDesk } from '@/store/coop';
import { stopScene } from '@/ui/tools/lib/sceneRunner';
import type { LngLat } from '@/sim/types';
import { selectIncident, selectUnit } from './actions';
import { selPendingRadio, selQueue, selRecs, soft } from './data';
import { TopBar } from './TopBar';
import { EventQueue } from './EventQueue';
import { IncidentPanel } from './IncidentPanel';
import { UnitPanel } from './UnitPanel';
import { UnitBoard } from './UnitBoard';
import { RadioPanel } from './RadioPanel';
import { Toasts, useToastFeed } from './Toasts';
import { PauseMenu, ShiftEndModal } from './Modals';
import { CoopPanel } from './CoopPanel';
import { CrisisBar, CrisisBrief, CrisisPanel, crisisOn } from './CrisisPanel';
import { useHotkeys } from './useHotkeys';
import { useGameUi, type MobileTab } from './uiStore';
import { VERSION } from '@/ui/screens/shell/helpers';
import './game.css';

const MemoMap = memo(MapView);
const NO_IDS: string[] = [];

export function GameScreen() {
  const t = useT();
  const sim = useGame((s) => s.sim);
  const hud = useGame((s) => s.hud);
  const dockOpen = useGameUi((s) => s.dockOpen);
  const drawerOpen = useGameUi((s) => s.drawerOpen);
  const mobileTab = useGameUi((s) => s.mobileTab);
  const setUi = useGameUi((s) => s.set);
  const reduced = useSettings((s) => s.reducedMotion);
  useHotkeys();
  useToastFeed();

  // Fresh UI state for every shift. Director state (an armed map placement, a running scene) belongs
  // to the shift it was made in and must never act on the next quick-play or career shift.
  const simId = sim ? shiftKeyOf(sim) : '';
  useEffect(() => {
    if (!simId) return;
    setUi({ queueCursor: null, picks: {}, dispatchError: {}, toasts: [], pauseOpen: false, bulletinsSeen: 0, drawerOpen: false });
    stopScene();
    useDirector.getState().reset();
    return () => stopScene();
  }, [simId, setUi]);

  if (!sim) {
    return (
      <div className="gm gm--nosim">
        <Empty icon="shield">{t('game.empty')}</Empty>
        <Button onClick={() => useGame.getState().setScreen('menu')}>{t('game.toMenu')}</Button>
      </div>
    );
  }

  const director = sim.mode === 'director';

  if (director && !hud) {
    return (
      <div className="gm-cine">
        <MapHost cinematic />
        <button type="button" className="gm-cine__restore" onClick={() => useGame.getState().setHud(true)} title={t('game.hud.show')}>
          <Icon name="eye" size={14} />
        </button>
        <CallTaker />
      </div>
    );
  }

  const cls = ['gm', !dockOpen && 'gm--dock-closed', drawerOpen && 'gm--drawer-open', `gm--m-${mobileTab}`, director && 'gm--director', reduced && 'gm--reduced'].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      <TopBar />
      <aside className="gm-queue">
        <EventQueue />
      </aside>
      <div className="gm-scrim" onClick={() => setUi({ drawerOpen: false })} aria-hidden="true" />
      <main className="gm-map">
        <MapHost />
        <CrisisBar />
        <PlacingHint />
        {/* The game's version, small in the map's lower left corner (the menus show it in their footer). */}
        <span className="gm-ver" title={t('game.version')}>
          v{VERSION}
        </span>
      </main>
      <aside className="gm-side">
        <SidePanel />
      </aside>
      <section className="gm-dock">
        <button
          type="button"
          className="gm-dock__toggle"
          onClick={() => setUi({ dockOpen: !dockOpen })}
          title={dockOpen ? t('game.dock.collapse') : t('game.dock.expand')}
          aria-expanded={dockOpen}
        >
          <Icon name={dockOpen ? 'chevron-down' : 'chevron-right'} size={12} />
        </button>
        <div className="gm-dock__radio">
          <RadioPanel />
        </div>
        <div className="gm-dock__units">
          <UnitBoard />
        </div>
      </section>
      <MobileNav />
      <Toasts />
      {sim.coop && <CoopPanel />}
      <CallTaker />
      <CrisisBrief />
      <ShiftEndModal />
      <PauseMenu />
    </div>
  );
}

// ── Map host ─────────────────────────────────────────────────────────────────

function MapHost({ cinematic }: { cinematic?: boolean }) {
  const sim = useGame((s) => s.sim)!;
  const tick = useGame((s) => s.tick);
  const selInc = useGame((s) => s.selection.incidentId);
  const selUnit = useGame((s) => s.selection.unitId);
  const focus = useGame((s) => s.mapFocus);
  const styleKey = useSettings((s) => s.mapStyle);
  const lang = useLang();
  const placing = useDirector((s) => s.placing);
  const picks = useGameUi((s) => (selInc ? s.picks[selInc] : undefined));

  // Highlight the units the dispatcher is about to send: explicit picks, else the top recommendations.
  const idsKey = useMemo(() => {
    if (!selInc) return '';
    if (picks?.length) return picks.join(',');
    const inc = sim.incidents[selInc];
    if (!inc || inc.state === 'closed') return '';
    return soft(
      'mapRecs',
      () =>
        selRecs(sim, selInc)
          .filter((r) => r.fit === 'ideal' || r.fit === 'need')
          .slice(0, 3)
          .map((r) => r.unit.id)
          .join(','),
      '',
    );
  }, [sim, selInc, picks, tick]); // tick: recompute as units move
  const highlight = useMemo(() => (idsKey ? idsKey.split(',') : NO_IDS), [idsKey]);

  // Sector co-op: the neighbouring desks' units and incidents are drawn dimmed (src/sim/desks.ts).
  const desk = useMyDesk();
  const dimmed = useMemo(
    () =>
      desk === null
        ? undefined
        : (kind: 'unit' | 'incident', id: string) => {
            const s = useGame.getState().sim;
            if (!s) return false;
            if (kind === 'unit') return !!s.units[id] && !deskCan(s, { unit: s.units[id] });
            return !!s.incidents[id] && !deskCan(s, { incident: s.incidents[id] });
          },
    [desk],
  );
  const onSelectIncident = useCallback((id: string) => selectIncident(id), []);
  const onSelectUnit = useCallback((id: string) => selectUnit(id), []);
  const onMapClick = useCallback((coord: LngLat) => {
    const id = useDirector.getState().commitPlacing(coord);
    if (id) selectIncident(id);
  }, []);

  return (
    <MemoMap
      sim={sim}
      regionId={sim.regionId}
      lang={lang}
      styleKey={styleKey}
      selectedIncidentId={selInc}
      selectedUnitId={selUnit}
      highlightUnitIds={highlight}
      focus={focus}
      onSelectIncident={onSelectIncident}
      onSelectUnit={onSelectUnit}
      onMapClick={placing ? onMapClick : undefined}
      placing={!!placing}
      cinematic={cinematic}
      dimmed={dimmed}
    />
  );
}

function PlacingHint() {
  const t = useT();
  const placing = useDirector((s) => s.placing);
  const sim = useGame((s) => s.sim);
  if (!placing || !sim) return null;
  const label =
    placing.kind === 'incident'
      ? t('game.dir.placeIncident')
      : t('game.dir.placeUnit', { c: sim.units[placing.unitId]?.callsign ?? placing.unitId });
  return (
    <div className="gm-placing" role="status">
      <Icon name="crosshair" size={14} />
      <span>{label}</span>
      <span className="gm-placing__esc">{t('game.dir.cancel')}</span>
      <button type="button" onClick={() => useDirector.getState().setPlacing(null)} aria-label={t('game.cancel')}>
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

// ── Right context panel ──────────────────────────────────────────────────────

function SidePanel() {
  const t = useT();
  const tab = useGame((s) => s.rightTab);
  const setTab = useGame((s) => s.setRightTab);
  const director = useGame((s) => s.sim?.mode === 'director');
  const bulletins = useGame((s) => s.sim?.bulletins.length ?? 0);
  const seen = useGameUi((s) => s.bulletinsSeen);
  const setUi = useGameUi((s) => s.set);
  // Suurõnnetus (docs/CRISIS.md): the staff's tab once it broke out, marked while a decision waits or a task escalated.
  const crisisKey = useGame((s) => {
    const c = crisisOn(s.sim);
    if (!c) return '';
    const waits = Object.keys(c.asked).some((d) => c.decisions[d] === undefined);
    return `${c.phase === 'over' ? 'o' : 'r'}${waits ? 'w' : '-'}`;
  });
  const crisis = crisisKey ? { over: crisisKey[0] === 'o', waits: crisisKey[1] === 'w' } : null;
  const active: RightTab = (tab === 'director' && !director) || (tab === 'crisis' && !crisis) ? 'incident' : tab;

  useEffect(() => {
    if (active === 'bulletins' && bulletins !== seen) setUi({ bulletinsSeen: bulletins });
  }, [active, bulletins, seen, setUi]);

  const tabs: TabDef<RightTab>[] = [
    { id: 'incident', label: t('game.tab.incident'), icon: 'list' },
    { id: 'unit', label: t('game.tab.unit'), icon: 'car' },
    { id: 'registry', label: t('game.tab.registry'), icon: 'search' },
    { id: 'stats', label: t('game.tab.stats'), icon: 'stats' },
    { id: 'bulletins', label: t('game.tab.bulletins'), icon: 'newspaper', badge: active !== 'bulletins' && bulletins > seen ? bulletins - seen : undefined },
  ];
  if (crisis)
    tabs.splice(1, 0, {
      id: 'crisis',
      label: t('game.crisis.tab'),
      icon: 'alert',
      badge: active !== 'crisis' && !crisis.over && crisis.waits ? '!' : undefined,
    });
  if (director) tabs.push({ id: 'director', label: t('game.tab.director'), icon: 'film' });

  return (
    <div className="gm-side__inner">
      <Tabs<RightTab> className="gm-side__tabs" tabs={tabs} value={active} onChange={setTab} />
      <div className={`gm-side__body gm-side__body--${active}`}>
        {active === 'incident' && <IncidentPanel />}
        {active === 'unit' && <UnitPanel />}
        {active === 'registry' && <RegistryPanel />}
        {active === 'stats' && <StatsPanel />}
        {active === 'bulletins' && <BulletinsPanel />}
        {active === 'director' && <DirectorPanel />}
        {active === 'crisis' && <CrisisPanel />}
      </div>
    </div>
  );
}

// ── Mobile bottom navigation (< 900 px) ──────────────────────────────────────

function MobileNav() {
  const t = useT();
  const tab = useGameUi((s) => s.mobileTab);
  const setUi = useGameUi((s) => s.set);
  useGame((s) => s.tick);
  const sim = useGame((s) => s.sim);
  const incoming = sim ? soft('mobQueue', () => selQueue(sim).filter((i) => i.state === 'incoming').length, 0) : 0;
  const pending = sim ? soft('mobRadio', () => selPendingRadio(sim).length, 0) : 0;
  const items: { id: MobileTab; icon: 'map' | 'list' | 'info' | 'radio' | 'car'; n?: number }[] = [
    { id: 'map', icon: 'map' },
    { id: 'queue', icon: 'list', n: incoming },
    { id: 'panel', icon: 'info' },
    { id: 'radio', icon: 'radio', n: pending },
    { id: 'units', icon: 'car' },
  ];
  return (
    <nav className="gm-mnav" aria-label={t('game.nav')}>
      {items.map((it) => (
        <button key={it.id} type="button" className={`gm-mnav__btn${tab === it.id ? ' is-active' : ''}`} onClick={() => setUi({ mobileTab: it.id })}>
          <Icon name={it.icon} size={18} />
          <span>{t(`game.mtab.${it.id}`)}</span>
          {!!it.n && <i className="gm-mnav__n">{it.n}</i>}
        </button>
      ))}
    </nav>
  );
}
