import { useEffect } from 'react';
import { useGame } from '@/store/game';
import { useSettings } from '@/store/settings';
import { BootScreen } from '@/ui/screens/BootScreen';
import { LoginScreen } from '@/ui/screens/LoginScreen';
import { MenuScreen } from '@/ui/screens/MenuScreen';
import { BriefingScreen } from '@/ui/screens/BriefingScreen';
import { ReportScreen } from '@/ui/screens/ReportScreen';
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
import { CreditsScreen } from '@/ui/screens/CreditsScreen';
import { LegacyScreen } from '@/ui/screens/LegacyScreen';
import { CareerScreen } from '@/ui/screens/CareerScreen';
import { GameScreen } from '@/ui/game/GameScreen';
import { AudioBridge } from '@/audio/AudioBridge';

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
} as const;

export function App() {
  const screen = useGame((s) => s.screen);
  const theme = useSettings((s) => s.theme);
  const colorblind = useSettings((s) => s.colorblind);
  const uiScale = useSettings((s) => s.uiScale);
  const lang = useSettings((s) => s.lang);

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = theme;
    el.dataset.colorblind = String(colorblind);
    el.lang = lang;
    el.style.fontSize = `${Math.round(16 * uiScale)}px`;
    (el.style as CSSStyleDeclaration & { zoom?: string }).zoom = uiScale === 1 ? '' : String(uiScale);
  }, [theme, colorblind, uiScale, lang]);

  const Screen = SCREENS[screen];
  return (
    <>
      <AudioBridge />
      <Screen />
    </>
  );
}
