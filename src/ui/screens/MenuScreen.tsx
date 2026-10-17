// Main menu. Owned by ui-shell.
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { clearAutosave, loadAutosave, shiftKeyOf, useGame, type Screen } from '@/store/game';
import { useCareer } from '@/store/career';
import { useAccount } from '@/net/account';
import { useLang, useT } from '@/i18n';
import type { GameMode } from '@/sim/types';
import { ddmmyyyy, hhmm } from '@/sim/time';
import { Badge, Button, Emblem, Icon, IconButton, type IconName } from '@/ui/components';
import { AccountChip } from './shell/AccountChip';
import { Leaderboard } from './shell/Leaderboard';
import { Backdrop } from './shell/Backdrop';
import { Disclaimer, LangToggle } from './shell/ShellPage';
import { formatMoney, regionSummary, VERSION } from './shell/helpers';
import './shell/shell.css';
import './shell/menu.css';

interface Item {
  id: string;
  icon: IconName;
  title: string;
  desc: string;
  primary?: boolean;
  badge?: string;
  run: () => void;
}

const NEWS: { icon: IconName; key: string }[] = [
  { icon: 'map', key: 'shell.menu.news.map' },
  { icon: 'list', key: 'shell.menu.news.incidents' },
  { icon: 'fingerprint', key: 'shell.menu.news.registry' },
  { icon: 'phone', key: 'shell.menu.news.calls' },
  { icon: 'radio', key: 'shell.menu.news.radio' },
  { icon: 'moon', key: 'shell.menu.news.time' },
  { icon: 'briefcase', key: 'shell.menu.news.career' },
  { icon: 'film', key: 'shell.menu.news.director' },
];

