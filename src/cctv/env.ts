/**
 * The light and the weather a camera films in (docs/CCTV.md): where the sun stands at the game's clock, how dark
 * it is, whether the lamps are lit, snow on the ground, rain on the lens. Pure: the renderer reads it.
 */
import { wall } from '@/sim/time';
import type { LngLat, Season, Weather } from '@/sim/types';

const RAD = Math.PI / 180;

export interface Env {
  /** Sun altitude in degrees (below 0: under the horizon) and its compass bearing (0 north, 90 east). */
  sunAlt: number;
  sunAz: number;
  /** 0 by day, 1 in full night (the same curve as the map's night tint). */
  night: number;
  /** Street lamps and lit windows. */
  lamps: boolean;
  weather: Weather['kind'];
  /** Rain or sleet falling (drops on the lens, dark wet asphalt). */
  rain: boolean;
  snowing: boolean;
  /** Snow lying on the ground and the roofs, 0..1. */
  snow: number;
  /** 0..1: how much the distance is washed out. */
  fog: number;
  wind: number;
  season: Season;
  month: number;
  /** Clock hour 0..23 (Tallinn time). */
  hour: number;
}

/** The sun's altitude and compass bearing at a moment and place. */
export function sunAt(t: number, at: LngLat): { alt: number; az: number } {
  const d = t / 86_400_000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const gmstH = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const ha = (gmstH * 15 + at[0]) * RAD - ra;
  const lat = at[1] * RAD;
  const alt = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
  // Bearing from north, clockwise.
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha));
  return { alt: alt / RAD, az: ((az / RAD) % 360 + 360) % 360 };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function seasonOf(month: number): Season {
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

export function envAt(t: number, at: LngLat, weather: Weather): Env {
  const sun = sunAt(t, at);
  const w = wall(t);
  const alt = sun.alt;
  const night = alt >= 0 ? 0 : alt <= -12 ? 1 : alt > -6 ? clamp01(-alt / 6) * 0.6 : 0.6 + clamp01((-alt - 6) / 6) * 0.4;
  const kind = weather.kind;
  const season = seasonOf(w.month);
  const cold = weather.tempC <= 0.5;
  // Snow lies in a cold winter, and wherever it is falling in the cold.
  let snow = 0;
  if (kind === 'snow') snow = cold ? 1 : 0.5;
  else if (season === 'winter' && cold) snow = 0.85;
  else if ((w.month === 3 || w.month === 11) && weather.tempC <= -2) snow = 0.5;
  const gloom = kind === 'storm' || kind === 'fog' ? 1 : kind === 'rain' || kind === 'sleet' || kind === 'snow' ? 0.5 : 0;
  return {
    sunAlt: alt,
    sunAz: sun.az,
    night,
    lamps: alt < 1.5 + gloom * 3,
    weather: kind,
    rain: kind === 'rain' || kind === 'storm' || kind === 'sleet',
    snowing: kind === 'snow' || kind === 'sleet',
    snow,
    fog: kind === 'fog' ? 1 : kind === 'storm' ? 0.45 : kind === 'snow' ? 0.4 : kind === 'rain' || kind === 'sleet' ? 0.25 : kind === 'cloudy' ? 0.08 : 0,
    wind: weather.windMs,
    season,
    month: w.month,
    hour: w.hour,
  };
}
