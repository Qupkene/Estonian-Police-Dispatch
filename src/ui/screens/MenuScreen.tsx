// Main menu (Valvekaart): the duty map of Estonia with the player's desk, the prefect's offer and today's challenge
// on it, and flat panels over it: Teenistus (the menu), Teated, Karjäär and Edetabel. The daily challenge's panel
// slides in when its Teenistus row is pressed (a sheet from below on a phone) and its area lights up amber on the
// map; pressing the row again starts it. On a narrow screen the map is a strip on top and the panels stack. Owned
// by ui-shell.
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { clearAutosave, loadAutosave, shiftKeyOf, useGame, type Screen } from '@/store/game';
import { useCareer } from '@/store/career';
import { useSettings } from '@/store/settings';
import { useAccount } from '@/net/account';
import { fetchMyRoom, type Room } from '@/net/rooms';
import { useFriends } from '@/store/friends';
import { useLang, useT, useTx } from '@/i18n';
import { displayRoomCode } from '@/sim/room';
import { sectorById } from '@/sim/sectors';
import { storyLine } from '@/sim/story';
import { ddmmyyyy, hhmm, wall } from '@/sim/time';
import type { CareerProfile, GameMode, Lang } from '@/sim/types';
import { DailyCard, useDaily } from './shell/Daily';
import { openLobby } from './shell/lobbyNav';
import { DutyMap, type MapLayout } from './shell/DutyMap';
import { Leaderboard } from './shell/Leaderboard';
import { MapLegend } from './shell/MapLegend';
import { MonoNumbers, NoticeLabel, noticeText } from './shell/notices';
import { ShellAccount, ShellFooter, ShellTopBar, STACKED, useMedia } from './shell/ShellFrame';
import { regionSummary } from './shell/helpers';
import {
  barHeight,
  careerFigures,
  homeArea,
  mapInput,
  menuNotices,
  nextShiftKind,
  shiftBars,
  type Notice,
} from './shell/menuModel';
import type { DutyInput } from './shell/dutyMap';
import { fmtMoney, fmtNum } from './career/helpers';
import './shell/vk.css';
import './shell/menu.css';

/** The menu group left open this session (Üksikmäng after a shift, so its rows are a click away). */
let lastOpen: Row['id'] | null = null;

interface Row {
  id:
    | 'career'
    | 'daily'
    | 'solo'
    | 'quick'
    | 'custom'
    | 'multi'
    | 'director'
    | 'settings'
    | 'more'
    | 'legacy'
    | 'credits';
  system?: boolean;
  /** A group: the row opens its rows below it (Üksikmäng, Muu). */
  sub?: Row[];
  title: string;
  desc: string;
  mono?: boolean;
  mark?: 'mine' | 'challenge';
  /** Things waiting behind the row (friends' invitations and requests), as a count at its end. */
  badge?: number;
  /** A row that opens a panel elsewhere (the daily challenge's): whether it is open, and its id. */
  expanded?: boolean;
  controls?: string;
  run: () => void;
}

/** The daily challenge's panel (DailyCard), opened from its Teenistus row. */
const DAILY_PANEL = 'vk-day-panel';

/** A career profile the menu can show (a broken save goes to the career screen, which explains it). */
function usable(p: CareerProfile | null): p is CareerProfile {
  return (
    !!p &&
    typeof p === 'object' &&
    typeof p.money === 'number' &&
    typeof p.day === 'number' &&
    Array.isArray(p.staff) &&
    typeof p.regionId === 'string'
  );
}

/** The career's desks in its home prefecture ("Tartu linn"), or the prefecture when it covers it whole. */
function areaName(p: CareerProfile, lang: Lang): { area: string; region: string } {
  const home = homeArea(p);
  const region = regionSummary(home.regionId).name[lang];
  const names = home.sectors.map((id) => sectorById(id)?.name[lang]).filter((x): x is string => !!x);
  return { area: home.whole || !names.length ? region : names.join(', '), region };
}