export function MenuScreen() {
  const t = useT();
  const lang = useLang();
  const user = useGame((s) => s.user);
  const setScreen = useGame((s) => s.setScreen);
  const setBriefing = useGame((s) => s.setBriefing);
  const resumeShift = useGame((s) => s.resumeShift);
  const logout = useGame((s) => s.logout);
  const profile = useCareer((s) => s.profile);
  const backend = useAccount((s) => s.backend);
  const accountUser = useAccount((s) => s.user);
  // Re-read when a cloud save landed in the browser after the menu opened.
  const pulls = useAccount((s) => s.pulls);
  const loaded = useMemo(() => loadAutosave(), [pulls]);
  // A career shift this profile has already been paid for (an old copy from another device) is over:
  // it is never offered again, and the stale copy is removed here and in the cloud.
  const paidAlready = !!loaded && loaded.mode === 'career' && !!profile?.paidShifts?.includes(shiftKeyOf(loaded));
  const saved = paidAlready ? null : loaded;
  const isAccount = user?.method === 'account';

  useEffect(() => {
    if (paidAlready) clearAutosave();
  }, [paidAlready]);

  useEffect(() => {
    void useAccount.getState().init();
  }, []);

  const createAccount = () => {
    useAccount.getState().setIntent('register');
    logout();
  };
  const listRef = useRef<HTMLDivElement>(null);

  const go = (s: Screen) => () => setScreen(s);
  const brief = (mode: GameMode) => () => {
    setBriefing({ mode });
    setScreen('briefing');
  };

  const items: Item[] = [];
  if (saved) {
    const r = regionSummary(saved.regionId);
    const vars = {
      region: r.name[lang],
      date: ddmmyyyy(saved.now),
      time: hhmm(saved.now),
      mode: t(`shell.mode.${saved.mode}`),
    };
    // A shift whose clock ran out before its report was opened is not continued: it opens the report.
    items.push({
      id: 'continue',
      icon: saved.ended ? 'newspaper' : 'play',
      title: saved.ended ? t('game.end.report') : t('shell.menu.continue'),
      desc: saved.ended ? t('game.pending.desc', vars) : t('shell.menu.continueDesc', vars),
      primary: true,
      run: () => resumeShift(saved),
    });
  }
  items.push(
    {
      id: 'career',
      icon: 'briefcase',
      title: t('shell.menu.career'),
      desc: profile
        ? t('shell.menu.careerDescProfile', {
            day: profile.day,
            money: formatMoney(profile.money, lang),
            rep: Math.round(profile.reputation),
          })
        : t('shell.menu.careerDesc'),
      primary: !saved,
      run: go('career'),
    },
    {
      id: 'quick',
      icon: 'siren',
      title: t('shell.menu.quick'),
      desc: t('shell.menu.quickDesc'),
      run: brief('free'),
    },
    {
      id: 'director',
      icon: 'film',
      title: t('shell.menu.director'),
      desc: t('shell.menu.directorDesc'),
      run: brief('director'),
    },
    {
      id: 'settings',
      icon: 'settings',
      title: t('shell.menu.settings'),
      desc: t('shell.menu.settingsDesc'),
      run: go('settings'),
    },
    {
      id: 'legacy',
      icon: 'book',
      title: t('shell.menu.legacy'),
      desc: t('shell.menu.legacyDesc'),
      badge: '2024 · 2025',
      run: go('legacy'),
    },
    {
      id: 'credits',
      icon: 'star',
      title: t('shell.menu.credits'),
      desc: t('shell.menu.creditsDesc'),
      run: go('credits'),
    },
  );

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const btns = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('.sh-menu__item') ?? []);
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = e.key === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
      btns[i < 0 ? 0 : n]?.focus();
    } else if (/^[1-9]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const it = items[Number(e.key) - 1];
      if (it) {
        e.preventDefault();
        it.run();
      }
    }
  };

  const methodLabel = user
    ? user.method === 'account'
      ? t('account.method')
      : user.method === 'legacy'
      ? t('shell.login.method.legacy')
      : user.method === 'guest'
        ? t('shell.login.guestName')
        : t(`shell.login.tab.${user.method}`)
    : '';
  const initials = (user?.name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <div className="sh-screen sh-menu" onKeyDown={onKey}>
      <Backdrop variant="grid" />
      <header className="sh-menu__top">
        <div className="sh-menu__logo">
          <Emblem size={30} />
          <span className="mono">EPD {VERSION}</span>
        </div>
        <div className="sh-menu__topRight">
          <LangToggle />
          {isAccount && <AccountChip />}
          {user && !isAccount && (
            <div className="sh-user" title={user.idcode ? `${user.name} · ${user.idcode}` : user.name}>
              <span className="sh-user__avatar" aria-hidden="true">
                {initials}
              </span>
              <span className="sh-user__text">
                <span className="sh-user__name">{user.name}</span>
                <span className="sh-user__method">
                  <Icon
                    name={user.method === 'legacy' ? 'keyboard' : user.method === 'guest' ? 'user' : 'lock'}
                    size={11}
                  />
                  {methodLabel}
                </span>
              </span>
              <IconButton icon="logout" size="sm" label={t('shell.menu.logout')} onClick={logout} />
            </div>
          )}
        </div>
      </header>

      <main className="sh-menu__main">
        <section className="sh-menu__left">
          <div className="sh-menu__hero">
            <h1 className="sh-menu__title">EPD</h1>
            <div className="sh-menu__name">{t('shell.menu.name')}</div>
            <div className="sh-menu__sub">{t('shell.menu.sub')}</div>
          </div>
          <nav className="sh-menu__list" ref={listRef} aria-label={t('shell.menu.aria')}>
            {items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                className={`sh-menu__item${it.primary ? ' is-primary' : ''}`}
                onClick={it.run}
                data-sfx-hover
                data-sfx="click"
                autoFocus={i === 0}
                style={{ animationDelay: `${60 + i * 45}ms` }}
              >
                <span className="sh-menu__icon">
                  <Icon name={it.icon} size={20} />
                </span>
                <span className="sh-menu__text">
                  <span className="sh-menu__itemTitle">
                    {it.title}
                    {it.badge && <Badge tone="gold">{it.badge}</Badge>}
                  </span>
                  <span className="sh-menu__desc">{it.desc}</span>
                </span>
                <kbd className="sh-menu__key">{i + 1}</kbd>
                <Icon name="chevron-right" size={18} className="sh-menu__chev" />
              </button>
            ))}
          </nav>
        </section>

        <aside className="sh-menu__right">
          {backend === 'online' && !isAccount && (
            <section className="sh-card sh-guest">
              <span className="sh-guest__icon" aria-hidden="true">
                <Icon name="cloud" size={18} />
              </span>
              <div className="sh-guest__text">
                <strong>{t('account.guest.title')}</strong>
                <span>{t('account.guest.text')}</span>
              </div>
              <Button size="sm" variant="primary" icon="user" onClick={createAccount}>
                {t('account.guest.cta')}
              </Button>
            </section>
          )}
          {backend === 'online' && <Leaderboard me={accountUser?.name ?? null} />}
          <section className="sh-card sh-news">
            <h2 className="sh-news__title">
              <Icon name="star" size={16} /> {t('shell.menu.news')}
              <Badge tone="accent">2.0</Badge>
            </h2>
            <ul className="sh-news__list">
              {NEWS.map((n) => (
                <li key={n.key}>
                  <span className="sh-news__icon">
                    <Icon name={n.icon} size={16} />
                  </span>
                  <span>{t(n.key)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="sh-card sh-tip">
            <Icon name="keyboard" size={16} />
            <span>{t('shell.menu.tip', { n: items.length })}</span>
          </section>
        </aside>
      </main>
      <footer className="sh-menu__foot">
        <span className="mono sh-dim">v{VERSION} · politsei.eu</span>
        <Disclaimer />
      </footer>
    </div>
  );
}
