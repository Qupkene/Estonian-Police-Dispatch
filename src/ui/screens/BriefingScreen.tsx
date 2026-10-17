// Shift briefing: prefecture, difficulty, shift, date and weather → "päevakäsk" → start. Owned by ui-shell.
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useGame } from '@/store/game';
import { useCareer } from '@/store/career';
import { useLang, useT } from '@/i18n';
import { sfx } from '@/audio/sfx';
import { rankOf, rosterFromCareer } from '@/sim/career';
import { dayInfo, weekdayFactor } from '@/sim/calendar';
import { Rng } from '@/sim/rng';
import { sunTimes } from '@/sim/sun';
import { DAY, HOUR, hhmm, wall } from '@/sim/time';
import { initialWeather } from '@/sim/weather';
import type { Difficulty, GameMode, NewShiftOptions, RegionId, RosterUnit, Text, Weather } from '@/sim/types';
import { Badge, Button, Emblem, Empty, Icon, type IconName } from '@/ui/components';
import { EstoniaMap } from './shell/EstoniaMap';
import { ShellPage } from './shell/ShellPage';
import {
  DATE_PRESETS,
  formatMoney,
  presetHoliday,
  regionSummary,
  resolveDatePreset,
  SHIFT_PRESETS,
  shiftStart,
  ymdText,
  type DatePreset,
  type ShiftPreset,
  type YMD,
} from './shell/helpers';
import './shell/briefing.css';

