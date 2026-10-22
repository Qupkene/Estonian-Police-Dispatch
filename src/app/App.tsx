import { lazy, Suspense, useEffect } from 'react';
import { useGame } from '@/store/game';
import { useSettings } from '@/store/settings';
import { useT } from '@/i18n';
import { PpaLogo } from '@/ui/components';
import { BootScreen } from '@/ui/screens/BootScreen';
import { LoginScreen } from '@/ui/screens/LoginScreen';
import { MenuScreen } from '@/ui/screens/MenuScreen';
import { BriefingScreen } from '@/ui/screens/BriefingScreen';
import { ReportScreen } from '@/ui/screens/ReportScreen';
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
import { CreditsScreen } from '@/ui/screens/CreditsScreen';
import { LegacyScreen } from '@/ui/screens/LegacyScreen';
import { CareerScreen } from '@/ui/screens/CareerScreen';
import { LobbyScreen } from '@/ui/screens/LobbyScreen';
import { CustomScreen } from '@/ui/screens/custom/CustomScreen';
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
  const booted = screen !== 'boot';

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = theme;
    el.dataset.colorblind = String(colorblind);
    el.lang = lang;
    el.style.fontSize = `${Math.round(16 * uiScale)}px`;
    (el.style as CSSStyleDeclaration & { zoom?: string }).zoom = uiScale === 1 ? '' : String(uiScale);
  }, [theme, colorblind, uiScale, lang]);

  // Once past the boot screen, fetch the in-shift chunk while the player is still in the menus.
  useEffect(() => {
    if (!booted) return;
    const preload = () => void loadGameScreen().catch(() => {});
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(preload, { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(preload, 1500);
    return () => clearTimeout(id);
  }, [booted]);

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