export function MenuScreen() {
  const t = useT();
  const lang = useLang();
  const user = useGame((s) => s.user);
  const setScreen = useGame((s) => s.setScreen);
  const setBriefing = useGame((s) => s.setBriefing);
  const resumeShift = useGame((s) => s.resumeShift);
  const stored = useCareer((s) => s.profile);
  const inbox = useCareer((s) => s.inbox);
  const backend = useAccount((s) => s.backend);
  const accountUser = useAccount((s) => s.user);
  // Re-read when a cloud save landed in the browser after the menu opened, or another identity's data (the
  // guest's own, an account's cache) became the active one: the menu only ever shows the active one's.
  const pulls = useAccount((s) => s.pulls);
  const space = useAccount((s) => s.space);
  const loaded = useMemo(() => loadAutosave(), [pulls, space]);
  // A career shift this profile has already been paid for (an old copy from another device) is over:
  // it is never offered again, and the stale copy is removed here and in the cloud.
  const paidAlready =
    !!loaded && loaded.mode === 'career' && !!stored?.paidShifts?.includes(shiftKeyOf(loaded));
  const saved = paidAlready ? null : loaded;
  const profile = usable(stored) ? stored : null;
  const stacked = useMedia(STACKED);
  const daily = useDaily(saved);

  useEffect(() => {
    if (paidAlready) clearAutosave();
  }, [paidAlready]);

  useEffect(() => {
    void useAccount.getState().init();
  }, []);

  // A room the player is still in (a reload, a closed tab): the menu row says so and leads back to it.
  const signedIn = !!accountUser && user?.method === 'account' && backend === 'online';
  const [openRoom, setOpenRoom] = useState<Room | null>(null);
  useEffect(() => {
    if (!signedIn) {
      setOpenRoom(null);
      return;
    }
    let alive = true;
    fetchMyRoom()
      .then((r) => alive && setOpenRoom(r))
      .catch(() => alive && setOpenRoom(null));
    return () => {
      alive = false;
    };
  }, [signedIn, accountUser?.id]);

  // Sõbrad (2.40.0): who is online and what waits (invitations, friend requests), from the presence call.
  const friendsOnline = useFriends((s) => s.online);
  const waiting = useFriends((s) => s.invites.length + s.asking);
  const friendsLine = [
    waiting ? (waiting === 1 ? t('friends.menu.waiting.one') : t('friends.menu.waiting', { n: waiting })) : '',
    !openRoom && friendsOnline
      ? friendsOnline === 1
        ? t('friends.menu.online.one')
        : t('friends.menu.online', { n: friendsOnline })
      : '',
  ].filter(Boolean);

  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dailyPlayRef = useRef<HTMLButtonElement>(null);

  // The daily challenge's panel: closed until its row is pressed; pressed again, the row starts the challenge.
  const [dailyOpen, setDailyOpen] = useState(false);
  const dailyRow = () => rootRef.current?.querySelector<HTMLButtonElement>('[data-daily-row]') ?? null;
  const openDaily = () => {
    setDailyOpen(true);
    // A phone: the map strip on top shows the lit area above the sheet, and the sheet's own start is next.
    if (stacked) {
      const still =
        useSettings.getState().reducedMotion ||
        !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      rootRef.current?.scrollTo?.({ top: 0, behavior: still ? 'auto' : 'smooth' });
      requestAnimationFrame(() => dailyPlayRef.current?.focus({ preventScroll: true }));
    }
  };
  /** Close it; focus inside it goes back to its row. */
  const closeDaily = () => {
    const inside = !!cardRef.current?.contains(document.activeElement);
    setDailyOpen(false);
    if (inside) dailyRow()?.focus({ preventScroll: stacked });
  };
  // A click anywhere else in the menu closes it (that click still does its own thing); its dialogs do not.
  // Esc closes it too when nothing has focus (Safari does not focus a clicked button; the menu's own keys
  // handle Esc when focus is in it).
  useEffect(() => {
    if (!dailyOpen) return;
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && (e.target === document.body || e.target === document.documentElement))
        setDailyOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (
        !el ||
        !el.isConnected ||
        el.closest(`[data-daily-row], #${DAILY_PANEL}, .vk-layer, [role="dialog"]`)
      )
        return;
      setDailyOpen(false);
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [dailyOpen]);

  const go = (s: Screen) => () => setScreen(s);
  const brief = (mode: GameMode) => () => {
    // A custom game's force and area stay out of every other shift.
    setBriefing({ mode, custom: undefined, sectors: undefined });
    setScreen('briefing');
  };
  const where = profile ? areaName(profile, lang) : null;

  // A group row (Üksikmäng, Muu) opens its rows below it; the open one is kept for the session.
  const [open, setOpen] = useState<Row['id'] | null>(lastOpen);
  const toggle = (id: Row['id']) => {
    const next = open === id ? null : id;
    lastOpen = next;
    setOpen(next);
    if (next)
      requestAnimationFrame(() =>
        rootRef.current?.querySelector<HTMLButtonElement>(`[data-sub-of="${next}"] .vk-row`)?.focus(),
      );
  };

  const rows: Row[] = [
    {
      id: 'career',
      title: t('shell.menu.career'),
      desc:
        profile && where
          ? t('shell.menu.row.career', { day: profile.day, area: where.area })
          : t('shell.menu.row.careerNew'),
      mark: profile ? 'mine' : undefined,
      run: go('career'),
    },
    {
      id: 'daily',
      title: t('daily.title'),
      desc: dailyOpen
        ? t(`shell.menu.row.dailyAgain.${daily.action}`)
        : t('shell.menu.row.daily', {
            area: daily.d.area,
            slot: daily.d.slot.toLocaleLowerCase(lang),
            state: daily.short,
          }),
      mark: 'challenge',
      expanded: dailyOpen,
      controls: DAILY_PANEL,
      // The first press shows the challenge (the panel, its area on the map); the second starts it, as the
      // panel's own button does (today's run continued, a replay as practice).
      run: () => (dailyOpen ? daily.play() : openDaily()),
    },
    {
      id: 'solo',
      title: t('shell.menu.solo'),
      desc: t('shell.menu.row.solo'),
      run: () => toggle('solo'),
      sub: [
        { id: 'quick', title: t('shell.menu.quick'), desc: t('shell.menu.row.quick'), run: brief('free') },
        { id: 'custom', title: t('shell.menu.custom'), desc: t('shell.menu.row.custom'), run: go('custom') },
        {
          id: 'director',
          title: t('shell.menu.director'),
          desc: t('shell.menu.row.director'),
          run: brief('director'),
        },
      ],
    },
    {
      id: 'multi',
      title: t('rooms.title'),
      desc: [
        openRoom
          ? t('rooms.menu.rowIn', {
              code: displayRoomCode(openRoom.code),
              state: t(`rooms.state.${openRoom.state}`),
            })
          : friendsLine.length
            ? ''
            : t('rooms.menu.row'),
        ...friendsLine,
      ]
        .filter(Boolean)
        .join(' · '),
      mark: openRoom ? 'mine' : undefined,
      badge: waiting || undefined,
      run: () => openLobby(),
    },
    {
      id: 'settings',
      system: true,
      title: t('shell.menu.settings'),
      desc: t('shell.menu.row.settings'),
      run: go('settings'),
    },
    {
      id: 'more',
      system: true,
      title: t('shell.menu.more'),
      desc: t('shell.menu.row.more'),
      run: () => toggle('more'),
      sub: [
        {
          id: 'legacy',
          system: true,
          title: t('shell.menu.legacy'),
          desc: '2024, 2025',
          mono: true,
          run: go('legacy'),
        },
        {
          id: 'credits',
          system: true,
          title: t('shell.menu.credits'),
          desc: t('shell.menu.row.credits'),
          run: go('credits'),
        },
      ],
    },
  ];

  // The primary action: continue the saved shift, else the next career shift, else a new career.
  const primary: { label: string; line: string | null; run: () => void } = saved
    ? {
        label: saved.ended ? t('game.end.report') : t('shell.menu.continue'),
        line: t(saved.ended ? 'game.pending.desc' : 'shell.menu.continueDesc', {
          region: regionSummary(saved.regionId).name[lang],
          date: ddmmyyyy(saved.now),
          time: hhmm(saved.now),
          mode: t(`shell.mode.${saved.mode}`),
        }),
        // A shift whose clock ran out before its report was opened is not continued: it opens the report.
        run: () => resumeShift(saved),
      }
    : profile && where
      ? (() => {
          const next = nextShiftKind(wall(Date.now()).hour);
          return {
            label: t('shell.menu.start', { day: profile.day }),
            line: `${t(`shell.menu.next.${next.kind}`)} ${next.from}-${next.to} · ${where.area}`,
            run: () => {
              setBriefing({ mode: 'career', regionId: profile.regionId });
              setScreen('briefing');
            },
          };
        })()
      : { label: t('shell.menu.newCareer.start'), line: null, run: go('career') };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    // Keys typed in a dialog (portalled, but still inside this tree for React) or a field are theirs.
    if (!root || !root.contains(e.target as Node) || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, [role="menu"]')) return;
    if (e.key === 'Escape' && dailyOpen) {
      e.preventDefault();
      closeDaily();
      return;
    }
    const btns = Array.from(root.querySelectorAll<HTMLButtonElement>('.vk-row'));
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = e.key === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
      btns[i < 0 ? 0 : n]?.focus();
    } else if (/^[1-9]$/.test(e.key)) {
      const row = rows[Number(e.key) - 1];
      if (row) {
        e.preventDefault();
        if (row.id !== 'daily') setDailyOpen(false);
        row.run();
      }
    }
  };

  const input = useMemo<DutyInput>(
    () => mapInput(profile, { sector: daily.c.sector, regionId: daily.c.regionId }),
    [profile, daily.c.sector, daily.c.regionId],
  );
  const notices = useMemo(() => menuNotices(profile, inbox), [profile, inbox]);

  // Where the panels leave the map visible (degree labels, the leader to the challenge card); resize only.
  const [layout, setLayout] = useState<MapLayout | null>(null);
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (stacked || !main) return;
    const measure = () => {
      const m = main.getBoundingClientRect();
      if (!m.width || !m.height) return;
      const scale = Math.max(m.width / 1440, m.height / 828);
      const l = leftRef.current?.getBoundingClientRect();
      const c = cardRef.current?.getBoundingClientRect();
      const next: MapLayout = {
        scale,
        offX: (m.width - 1440 * scale) / 2,
        offY: (m.height - 828 * scale) / 2,
        left: l ? l.right - m.left : 0,
        card: c ? { left: c.left - m.left, right: c.right - m.left, bottom: c.bottom - m.top } : null,
      };
      setLayout((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    for (const el of [main, leftRef.current, cardRef.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [stacked]);

  useWholeRows([leftRef, rightRef], !stacked);

  const service = <ServicePanel rows={rows} open={open} stacked={stacked} focusFirst={!saved} />;
  const career = (
    <CareerPanel
      profile={profile}
      where={where}
      primary={primary}
      focusPrimary={!!saved}
      resuming={!!saved}
      stacked={stacked}
    />
  );
  const dailyPanel = (
    <div className={`vk-menu__daily${dailyOpen ? ' is-open' : ''}`} ref={cardRef} inert={!dailyOpen}>
      <DailyCard daily={daily} id={DAILY_PANEL} playRef={dailyPlayRef} onClose={closeDaily} />
    </div>
  );
  const noticesPanel = notices.length > 0 ? <NoticesPanel notices={notices} max={stacked ? 3 : 3} /> : null;
  const board = backend === 'online' ? <Leaderboard me={accountUser?.name ?? null} /> : null;
  // 1.82 px per km on the 1:1 map. The challenge is on the map (and in its key) only while its panel is open.
  const legendInput = useMemo(() => (dailyOpen ? input : { ...input, challenge: null }), [input, dailyOpen]);
  const legend = <MapLegend input={legendInput} compact={stacked} pxPerKm={1.82 * (layout?.scale ?? 1)} />;

  return (
    <div className={`vk vk-menu${stacked ? ' is-stacked' : ''}`} ref={rootRef} onKeyDown={onKey}>
      <ShellTopBar brandAs="h1" account={!stacked} />
      <main className="vk-menu__main" ref={mainRef}>
        {stacked ? (
          <>
            <div className="vk-menu__strip">
              <DutyMap variant="strip" input={input} lit={dailyOpen} />
              {legend}
            </div>
            <div className="vk-menu__stack">
              {career}
              {service}
              {noticesPanel}
              {board}
              {user && (
                <section className="vk-panel vk-menu__account" aria-label={t('account.method')}>
                  <ShellAccount />
                </section>
              )}
            </div>
            {dailyPanel}
          </>
        ) : (
          <>
            <div className="vk-menu__map">
              <DutyMap variant="full" input={input} layout={layout} lit={dailyOpen} />
            </div>
            <div className="vk-menu__docks">
              <div className="vk-menu__col vk-menu__col--left" ref={leftRef}>
                {service}
                {noticesPanel}
              </div>
              <div className="vk-menu__center">
                {dailyPanel}
                {legend}
              </div>
              <div className="vk-menu__col vk-menu__col--right" ref={rightRef}>
                {career}
                {board}
              </div>
            </div>
          </>
        )}
      </main>
      <p className="vk-sr" role="status">
        {dailyOpen
          ? `${t('daily.onMap', { area: daily.d.area })} ${upperFirst(t(`shell.menu.row.dailyAgain.${daily.action}`), lang)}.`
          : ''}
      </p>
      <ShellFooter>{!stacked && <MenuKeys n={rows.length} />}</ShellFooter>
    </div>
  );
}

/**
 * A panel that scrolls inside a short window (Teated, Edetabel) ends at a whole row: its list is cut to the rows
 * that fit, so no row shows half. Re-fitted when the window resizes or the list changes.
 */
function useWholeRows(cols: RefObject<HTMLElement | null>[], active: boolean) {
  useLayoutEffect(() => {
    if (!active || typeof ResizeObserver !== 'function') return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      for (const col of cols) {
        for (const body of col.current?.querySelectorAll<HTMLElement>('[data-fit-rows]') ?? []) {
          body.style.maxHeight = '';
          const avail = body.clientHeight;
          if (body.scrollHeight <= avail + 1) continue;
          const top = body.getBoundingClientRect().top;
          let fitTo = 0;
          for (const row of body.querySelectorAll<HTMLElement>(':scope > li, tbody > tr')) {
            const bottom = row.getBoundingClientRect().bottom - top;
            if (bottom > avail + 0.5) break;
            fitTo = bottom;
          }
          if (fitTo > 0) body.style.maxHeight = `${Math.floor(fitTo)}px`;
        }
      }
    };
    const later = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };
    fit();
    const ro = new ResizeObserver(later);
    const mo = new MutationObserver(later);
    for (const col of cols)
      if (col.current) {
        ro.observe(col.current);
        mo.observe(col.current, { childList: true, subtree: true });
      }
    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(frame);
    };
    // The refs are stable; `active` switches it on and off.
  }, [active]);
}

