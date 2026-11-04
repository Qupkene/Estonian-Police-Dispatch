import { lazy, Suspense, useEffect } from 'react';
import { useGame } from '@/store/game';
import { useSettings } from '@/store/settings';
import { loadTemplates } from '@/sim/templates';
import { useT } from '@/i18n';
import { PpaLogo } from '@/ui/components';
import { BootScreen } from '@/ui/screens/BootScreen';
import { LoginScreen } from '@/ui/screens/LoginScreen';
import { MenuScreen } from '@/ui/screens/MenuScreen';
import { ChallengeGate, takeChallengeLink } from '@/ui/screens/shell/Challenge';
import { FriendsGate } from '@/ui/screens/shell/Friends';
import { ReplayLayer } from '@/ui/replay/ReplayLayer';
import { AudioBridge } from '@/audio/AudioBridge';
import { AppBoundary, isChunkError, QuietBoundary } from './AppBoundary';
import './app.css';

// ── In-shift screen, loaded on demand ────────────────────────────────────────
// MapLibre and the CAD screen are a separate chunk, so the boot screen paints without waiting for
// them. The service worker precaches that chunk (public/sw.js PRECACHE), so play still works offline.

const RELOAD_KEY = 'epd:chunkReload';

type GameModule = typeof import('@/ui/game/GameScreen');
let gameChunk: Promise<GameModule> | null = null;

/** Load (or start preloading) the in-shift screen. A failed load is retried on the next call. */
export function loadGameScreen(): Promise<GameModule> {
  gameChunk ??= import('@/ui/game/GameScreen').catch((err: unknown) => {
    gameChunk = null;
    throw err;
  });
  return gameChunk;
}

/**
 * A tab still running the previous build asks for a chunk the server no longer has: one reload fetches
 * the current build (the shift is saved on the way out). Never twice within 30 s and never offline;
 * otherwise the error reaches the error boundary, which offers the reload itself.
 */
function reloadOnceIfStale(err: unknown): Promise<never> {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    /* storage blocked */
  }
  if (isChunkError(err) && navigator.onLine !== false && Date.now() - last > 30_000) {
    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      location.reload();
      return new Promise<never>(() => {});
    } catch {
      /* storage blocked: no protection against a reload loop, so show the error instead */
    }
  }
  return Promise.reject(err);
}

const GameScreen = lazy(() => loadGameScreen().then((m) => ({ default: m.GameScreen }), reloadOnceIfStale));

// ── The other pages past the menu, loaded on demand ──────────────────────────
// The start, the sign-in and the menu are in the entry chunk; the other pages, and their styles, come when first
// opened (and in idle time from the menu on, so a click rarely waits). The service worker precaches them too.

/** A chunk loaded once; a failed load is tried again on the next call. */
function chunk<M>(load: () => Promise<M>): () => Promise<M> {
  let p: Promise<M> | null = null;
  return () =>
    (p ??= load().catch((err: unknown) => {
      p = null;
      throw err;
    }));
}

const PAGES = {
  briefing: chunk(() => import('@/ui/screens/BriefingScreen')),
  report: chunk(() => import('@/ui/screens/ReportScreen')),
  settings: chunk(() => import('@/ui/screens/SettingsScreen')),
  credits: chunk(() => import('@/ui/screens/CreditsScreen')),
  legacy: chunk(() => import('@/ui/screens/LegacyScreen')),
  career: chunk(() => import('@/ui/screens/CareerScreen')),
  lobby: chunk(() => import('@/ui/screens/LobbyScreen')),
  custom: chunk(() => import('@/ui/screens/custom/CustomScreen')),
};

const BriefingScreen = lazy(() =>
  PAGES.briefing().then((m) => ({ default: m.BriefingScreen }), reloadOnceIfStale),
);
const ReportScreen = lazy(() => PAGES.report().then((m) => ({ default: m.ReportScreen }), reloadOnceIfStale));
const SettingsScreen = lazy(() =>
  PAGES.settings().then((m) => ({ default: m.SettingsScreen }), reloadOnceIfStale),
);
const CreditsScreen = lazy(() =>
  PAGES.credits().then((m) => ({ default: m.CreditsScreen }), reloadOnceIfStale),
);
const LegacyScreen = lazy(() => PAGES.legacy().then((m) => ({ default: m.LegacyScreen }), reloadOnceIfStale));
const CareerScreen = lazy(() => PAGES.career().then((m) => ({ default: m.CareerScreen }), reloadOnceIfStale));
const LobbyScreen = lazy(() => PAGES.lobby().then((m) => ({ default: m.LobbyScreen }), reloadOnceIfStale));
const CustomScreen = lazy(() => PAGES.custom().then((m) => ({ default: m.CustomScreen }), reloadOnceIfStale));

// A challenge link (/v/<code>, docs/CHALLENGE.md): remembered, and the address goes back to the game's own.
takeChallengeLink();

const SCREENS = {
  boot: BootScreen,
  login: LoginScreen,
  menu: MenuScreen,
  briefing: BriefingScreen,
  game: GameScreen,
  report: ReportScreen,
  settings: SettingsScreen,
  credits: CreditsScreen,
  legacy: LegacyScreen,
  career: CareerScreen,
  lobby: LobbyScreen,
  custom: CustomScreen,
} as const;

export function App() {
  const screen = useGame((s) => s.screen);
  const theme = useSettings((s) => s.theme);
  const colorblind = useSettings((s) => s.colorblind);
  const uiScale = useSettings((s) => s.uiScale);
  const lang = useSettings((s) => s.lang);
  // Past the start and the sign-in: the player is in the menus, where a shift is a click away.
  const inside = screen !== 'boot' && screen !== 'login';

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = theme;
    el.dataset.colorblind = String(colorblind);
    el.lang = lang;
    el.style.fontSize = `${Math.round(16 * uiScale)}px`;
    (el.style as CSSStyleDeclaration & { zoom?: string }).zoom = uiScale === 1 ? '' : String(uiScale);
  }, [theme, colorblind, uiScale, lang]);

  // Once in the menus, fetch the in-shift chunk and the other pages while the player is still choosing (the start and
  // the sign-in page do without them and the map engine, so they load and settle sooner).
  useEffect(() => {
    if (!inside) return;
    const preload = () => {
      void loadGameScreen().catch(() => {});
      void loadTemplates().catch(() => {});
      for (const load of Object.values(PAGES)) void load().catch(() => {});
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(preload, { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(preload, 1500);
    return () => clearTimeout(id);
  }, [inside]);

  const Screen = SCREENS[screen];
  return (
    <>
      <QuietBoundary>
        <AudioBridge />
      </QuietBoundary>
      <AppBoundary key={screen}>
        <Suspense fallback={<Loading />}>
          <Screen />
        </Suspense>
      </AppBoundary>
      <QuietBoundary>
        <ChallengeGate />
      </QuietBoundary>
      <QuietBoundary>
        <FriendsGate />
      </QuietBoundary>
      <QuietBoundary>
        <ReplayLayer />
      </QuietBoundary>
    </>
  );
}

function Loading() {
  const t = useT();
  return (
    <div className="app-loading" role="status">
      <PpaLogo height={32} className="app-loading__ppa" />
      <span>{t('game.loading')}</span>
    </div>
  );
}