const DIFFICULTIES: Difficulty[] = ['cadet', 'normal', 'veteran', 'realistic'];
const DIFF_FACTOR: Record<Difficulty, number> = { cadet: 0.6, normal: 1, veteran: 1.35, realistic: 1.8 };
type WeatherPick = Weather['kind'] | 'auto';
const WEATHERS: WeatherPick[] = ['auto', 'clear', 'cloudy', 'rain', 'snow', 'sleet', 'fog', 'storm'];
const WEATHER_ICON: Record<WeatherPick, IconName> = {
  auto: 'refresh',
  clear: 'sun',
  cloudy: 'cloud',
  rain: 'rain',
  snow: 'snow',
  sleet: 'rain',
  fog: 'fog',
  storm: 'wind',
};
const SHIFT_ICON: Record<ShiftPreset, IconName> = { day: 'sun', night: 'moon', short: 'timer' };

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export function BriefingScreen() {
  const t = useT();
  const lang = useLang();
  const briefing = useGame((s) => s.briefing);
  const user = useGame((s) => s.user);
  const setBriefing = useGame((s) => s.setBriefing);
  const setScreen = useGame((s) => s.setScreen);
  const profile = useCareer((s) => s.profile);
  const mode: GameMode = briefing.mode ?? 'free';
  const career = mode === 'career';

  const nowHour = wall(Date.now()).hour;
  const [regionId, setRegionId] = useState<RegionId>(
    career && profile ? profile.regionId : (briefing.regionId ?? 'pohja'),
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(briefing.difficulty ?? 'normal');
  const [shift, setShift] = useState<ShiftPreset>(
    briefing.shiftKind === 'custom'
      ? 'short'
      : briefing.shiftKind === 'day'
        ? 'day'
        : briefing.shiftKind === 'night'
          ? 'night'
          : nowHour >= 6 && nowHour < 17
            ? 'day'
            : 'night',
  );
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [weather, setWeather] = useState<WeatherPick>('auto');
  const [seed] = useState(() => Date.now() >>> 0);
  const [error, setError] = useState<string | null>(null);

  const region = regionSummary(regionId);
  const allowed: RegionId[] | undefined =
    career && profile
      ? profile.unlockedRegions?.length
        ? profile.unlockedRegions
        : [profile.regionId]
      : undefined;

  // Career calendar: day 1 = the profile's creation date.
  const date: YMD = useMemo(() => {
    if (career && profile) {
      const w = wall(profile.createdAt + (Math.max(1, profile.day) - 1) * DAY);
      return { y: w.year, m: w.month, d: w.day };
    }
    return resolveDatePreset(datePreset, Date.now());
  }, [career, profile, datePreset]);

  const start = shiftStart(date, shift);
  const hours = SHIFT_PRESETS[shift].hours;
  const forecast = useMemo(
    () =>
      safe(() =>
        initialWeather(new Rng(seed ^ 0x77), start, weather === 'auto' ? undefined : weather, regionId),
      ),
    [seed, start, weather, regionId],
  );
  const sun = useMemo(() => {
    const s = safe(() => sunTimes(start, region.hq[1], region.hq[0]));
    return s && s.sunset - s.sunrise > 30 * 60_000 ? s : null;
  }, [start, region.hq]);
  const holiday: Text | null = useMemo(() => {
    for (const k of [0, 0.5, 0.9]) {
      const info = safe(() => dayInfo(start + k * hours * HOUR));
      if (info?.holiday) return info.holiday;
    }
    return presetHoliday(date) ?? null;
  }, [start, hours, date]);
  const load = useMemo(() => {
    const dayF = Math.max(
      ...[0, 0.5, 0.9].map((k) => safe(() => dayInfo(start + k * hours * HOUR).factor) ?? 1),
    );
    const wd = safe(() => weekdayFactor(start + hours * 0.5 * HOUR)) ?? 1;
    const night = shift === 'day' ? 1 : 1.2;
    const f = dayF * wd * night * DIFF_FACTOR[difficulty];
    return f < 0.8 ? 'low' : f < 1.2 ? 'normal' : f < 1.6 ? 'high' : 'extreme';
  }, [start, hours, shift, difficulty]);

  const roster: RosterUnit[] | null = useMemo(
    () =>
      career && profile ? safe(() => rosterFromCareer(profile, shift === 'day' ? 'day' : 'night')) : null,
    [career, profile, shift],
  );
  const rank = useMemo(() => (profile ? safe(() => rankOf(profile.xp)) : null), [profile]);

  const begin = () => {
    setError(null);
    const opts: NewShiftOptions = {
      seed,
      regionId,
      mode,
      difficulty,
      start,
      hours,
      playerName: user?.name ?? profile?.name ?? 'Dispetšer',
      weather: weather === 'auto' ? forecast?.kind : weather,
      ...(career && profile
        ? {
            roster: roster && roster.length ? roster : undefined,
            upgrades: profile.upgrades,
            reputation: profile.reputation,
          }
        : {}),
    };
    setBriefing({
      mode,
      regionId,
      difficulty,
      start,
      hours,
      weather: opts.weather,
      shiftKind: SHIFT_PRESETS[shift].kind,
    });
    try {
      useGame.getState().startShift(opts);
      sfx.play('dispatch');
    } catch (e) {
      sfx.play('error');
      setError(t('shell.brief.startError', { err: e instanceof Error ? e.message : String(e) }));
    }
  };

  const orderNo = 100 + (seed % 900);
  const weekday =
    safe(() =>
      new Intl.DateTimeFormat(lang === 'et' ? 'et-EE' : 'en-GB', {
        weekday: 'long',
        timeZone: 'Europe/Tallinn',
      }).format(new Date(start)),
    ) ?? '';
  const startT = hhmm(start);
  const endT = hhmm(start + hours * HOUR);

  if (career && !profile) {
    return (
      <ShellPage title={t('shell.brief.title.career')} icon="briefcase" onBack={() => setScreen('career')}>
        <div className="sh-card sh-card--pad">
          <Empty
            icon="briefcase"
            title={t('shell.brief.career.noProfileTitle')}
            action={
              <Button variant="primary" icon="building" onClick={() => setScreen('career')}>
                {t('shell.brief.career.toHq')}
              </Button>
            }
          >
            {t('shell.brief.career.noProfile')}
          </Empty>
        </div>
      </ShellPage>
    );
  }

  return (
    <ShellPage
      title={t(`shell.brief.title.${mode === 'tutorial' ? 'free' : mode}`)}
      subtitle={t('shell.brief.subtitle')}
      icon={mode === 'director' ? 'film' : mode === 'career' ? 'briefcase' : 'siren'}
      onBack={() => setScreen(career ? 'career' : 'menu')}
      actions={
        <Button variant="primary" icon="play" onClick={begin} className="sh-brief__headStart">
          {t('shell.brief.start')}
        </Button>
      }
    >
      <div className="sh-brief">
        {/* ── Map & prefecture card ── */}
        <section className="sh-card sh-brief__mapCard">
          <h2 className="sh-section-title">
            <Icon name="map" size={14} /> {t('shell.brief.region')}
          </h2>
          <div className="sh-brief__mapWrap">
            <EstoniaMap
              value={regionId}
              onChange={setRegionId}
              allowed={allowed}
              label={t('shell.brief.region')}
            />
            <span className="sh-brief__mapHint">{t('shell.brief.mapHint')}</span>
          </div>
          <div className="sh-brief__region" aria-live="polite">
            <div className="sh-brief__regionHead">
              <span className={`sh-brief__swatch sh-brief__swatch--${regionId}`} />
              <h3>{region.name[lang]}</h3>
              {region.placeholder && <Badge tone="warn">{t('shell.brief.placeholder')}</Badge>}
            </div>
            <p>{region.description[lang]}</p>
            <div className="sh-brief__facts">
              <Fact icon="building" label={t('shell.brief.hq')} value={region.hqCity} />
              <Fact icon="home" label={t('shell.brief.stations')} value={region.stations || '—'} />
              <Fact
                icon="car"
                label={t('shell.brief.units')}
                value={career && roster ? roster.length : region.units || '—'}
              />
              <Fact icon="layers" label={t('shell.brief.counties')} value={region.counties.length} />
            </div>
          </div>
        </section>

        {/* ── Options ── */}
        <section className="sh-brief__opts">
          {career && profile && (
            <div className="sh-card sh-card--pad sh-brief__career">
              <h2 className="sh-section-title">
                <Icon name="briefcase" size={14} /> {t('shell.brief.career.profile')}
              </h2>
              <div className="sh-brief__careerGrid">
                <Stat label={t('shell.brief.career.name')} value={`${profile.name} · ${profile.badge}`} />
                <Stat label={t('shell.brief.career.rank')} value={rank ? rank.name[lang] : '—'} />
                <Stat label={t('shell.brief.career.day')} value={String(profile.day)} />
                <Stat label={t('shell.brief.career.money')} value={formatMoney(profile.money, lang)} />
                <Stat label={t('shell.brief.career.rep')} value={`${Math.round(profile.reputation)} / 100`} />
                <Stat
                  label={t('shell.brief.career.staff')}
                  value={`${profile.staff.filter((s) => s.status === 'active').length} / ${profile.staff.length}`}
                />
              </div>
            </div>
          )}

          <div className="sh-card sh-card--pad">
            <h2 className="sh-section-title">
              <Icon name="gauge" size={14} /> {t('shell.brief.difficulty')}
            </h2>
            <ChoiceGroup<Difficulty>
              label={t('shell.brief.difficulty')}
              value={difficulty}
              onChange={setDifficulty}
              className="sh-choices--diff"
            >
              {DIFFICULTIES.map((d, i) => (
                <Choice key={d} value={d}>
                  <span className="sh-choice__top">
                    <strong>{t(`shell.diff.${d}`)}</strong>
                    <span className="sh-bars" aria-hidden="true">
                      {[0, 1, 2, 3].map((k) => (
                        <i key={k} className={k <= i ? 'is-on' : ''} />
                      ))}
                    </span>
                  </span>
                  <span className="sh-choice__desc">{t(`shell.diff.${d}.desc`)}</span>
                </Choice>
              ))}
            </ChoiceGroup>
          </div>

          <div className="sh-card sh-card--pad">
            <h2 className="sh-section-title">
              <Icon name="clock" size={14} /> {t('shell.brief.shift')}
            </h2>
            <ChoiceGroup<ShiftPreset>
              label={t('shell.brief.shift')}
              value={shift}
              onChange={setShift}
              className="sh-choices--row"
            >
              {(Object.keys(SHIFT_PRESETS) as ShiftPreset[]).map((s) => (
                <Choice key={s} value={s}>
                  <Icon name={SHIFT_ICON[s]} size={18} />
                  <strong>{t(`shell.shift.${s}`)}</strong>
                  <span className="sh-choice__desc mono">{t(`shell.shift.${s}.time`)}</span>
                </Choice>
              ))}
            </ChoiceGroup>

            {!career && (
              <>
                <h2 className="sh-section-title sh-brief__gap">
                  <Icon name="flag" size={14} /> {t('shell.brief.date')}
                </h2>
                <ChoiceGroup<DatePreset>
                  label={t('shell.brief.date')}
                  value={datePreset}
                  onChange={setDatePreset}
                  className="sh-choices--chips"
                >
                  {DATE_PRESETS.map((p) => (
                    <Choice key={p} value={p}>
                      <strong>{t(`shell.date.${p}`)}</strong>
                      <span className="sh-choice__desc mono">
                        {ymdText(resolveDatePreset(p, Date.now()))}
                      </span>
                    </Choice>
                  ))}
                </ChoiceGroup>
              </>
            )}

            <h2 className="sh-section-title sh-brief__gap">
              <Icon name="cloud" size={14} /> {t('shell.brief.weather')}
            </h2>
            <ChoiceGroup<WeatherPick>
              label={t('shell.brief.weather')}
              value={weather}
              onChange={setWeather}
              className="sh-choices--chips sh-choices--weather"
            >
              {WEATHERS.map((w) => (
                <Choice key={w} value={w}>
                  <Icon name={WEATHER_ICON[w]} size={16} />
                  <strong>{t(`shell.weather.${w}`)}</strong>
                </Choice>
              ))}
            </ChoiceGroup>

            {mode === 'director' && (
              <p className="sh-brief__note">
                <Icon name="film" size={16} /> {t('shell.brief.director.note')}
              </p>
            )}
          </div>
        </section>

        {/* ── Päevakäsk ── */}
        <section className="sh-order" aria-labelledby="sh-order-title">
          <div className="sh-order__paper">
            <header className="sh-order__head">
              <Emblem size={44} />
              <div>
                <div className="sh-order__org">{region.name[lang]}</div>
                <div className="sh-order__unit">{t('shell.brief.orderUnit')}</div>
              </div>
              <div className="sh-order__meta mono">
                <div>
                  {region.hqCity}, {ymdText(date)}
                </div>
                <div>{t('shell.brief.orderNo', { n: `${wall(start).year % 100}-${orderNo}` })}</div>
              </div>
            </header>
            <h2 id="sh-order-title" className="sh-order__title">
              {t('shell.brief.order')}
            </h2>
            <div className="sh-order__body">
              <p>{t('shell.brief.orderIntro', { name: user?.name ?? profile?.name ?? '—' })}</p>
              <ol>
                <li>
                  {t('shell.brief.orderShift', {
                    date: `${weekday}, ${ymdText(date)}`,
                    from: startT,
                    to: endT,
                    hours,
                  })}
                </li>
                <li>
                  {forecast
                    ? t('shell.brief.orderWeather', { weather: forecast.text[lang] })
                    : t('shell.brief.orderWeatherNone')}
                  {forecast && forecast.windMs < 12 && (
                    <> {t('shell.brief.orderWind', { wind: Math.round(forecast.windMs) })}</>
                  )}
                  {forecast && forecast.roadFactor >= 1.2 && <> {t('shell.brief.orderRoads')}</>}
                </li>
                {sun && (
                  <li>{t('shell.brief.orderSun', { rise: hhmm(sun.sunrise), set: hhmm(sun.sunset) })}</li>
                )}
                {holiday && (
                  <li className="sh-order__hl">
                    {t('shell.brief.orderHoliday', { holiday: holiday[lang] })}
                  </li>
                )}
                <li>
                  {t('shell.brief.orderLoad', {
                    load: t(`shell.load.${load}`),
                    diff: t(`shell.diff.${difficulty}`).toLowerCase(),
                  })}
                </li>
                {mode === 'director' && <li>{t('shell.brief.orderDirector')}</li>}
              </ol>
              <p>{t('shell.brief.orderClose')}</p>
            </div>
            <footer className="sh-order__sign">
              <div>
                <div className="sh-order__sigName">{region.commander.name}</div>
                <div className="sh-dim">{region.commander.title[lang]}</div>
              </div>
              <div className="sh-order__stamp">
                <Icon name="check" size={14} /> {t('shell.brief.signed')}
              </div>
            </footer>
          </div>

          {career && (
            <div className="sh-card sh-card--pad sh-roster">
              <h2 className="sh-section-title">
                <Icon name="users" size={14} /> {t('shell.brief.career.roster')}
              </h2>
              {roster && roster.length ? (
                <ul className="sh-roster__list">
                  {roster.map((u) => (
                    <li key={u.callsign}>
                      <span className="mono sh-roster__cs">{u.callsign}</span>
                      <Badge tone={u.onCall ? 'warn' : 'accent'}>{t(`shell.unit.${u.type}`)}</Badge>
                      <span className="sh-roster__veh">{u.vehicle}</span>
                      <span className="sh-roster__crew">
                        {u.crew.map((c) => `${c.firstName[0]}. ${c.lastName}`).join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sh-muted">{t('shell.brief.career.noRoster')}</p>
              )}
            </div>
          )}

          <div className="sh-brief__start">
            {error && (
              <p className="sh-error" role="alert">
                <Icon name="warning" size={16} /> {error}
              </p>
            )}
            <Button variant="primary" size="lg" icon="play" onClick={begin} block>
              {t('shell.brief.start')}
            </Button>
            <span className="sh-dim sh-brief__startHint">
              {region.short} · {t(`shell.diff.${difficulty}`)} · {startT}–{endT} · {ymdText(date)}
            </span>
          </div>
        </section>
      </div>
    </ShellPage>
  );
}

function Fact({ icon, label, value }: { icon: IconName; label: string; value: ReactNode }) {
  return (
    <div className="sh-fact">
      <Icon name={icon} size={16} />
      <span className="sh-fact__label">{label}</span>
      <strong className="sh-fact__value">{value}</strong>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="sh-stat">
      <span className="sh-stat__label">{label}</span>
      <strong className="sh-stat__value">{value}</strong>
    </div>
  );
}

// ── Radio-card group (roving focus, arrow keys) ─────────────────────────────

interface ChoiceProps<T extends string> {
  value: T;
  children: ReactNode;
}
function Choice<T extends string>(_p: ChoiceProps<T>): null {
  return null;
}

function ChoiceGroup<T extends string>({
  value,
  onChange,
  label,
  children,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean) as {
    props: ChoiceProps<T>;
  }[];
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = items.findIndex((c) => c.props.value === value);
    const n =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (i + 1) % items.length
        : (i - 1 + items.length) % items.length;
    onChange(items[n].props.value);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[n]?.focus();
  };
  return (
    <div
      className={`sh-choices${className ? ' ' + className : ''}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
    >
      {items.map(({ props }) => {
        const active = props.value === value;
        return (
          <button
            key={props.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className={`sh-choice${active ? ' is-active' : ''}`}
            onClick={() => onChange(props.value)}
            data-sfx="click"
          >
            {props.children}
          </button>
        );
      })}
    </div>
  );
}