// ── Teenistus ────────────────────────────────────────────────────────────────

function ServicePanel({
  rows,
  open,
  stacked,
  focusFirst,
}: {
  rows: Row[];
  open: Row['id'] | null;
  stacked: boolean;
  focusFirst: boolean;
}) {
  const t = useT();
  const item = (r: Row, i: number, sub = false) => (
    <li key={r.id}>
      <button
        type="button"
        className={`vk-row${r.system ? ' is-system' : ''}${sub ? ' vk-row--sub' : ''}${r.sub ? ' vk-row--group' : ''}${r.id === 'daily' ? ' vk-row--daily' : ''}`}
        onClick={r.run}
        aria-keyshortcuts={sub ? undefined : String(i + 1)}
        aria-expanded={r.sub ? open === r.id : r.expanded}
        aria-controls={r.controls}
        data-daily-row={r.id === 'daily' ? '' : undefined}
        data-sfx-hover
        data-sfx="click"
        autoFocus={focusFirst && i === 0 && !sub}
      >
        <span className="vk-row__key" aria-hidden="true">
          {sub ? '' : i + 1}
        </span>
        <span className="vk-row__text">
          <span className="vk-row__title">{r.title}</span>
          <span className={`vk-row__desc${r.mono ? ' vk-mono' : ''}`}>{r.desc}</span>
        </span>
        <span className="vk-row__end" aria-hidden="true">
          {r.badge ? <span className="vk-count vk-row__badge">{r.badge}</span> : null}
          {r.mark === 'mine' && <span className="vk-row__mine" />}
          {r.mark === 'challenge' && (
            <svg className="vk-mark" width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="5.2" />
              <circle cx="7" cy="7" r="2" />
            </svg>
          )}
          {r.sub ? (
            <svg
              className={`vk-row__chev vk-row__fold${open === r.id ? ' is-open' : ''}`}
              width="16"
              height="16"
              viewBox="0 0 16 16"
            >
              <path d="M3.5 6 8 10.5 12.5 6" />
            </svg>
          ) : stacked ? (
            <svg className="vk-row__chev" width="16" height="16" viewBox="0 0 16 16">
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
          ) : (
            <span className="vk-kbd vk-row__enter">⏎</span>
          )}
        </span>
      </button>
      {r.sub && open === r.id && (
        <ul className="vk-svc__list vk-svc__sub" data-sub-of={r.id} aria-label={r.title}>
          {r.sub.map((x, k) => item(x, k, true))}
        </ul>
      )}
    </li>
  );
  return (
    <nav className="vk-panel vk-svc" aria-labelledby="vk-svc-title">
      <div className="vk-panel__head">
        <h2 className="vk-h" id="vk-svc-title">
          {t('shell.menu.service')}
        </h2>
        {!stacked && <span className="vk-meta">1-{rows.length}</span>}
      </div>
      <ul className="vk-svc__list">{rows.map((r, i) => (r.system ? null : item(r, i)))}</ul>
      <p className="vk-svc__group vk-label" id="vk-svc-system">
        {t('shell.menu.system')}
      </p>
      <ul className="vk-svc__list" aria-labelledby="vk-svc-system">
        {rows.map((r, i) => (r.system ? item(r, i) : null))}
      </ul>
    </nav>
  );
}

