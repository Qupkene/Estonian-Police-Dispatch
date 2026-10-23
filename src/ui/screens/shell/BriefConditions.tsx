// The briefing's conditions (BriefingScreen.tsx): the shift at a glance (when, weather, load), then the choices as
// pictures: difficulty cards, the shift on a 24-hour line with the busy hours and the dark, the dates as calendar
// tiles and the weather as icon tiles, each with what it does in the game (conditions.ts). Styles in briefing.css.
import { useMemo, type KeyboardEvent, type ReactNode } from 'react';
import { useT } from '@/i18n';
import { sunTimes } from '@/sim/sun';
import { DAY, HOUR, hhmm } from '@/sim/time';
import type { Difficulty, Lang, LngLat, Text, Weather } from '@/sim/types';
import {
  capitalize,
  darkSpans,
  dayBars,
  dayHours,
  difficultyCalls,
  difficultyXp,
  fmtChange,
  fmtMult,
  fmtTemp,
  kindDrive,
  loadBars,
  nightOf,
  shiftDayFactor,
  shiftTags,
  weatherEffect,
  weatherName,
  type LoadLevel,
} from './conditions';
import {
  DATE_PRESETS,
  resolveDatePreset,
  SHIFT_PRESETS,
  shiftStart,
  ymdText,
  type DatePreset,
  type ShiftPreset,
  type YMD,
} from './helpers';

export const DIFFICULTIES: Difficulty[] = ['cadet', 'normal', 'veteran', 'realistic'];
export type WeatherPick = Weather['kind'] | 'auto';
export const WEATHERS: WeatherPick[] = ['auto', 'clear', 'cloudy', 'rain', 'snow', 'sleet', 'fog', 'storm'];

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/** Long weekday name in Tallinn ("reede", "Friday"). */
function weekdayName(t: number, lang: Lang): string {
  return (
    safe(() =>
      new Intl.DateTimeFormat(lang === 'et' ? 'et-EE' : 'en-GB', {
        weekday: 'long',
        timeZone: 'Europe/Tallinn',
      }).format(new Date(t)),
    ) ?? ''
  );
}

export interface ConditionsProps {
  lang: Lang;
  /** Career: the date is the career calendar's, no date choice. */
  career: boolean;
  /** Free play: crews on duty at each difficulty (career and custom games bring their own roster). */
  unitsFor?: (d: Difficulty) => number;
  hq: LngLat;
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  shift: ShiftPreset;
  onShift: (s: ShiftPreset) => void;
  datePreset: DatePreset;
  onDatePreset: (d: DatePreset) => void;
  weather: WeatherPick;
  onWeather: (w: WeatherPick) => void;
  date: YMD;
  start: number;
  hours: number;
  /** The weather the shift will have (the forecast, or the forced kind). */
  forecast: Weather | null;
  /** The automatic forecast, for its tile. */
  autoForecast: Weather | null;
  load: LoadLevel;
  holiday: Text | null;
}

