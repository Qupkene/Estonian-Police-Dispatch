// Valvekaart frame of the out-of-game screens: the top bar (wordmark, date and clock, language, account) and the
// footer (version, map credits, disclaimer, the screen's keys). Styles in vk.css. There is no live weather source,
// so the bar shows none.
import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '@/i18n';
import { useAccount } from '@/net/account';
import { useGame } from '@/store/game';
import { useSettings } from '@/store/settings';
import { hhmm, isoDate, wall } from '@/sim/time';
import type { Lang } from '@/sim/types';
import { AccountChip } from './AccountChip';
import { VERSION } from './helpers';
import './vk.css';

/** The current time, refreshed on every full minute. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let interval = 0;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(
      () => {
        tick();
        interval = window.setInterval(tick, 60_000);
      },
      60_000 - (Date.now() % 60_000) + 50,
    );
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, []);
  return now;
}

const WEEKDAY: Record<Lang, string[]> = {
  et: ['E', 'T', 'K', 'N', 'R', 'L', 'P'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

/** "R 15.01.2027" (Tallinn time, as everywhere in the game). */
export function dateLine(t: number, lang: Lang): string {
  const w = wall(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${WEEKDAY[lang][w.weekday] ?? ''} ${pad(w.day)}.${pad(w.month)}.${w.year}`;
}

/** True while the media query matches (false where matchMedia is missing, as in tests). */
export function useMedia(query: string): boolean {
  const get = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Below this width the screens stack into one column with the map as a strip on top. */
export const STACKED = '(max-width: 1099px)';

export function ShellTopBar({
  account = true,
  brandAs = 'p',
  children,
}: {
  account?: boolean;
  brandAs?: 'h1' | 'p';
  children?: ReactNode;
}) {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const now = useMinuteClock();
  const Brand = brandAs;
  return (
    <header className="vk-top">
      <div className="vk-top__cell vk-top__brand">
        <Brand className="vk-brand">
          <span aria-hidden="true">EPD</span>
          <span className="vk-sr">{t('shell.menu.name')}</span>
        </Brand>
        <span className="vk-top__name">{t('shell.menu.sub')}</span>
      </div>
      <div className="vk-top__cell vk-top__time">
        <time className="vk-top__date" dateTime={isoDate(now)}>
          {dateLine(now, lang)}
        </time>
        <time className="vk-top__clock">{hhmm(now)}</time>
      </div>
      {children}
      <div className="vk-top__spacer" />
      <div className="vk-top__cell vk-top__lang">
        <LangSwitch />
      </div>
      {account && (
        <div className="vk-top__cell vk-top__acct">
          <ShellAccount />
        </div>
      )}
    </header>
  );
}

function LangSwitch() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const set = useSettings((s) => s.set);
  const opts: { value: Lang; label: string; title: string }[] = [
    { value: 'et', label: 'ET', title: 'Eesti keel' },
    { value: 'en', label: 'EN', title: 'English' },
  ];
  return (
    <div className="vk-lang" role="group" aria-label={t('shell.set.lang')}>
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          lang={o.value}
          title={o.title}
          aria-pressed={lang === o.value}
          onClick={() => set({ lang: o.value })}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Who is playing: an account (its name, the cloud save and when it last succeeded, sign out), or a guest or
 * e-ID simulation player (saved in this browser, with a way to sign in to an account while the server is up).
 */
export function ShellAccount() {
  const t = useT();
  const user = useGame((s) => s.user);
  const backend = useAccount((s) => s.backend);
  if (!user) return null;
  if (user.method === 'account') return <AccountChip />;
  const method =
    user.method === 'legacy'
      ? t('shell.login.method.legacy')
      : user.method === 'guest'
        ? t('shell.login.guestName')
        : t(`shell.login.tab.${user.method}`);
  const signIn = () => {
    useAccount.getState().setIntent('login');
    useGame.getState().logout();
  };
  return (
    <div className="vk-acct sh-user">
      <span className="vk-acct__who">
        <span className="vk-acct__name">
          {user.name}
          {method !== user.name && <span className="vk-acct__method">{method}</span>}
        </span>
        <span className="vk-acct__state">
          <span className="vk-acct__dot" aria-hidden="true" />
          {backend === 'online' ? (
            <button type="button" className="vk-linkbtn vk-acct__signin" onClick={signIn}>
              {t('shell.frame.signIn')}
            </button>
          ) : (
            t('shell.frame.local')
          )}
        </span>
      </span>
      <button
        type="button"
        className="vk-btn vk-btn--ghost vk-acct__out"
        onClick={() => useGame.getState().logout()}
      >
        {t('shell.menu.logout')}
      </button>
    </div>
  );
}

export function ShellFooter({ children }: { children?: ReactNode }) {
  const t = useT();
  return (
    <footer className="vk-foot">
      <span className="vk-foot__version">EPD {VERSION} · politsei.eu</span>
      <span className="vk-foot__credit">{t('shell.frame.mapCredit')}</span>
      <p className="vk-foot__disclaimer">{t('shell.frame.disclaimer')}</p>
      {children}
      <p className="vk-foot__line">
        EPD {VERSION} · politsei.eu · {t('shell.frame.mapCreditShort')}
      </p>
    </footer>
  );
}

/** Back to where the player came from ("Peamenüü Esc"), at the start of a page head. */
export function PageBack({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button type="button" className="vk-back" onClick={onBack} aria-keyshortcuts="Escape">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10 3.5 5.5 8l4.5 4.5" />
      </svg>
      {label}
      <kbd className="vk-kbd" aria-hidden="true">
        Esc
      </kbd>
    </button>
  );
}
