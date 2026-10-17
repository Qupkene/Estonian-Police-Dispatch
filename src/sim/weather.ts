/**
 * Estonian weather model: monthly climatology (Tallinn 1991-2020 normals, regional offsets for
 * the colder inland south-east and the milder islands), a diurnal temperature cycle, an AR(1)
 * temperature anomaly and an hourly Markov drift of the weather kind. Road factors follow the
 * DESIGN (snow 1.3, sleet/ice 1.4, rain 1.1, fog 1.15, storm 1.25) plus "libedus": wet roads
 * freezing after rain or sleet (1.35).
 *
 * Owned by engine-systems. Randomness only via Rng / withRng.
 */
import type { Rng } from './rng';
import { withRng } from './rng';
import { HOUR, wall } from './time';
import type { Bulletin, RegionId, SimState, Text, Weather } from './types';

type Kind = Weather['kind'];
const KINDS: Kind[] = ['clear', 'cloudy', 'rain', 'snow', 'sleet', 'fog', 'storm'];

// ─────────────────────────────────────────────────────────────────────────────
// Climatology
// ─────────────────────────────────────────────────────────────────────────────

/** Monthly mean air temperature, Tallinn (≈ 1991-2020 normals), °C. Index 0 = January. */
export const MONTH_MEAN_C = [-2.3, -3.0, -0.3, 5.0, 10.4, 14.7, 17.8, 16.7, 12.1, 6.8, 2.6, -0.4];
/** Half of the typical daily min-max range, °C (small in the dark, cloudy winter). */
const DIURNAL_AMP = [1.8, 2.4, 3.4, 4.5, 5.5, 5.5, 5.4, 5.0, 4.0, 2.8, 1.9, 1.6];
/** Standard deviation of day-to-day anomalies, °C (winter cold snaps / thaws are large). */
const ANOMALY_SD = [5.5, 5.5, 4.0, 3.0, 3.0, 2.5, 2.5, 2.5, 2.5, 3.0, 3.5, 4.5];
/** Mean wind speed, m/s (coastal stations; windier in autumn and winter). */
const WIND_MEAN = [4.6, 4.4, 4.2, 3.8, 3.5, 3.3, 3.1, 3.2, 3.7, 4.3, 4.6, 4.8];

/** Regional offsets: [winter offset, summer offset] °C relative to Tallinn. */
const REGION_OFFSET: Record<RegionId, [number, number]> = {
  pohja: [0, 0],
  ida: [-1.2, 0.1], // Ida-Viru: colder winters
  louna: [-1.6, 0.5], // inland south-east: most continental
  laane: [0.6, -0.4], // islands & west coast: maritime
};

/**
 * Probability of each kind per month [clear, cloudy, rain, snow, sleet, fog, storm].
 * Estonia's Nov-Jan is famously grey (≈ 30 sunshine hours in December); May-July sunny.
 */
const KIND_P: number[][] = [
  [0.12, 0.42, 0.05, 0.28, 0.06, 0.05, 0.02], // Jan
  [0.18, 0.4, 0.04, 0.25, 0.06, 0.05, 0.02], // Feb
  [0.24, 0.39, 0.08, 0.15, 0.07, 0.05, 0.02], // Mar
  [0.32, 0.37, 0.17, 0.04, 0.04, 0.04, 0.02], // Apr
  [0.4, 0.33, 0.19, 0.0, 0.01, 0.04, 0.03], // May
  [0.4, 0.31, 0.21, 0.0, 0.0, 0.03, 0.05], // Jun
  [0.42, 0.29, 0.21, 0.0, 0.0, 0.02, 0.06], // Jul
  [0.36, 0.31, 0.24, 0.0, 0.0, 0.04, 0.05], // Aug
  [0.27, 0.37, 0.26, 0.0, 0.0, 0.06, 0.04], // Sep
  [0.16, 0.44, 0.27, 0.02, 0.03, 0.06, 0.02], // Oct
  [0.08, 0.48, 0.2, 0.08, 0.08, 0.06, 0.02], // Nov
  [0.07, 0.42, 0.1, 0.24, 0.08, 0.06, 0.03], // Dec
];

const ROAD_FACTOR: Record<Kind, number> = { clear: 1, cloudy: 1, rain: 1.1, snow: 1.3, sleet: 1.4, fog: 1.15, storm: 1.25 };
/** Freezing wet roads ("libedus"). */
export const ICE_ROAD_FACTOR = 1.35;