// ── Karjäär ──────────────────────────────────────────────────────────────────

const GRADE_LETTERS = ['S', 'A', 'B', 'C', 'D', 'F'];
const gradeOf = (g: string) => (GRADE_LETTERS.includes(g) ? g : 'F');

function Delta({ value, money, lang }: { value: number; money?: boolean; lang: Lang }) {
  const cls = value > 0 ? 'vk-up' : value < 0 ? 'vk-down' : undefined;
  return (
    <span className={`vk-mono${cls ? ' ' + cls : ''}`}>
      {money ? fmtMoney(value, lang, { sign: true }) : (value > 0 ? '+' : '') + fmtNum(value, lang)}
    </span>
  );
}

function CareerPanel({
  profile,
  where,
  primary,
  focusPrimary,
  resuming,
  stacked,
}: {
  profile: CareerProfile | null;
  where: { area: string; region: string } | null;
  primary: { label: string; line: string | null; run: () => void };
  focusPrimary: boolean;
  /** The primary button continues a saved shift: a new career still needs its own way in. */
  resuming: boolean;
  stacked: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const tx = useTx();
  const f = useMemo(() => (profile ? careerFigures(profile) : null), [profile]);
  const chart = useMemo(() => (profile ? shiftBars(profile) : null), [profile]);
  // The career's story in one line (docs/STORY.md).
  const story = useMemo(() => {
    if (!profile) return null;
    try {
      return storyLine(profile);
    } catch {
      return null;
    }
  }, [profile]);
  const go = useGame((s) => s.setScreen);

  const action = (
    <div className="vk-car__go">
      <button
        type="button"
        className="vk-btn vk-btn--primary vk-car__start"
        onClick={primary.run}
        autoFocus={focusPrimary}
        data-sfx="click"
      >
        <span>{primary.label}</span>
        {!stacked && (
          <span className="vk-car__enter" aria-hidden="true">
            ⏎
          </span>
        )}
      </button>
      <p className="vk-car__line">
        {primary.line && <span>{primary.line}</span>}
        {profile && (
          <button type="button" className="vk-linkbtn vk-car__hq" onClick={() => go('career')}>
            {t('shell.menu.hq')}
            {stacked && (
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 3.5 10.5 8 6 12.5" />
              </svg>
            )}
          </button>
        )}
      </p>
    </div>
  );

  if (!profile || !f || !where)
    return (
      <section className="vk-panel vk-car is-new" aria-labelledby="vk-car-title">
        <div className="vk-panel__head">
          <h2 className="vk-h" id="vk-car-title">
            {t('shell.menu.career')}
          </h2>
          <span className="vk-meta">{t('shell.menu.newCareer.meta')}</span>
        </div>
        <div className="vk-car__id">
          <p className="vk-car__name">{t('shell.menu.newCareer')}</p>
          <p className="vk-car__intro">{t('shell.menu.newCareer.text')}</p>
        </div>
        {action}
        {resuming && (
          <p className="vk-car__also">
            <button type="button" className="vk-linkbtn" onClick={() => go('career')}>
              {t('shell.menu.newCareer.start')}
            </button>
          </p>
        )}
      </section>
    );

  const onDay = (day: number | null) => (day !== null ? ` ${t('shell.menu.kpi.onDay', { day })}` : '');
  const kpis: { key: string; label: string; sub: ReactNode; value: ReactNode; bar?: number }[] = [
    {
      key: 'money',
      label: t('shell.menu.kpi.money'),
      sub:
        f.moneyDelta !== null ? (
          <>
            <Delta value={f.moneyDelta} money lang={lang} />
            {onDay(f.lastDay)}
          </>
        ) : null,
      value: fmtMoney(f.money, lang),
    },
    {
      key: 'rep',
      label: t('shell.menu.kpi.rep'),
      sub:
        f.repDelta !== null ? (
          <>
            <Delta value={f.repDelta} lang={lang} />
            {onDay(f.lastDay)}
          </>
        ) : null,
      value: (
        <>
          {f.rep}
          <small>/100</small>
        </>
      ),
      bar: f.rep / 100,
    },
    {
      key: 'rank',
      label: t('shell.menu.kpi.rank'),
      sub: tx(f.rank),
      value: (
        <>
          {fmtNum(f.xp, lang)}
          <small>{f.nextXp !== null ? `/${fmtNum(f.nextXp, lang)} XP` : ' XP'}</small>
        </>
      ),
      bar: f.rankProgress,
    },
    {
      key: 'payday',
      label: t('shell.menu.kpi.payday'),
      sub: f.payday === 1 ? t('shell.menu.kpi.paydayNext') : t('shell.menu.kpi.paydayIn'),
      value: f.payday,
    },
  ];
  if (f.last)
    kpis.push({
      key: 'last',
      label: t('shell.menu.kpi.last'),
      sub: t('shell.menu.kpi.onDay', { day: f.last.day }),
      value: (
        <>
          <span
            className={`vk-grade vk-grade--${gradeOf(f.last.grade)}`}
            role="img"
            aria-label={t('shell.menu.kpi.grade', { grade: f.last.grade })}
          >
            {f.last.grade}
          </span>
          {f.last.score}
        </>
      ),
    });
  kpis.push({
    key: 'shifts',
    label: t('shell.menu.kpi.shifts'),
    sub: f.best
      ? f.best.day !== null
        ? t('shell.menu.kpi.bestDay', { score: f.best.score, day: f.best.day })
        : t('shell.menu.kpi.best', { score: f.best.score })
      : null,
    value: f.shifts,
  });

  return (
    <section className="vk-panel vk-car" aria-labelledby="vk-car-title">
      <div className="vk-panel__head">
        <h2 className="vk-h" id="vk-car-title">
          {t('shell.menu.career')}
        </h2>
        <span className="vk-meta">{t('shell.menu.dayMonth', { day: f.day, month: f.month })}</span>
      </div>
      <div className="vk-car__id">
        <p className="vk-car__who">
          <span className="vk-car__name">{profile.name}</span>
          <span className="vk-car__badge vk-mono">{profile.badge}</span>
        </p>
        <p className="vk-car__pos">
          {tx(f.rank)} · {lowerFirst(tx(f.position), lang)}
        </p>
        <p className="vk-car__area">
          <span className="vk-car__swatch" aria-hidden="true" />
          {where.area === where.region
            ? where.region
            : t('shell.menu.areaLine', { area: where.area, region: where.region })}
        </p>
        {story && (
          <p className="vk-car__story">
            <span className="vk-car__chapter" aria-hidden="true" />
            <span>
              {story.state === 'told'
                ? t('story.menuTold', { total: story.total })
                : t(story.state === 'waiting' ? 'story.menuWaiting' : 'story.menu', {
                    n: story.chapter,
                    total: story.total,
                    title: tx(story.title),
                    met: story.met,
                    need: story.need,
                  })}
              {story.ask && <span className="vk-car__ask"> · {t('story.menuAsk')}</span>}
            </span>
          </p>
        )}
      </div>
      <dl className="vk-kpis">
        {kpis.map((k) => (
          <div key={k.key} className={`vk-kpi is-${k.key}`}>
            <dt>{k.label}</dt>
            <dd className="vk-kpi__value vk-mono">{k.value}</dd>
            <dd className="vk-kpi__sub">{k.sub}</dd>
            {k.bar !== undefined && (
              <span className="vk-kpi__bar" aria-hidden="true">
                <span style={{ width: `${Math.round(Math.max(0, Math.min(1, k.bar)) * 1000) / 10}%` }} />
              </span>
            )}
          </div>
        ))}
      </dl>
      {chart && (
        <div className="vk-car__chart">
          <p className="vk-car__chartHead">
            <span className="vk-label">
              {chart.from === chart.to
                ? t('shell.menu.chart.one', { from: chart.from })
                : t('shell.menu.chart', { from: chart.from, to: chart.to })}
            </span>
            <span>
              {t('shell.menu.chart.avg')} <span className="vk-mono vk-car__avg">{chart.avg}</span>
            </span>
          </p>
          <div
            className="vk-bars"
            role="img"
            aria-label={t('shell.menu.chart.aria', {
              from: chart.from,
              to: chart.to,
              list: chart.bars.map((b) => `${b.grade} ${b.score}`).join(', '),
            })}
            style={{ gridTemplateColumns: `repeat(${chart.bars.length}, 1fr)` }}
          >
            <span
              className="vk-bars__avg"
              style={{ bottom: `${barHeight(chart.avg, 100)}%` }}
              aria-hidden="true"
            />
            {chart.bars.map((b, i) => (
              <i
                key={`${b.day}-${i}`}
                className={i === chart.bars.length - 1 ? 'is-last' : undefined}
                style={{ height: `${barHeight(b.score, 100)}%` }}
              />
            ))}
          </div>
          <div
            className="vk-bars__grades"
            aria-hidden="true"
            style={{ gridTemplateColumns: `repeat(${chart.bars.length}, 1fr)` }}
          >
            {chart.bars.map((b, i) => (
              <span key={`${b.day}-${i}`} className={`vk-grade-ink vk-grade--${gradeOf(b.grade)}`}>
                {b.grade}
              </span>
            ))}
          </div>
        </div>
      )}
      {action}
    </section>
  );
}

function lowerFirst(s: string, lang: Lang): string {
  return s ? s[0].toLocaleLowerCase(lang) + s.slice(1) : s;
}

function upperFirst(s: string, lang: Lang): string {
  return s ? s[0].toLocaleUpperCase(lang) + s.slice(1) : s;
}

// ── Teated ───────────────────────────────────────────────────────────────────

function NoticesPanel({ notices, max }: { notices: Notice[]; max: number }) {
  const t = useT();
  const lang = useLang();
  const go = useGame((s) => s.setScreen);
  const textOf = (n: Notice) => noticeText(n, lang);
  return (
    <section className="vk-panel vk-notes" aria-labelledby="vk-notes-title">
      <div className="vk-panel__head">
        <h2 className="vk-h" id="vk-notes-title">
          {t('shell.menu.notices')}
        </h2>
        <span className="vk-count">{notices.length}</span>
        <button
          type="button"
          className="vk-linkbtn vk-notes__all"
          onClick={() => go('career')}
          aria-label={t('shell.menu.notices.allAria')}
        >
          {t('shell.menu.notices.all')}
        </button>
      </div>
      <ul className="vk-notes__list" data-fit-rows>
        {notices.slice(0, max).map((n, i) => (
          <li key={i} className="vk-note">
            <p className="vk-note__head">
              <span className={`vk-note__dot${n.day === null ? ' is-state' : ''}`} aria-hidden="true" />
              <NoticeLabel n={n} />
              {n.day !== null && <span className="vk-meta">{t('shell.menu.note.day', { day: n.day })}</span>}
            </p>
            <p className="vk-note__text">
              <MonoNumbers text={textOf(n)} />
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Keyboard ─────────────────────────────────────────────────────────────────

function MenuKeys({ n }: { n: number }) {
  const t = useT();
  return (
    <ul className="vk-foot__keys" aria-label={t('shell.menu.keys')}>
      <li>
        <kbd className="vk-kbd">↑</kbd>
        <kbd className="vk-kbd">↓</kbd> {t('shell.menu.keys.move')}
      </li>
      <li>
        <kbd className="vk-kbd">⏎</kbd> {t('shell.menu.keys.open')}
      </li>
      <li>
        <kbd className="vk-kbd">1</kbd>-<kbd className="vk-kbd">{n}</kbd> {t('shell.menu.keys.direct')}
      </li>
    </ul>
  );
}
