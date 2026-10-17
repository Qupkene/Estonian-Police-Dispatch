/**
 * Solar position: NOAA "General Solar Position" equations (the same maths as the NOAA
 * solar calculator spreadsheet). Accurate to well under a minute for sunrise/sunset at
 * Estonian latitudes, which is what the day/night cycle, the map shading and the
 * pursuit/search night modifiers need.
 *
 * Owned by engine-systems. Pure functions, no state.
 */
import { DAY, MIN, wall } from './time';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Tallinn city centre (Raekoja plats): the default observer for the whole game. */
export const TALLINN: { lat: number; lon: number } = { lat: 59.437, lon: 24.745 };

/** Zenith for official sunrise/sunset: 90° + 50′ (refraction 34′ + solar radius 16′). */
const ZENITH_OFFICIAL = 90.833;

function julianCentury(t: number): number {
  const jd = t / DAY + 2440587.5;
  return (jd - 2451545) / 36525;
}

interface SolarParams {
  /** Solar declination, degrees. */
  decl: number;
  /** Equation of time, minutes. */
  eqTime: number;
}

/** Declination and equation of time for a Julian century (NOAA spreadsheet formulas). */
function solarParams(jc: number): SolarParams {
  const l0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360; // geom mean long sun
  const m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc); // geom mean anomaly
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc); // eccentricity
  const c =
    Math.sin(m * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * m * RAD) * 0.000289; // equation of centre
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * jc;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const meanObliq = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(appLong * RAD)) * DEG;
  const y = Math.tan((obliq / 2) * RAD) ** 2;
  const eqTime =
    4 *
    DEG *
    (y * Math.sin(2 * l0 * RAD) -
      2 * e * Math.sin(m * RAD) +
      4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) -
      0.5 * y * y * Math.sin(4 * l0 * RAD) -
      1.25 * e * e * Math.sin(2 * m * RAD));
  return { decl, eqTime };
}

/** UTC midnight (epoch ms) of the Europe/Tallinn calendar day containing t. */
function utcMidnightOfLocalDay(t: number): number {
  const w = wall(t);
  return Date.UTC(w.year, w.month - 1, w.day);
}

/**
 * Minutes after UTC midnight of the event (rise = -1, set = +1) for the given day, or
 * NaN-free fallbacks for polar day/night. Iterates twice so the solar parameters are
 * evaluated at the event itself.
 */
function eventMinutes(midnight: number, lat: number, lon: number, sign: -1 | 1, zenith: number): number | 'day' | 'night' {
  let minutes = 720 - 4 * lon; // first guess: solar noon
  for (let i = 0; i < 3; i++) {
    const { decl, eqTime } = solarParams(julianCentury(midnight + minutes * MIN));
    const cosH =
      Math.cos(zenith * RAD) / (Math.cos(lat * RAD) * Math.cos(decl * RAD)) - Math.tan(lat * RAD) * Math.tan(decl * RAD);
    if (cosH > 1) return 'night';
    if (cosH < -1) return 'day';
    const ha = Math.acos(cosH) * DEG;
    // NOAA convention: rise = noon − 4·HA, set = noon + 4·HA (lon east-positive).
    minutes = 720 - 4 * lon - eqTime + sign * 4 * ha;
  }
  return minutes;
}

/** Solar noon (epoch ms) of the local calendar day containing t. */
export function solarNoon(t: number, _lat: number, lon: number): number {
  const midnight = utcMidnightOfLocalDay(t);
  let minutes = 720 - 4 * lon;
  for (let i = 0; i < 2; i++) {
    const { eqTime } = solarParams(julianCentury(midnight + minutes * MIN));
    minutes = 720 - 4 * lon - eqTime;
  }
  return midnight + Math.round(minutes * MIN);
}

/** Sunrise/sunset (epoch ms) for the calendar day containing `t` at the given location (NOAA algorithm). */
export function sunTimes(t: number, lat: number, lon: number): { sunrise: number; sunset: number } {
  const midnight = utcMidnightOfLocalDay(t);
  const rise = eventMinutes(midnight, lat, lon, -1, ZENITH_OFFICIAL);
  const set = eventMinutes(midnight, lat, lon, 1, ZENITH_OFFICIAL);
  if (typeof rise === 'number' && typeof set === 'number') {
    return { sunrise: midnight + Math.round(rise * MIN), sunset: midnight + Math.round(set * MIN) };
  }
  const noon = solarNoon(t, lat, lon);
  // Polar night: sunrise = sunset = noon (zero-length day). Midnight sun: the whole day.
  if (rise === 'night' || set === 'night') return { sunrise: noon, sunset: noon };
  return { sunrise: midnight - 2 * 60 * MIN, sunset: midnight + DAY - 2 * 60 * MIN };
}

/** Civil twilight (sun 6° below the horizon) for the day containing t, used for street lights etc. */
export function civilTwilight(t: number, lat: number, lon: number): { dawn: number; dusk: number } {
  const midnight = utcMidnightOfLocalDay(t);
  const dawn = eventMinutes(midnight, lat, lon, -1, 96);
  const dusk = eventMinutes(midnight, lat, lon, 1, 96);
  if (typeof dawn === 'number' && typeof dusk === 'number') {
    return { dawn: midnight + Math.round(dawn * MIN), dusk: midnight + Math.round(dusk * MIN) };
  }
  const st = sunTimes(t, lat, lon);
  return { dawn: st.sunrise, dusk: st.sunset };
}

/** Solar altitude in degrees at time t (with a standard atmospheric refraction correction). */
export function sunAltitude(t: number, lat: number, lon: number): number {
  const { decl, eqTime } = solarParams(julianCentury(t));
  const minutesUtc = (((t % DAY) + DAY) % DAY) / MIN;
  let tst = (minutesUtc + eqTime + 4 * lon) % 1440; // true solar time
  if (tst < 0) tst += 1440;
  let ha = tst / 4 - 180; // hour angle
  if (ha < -180) ha += 360;
  const cosZ = Math.sin(lat * RAD) * Math.sin(decl * RAD) + Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(ha * RAD);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZ))) * DEG;
  const elev = 90 - zenith;
  // NOAA refraction approximation (degrees).
  let refr = 0;
  if (elev <= 85) {
    const te = Math.tan(elev * RAD);
    if (elev > 5) refr = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
    else if (elev > -0.575) refr = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
    else refr = -20.772 / te;
    refr /= 3600;
  }
  return elev + refr;
}

/** True between sunrise and sunset (sun's upper limb above the horizon). */
export function isDaylight(t: number, lat = TALLINN.lat, lon = TALLINN.lon): boolean {
  return sunAltitude(t, lat, lon) > -0.833;
}

/** Light level 0 (night) … 1 (full day), smooth through civil twilight. Used for map shading / night modifiers. */
export function daylightFactor(t: number, lat = TALLINN.lat, lon = TALLINN.lon): number {
  const alt = sunAltitude(t, lat, lon);
  if (alt >= 6) return 1;
  if (alt <= -6) return 0;
  return (alt + 6) / 12;
}