function regionOffset(regionId: RegionId | undefined, month: number): number {
  const [w, s] = REGION_OFFSET[regionId ?? 'pohja'];
  // cos curve: full winter offset in Jan, full summer offset in Jul
  const k = (1 + Math.cos(((month - 1) / 12) * 2 * Math.PI)) / 2; // 1 in Jan, 0 in Jul
  return w * k + s * (1 - k);
}

/** Climatological temperature for wall time (no anomaly): monthly mean (interpolated) + diurnal cycle. */
export function climateTemp(t: number, regionId?: RegionId): number {
  const w = wall(t);
  // interpolate between month means by day of month (mid-month anchors)
  const m0 = w.month - 1;
  const frac = (w.day - 15) / 30;
  const m1 = (m0 + (frac >= 0 ? 1 : 11)) % 12;
  const mean = MONTH_MEAN_C[m0] + (MONTH_MEAN_C[m1] - MONTH_MEAN_C[m0]) * Math.abs(frac);
  const amp = DIURNAL_AMP[m0];
  const h = w.hour + w.minute / 60;
  const diurnal = amp * Math.cos(((h - 15) / 24) * 2 * Math.PI); // max ≈ 15:00, min ≈ 03:00
  return mean + diurnal + regionOffset(regionId, w.month);
}

function sampleKind(rng: Rng, month: number, hour: number): Kind {
  const p = KIND_P[month - 1];
  return rng.weighted(KINDS, (k) => {
    const i = KINDS.indexOf(k);
    let wgt = p[i];
    if (k === 'fog') wgt *= hour < 9 || hour >= 21 ? 1.8 : hour >= 11 && hour < 18 ? 0.35 : 1;
    if (k === 'storm' && month >= 5 && month <= 8) wgt *= hour >= 12 && hour < 20 ? 1.6 : 0.5; // afternoon thunderstorms
    return wgt;
  });
}

/** Make kind and temperature physically consistent (no +8 °C snow, no −8 °C rain). */
function reconcile(kind: Kind, tempC: number, rng: Rng): Kind {
  if (kind === 'snow' && tempC > 2) return tempC > 4 ? 'rain' : 'sleet';
  if (kind === 'sleet' && tempC > 4) return 'rain';
  if (kind === 'sleet' && tempC < -3) return 'snow';
  if (kind === 'rain' && tempC < -1.5) return 'snow';
  if (kind === 'rain' && tempC < 0.8) return rng.chance(0.5) ? 'sleet' : 'rain';
  return kind;
}

