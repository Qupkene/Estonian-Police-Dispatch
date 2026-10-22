// Shift briefing: prefecture, difficulty, shift, date and weather → "päevakäsk" → start. Owned by ui-shell.
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useGame } from '@/store/game';
import { useCareer } from '@/store/career';
import { useLang, useT, useTx } from '@/i18n';
import { PpaLogo } from '@/ui/components';
import { sfx } from '@/audio/sfx';
import { REGIONS } from '@/data/regions';
import { rankOf, rosterFromCareer } from '@/sim/career';
import { storyOrder } from '@/sim/story';
import { nightCoverFor } from '@/sim/colleagues';
import { expandCustom } from '@/sim/custom';
import { areaStations, neighbourSectors, sectorById } from '@/sim/sectors';
import { dayInfo, weekdayFactor } from '@/sim/calendar';
import { shiftKindOf } from '@/sim/engine';
import { Rng } from '@/sim/rng';
import { sunTimes } from '@/sim/sun';
import { DAY, HOUR, hhmm, wall } from '@/sim/time';
import { initialWeather } from '@/sim/weather';
import type { Difficulty, GameMode, NewShiftOptions, RegionId, RosterUnit, Text, Weather } from '@/sim/types';
import { EstoniaMap } from './shell/EstoniaMap';
import { DutyMap } from './shell/DutyMap';
import { fitView, type DutyInput, type MapView } from './shell/dutyMap';
import { MapLegend } from './shell/MapLegend';
import {
  careerShiftArea,
  colleagueName,
  rosterByStation,
  stationName,
  type ShiftArea,
} from './career/sectors';
import { ShellPage, useEnter } from './shell/ShellPage';
import { SignedStamp } from './shell/ShellFrame';
import {
  careerShiftRegion,
  DATE_PRESETS,
  formatMoney,
  presetHoliday,
  regionSummary,
  regionUnitsOnDuty,
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

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export function BriefingScreen() {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const briefing = useGame((s) => s.briefing);
  const user = useGame((s) => s.user);
  const setBriefing = useGame((s) => s.setBriefing);
  const setScreen = useGame((s) => s.setScreen);
  const profile = useCareer((s) => s.profile);
  const mode: GameMode = briefing.mode ?? 'free';
  const career = mode === 'career';
  // Custom game (src/sim/custom.ts): the force and the area were drafted on the custom screen; the prefecture is theirs.
  const custom = !career && briefing.custom && briefing.regionId ? briefing.custom : null;
  const customArea = custom ? (briefing.sectors ?? []) : [];

  const nowHour = wall(Date.now()).hour;
  // Career: the prefecture picked in HQ when it is unlocked, else the home region.
  const [regionId, setRegionId] = useState<RegionId>(() =>
    career && profile ? careerShiftRegion(profile, briefing.regionId) : (briefing.regionId ?? 'pohja'),
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
  const allowed: RegionId[] | undefined = custom
    ? [briefing.regionId!]
    : career && profile
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

  const shiftKind = shiftKindOf(start);
  // Tonight's night cover is decided from the seed and the start, exactly as createShift will (nightCoverFor).
  const area: ShiftArea | null = useMemo(
    () =>
      career && profile
        ? safe(() => {
            const own = careerShiftArea(profile, regionId);
            const cover = own.sectors.length ? nightCoverFor({ regionId, sectors: own.sectors, seed, start }) : [];
            return cover.length ? careerShiftArea(profile, regionId, cover) : own;
          })
        : null,
    [career, profile, regionId, seed, start],
  );
  const areaOn = !!area && area.sectors.length > 0;
  const areaName = (ids: string[]) =>
    ids
      .map((id) => sectorById(id)?.name)
      .filter((x): x is Text => !!x)
      .map((x) => x[lang])
      .join(', ');
  const roster: RosterUnit[] | null = useMemo(
    () =>
      career && profile
        ? safe(() => rosterFromCareer(profile, shiftKind, regionId))
        : custom
          ? safe(() => expandCustom(regionId, custom, shiftKind))
          : null,
    [career, profile, shiftKind, regionId, custom],
  );
  // Units actually on duty for this shift and difficulty (not the whole roster file).
  const unitsOnDuty = useMemo(
    () => regionUnitsOnDuty(regionId, shiftKind, difficulty),
    [regionId, shiftKind, difficulty],
  );
  const rank = useMemo(() => (profile ? safe(() => rankOf(profile.xp)) : null), [profile]);
  // The career's story speaks in the order too (docs/STORY.md): the current chapter's line.
  const storyOrderText = useMemo(
    () => (career && profile ? safe(() => storyOrder(profile)) : null),
    [career, profile],
  );
  const storyLineText = storyOrderText ? storyOrderText[lang] || storyOrderText.et : null;

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
            ...(areaOn ? { sectors: area!.sectors, openPosts: area!.posts } : {}),
          }
        : {}),
      ...(custom ? { custom, ...(customArea.length ? { sectors: customArea } : {}) } : {}),
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

  const summary = `${region.name[lang]} · ${t(`shell.diff.${difficulty}`)} · ${t(`shell.shift.${shift}`)} ${startT}-${endT} · ${ymdText(date)}`;
  const startButton = (
    <button type="button" className="vk-btn vk-btn--primary vk-go" onClick={begin} data-sfx="click">
      <span>{t('shell.brief.start')}</span>
      <span className="vk-go__key" aria-hidden="true">
        ⏎
      </span>
    </button>
  );
  const startKey = (
    <li>
      <kbd className="vk-kbd">⏎</kbd> {t('career.vk.key.start')}
    </li>
  );

  if (career && !profile) {
    return (
      <ShellPage title={t('shell.brief.title.career')} onBack={() => setScreen('career')} backTo="career">
        <section className="vk-panel vk-brief__empty" aria-labelledby="vk-brief-empty">
          <div className="vk-panel__head">
            <h2 className="vk-h" id="vk-brief-empty">
              {t('shell.brief.career.noProfileTitle')}
            </h2>
          </div>
          <div className="vk-panel__body">
            <p>{t('shell.brief.career.noProfile')}</p>
          </div>
          <div className="vk-panel__foot">
            <button type="button" className="vk-btn vk-btn--primary" onClick={() => setScreen('career')}>
              {t('shell.brief.career.toHq')}
            </button>
          </div>
        </section>
      </ShellPage>
    );
  }

  const stations =
    (areaOn && safe(() => areaStations(REGIONS[regionId], area!.sectors, area!.posts).length)) ||
    region.stations ||
    '-';
  const units = (career || custom) && roster ? roster.length : unitsOnDuty || '-';

  return (
    <ShellPage
      title={t(custom ? 'shell.brief.title.custom' : `shell.brief.title.${mode === 'tutorial' ? 'free' : mode}`)}
      subtitle={summary}
      meta={t('shell.brief.orderNo', { n: `${wall(start).year % 100}-${orderNo}` })}
      onBack={() => setScreen(career ? 'career' : custom ? 'custom' : 'menu')}
      backTo={career ? 'career' : 'menu'}
      actions={startButton}
      keys={startKey}
      className="vk-brief-page"
    >
      <Enter fn={begin} />
      {career && profile && (
        <dl className="vk-strip vk-panel vk-brief__strip" style={{ '--vk-strip-n': 6 } as CSSProperties}>
          <StripCell label={t('shell.brief.career.name')} value={profile.name} sub={profile.badge} />
          <StripCell label={t('shell.brief.career.rank')} value={rank ? rank.name[lang] : '-'} />
          <StripCell label={t('shell.brief.career.day')} value={String(profile.day)} mono />
          <StripCell label={t('shell.brief.career.money')} value={formatMoney(profile.money, lang)} mono />
          <StripCell
            label={t('shell.brief.career.rep')}
            value={
              <>
                {Math.round(profile.reputation)}
                <small>/100</small>
              </>
            }
            mono
          />
          <StripCell
            label={t('shell.brief.career.staff')}
            value={
              <>
                {profile.staff.filter((x) => x.status === 'active').length}
                <small>/{profile.staff.length}</small>
              </>
            }
            mono
          />
        </dl>
      )}
      <div className="vk-brief">
        <div className="vk-brief__col">
          {/* ── Prefecture ── */}
          <section className="vk-panel vk-brief__region" aria-labelledby="vk-brief-region">
            <div className="vk-panel__head">
              <h2 className="vk-h" id="vk-brief-region">
                {t('shell.brief.region')}
              </h2>
              <span className="vk-panel__meta">{t('shell.brief.mapHint')}</span>
            </div>
            <div className="vk-brief__regionBody">
              <div className="vk-brief__mapWrap">
                <EstoniaMap
                  value={regionId}
                  onChange={setRegionId}
                  allowed={allowed}
                  label={t('shell.brief.region')}
                />
              </div>
              <div className="vk-brief__regionText" aria-live="polite">
                <h3 className="vk-brief__regionName">
                  {region.name[lang]}
                  {region.placeholder && (
                    <span className="vk-brief__tag">{t('shell.brief.placeholder')}</span>
                  )}
                </h3>
                <dl className="vk-kv">
                  <div>
                    <dt>{t('shell.brief.hq')}</dt>
                    <dd>{region.hqCity}</dd>
                  </div>
                  <div>
                    <dt>{t('shell.brief.stations')}</dt>
                    <dd className="vk-mono">{stations}</dd>
                  </div>
                  <div>
                    <dt>{t('shell.brief.units')}</dt>
                    <dd className="vk-mono">{units}</dd>
                  </div>
                  <div>
                    <dt>{t('shell.brief.counties')}</dt>
                    <dd className="vk-mono">{region.counties.length}</dd>
                  </div>
                </dl>
                <p className="vk-brief__desc">{region.description[lang]}</p>
              </div>
            </div>
          </section>

          {areaOn && <AreaPanel regionId={regionId} area={area!} who={profile?.name ?? ''} />}

          {/* ── Conditions ── */}
          <section className="vk-panel vk-brief__opts" aria-labelledby="vk-brief-opts">
            <div className="vk-panel__head">
              <h2 className="vk-h" id="vk-brief-opts">
                {t('shell.brief.conditions')}
              </h2>
            </div>
            <div className="vk-brief__rows">
              <OptRow label={t('shell.brief.difficulty')} note={t(`shell.diff.${difficulty}.desc`)}>
                <ChoiceGroup<Difficulty>
                  label={t('shell.brief.difficulty')}
                  value={difficulty}
                  onChange={setDifficulty}
                >
                  {DIFFICULTIES.map((d) => (
                    <Choice key={d} value={d}>
                      {t(`shell.diff.${d}`)}
                    </Choice>
                  ))}
                </ChoiceGroup>
              </OptRow>
              <OptRow label={t('shell.brief.shift')}>
                <ChoiceGroup<ShiftPreset> label={t('shell.brief.shift')} value={shift} onChange={setShift}>
                  {(Object.keys(SHIFT_PRESETS) as ShiftPreset[]).map((x) => (
                    <Choice key={x} value={x}>
                      {t(`shell.shift.${x}`)}{' '}
                      <span className="vk-mono vk-choice__sub">{t(`shell.shift.${x}.time`)}</span>
                    </Choice>
                  ))}
                </ChoiceGroup>
              </OptRow>
              {!career && (
                <OptRow label={t('shell.brief.date')}>
                  <ChoiceGroup<DatePreset>
                    label={t('shell.brief.date')}
                    value={datePreset}
                    onChange={setDatePreset}
                  >
                    {DATE_PRESETS.map((x) => (
                      <Choice key={x} value={x}>
                        {t(`shell.date.${x}`)}{' '}
                        <span className="vk-mono vk-choice__sub">
                          {ymdText(resolveDatePreset(x, Date.now()))}
                        </span>
                      </Choice>
                    ))}
                  </ChoiceGroup>
                </OptRow>
              )}
              <OptRow
                label={t('shell.brief.weather')}
                note={
                  weather === 'auto' && forecast
                    ? t('shell.brief.autoWeather', { weather: forecast.text[lang] })
                    : undefined
                }
              >
                <ChoiceGroup<WeatherPick>
                  label={t('shell.brief.weather')}
                  value={weather}
                  onChange={setWeather}
                >
                  {WEATHERS.map((w) => (
                    <Choice key={w} value={w}>
                      {t(`shell.weather.${w}`)}
                    </Choice>
                  ))}
                </ChoiceGroup>
              </OptRow>
            </div>
            {mode === 'director' && <p className="vk-msg vk-brief__note">{t('shell.brief.director.note')}</p>}
          </section>
        </div>

        <div className="vk-brief__col">
          {error && (
            <p className="vk-msg is-bad" role="alert">
              {error}
            </p>
          )}
          {/* ── Päevakäsk: the order the system produces, as a document ── */}
          <article className="vk-doc sh-order" aria-labelledby="sh-order-title">
            <header className="vk-doc__head">
              <div className="vk-doc__from">
                <PpaLogo height={30} className="vk-doc__logo" />
                <div className="vk-doc__org">{region.name[lang]}</div>
                <div className="vk-doc__unit">{t('shell.brief.orderUnit')}</div>
              </div>
              <div className="vk-doc__meta">
                <div>
                  {region.hqCity}, {ymdText(date)}
                </div>
                <div>{t('shell.brief.orderNo', { n: `${wall(start).year % 100}-${orderNo}` })}</div>
              </div>
            </header>
            <h2 id="sh-order-title" className="vk-doc__title">
              {t('shell.brief.order')}
            </h2>
            <div className="vk-doc__body">
              <p>{t('shell.brief.orderIntro', { name: user?.name ?? profile?.name ?? '-' })}</p>
              <ol>
                <li>
                  {t('shell.brief.orderShift', {
                    date: `${weekday}, ${ymdText(date)}`,
                    from: startT,
                    to: endT,
                    hours,
                  })}
                </li>
                {custom && customArea.length > 0 && (
                  <li className="sh-order__area">{t('career.brief.orderArea', { area: areaName(customArea) })}</li>
                )}
                {areaOn && (
                  <li className="sh-order__area">
                    {t('career.brief.orderArea', { area: areaName(area!.sectors) })}
                    {area!.cover.length > 0 && (
                      <> {t('career.brief.orderCover', { names: areaName(area!.cover) })}</>
                    )}
                  </li>
                )}
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
                  <li className="vk-doc__hl">{t('shell.brief.orderHoliday', { holiday: holiday[lang] })}</li>
                )}
                <li>
                  {t('shell.brief.orderLoad', {
                    load: t(`shell.load.${load}`),
                    diff: t(`shell.diff.${difficulty}`).toLowerCase(),
                  })}
                </li>
                {mode === 'director' && <li>{t('shell.brief.orderDirector')}</li>}
                {storyLineText && <li className="sh-order__story">{storyLineText}</li>}
              </ol>
              <p>{t('shell.brief.orderClose')}</p>
            </div>
            <footer className="vk-doc__sign">
              <div>
                <div className="vk-doc__sigName">{region.commander.name}</div>
                <div className="vk-doc__sigTitle">{region.commander.title[lang]}</div>
              </div>
              <SignedStamp className="vk-doc__stamp" />
            </footer>
          </article>

          {(career || custom) && (
            <section className="vk-panel vk-brief__roster" aria-labelledby="vk-brief-roster">
              <div className="vk-panel__head">
                <h2 className="vk-h" id="vk-brief-roster">
                  {t(custom ? 'custom.brief.roster' : 'shell.brief.career.roster')}
                </h2>
                {custom && (
                  <button type="button" className="vk-linkbtn" onClick={() => setScreen('custom')}>
                    {t('custom.brief.edit')}
                  </button>
                )}
                {roster && roster.length > 0 && (
                  <span className="vk-panel__meta">
                    {roster.length === 1
                      ? t('career.brief.stationOne')
                      : t('career.brief.station', { n: roster.length })}
                  </span>
                )}
              </div>
              {roster && roster.length ? (
                <table className="vk-table vk-roster">
                  <caption>{t('shell.brief.career.roster')}</caption>
                  {rosterByStation(regionId, roster).map((g) => (
                    <tbody key={g.stationId}>
                      <tr className="vk-roster__group">
                        <th scope="colgroup" colSpan={4} className="sh-roster__station">
                          {tx(g.name)}
                          <span className="vk-roster__count">
                            {g.units.length === 1
                              ? t('career.brief.stationOne')
                              : t('career.brief.station', { n: g.units.length })}
                          </span>
                        </th>
                      </tr>
                      {g.units.map((u) => (
                        <tr key={u.callsign}>
                          <td className="vk-mono vk-roster__cs">{u.callsign}</td>
                          <td className={u.onCall ? 'vk-warn' : undefined}>{t(`shell.unit.${u.type}`)}</td>
                          <td className="vk-roster__veh">{u.vehicle}</td>
                          <td className="vk-roster__crew">
                            {u.crew.map((c) => `${c.firstName[0]}. ${c.lastName}`).join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              ) : (
                <p className="vk-panel__body vk-dim">{t('shell.brief.career.noRoster')}</p>
              )}
            </section>
          )}
        </div>
      </div>
    </ShellPage>
  );
}

/** Enter starts the shift (ShellPage's main action key). */
function Enter({ fn }: { fn: () => void }) {
  const ref = useRef(fn);
  ref.current = fn;
  const stable = useMemo(() => () => ref.current(), []);
  useEnter(stable);
  return null;
}

function StripCell({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="vk-strip__cell">
      <dt>{label}</dt>
      <dd className={mono ? 'vk-strip__value' : 'vk-strip__value vk-strip__value--text'}>
        {value}
        {sub && <span className="vk-mono vk-strip__badge">{sub}</span>}
      </dd>
    </div>
  );
}

function OptRow({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="vk-brief__row">
      <span className="vk-label vk-brief__rowLabel">{label}</span>
      <div className="vk-brief__rowCtl">
        {children}
        {note && <p className="vk-brief__rowNote">{note}</p>}
      </div>
    </div>
  );
}

/** The size of a box (rounded to 16 px, so a scrollbar or a small resize does not rebuild the map in it). */
function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
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
  }, [ref]);
  return size;
}

/** The career shift's area: the duty map on the prefecture (sectors, tonight's cover, the neighbouring desks). */
function AreaPanel({ regionId, area, who }: { regionId: RegionId; area: ShiftArea; who: string }) {
  const t = useT();
  const tx = useTx();
  const own = new Set(area.sectors);
  const neighbours =
    safe(() => neighbourSectors([...area.sectors, ...area.cover]).filter((x) => x.regionId === regionId)) ??
    [];
  const names = (ids: string[]) =>
    ids
      .map((id) => sectorById(id))
      .filter((x) => !!x)
      .map((x) => tx(x!.name))
      .join(', ');
  const boxRef = useRef<HTMLDivElement>(null);
  const size = useBoxSize(boxRef);
  const input = useMemo<DutyInput>(
    () => ({
      mine: area.sectors,
      whole: [],
      offered: area.cover,
      challenge: null,
      home: regionId,
      others: neighbours.map((x) => x.id),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [area.sectors.join(), area.cover.join(), regionId, neighbours.map((x) => x.id).join()],
  );
  const view = useMemo<MapView | null>(() => {
    const bounds = REGIONS[regionId]?.bounds;
    if (!size || !bounds) return null;
    return fitView(bounds, size.w, size.h, { top: 12, right: 12, bottom: 40, left: 12 });
  }, [size, regionId]);
  const coverWord = t('career.brief.coverWord');
  return (
    <section
      className="vk-panel sh-brief__area"
      data-area={area.sectors.join(' ')}
      aria-labelledby="vk-brief-area"
    >
      <div className="vk-panel__head">
        <h2 className="vk-h" id="vk-brief-area">
          {t('career.brief.area')}
        </h2>
      </div>
      <div className="vk-brief__areaMap" ref={boxRef}>
        {view && (
          <>
            <DutyMap variant="full" input={input} view={view} who={who} offerWord={coverWord} />
            <MapLegend input={input} compact pxPerKm={view.scale} offerLabel={t('career.brief.cover')} />
          </>
        )}
      </div>
      <dl className="vk-kv">
        <div>
          <dt>{t('career.brief.sectors')}</dt>
          <dd className="sh-brief__areaNames">{names(area.sectors.filter((id) => own.has(id)))}</dd>
        </div>
        {area.posts.length > 0 && (
          <div>
            <dt>{t('career.brief.posts')}</dt>
            <dd>{area.posts.map((id) => tx(stationName(regionId, id))).join(', ')}</dd>
          </div>
        )}
        {area.cover.length > 0 && (
          <div>
            <dt>{t('career.brief.cover')}</dt>
            <dd>{t('career.brief.coverText', { names: names(area.cover) })}</dd>
          </div>
        )}
        {neighbours.length > 0 && (
          <div>
            <dt>{t('career.brief.neighbours')}</dt>
            <dd>
              {neighbours.map((x, i) => (
                <span key={x.id} className="vk-brief__desk">
                  {tx(x.name)} <span className="vk-dim">· {colleagueName(x)}</span>
                  {i < neighbours.length - 1 && <br />}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

// ── Segmented radio group (roving focus, arrow keys) ───────────────────────

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
}: {
  value: T;
  onChange: (v: T) => void;
  label: string;
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
    <div className="vk-seg vk-choices" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {items.map(({ props }) => {
        const active = props.value === value;
        return (
          <button
            key={props.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
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
