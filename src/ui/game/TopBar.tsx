import { useGame, SPEEDS } from '@/store/game';
import { useCareer } from '@/store/career';
import { useLang, useT, useTx } from '@/i18n';
import { Emblem, Icon, IconButton, Kbd } from '@/ui/components';
import { dayInfo } from '@/sim/calendar';
import { ddmmyyyy, hhmm, hhmmss, wall } from '@/sim/time';
import { selLiveStats, selRegion, selShiftProgress, selSun, soft } from './data';
import { fmtMoney, fmtNum, hmText, roadCondition, weekdayName } from './format';
import { WEATHER_ICON, useSim } from './bits';
import { useGameUi } from './uiStore';

const SPEED_LABELS = ['', '1×', '2×', '4×', '8×'];

export function TopBar() {
  const sim = useSim();
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const speedIndex = useGame((s) => s.speedIndex);
  const realtime = useGame((s) => s.realtime);
  const profile = useCareer((s) => s.profile);
  const drawerOpen = useGameUi((s) => s.drawerOpen);
  const setUi = useGameUi((s) => s.set);
  if (!sim) return null;

  const g = useGame.getState();
  const director = sim.mode === 'director';
  const region = selRegion(sim);
  const w = wall(sim.now);
  const sun = selSun(sim);
  const stats = selLiveStats(sim);
  const progress = selShiftProgress(sim);
  const holiday = soft('dayInfo', () => dayInfo(sim.now).holiday, undefined);
  const weather = sim.weather;
  const road = roadCondition(weather.roadFactor, weather.kind);
  const wIcon = weather.kind === 'clear' && !sun.isDay ? 'moon' : WEATHER_ICON[weather.kind] ?? 'cloud';
  const paused = speedIndex === 0;
  const trust = Math.round(sim.trust);
  const trustTone = trust >= 60 ? 'ok' : trust >= 35 ? 'warn' : 'danger';
  const newIncoming = sim.incidentOrder.reduce((n, id) => {
    const inc = sim.incidents[id];
    return n + (inc && inc.state === 'incoming' && !sim.flags[`hidden:${id}`] ? 1 : 0);
  }, 0);

  return (
    <header className={`gm-top${paused ? ' is-paused' : ''}`}>
      <button
        type="button"
        className="gm-top__drawer"
        onClick={() => setUi({ drawerOpen: !drawerOpen })}
        aria-label={t('game.queueDrawer')}
        title={t('game.queueDrawer')}
      >
        <Icon name="list" size={18} />
        {newIncoming > 0 && <span className="gm-top__drawer-badge">{newIncoming}</span>}
      </button>

      <div className="gm-top__brand">
        <Emblem size={30} />
        <div className="gm-top__brand-text">
          <strong>{tx(region.name)}</strong>
          <span>{t('game.centre')}</span>
        </div>
        {director && <span className="gm-top__director">{t('game.director')}</span>}
      </div>

      <div className="gm-top__clock" title={`${ddmmyyyy(sim.now)} ${hhmmss(sim.now)}`}>
        <div className="gm-top__time mono">
          {hhmmss(sim.now)}
          {paused && <span className="gm-top__paused">{t('game.paused')}</span>}
        </div>
        <div className="gm-top__date">
          <span className="mono">{ddmmyyyy(sim.now)}</span> · <span>{weekdayName(w.weekday, lang)}</span>
          {holiday && <span className="gm-top__holiday">{tx(holiday)}</span>}
        </div>
      </div>

      <div className="gm-top__env">
        <div className="gm-top__sun" title={sun.isDay ? t('game.day') : t('game.night')}>
          <Icon name={sun.isDay ? 'sun' : 'moon'} size={16} className={sun.isDay ? 'is-day' : 'is-night'} />
          {sun.sunrise !== null && sun.sunset !== null && (
            <div className="gm-top__sun-times mono">
              <span title={t('game.sunrise')}>↑{hhmm(sun.sunrise)}</span>
              <span title={t('game.sunset')}>↓{hhmm(sun.sunset)}</span>
            </div>
          )}
        </div>
        <div className="gm-top__weather" title={`${tx(weather.text)} · ${t('game.wind', { v: fmtNum(weather.windMs, 0, lang) })}`}>
          <Icon name={wIcon} size={16} />
          <div>
            <span className="mono gm-top__temp">
              {weather.tempC > 0 ? '+' : ''}
              {fmtNum(weather.tempC, 0, lang)}°C
            </span>
            <span className={`gm-top__road gm-top__road--${road}`}>{t(`game.road.${road}`)}</span>
          </div>
        </div>
      </div>

      <div className="gm-top__shift" title={`${hhmm(sim.startTime)}–${hhmm(sim.endTime)}`}>
        <div className="gm-top__shift-row">
          <span>{t('game.shift')}</span>
          <span className="mono">
            {sim.ended ? t('game.shift.over') : t('game.shift.left', { t: hmText(sim.endTime - sim.now) })}
          </span>
        </div>
        <div className="gm-top__shift-bar">
          <i style={{ width: `${(progress * 100).toFixed(2)}%` }} />
        </div>
      </div>

      <div className="gm-top__speed" role="group" aria-label={t('game.speed')}>
        <button
          type="button"
          className={`gm-speed${paused ? ' is-active is-pause' : ''}`}
          onClick={() => g.togglePause()}
          title={`${t('game.speed.pause')} (Space)`}
          aria-pressed={paused}
        >
          <Icon name={paused ? 'play' : 'pause'} size={14} />
        </button>
        {SPEEDS.slice(1).map((_, k) => {
          const i = k + 1;
          const active = !realtime && speedIndex === i;
          return (
            <button
              key={i}
              type="button"
              className={`gm-speed mono${active ? ' is-active' : ''}`}
              onClick={() => g.setSpeed(i)}
              title={`${SPEED_LABELS[i]} (${i})`}
              aria-pressed={active}
            >
              {SPEED_LABELS[i]}
            </button>
          );
        })}
        {director && (
          <button
            type="button"
            className={`gm-speed gm-speed--rt${realtime ? ' is-active' : ''}`}
            onClick={() => g.setRealtime(!realtime)}
            title={`${t('game.speed.realtimeHint')} (5)`}
            aria-pressed={realtime}
          >
            <Icon name="clock" size={13} />
            {t('game.speed.realtime')}
          </button>
        )}
      </div>

      <div className="gm-top__stats">
        <div className="gm-stat">
          <span className="gm-stat__k">{t('game.stats.open')}</span>
          <span className="gm-stat__v mono">{stats.open}</span>
        </div>
        <div className={`gm-stat${stats.p1 > 0 ? ' gm-stat--p1' : ''}`}>
          <span className="gm-stat__k">{t('game.stats.p1')}</span>
          <span className="gm-stat__v mono">{stats.p1}</span>
        </div>
        <div className="gm-stat">
          <span className="gm-stat__k">{t('game.stats.avg')}</span>
          <span className="gm-stat__v mono">{stats.avgResponse === null ? '—' : `${fmtNum(stats.avgResponse, 1, lang)}′`}</span>
        </div>
        <div className={`gm-stat${stats.unitsFree === 0 ? ' gm-stat--warn' : ''}`} title={t('game.stats.unitsTitle')}>
          <span className="gm-stat__k">{t('game.stats.units')}</span>
          <span className="gm-stat__v mono">
            {stats.unitsFree}
            <small>/{stats.unitsTotal}</small>
          </span>
        </div>
      </div>

      {!director && (
        <div className={`gm-top__trust gm-top__trust--${trustTone}`} title={t('game.trustTitle')}>
          <div className="gm-top__trust-row">
            <span>{t('game.trust')}</span>
            <span className="mono">{trust}</span>
          </div>
          <div className="gm-top__trust-bar">
            <i style={{ width: `${Math.max(0, Math.min(100, trust))}%` }} />
          </div>
        </div>
      )}

      {sim.mode === 'career' && profile && (
        <div className="gm-top__career">
          <div className="gm-stat">
            <span className="gm-stat__k">{t('game.money')}</span>
            <span className={`gm-stat__v mono${profile.money < 0 ? ' is-neg' : ''}`}>{fmtMoney(profile.money)}</span>
          </div>
          <div className="gm-stat">
            <span className="gm-stat__k">{t('game.staatus')}</span>
            <span className="gm-stat__v mono">
              <Icon name="star" size={11} /> {Math.round(profile.reputation)}
            </span>
          </div>
        </div>
      )}

      <div className="gm-top__end">
        {director && <IconButton icon="eye-off" label={t('game.hud.hide')} onClick={() => g.setHud(false)} />}
        <button type="button" className="gm-top__menu" onClick={() => setUi({ pauseOpen: true })} title={t('game.menu')}>
          <Icon name="settings" size={16} />
          <Kbd>Esc</Kbd>
        </button>
      </div>
    </header>
  );
}
