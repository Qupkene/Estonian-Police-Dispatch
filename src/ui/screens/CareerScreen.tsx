// Career page (Valvekaart): the head row with the start button, the career's figures, the duty map focused on
// the prefecture with the Vastutusala table and the prefect's offer over it, then the next shift's crews, the
// last shifts, the fleet, the notices, the next rank, the police posts and the management tabs. Stacked on a
// narrow screen with the map as a strip on top. Owned by ui-career.
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useCareer } from '@/store/career';
import { useGame } from '@/store/game';
import { useSettings } from '@/store/settings';
import { useT } from '@/i18n';
import { REGIONS } from '@/data/regions';
import { sectorsOf } from '@/sim/sectors';
import { Button, Modal, Tabs, TextField, type TabDef } from '@/ui/components';
import type { CareerProfile, RegionId } from '@/sim/types';
import { DutyMap } from './shell/DutyMap';
import { fitView, type DutyInput, type MapView } from './shell/dutyMap';
import { MapLegend } from './shell/MapLegend';
import { mapInput } from './shell/menuModel';
import { ShellAccount, ShellFooter, ShellTopBar, STACKED, useMedia } from './shell/ShellFrame';
import { useEscape } from './shell/ShellPage';
import { Onboarding } from './career/Onboarding';
import { AreaPanel, NextOfferPanel, OfferPanel, PostsPanel } from './career/AreaCard';
import {
  BackButton,
  FleetPanel,
  KpiStrip,
  LastShiftsPanel,
  NextRankPanel,
  NextShiftPanel,
  NoticesPanel,
  PageHead,
  useRank,
} from './career/Overview';
import { StaffTab } from './career/StaffTab';
import { RecruitTab } from './career/RecruitTab';
import { FleetTab } from './career/FleetTab';
import { UpgradesTab } from './career/UpgradesTab';
import { BudgetTab } from './career/BudgetTab';
import { AchievementsTab, HistoryTab } from './career/RecordsTabs';
import { ToastProvider, useToast } from './career/Toasts';
import { useStoredState } from './career/hooks';
import { safe } from './career/helpers';
import { unlockedOrder, wholeIn } from './career/sectors';
import './shell/vk.css';
import './career/career.css';

const TAB_IDS = ['staff', 'recruit', 'fleet', 'upgrades', 'budget', 'achievements', 'history'] as const;
type TabId = (typeof TAB_IDS)[number];

function isUsable(p: CareerProfile | null): p is CareerProfile {
  return (
    !!p &&
    typeof p === 'object' &&
    typeof p.money === 'number' &&
    typeof p.day === 'number' &&
    Array.isArray(p.staff) &&
    typeof p.regionId === 'string'
  );
}

export function CareerScreen() {
  const t = useT();
  const profile = useCareer((s) => s.profile);
  const user = useGame((s) => s.user);
  const stacked = useMedia(STACKED);
  const usable = isUsable(profile);
  useEscape(() => useGame.getState().setScreen('menu'));
  return (
    <div className={`vk vk-ui vk-career${stacked ? ' is-stacked' : ''}`}>
      <ToastProvider>
        <ShellTopBar account={!stacked} />
        <div className="vk-career__page">
          {usable ? <Hq profile={profile} stacked={stacked} /> : profile ? <BrokenSave /> : <Onboarding />}
        </div>
        {stacked && user && (
          <section className="vk-panel cr-account" aria-label={t('account.method')}>
            <ShellAccount />
          </section>
        )}
        <ShellFooter>{!stacked && <CareerKeys start={usable} />}</ShellFooter>
      </ToastProvider>
    </div>
  );
}

function CareerKeys({ start }: { start: boolean }) {
  const t = useT();
  return (
    <ul className="vk-foot__keys" aria-label={t('shell.menu.keys')}>
      <li>
        <kbd className="vk-kbd">Esc</kbd> {t('career.vk.key.menu')}
      </li>
      {start && (
        <li>
          <kbd className="vk-kbd">⏎</kbd> {t('career.vk.key.start')}
        </li>
      )}
    </ul>
  );
}