export function BriefConditions(p: ConditionsProps) {
  const t = useT();
  const { lang, difficulty, shift, start, hours, forecast } = p;
  const weekday = weekdayName(start, lang);
  const night = SHIFT_PRESETS[shift].kind !== 'day';
  const dayName = p.holiday ? p.holiday[lang] : capitalize(night ? nightOf(weekday, lang) : weekday);
  const end = start + hours * HOUR;
  const fx = forecast ? weatherEffect(forecast) : null;

  // The weather in one line, its effects in the next.
  const wxRest = forecast ? (forecast.text[lang] || forecast.text.et).split(', ').slice(2).join(', ') : '';
  const effects: string[] = [];
  if (fx) {
    if (fx.drive > 1.01) effects.push(t('shell.brief.wx.driveLong', { pct: fmtChange(fx.drive) }));
    if (fx.traffic > 1.01) effects.push(t('shell.brief.wx.traffic', { x: fmtMult(fx.traffic, lang) }));
    if (Math.abs(fx.calls - 1) > 0.01) effects.push(t('shell.brief.wx.calls', { pct: fmtChange(fx.calls) }));
    if (fx.wet) effects.push(t('shell.brief.wx.wet'));
  }

  const dayF = useMemo(() => safe(() => shiftDayFactor(start, hours)) ?? 1, [start, hours]);
  const tags = useMemo(() => safe(() => shiftTags(start, hours)) ?? [], [start, hours]);

  return (
    <section className="vk-panel vk-brief__opts" aria-labelledby="vk-brief-opts">
      <div className="vk-panel__head">
        <h2 className="vk-h" id="vk-brief-opts">
          {t('shell.brief.conditions')}
        </h2>
      </div>

      {/* ── At a glance ── */}
      <dl className="vk-cond__glance" aria-live="polite">
        <div className="vk-cond__cell">
          <dt>{t('shell.brief.when')}</dt>
          <dd>
            <span className="vk-cond__value">
              {capitalize(weekday)}, {ymdText(p.date)}
            </span>
            <span className="vk-cond__sub vk-mono">
              {hhmm(start)}-{hhmm(end)} · {t('shell.brief.hours', { n: hours })}
            </span>
          </dd>
        </div>
        <div className="vk-cond__cell">
          <dt>{t('shell.brief.weather')}</dt>
          <dd>
            <span className="vk-cond__value">
              {forecast && <WxIcon kind={forecast.kind} className="vk-cond__icon" />}
              {forecast ? `${weatherName(forecast, lang)}, ${fmtTemp(forecast.tempC)}` : '-'}
            </span>
            {fx && (
              <span className="vk-cond__sub">
                {[
                  capitalize(wxRest),
                  fx.drive > 1.01
                    ? t('shell.brief.wx.drive', { pct: fmtChange(fx.drive) })
                    : wxRest
                      ? ''
                      : t('shell.brief.wx.driveOk'),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </dd>
        </div>
        <div className="vk-cond__cell">
          <dt>{t('shell.brief.loadLabel')}</dt>
          <dd>
            <span className="vk-cond__value">
              <Bars n={loadBars(p.load)} className="vk-cond__bars" />
              {capitalize(t(`shell.load.${p.load}`))}
            </span>
            <span className="vk-cond__sub">
              {[
                p.holiday?.[lang],
                `${t('shell.brief.difficulty')}: ${t(`shell.diff.${difficulty}`).toLowerCase()}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </dd>
        </div>
      </dl>

      <div className="vk-brief__rows">
        {/* ── Difficulty ── */}
        <OptRow label={t('shell.brief.difficulty')} note={t(`shell.diff.${difficulty}.desc`)}>
          <ChoiceGroup<Difficulty>
            label={t('shell.brief.difficulty')}
            value={difficulty}
            onChange={p.onDifficulty}
            className="vk-cards vk-cards--4"
          >
            {DIFFICULTIES.map((d, i) => {
              const units = p.unitsFor?.(d);
              const calls = t('shell.brief.diffCalls', { x: fmtMult(difficultyCalls(d), lang) });
              const more =
                p.career || !units
                  ? t('shell.brief.diffXp', { x: fmtMult(difficultyXp(d), lang) })
                  : t('shell.brief.diffUnits', { n: units });
              return (
                <Choice key={d} value={d} label={`${t(`shell.diff.${d}`)}, ${calls.toLowerCase()}, ${more}`}>
                  <span className="vk-card__name">{t(`shell.diff.${d}`)}</span>
                  <Bars n={i + 1} className="vk-card__bars" />
                  <span className="vk-card__line vk-mono">{calls}</span>
                  <span className="vk-card__line vk-mono">{more}</span>
                </Choice>
              );
            })}
          </ChoiceGroup>
        </OptRow>

        {/* ── Shift on the day's line ── */}
        <OptRow label={t('shell.brief.shift')}>
          <ChoiceGroup<ShiftPreset>
            label={t('shell.brief.shift')}
            value={shift}
            onChange={p.onShift}
            className="vk-cards vk-cards--3"
          >
            {(Object.keys(SHIFT_PRESETS) as ShiftPreset[]).map((x) => {
              const s = SHIFT_PRESETS[x];
              const from = `${String(s.hour).padStart(2, '0')}:00`;
              const to = `${String((s.hour + s.hours) % 24).padStart(2, '0')}:00`;
              return (
                <Choice
                  key={x}
                  value={x}
                  label={`${t(`shell.shift.${x}`)}, ${from}-${to}, ${t('shell.brief.hours', { n: s.hours })}`}
                >
                  <span className="vk-card__name">{t(`shell.shift.${x}`)}</span>
                  <span className="vk-card__time vk-mono">
                    {from}-{to}
                  </span>
                  <span className="vk-card__line vk-mono">{t('shell.brief.hours', { n: s.hours })}</span>
                </Choice>
              );
            })}
          </ChoiceGroup>
          <Timeline date={p.date} start={start} hours={hours} hq={p.hq} />
        </OptRow>

        {/* ── Date ── */}
        {!p.career && (
          <OptRow
            label={t('shell.brief.date')}
            note={
              <>
                {dayF > 1.05
                  ? t('shell.brief.dateMore', { day: dayName, pct: `${Math.round((dayF - 1) * 100)}%` })
                  : t('shell.brief.dateCalm', { day: dayName })}
                {tags.length > 0 && (
                  <> {t('shell.brief.dateTags', { tags: tags.map((x) => t(`shell.tag.${x}`)).join(', ') })}</>
                )}
              </>
            }
          >
            <ChoiceGroup<DatePreset>
              label={t('shell.brief.date')}
              value={p.datePreset}
              onChange={p.onDatePreset}
              className="vk-cards vk-cards--dates"
            >
              {DATE_PRESETS.map((x) => {
                const ymd = resolveDatePreset(x, Date.now());
                return (
                  <Choice
                    key={x}
                    value={x}
                    label={`${t(`shell.date.${x}`)}, ${weekdayName(shiftStart(ymd, shift), lang)} ${ymdText(ymd)}`}
                  >
                    <DateTile preset={x} shift={shift} lang={lang} />
                  </Choice>
                );
              })}
            </ChoiceGroup>
          </OptRow>
        )}

        {/* ── Weather ── */}
        <OptRow
          label={t('shell.brief.weather')}
          note={
            forecast ? (
              <>
                {p.weather === 'auto'
                  ? t('shell.brief.autoWeather', { weather: forecast.text[lang] })
                  : forecast.text[lang]}
                . {capitalize(effects.length ? effects.join(', ') : t('shell.brief.wx.none'))}.
              </>
            ) : undefined
          }
        >
          <ChoiceGroup<WeatherPick>
            label={t('shell.brief.weather')}
            value={p.weather}
            onChange={p.onWeather}
            className="vk-cards vk-cards--wx"
          >
            {WEATHERS.map((w) => {
              const kind = w === 'auto' ? p.autoForecast?.kind : w;
              const drive = w === 'auto' ? null : kindDrive(w);
              const fxLine =
                w === 'auto'
                  ? p.autoForecast
                    ? `${t('shell.brief.wx.forecast')}: ${weatherName(p.autoForecast, lang)}`
                    : t('shell.brief.wx.forecast')
                  : drive && drive > 1.01
                    ? t('shell.brief.wx.drive', { pct: fmtChange(drive) })
                    : t('shell.brief.wx.driveOk');
              return (
                <Choice key={w} value={w} label={`${t(`shell.weather.${w}`)}, ${fxLine.toLowerCase()}`}>
                  <span className={`vk-wx__icon${w === 'auto' ? ' is-auto' : ''}`}>
                    {kind && <WxIcon kind={kind} />}
                  </span>
                  <span className="vk-card__name">{t(`shell.weather.${w}`)}</span>
                  <span className="vk-card__line vk-wx__fx">{fxLine}</span>
                </Choice>
              );
            })}
          </ChoiceGroup>
        </OptRow>
      </div>
    </section>
  );
}

/** A date preset as a calendar tile: its name, the date and weekday, how busy the chosen shift is on it. */
function DateTile({ preset, shift, lang }: { preset: DatePreset; shift: ShiftPreset; lang: Lang }) {
  const t = useT();
  const ymd = resolveDatePreset(preset, Date.now());
  const s = shiftStart(ymd, shift);
  const bars = dayBars(safe(() => shiftDayFactor(s, SHIFT_PRESETS[shift].hours)) ?? 1);
  return (
    <>
      <span className="vk-card__name">{t(`shell.date.${preset}`)}</span>
      <span className="vk-card__time vk-mono">{ymdText(ymd)}</span>
      <span className="vk-card__foot">
        <span className="vk-card__line">{weekdayName(s, lang)}</span>
        <Bars n={bars} />
      </span>
    </>
  );
}

/** The 24 hours from 07:00 of the shift's date: calls per hour as bars, the dark shaded, the shift marked. */
function Timeline({ date, start, hours, hq }: { date: YMD; start: number; hours: number; hq: LngLat }) {
  const t = useT();
  const dayStart = shiftStart(date, 'day');
  const bars = useMemo(() => safe(() => dayHours(dayStart, start, hours)) ?? [], [dayStart, start, hours]);
  const sun = useMemo(
    () =>
      safe(() => {
        const a = sunTimes(dayStart, hq[1], hq[0]);
        const b = sunTimes(dayStart + DAY, hq[1], hq[0]);
        return { a, b };
      }),
    [dayStart, hq],
  );
  const dark = sun ? darkSpans(dayStart, sun.a.sunrise, sun.a.sunset, sun.b.sunrise) : [];
  const pct = (x: number) => `${(x * 100).toFixed(3)}%`;
  const from = (start - dayStart) / DAY;
  const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24];
  return (
    <figure className="vk-tl">
      <div
        className="vk-tl__plot"
        role="img"
        aria-label={`${t('shell.brief.tl')}: ${t('shell.brief.tl.shift').toLowerCase()} ${hhmm(start)}-${hhmm(start + hours * HOUR)}`}
      >
        {dark.map(([a, b]) => (
          <span key={a} className="vk-tl__dark" style={{ left: pct(a), width: pct(b - a) }} />
        ))}
        <span className="vk-tl__span" style={{ left: pct(from), width: pct(hours / 24) }} />
        <span className="vk-tl__bars">
          {bars.map((h) => (
            <span key={h.t} className={h.inShift ? 'is-on' : undefined}>
              <i style={{ height: pct(Math.max(0.05, h.load)) }} />
            </span>
          ))}
        </span>
      </div>
      <div className="vk-tl__axis vk-mono" aria-hidden="true">
        {ticks.map((h) => (
          <span key={h} style={{ left: pct(h / 24) }}>
            {String((7 + h) % 24).padStart(2, '0')}
          </span>
        ))}
      </div>
      <figcaption className="vk-tl__legend">
        <span>
          <i className="vk-tl__key is-bar" aria-hidden="true" />
          {t('shell.brief.tl.busy')}
        </span>
        <span>
          <i className="vk-tl__key is-shift" aria-hidden="true" />
          {t('shell.brief.tl.shift')}
        </span>
        <span>
          <i className="vk-tl__key is-dark" aria-hidden="true" />
          {t('shell.brief.tl.dark')}
        </span>
        {sun && sun.a.sunset - sun.a.sunrise > 30 * 60_000 && (
          <span className="vk-mono vk-tl__sun">
            {t('shell.brief.tl.sun', { rise: hhmm(sun.a.sunrise), set: hhmm(sun.a.sunset) })}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** 1..4 of four small bars (load, difficulty, how busy a date is). */
function Bars({ n, className }: { n: number; className?: string }) {
  return (
    <span className={`vk-lvl${className ? ' ' + className : ''}`} aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={i <= n ? 'is-on' : undefined} />
      ))}
    </span>
  );
}

/** Line icons of the weather kinds (24-unit grid, the text colour). */
export function WxIcon({ kind, className }: { kind: Weather['kind']; className?: string }) {
  const cloud = 'M7.5 17h9.5a4 4 0 0 0 .6-7.95 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7.5 17z';
  const cloudUp = 'M7.5 14h9.5a4 4 0 0 0 .6-7.95 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7.5 14z';
  let body: ReactNode;
  switch (kind) {
    case 'clear':
      body = (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
        </>
      );
      break;
    case 'cloudy':
      body = <path d={cloud} />;
      break;
    case 'rain':
      body = (
        <>
          <path d={cloudUp} />
          <path d="M9 17l-1 3M13 17l-1 3M17 17l-1 3" />
        </>
      );
      break;
    case 'snow':
      body = (
        <>
          <path d={cloudUp} />
          <path d="M8.5 18.5h.01M12 20.5h.01M15.5 18.5h.01" strokeWidth={2.4} />
        </>
      );
      break;
    case 'sleet':
      body = (
        <>
          <path d={cloudUp} />
          <path d="M9 17l-1 3M16 17l-1 3" />
          <path d="M12.3 18.8h.01" strokeWidth={2.4} />
        </>
      );
      break;
    case 'fog':
      body = <path d="M4 8h13M6 12h14M4 16h12M8 20h9" />;
      break;
    case 'storm':
      body = (
        <>
          <path d={cloudUp} />
          <path d="M12.8 14.5l-2.2 3.5h3l-2.2 3.5" />
        </>
      );
      break;
  }
  return (
    <svg
      className={`vk-wx${className ? ' ' + className : ''}`}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {body}
    </svg>
  );
}

function OptRow({ label, note, children }: { label: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="vk-brief__row">
      <span className="vk-label vk-brief__rowLabel">{label}</span>
      <div className="vk-brief__rowCtl">
        {children}
        {note && (
          <p className="vk-brief__rowNote" aria-live="polite">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Radio group of cards (roving focus, arrow keys) ──────────────────────────

interface ChoiceProps<T extends string> {
  value: T;
  /** The radio's name for assistive tech (the card's lines in one sentence). */
  label: string;
  children: ReactNode;
}
function Choice<T extends string>(_p: ChoiceProps<T>): null {
  return null;
}

function ChoiceGroup<T extends string>({
  value,
  onChange,
  label,
  className,
  children,
}: {
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
  children: ReactNode;
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
    <div className={`vk-choices ${className ?? ''}`} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {items.map(({ props }) => {
        const active = props.value === value;
        return (
          <button
            key={props.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className="vk-card"
            aria-label={props.label}
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