function windFor(rng: Rng, kind: Kind, month: number, prev?: number): number {
  const base = WIND_MEAN[month - 1];
  let target: number;
  switch (kind) {
    case 'storm':
      target = rng.range(14, 23);
      break;
    case 'fog':
      target = rng.range(0.5, 2);
      break;
    case 'rain':
    case 'sleet':
    case 'snow':
      target = base + rng.range(0.5, 3);
      break;
    case 'clear':
      target = base + rng.normal(-0.5, 1.2);
      break;
    default:
      target = base + rng.normal(0, 1.3);
  }
  const w = prev === undefined || kind === 'storm' ? target : prev + (target - prev) * 0.5;
  return Math.max(0, Math.round(w * 10) / 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Text
// ─────────────────────────────────────────────────────────────────────────────

const fmtTemp = (c: number) => {
  const r = Math.round(c);
  return `${r < 0 ? '−' : ''}${Math.abs(r)} °C`;
};

function kindName(kind: Kind, tempC: number, month: number): Text {
  switch (kind) {
    case 'clear':
      return { et: 'Selge', en: 'Clear' };
    case 'cloudy':
      return { et: 'Pilves', en: 'Overcast' };
    case 'rain':
      return { et: 'Vihmasadu', en: 'Rain' };
    case 'snow':
      return { et: 'Lumesadu', en: 'Snowfall' };
    case 'sleet':
      return { et: 'Lörtsisadu', en: 'Sleet' };
    case 'fog':
      return { et: 'Udu', en: 'Fog' };
    case 'storm':
      if (tempC < 0) return { et: 'Tuisk', en: 'Blizzard' };
      if (month >= 5 && month <= 8) return { et: 'Äike ja hoovihm', en: 'Thunderstorm' };
      return { et: 'Torm', en: 'Gale' };
  }
}

/** Bilingual one-liner, e.g. "Lumesadu, −6 °C, teed libedad". */
export function weatherText(kind: Kind, tempC: number, windMs: number, roadFactor: number, month: number): Text {
  const name = kindName(kind, tempC, month);
  const parts: Text[] = [name, { et: fmtTemp(tempC), en: fmtTemp(tempC) }];
  if (windMs >= 12) parts.push({ et: `tuul ${Math.round(windMs)} m/s`, en: `wind ${Math.round(windMs)} m/s` });
  if (roadFactor >= ICE_ROAD_FACTOR) parts.push({ et: 'teed libedad', en: 'icy roads' });
  else if (kind === 'snow') parts.push({ et: 'lumised teed', en: 'snowy roads' });
  else if (kind === 'rain') parts.push({ et: 'teed märjad', en: 'wet roads' });
  else if (kind === 'fog') parts.push({ et: 'halb nähtavus', en: 'poor visibility' });
  return { et: parts.map((p) => p.et).join(', '), en: parts.map((p) => p.en).join(', ') };
}

/** Road factor for a kind/temperature; `icy` = wet surface that has frozen. */
export function roadFactorFor(kind: Kind, tempC: number, icy: boolean): number {
  let f = ROAD_FACTOR[kind];
  if (icy && tempC <= 0.5) f = Math.max(f, ICE_ROAD_FACTOR);
  if (kind === 'snow' && tempC > -1 && tempC <= 1.5) f = Math.max(f, 1.35); // wet snow slush
  return f;
}

function build(kind: Kind, tempC: number, windMs: number, icy: boolean, month: number): Weather {
  const t = Math.round(tempC * 10) / 10;
  const roadFactor = roadFactorFor(kind, t, icy);
  return { kind, tempC: t, windMs, roadFactor, text: weatherText(kind, t, windMs, roadFactor, month) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Weather at shift start. `kind` forces the weather type (temperature is nudged to be plausible).
 * `regionId` (optional extra) applies the regional climate offset.
 */
export function initialWeather(rng: Rng, t: number, kind?: Weather['kind'], regionId?: RegionId): Weather {
  const w = wall(t);
  const month = w.month;
  let temp = climateTemp(t, regionId) + rng.normal(0, ANOMALY_SD[month - 1] * 0.7);
  let k: Kind;
  if (kind) {
    k = kind;
    if (k === 'snow') temp = Math.min(temp, rng.range(-8, 0.5));
    if (k === 'sleet') temp = Math.max(-1, Math.min(2.5, temp));
    if (k === 'rain') temp = Math.max(temp, 1.5);
  } else {
    k = reconcile(sampleKind(rng, month, w.hour), temp, rng);
  }
  // Winter mornings often start with frozen roads after a thaw.
  const icy = (k === 'clear' || k === 'cloudy' || k === 'fog') && temp <= 0.5 && temp >= -5 && (month <= 3 || month >= 11) && rng.chance(0.3);
  return build(k, temp, windFor(rng, k, month), icy, month);
}

/** Multiplier on spawn rate from weather (DESIGN §4.2 weatherFactor): warm clear evenings are busy, gales and deep frost quiet. */
export function weatherCallFactor(w: Weather): number {
  let f = 1;
  if (w.kind === 'storm') f *= 0.9;
  else if (w.kind === 'rain' || w.kind === 'sleet') f *= 0.93;
  else if (w.kind === 'snow') f *= 0.97;
  if ((w.kind === 'clear' || w.kind === 'cloudy') && w.tempC >= 18) f *= 1.12;
  if (w.tempC <= -15) f *= 0.9;
  return f;
}

/** Extra weight for traffic templates (crashes spike on the first snow and icy days). */
export function weatherTrafficFactor(w: Weather): number {
  if (w.roadFactor >= ICE_ROAD_FACTOR) return 2.0;
  switch (w.kind) {
    case 'snow':
      return 1.7;
    case 'sleet':
      return 1.8;
    case 'fog':
      return 1.4;
    case 'storm':
      return 1.4;
    case 'rain':
      return 1.3;
    default:
      return 1;
  }
}

/** True when it is dark-and-bad enough that outdoor risk modifiers should apply. */
export function isBadWeather(w: Weather): boolean {
  return w.kind === 'snow' || w.kind === 'sleet' || w.kind === 'storm' || w.kind === 'fog' || w.roadFactor >= ICE_ROAD_FACTOR;
}

/**
 * Called every game hour: slowly drift weather. Safe to call more often: it only acts when
 * ≥ 50 game-minutes have passed since the last update (tracked in `s.flags['wx:last']`).
 * Set `s.flags['wx:locked'] = true` (director / forced weather) to freeze the weather.
 */
export function updateWeather(s: SimState): void {
  if (s.flags['wx:locked']) return;
  const last = s.flags['wx:last'];
  if (typeof last === 'number' && s.now - last < 50 * 60_000) return;
  s.flags['wx:last'] = s.now;
  const w = wall(s.now);
  const month = w.month;
  const prev = s.weather;

  withRng(s, (rng) => {
    // Temperature: AR(1) anomaly around the climatology.
    const clim = climateTemp(s.now, s.regionId);
    let anom = typeof s.flags['wx:anom'] === 'number' ? (s.flags['wx:anom'] as number) : prev.tempC - climateTemp(s.now - HOUR, s.regionId);
    anom = anom * 0.97 + rng.normal(0, ANOMALY_SD[month - 1] * 0.17);
    if (prev.kind === 'clear' && (w.hour >= 21 || w.hour < 6) && (month <= 3 || month >= 10)) anom -= 0.25; // clear-sky night cooling
    if ((prev.kind === 'cloudy' || prev.kind === 'rain') && (w.hour >= 21 || w.hour < 6)) anom += 0.1; // cloud blanket
    s.flags['wx:anom'] = Math.round(anom * 100) / 100;
    const temp = clim + anom;

    // Kind: Markov persistence, otherwise re-sample from the month's distribution.
    const stay: Record<Kind, number> = { clear: 0.82, cloudy: 0.8, rain: 0.68, snow: 0.72, sleet: 0.6, fog: w.hour >= 9 && w.hour < 17 ? 0.3 : 0.6, storm: 0.45 };
    let kind: Kind = prev.kind;
    if (!rng.chance(stay[prev.kind])) {
      kind = sampleKind(rng, month, w.hour);
      if (prev.kind === 'storm' && kind === 'clear') kind = 'cloudy'; // storms clear through clouds
    }
    kind = reconcile(kind, temp, rng);

    // Ice: wet roads that freeze stay slippery for a few hours.
    const wasWet = prev.kind === 'rain' || prev.kind === 'sleet' || (typeof s.flags['wx:wetUntil'] === 'number' && (s.flags['wx:wetUntil'] as number) > s.now);
    if (kind === 'rain' || kind === 'sleet') s.flags['wx:wetUntil'] = s.now + 3 * HOUR;
    let icyUntil = typeof s.flags['wx:icyUntil'] === 'number' ? (s.flags['wx:icyUntil'] as number) : 0;
    if (!icyUntil && prev.roadFactor >= ICE_ROAD_FACTOR) icyUntil = s.now + 4 * HOUR;
    if (wasWet && temp <= 0) icyUntil = s.now + 6 * HOUR;
    if (temp > 2) icyUntil = 0;
    s.flags['wx:icyUntil'] = icyUntil;
    const icy = icyUntil > s.now;

    const next = build(kind, temp, windFor(rng, kind, month, prev.windMs), icy, month);
    s.weather = next;

    // Weather warnings to the bulletin board (at most one every 3 h).
    const becameIcy = next.roadFactor >= ICE_ROAD_FACTOR && prev.roadFactor < ICE_ROAD_FACTOR;
    const severe = (next.kind !== prev.kind && (next.kind === 'storm' || next.kind === 'snow' || next.kind === 'fog')) || becameIcy;
    const lastWarn = typeof s.flags['wx:lastWarn'] === 'number' ? (s.flags['wx:lastWarn'] as number) : 0;
    if (severe && s.now - lastWarn >= 3 * HOUR) {
      s.flags['wx:lastWarn'] = s.now;
      const b: Bulletin = {
        id: `b${++s.seq.bulletin}`,
        t: s.now,
        kind: 'weather',
        title: becameIcy
          ? { et: 'Libedushoiatus', en: 'Ice warning' }
          : next.kind === 'fog'
            ? { et: 'Udu: halb nähtavus', en: 'Fog: poor visibility' }
            : { et: 'Ilmahoiatus', en: 'Weather warning' },
        text: {
          et: `${next.text.et}. Ekipaažidel arvestada pikema sõiduajaga, sõita ettevaatlikult.`,
          en: `${next.text.en}. Crews should expect longer travel times and drive carefully.`,
        },
      };
      s.bulletins.push(b);
      s.events.push({ t: s.now, type: 'bulletin', text: b.title });
    }
  });
}