function Hq({ profile, stacked }: { profile: CareerProfile; stacked: boolean }) {
  const t = useT();
  const rank = useRank(profile);
  const reduced = useSettings((s) => s.reducedMotion);
  const regions = useMemo(() => unlockedOrder(profile), [profile]);
  // The prefecture on show: the map, the Vastutusala table and the next shift follow it.
  const [region, setRegion] = useState<RegionId>(profile.regionId);
  useEffect(() => {
    if (!regions.includes(region)) setRegion(profile.regionId);
  }, [regions, region, profile.regionId]);
  const [tab, setTab] = useStoredState<TabId>('epd:career:tab', 'staff', TAB_IDS);
  const tabsRef = useRef<HTMLElement>(null);
  const openTab = (id: TabId) => {
    setTab(id);
    tabsRef.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    tabsRef.current
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.focus({ preventScroll: true });
  };
  const start = () => {
    const g = useGame.getState();
    g.setBriefing({ mode: 'career', regionId: region });
    g.setScreen('briefing');
  };
  // Enter starts the shift when nothing else has the focus (the footer's key).
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el && el !== document.body && !el.classList.contains('vk-career__page')) return;
      e.preventDefault();
      startRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tabs: TabDef<TabId>[] = [
    { id: 'staff', label: t('career.tab.staff'), icon: 'users' },
    {
      id: 'recruit',
      label: t('career.tab.recruit'),
      icon: 'plus',
      badge: (profile.recruits ?? []).length || undefined,
    },
    { id: 'fleet', label: t('career.tab.fleet'), icon: 'car' },
    { id: 'upgrades', label: t('career.tab.upgrades'), icon: 'shield' },
    { id: 'budget', label: t('career.tab.budget'), icon: 'money' },
    { id: 'achievements', label: t('career.tab.achievements'), icon: 'trophy' },
    { id: 'history', label: t('career.tab.history'), icon: 'clock' },
  ];

  return (
    <div className="cr-hq">
      <PageHead profile={profile} rank={rank} onStart={start} />
      <KpiStrip profile={profile} rank={rank} />
      <main className="cr-hq__main">
        <HqMap profile={profile} regionId={region} stacked={stacked} />
        <div className="cr-grid">
          <Boundary>
            <NextShiftPanel
              profile={profile}
              region={region}
              regions={regions}
              setRegion={setRegion}
              onStaff={() => openTab('staff')}
              onFleet={() => openTab('fleet')}
            />
          </Boundary>
          <Boundary>
            <LastShiftsPanel profile={profile} onHistory={() => openTab('history')} />
          </Boundary>
          <Boundary>
            <FleetPanel profile={profile} onFleet={() => openTab('fleet')} />
          </Boundary>
          <Boundary>
            <NoticesPanel profile={profile} />
          </Boundary>
          <Boundary>
            <NextRankPanel profile={profile} rank={rank} />
          </Boundary>
          <Boundary>
            <PostsPanel profile={profile} regionId={region} />
          </Boundary>
          <section className="vk-panel cr-tabs" ref={tabsRef} aria-labelledby="cr-tabs-title">
            <div className="vk-panel__head">
              <h2 className="vk-h" id="cr-tabs-title">
                {t('career.vk.manage')}
              </h2>
            </div>
            <Tabs tabs={tabs} value={tab} onChange={setTab} className="cr-tabs__bar" />
            <div className="cr-tabs__body">
              <Boundary key={tab} fallback={<p className="cr-placeholder">{t('career.tabError')}</p>}>
                {tab === 'staff' && <StaffTab profile={profile} goRecruit={() => setTab('recruit')} />}
                {tab === 'recruit' && <RecruitTab profile={profile} />}
                {tab === 'fleet' && <FleetTab profile={profile} rank={rank} />}
                {tab === 'upgrades' && <UpgradesTab profile={profile} rank={rank} />}
                {tab === 'budget' && <BudgetTab profile={profile} />}
                {tab === 'achievements' && <AchievementsTab profile={profile} />}
                {tab === 'history' && <HistoryTab profile={profile} />}
              </Boundary>
            </div>
          </section>
          <DangerZone profile={profile} />
        </div>
      </main>
    </div>
  );
}

// ── The duty map, focused on the prefecture, with the panels over it ─────────

/** Side panels over the desktop map (px): the map centres the prefecture in what they leave free. */
const LEFT_W = 340;
const RIGHT_W = 368;

/** The scale bar's length for a map of `pxPerKm`: about 70 to 140 px. */
function scaleKm(pxPerKm: number): number {
  return [5, 10, 20, 50, 100].find((km) => km * pxPerKm >= 70) ?? 100;
}

function HqMap({
  profile,
  regionId,
  stacked,
}: {
  profile: CareerProfile;
  regionId: RegionId;
  stacked: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // Rounded, so a scrollbar or a few pixels of resizing do not rebuild the map.
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const next = { w: Math.round(r.width / 16) * 16, h: Math.round(r.height / 16) * 16 };
      setSize((prev) => (prev && prev.w === next.w && prev.h === next.h ? prev : next));
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stacked]);

  const whole = safe(() => wholeIn(profile, regionId), true);
  const offerHere = !!profile.offer?.choices?.length && profile.offer.regionId === regionId;
  const input = useMemo<DutyInput>(() => {
    const base = mapInput(profile, null);
    const taken = new Set([...base.mine, ...base.offered]);
    return {
      ...base,
      home: regionId,
      others: whole
        ? []
        : sectorsOf(regionId)
            .map((s) => s.id)
            .filter((id) => !taken.has(id)),
    };
  }, [profile, regionId, whole]);

  const right = !whole || offerHere;
  const view = useMemo<MapView | null>(() => {
    const bounds = REGIONS[regionId]?.bounds;
    if (!size || !bounds) return null;
    if (stacked) return fitView(bounds, size.w, size.h, { top: 16, right: 16, bottom: 44, left: 16 });
    return fitView(bounds, size.w, size.h, {
      top: 28,
      right: right ? RIGHT_W + 36 : 48,
      bottom: 64,
      left: LEFT_W + 36,
    });
  }, [size, regionId, stacked, right]);

  const legend = view ? (
    <MapLegend input={input} compact={stacked} pxPerKm={view.scale} km={scaleKm(view.scale)} />
  ) : null;
  const map = view ? (
    <DutyMap variant={stacked ? 'strip' : 'full'} input={input} view={view} who={profile.name} />
  ) : null;

  if (stacked)
    return (
      <>
        <div className="cr-strip" ref={boxRef}>
          {map}
          {legend}
        </div>
        <div className="cr-stackpanels">
          <Boundary>
            <AreaPanel profile={profile} regionId={regionId} />
          </Boundary>
          <Boundary>
            {offerHere ? (
              <OfferPanel profile={profile} />
            ) : (
              <NextOfferPanel profile={profile} regionId={regionId} />
            )}
          </Boundary>
        </div>
      </>
    );
  return (
    <div className="cr-map">
      <div className="cr-map__canvas" ref={boxRef}>
        {map}
      </div>
      <div className="cr-map__docks">
        <div className="cr-map__col">
          <Boundary>
            <AreaPanel profile={profile} regionId={regionId} />
          </Boundary>
        </div>
        <div className="cr-map__center">{legend}</div>
        <div className="cr-map__col">
          <Boundary>
            {offerHere ? (
              <OfferPanel profile={profile} />
            ) : (
              <NextOfferPanel profile={profile} regionId={regionId} />
            )}
          </Boundary>
        </div>
      </div>
    </div>
  );
}

// ── Delete the career ────────────────────────────────────────────────────────

function DangerZone({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const ok = typed.trim() === profile.badge;
  const close = () => {
    setOpen(false);
    setTyped('');
  };
  const del = () => {
    if (!ok) return;
    useCareer.getState().reset();
    notify('info', t('career.danger.deleted'));
    close();
  };
  return (
    <section className="vk-panel cr-danger" aria-labelledby="cr-danger-title">
      <div className="cr-danger__text">
        <h2 className="vk-h" id="cr-danger-title">
          {t('career.danger.title')}
        </h2>
        <p>{t('career.danger.text')}</p>
      </div>
      <Button variant="danger" onClick={() => setOpen(true)}>
        {t('career.danger.delete')}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={t('career.danger.confirmTitle')}
        tone="danger"
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {t('career.cancel')}
            </Button>
            <Button variant="danger" disabled={!ok} onClick={del}>
              {t('career.danger.delete')}
            </Button>
          </>
        }
      >
        <p>{t('career.danger.confirmText', { name: profile.name, day: profile.day })}</p>
        <TextField
          label={t('career.danger.typeBadge', { badge: profile.badge })}
          mono
          value={typed}
          inputMode="numeric"
          maxLength={3}
          autoFocus
          onChange={(v) => setTyped(v.replace(/\D/g, '').slice(0, 3))}
          onKeyDown={(e) => e.key === 'Enter' && del()}
        />
      </Modal>
    </section>
  );
}

function BrokenSave() {
  const t = useT();
  return (
    <>
      <div className="vk-pagehead">
        <BackButton />
        <span className="vk-pagehead__rule" aria-hidden="true" />
        <h1 className="vk-pagehead__title">{t('shell.menu.career')}</h1>
      </div>
      <main className="cr-broken">
        <section className="vk-panel" aria-labelledby="cr-broken-title">
          <div className="vk-panel__head">
            <h2 className="vk-h" id="cr-broken-title">
              {t('career.broken.title')}
            </h2>
          </div>
          <p className="cr-broken__text">{t('career.broken.text')}</p>
          <div className="cr-panel__actions">
            <Button variant="ghost" onClick={() => useGame.getState().setScreen('menu')}>
              {t('career.back')}
            </Button>
            <Button variant="danger" onClick={() => useCareer.getState().reset()}>
              {t('career.broken.reset')}
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}

class Boundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[EPD career] panel crashed', err);
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
