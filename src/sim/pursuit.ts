/**
 * Vehicle pursuit (jälitus), see DESIGN §4.6.
 *
 * The suspect vehicle moves with heading noise (speed 70-140 km/h on the speedometer; its
 * straight-line map speed is ~55 % of that because of the road network and turns), drifts onto
 * nearby main roads, steers away from the nearest pursuing unit, stays on land (Estonia land
 * polygon) and inside the prefecture. Pursuing units (inc.assigned) are re-targeted every
 * game-minute to the predicted suspect position via engine-core's moveUnitTo(…, 'pursuit').
 *
 * Each game-minute (applied continuously, scaled by dtMin):
 *   pressure += 0.06 × units within 1.5 km + 0.2 with helicopter overhead + 0.35 while spikes bite
 *   risk     += 0.02 × speed factor (speed/100 × night 1.3 × weather 1.15-1.5; ×0.6 with heli)
 * Ends: caught (pressure ≥ 1), crashed (per-minute roll of risk × 0.2), escaped (> 8 km from all
 * units for 3 min, or lost visual contact > 1,5 km for 1,5+ min with a 20 %/min chance, or 25 min
 * without result), terminated (dispatcher command).
 *
 * Owned by engine-systems. Bookkeeping lives in s.flags under `pursuit:<incidentId>:*`.
 */
import roadsData from '@/data/geo/roads.json';
import { dispatchUnits } from '@/sim/commands';
import { bearing, destination, haversineKm, pointInBounds } from './geo';
import { addTimeline, emit, moveUnitTo, pushRadio, regionOf, tplOf } from './internal';
import { isOnLand } from './land';
import { releaseUnit } from './units';
import { withRng, type Rng } from './rng';
import { sunAltitude } from './sun';
import { genitiveName } from './text';
import { MIN } from './time';
import type { Incident, LngLat, PursuitState, SimState, Text, Unit } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────────────

export const PURSUIT = {
  minSpeed: 70,
  maxSpeed: 140,
  /** Straight-line map progress per km/h on the speedometer (road network + turns). */
  mapSpeedFactor: 0.55,
  /**
   * While tailed (< 3 km) the suspect cannot open the gap faster than cap × the lead unit's map
   * speed; the cap is drawn per pursuit (driver skill / recklessness) from this range.
   */
  tailedSpeedCap: [1.0, 1.4] as [number, number],
  closeKm: 1.5,
  pressurePerUnit: 0.06,
  pressureHeli: 0.2,
  pressureSpikes: 0.35,
  riskPerMin: 0.02,
  crashFactor: 0.2,
  /** Lost visual contact (no ground unit within closeKm, no heli) for this long → per-minute escape chance. */
  lostMin: 1.5,
  lostEscapePerMin: 0.2,
  escapeKm: 8,
  escapeMin: 3,
  maxMin: 25,
  heliKm: 3,
  spikesKm: 3,
  trailMax: 60,
  trailStepKm: 0.15,
  /** PPA lennusalk: lift-off within 15 min (docs/research/ppa-organisation.md §5.3). */
  heliActivationMin: 15,
  heliKmh: 200,
} as const;

/** Tallinn airport: PPA lennusalk base (virtual helicopter origin when no heli unit exists). */
const HELI_BASE: LngLat = [24.8328, 59.4133];

// ─────────────────────────────────────────────────────────────────────────────
// Land polygon: shared with the unit model, see ./land
// ─────────────────────────────────────────────────────────────────────────────

export { isOnLand };

// ─────────────────────────────────────────────────────────────────────────────
// Roads (gentle bias onto Natural Earth main roads)
// ─────────────────────────────────────────────────────────────────────────────

let ROAD_SEGS: [LngLat, LngLat][] | null = null;

function roadSegments(): [LngLat, LngLat][] {
  if (ROAD_SEGS) return ROAD_SEGS;
  const fc = roadsData as unknown as { features: { geometry: { type: string; coordinates: number[][] | number[][][] }; properties: { kind?: string } }[] };
  const segs: [LngLat, LngLat][] = [];
  for (const f of fc.features) {
    if (f.properties.kind === 'Ferry Route') continue;
    const lines = (f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates]) as number[][][];
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const a: LngLat = [line[i - 1][0], line[i - 1][1]];
        const b: LngLat = [line[i][0], line[i][1]];
        if (a[0] < 21 || a[0] > 28.5 || a[1] < 57.3 || a[1] > 59.9) continue;
        segs.push([a, b]);
      }
    }
  }
  ROAD_SEGS = segs;
  return segs;
}

/** Bearing of the nearest main-road segment within `maxKm`, or undefined. */
function nearbyRoadBearing(p: LngLat, maxKm: number): number | undefined {
  let best = maxKm;
  let br: number | undefined;
  const kx = Math.cos((p[1] * Math.PI) / 180) * 111.32;
  const ky = 110.57;
  for (const [a, b] of roadSegments()) {
    // quick reject by bbox
    if (p[0] < Math.min(a[0], b[0]) - 0.05 || p[0] > Math.max(a[0], b[0]) + 0.05) continue;
    if (p[1] < Math.min(a[1], b[1]) - 0.03 || p[1] > Math.max(a[1], b[1]) + 0.03) continue;
    const ax = (a[0] - p[0]) * kx;
    const ay = (a[1] - p[1]) * ky;
    const bx = (b[0] - p[0]) * kx;
    const by = (b[1] - p[1]) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) {
      best = d;
      br = bearing(a, b);
    }
  }
  return br;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const angDiff = (a: number, b: number) => ((b - a + 540) % 360) - 180;
const norm = (a: number) => ((a % 360) + 360) % 360;

const key = (inc: Incident, k: string) => `pursuit:${inc.id}:${k}`;
function fnum(s: SimState, k: string): number | undefined {
  const v = s.flags[k];
  return typeof v === 'number' ? v : undefined;
}

const COMPASS_ET = ['põhja', 'kirde', 'ida', 'kagu', 'lõuna', 'edela', 'lääne', 'loode'];
const COMPASS_EN = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function compass(h: number): Text {
  const i = Math.round(norm(h) / 45) % 8;
  return { et: `${COMPASS_ET[i]} suunas`, en: `heading ${COMPASS_EN[i]}` };
}

/** "Laagna teel" / "Narva maanteel": adessive for common street types, otherwise "… piirkonnas". */
export function onStreet(street: string): Text {
  const m = /^(.*?)\s+(tee|mnt|maantee|pst|puiestee)$/i.exec(street.trim());
  if (m) {
    const t = m[2].toLowerCase();
    const et = t === 'tee' ? `${m[1]} teel` : t === 'pst' || t === 'puiestee' ? `${m[1]} puiesteel` : `${m[1]} maanteel`;
    return { et, en: `on ${street}` };
  }
  // One-word roads: "Tallinna ringtee" → "Tallinna ringteel", "Keskpuiestee" → "Keskpuiesteel".
  if (/tee$/.test(street.trim())) return { et: `${street.trim()}l`, en: `on ${street}` };
  return { et: `${genitiveName(street)} piirkonnas`, en: `in the ${street} area` };
}

export function nearestStreetName(s: SimState, p: LngLat, inc: Incident): string {
  const region = (() => {
    try {
      return regionOf(s);
    } catch {
      return undefined;
    }
  })();
  let best = 1.2;
  let name: string | undefined;
  for (const st of region?.streets ?? []) {
    for (const q of st.points) {
      const d = haversineKm(p, q);
      if (d < best) {
        best = d;
        name = st.name;
      }
    }
  }
  if (name) return name;
  return roadOfAddress(inc.location.address) || inc.location.city;
}

/**
 * The road itself, without house number, km post, county or route number:
 * "Simmuli-Nooska tee, 4. km, Võru maakond" → "Simmuli-Nooska tee", "Tartu mnt 57" → "Tartu mnt",
 * "Tallinna-Tartu maantee (E263), 16. km" → "Tallinna-Tartu maantee".
 */
export function roadOfAddress(address: string): string {
  return address
    .split(',')[0]
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+\d.*$/, '')
    .trim();
}

/** True when an active template beat of this kind started the mechanic (engine-core already radioed/counted it). */
export function beatDriven(inc: Incident, kind: 'pursuit' | 'search'): boolean {
  const tpl = tplOf(inc);
  return inc.beats.some((b) => b.status === 'active' && tpl?.beats?.[b.index]?.kind === kind);
}

function pursuers(s: SimState, inc: Incident): Unit[] {
  return inc.assigned.map((id) => s.units[id]).filter((u): u is Unit => !!u && u.status !== 'offduty' && u.status !== 'break');
}

function leadCallsign(s: SimState, inc: Incident): { from: string; unitId?: string } {
  const u = pursuers(s, inc).find((x) => x.type !== 'heli');
  return u ? { from: u.callsign, unitId: u.id } : { from: 'JK' };
}

/** Straight-line map speed (km/h) of a unit from its current movement, or a default. */
function unitMapSpeed(u: Unit): number {
  const m = u.move;
  if (m && m.arriveAt > m.departAt && m.cum.length > 1) {
    const km = m.cum[m.cum.length - 1];
    const h = (m.arriveAt - m.departAt) / 3_600_000;
    if (h > 0 && km > 0.05) return Math.min(220, km / h);
  }
  return u.type === 'heli' ? 200 : 60;
}

function weatherRiskFactor(s: SimState): number {
  const w = s.weather;
  let f = 1;
  if (w.kind === 'rain') f = 1.15;
  else if (w.kind === 'fog') f = 1.25;
  else if (w.kind === 'storm') f = 1.35;
  else if (w.kind === 'snow' || w.kind === 'sleet') f = 1.5;
  if (w.roadFactor >= 1.35) f = Math.max(f, 1.5);
  return f;
}

function isNight(s: SimState, p: LngLat): boolean {
  return sunAltitude(s.now, p[1], p[0]) < -0.833;
}

function validPos(s: SimState, p: LngLat): boolean {
  let bounds: [LngLat, LngLat] | undefined;
  try {
    bounds = regionOf(s).bounds;
  } catch {
    bounds = undefined;
  }
  if (bounds && !pointInBounds(p, bounds)) return false;
  return isOnLand(p);
}

function radio(s: SimState, inc: Incident, text: Text, level: 'routine' | 'priority' | 'emergency' = 'priority', from?: string, unitId?: string): void {
  const lead = from ? { from, unitId } : leadCallsign(s, inc);
  pushRadio(s, { from: lead.from, unitId: lead.unitId, text, level, kind: 'pursuit', incidentId: inc.id });
}

function retarget(s: SimState, inc: Incident, p: PursuitState): void {
  for (const u of pursuers(s, inc)) {
    const d = haversineKm(u.pos, p.suspectPos);
    const speed = unitMapSpeed(u);
    const leadMin = Math.min(2.5, (d / Math.max(30, speed)) * 60 * 0.8 + 0.3);
    let target = destination(p.suspectPos, ((p.speedKmh * PURSUIT.mapSpeedFactor) / 60) * leadMin, p.heading);
    if (!isOnLand(target)) target = p.suspectPos;
    try {
      moveUnitTo(s, u, target, 'pursuit', true);
    } catch {
      /* engine-core not wired (tests / early boot) */
    }
  }
  s.flags[key(inc, 'rt')] = s.now;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function startPursuit(s: SimState, inc: Incident, from: LngLat): void {
  if (inc.pursuit && !inc.pursuit.ended) return;
  const start: LngLat = isOnLand(from) ? from : inc.location.coord;
  withRng(s, (rng) => {
    const units = pursuers(s, inc);
    let heading = rng.range(0, 360);
    const nearest = units.reduce<Unit | undefined>((a, u) => (!a || haversineKm(u.pos, start) < haversineKm(a.pos, start) ? u : a), undefined);
    if (nearest && haversineKm(nearest.pos, start) > 0.02) heading = norm(bearing(nearest.pos, start) + rng.normal(0, 30));
    const road = nearbyRoadBearing(start, 1.5);
    if (road !== undefined) heading = Math.abs(angDiff(heading, road)) <= 90 ? road : norm(road + 180);
    const p: PursuitState = {
      suspectPos: start,
      heading,
      speedKmh: Math.round(rng.range(85, 125)),
      startedAt: s.now,
      risk: 0.01,
      pressure: 0,
      heli: false,
      spikes: false,
      trail: [start],
    };
    inc.pursuit = p;
    s.flags[key(inc, 'cap')] = Math.round(rng.range(PURSUIT.tailedSpeedCap[0], PURSUIT.tailedSpeedCap[1]) * 100) / 100;
  });
  s.flags[key(inc, 'far')] = 0;
  s.flags[key(inc, 'upd')] = s.now;
  const p = inc.pursuit!;
  const street = nearestStreetName(s, start, inc);
  const where = onStreet(street);
  const dir = compass(p.heading);
  const speed = Math.floor(p.speedKmh / 10) * 10;
  if (beatDriven(inc, 'pursuit')) {
    // engine-core already counted the pursuit, emitted pursuit_start and radioed the beat line.
    radio(s, inc, { et: `Asukoht ${where.et}, liigub ${dir.et}, kiirus üle ${speed} km/h.`, en: `Position ${where.en}, ${dir.en}, speed over ${speed} km/h.` }, 'emergency');
  } else {
    s.stats.pursuits++;
    radio(
      s,
      inc,
      {
        et: `Sõiduk ei peatunud märguande peale, alustame jälitust ${where.et}! Liigub ${dir.et}, kiirus üle ${speed} km/h.`,
        en: `The vehicle failed to stop when signalled, starting a pursuit ${where.en}! ${dir.en.charAt(0).toUpperCase() + dir.en.slice(1)}, speed over ${speed} km/h.`,
      },
      'emergency',
    );
    addTimeline(s, inc, 'radio', { et: `Jälitus algas (${street}).`, en: `Pursuit started (${street}).` });
    emit(s, { type: 'pursuit_start', incidentId: inc.id, text: { et: 'Jälitus!', en: 'Pursuit!' } });
  }
  retarget(s, inc, p);
}

/** Advance pursuit by dtMin game minutes; returns true when it ended this step. */
export function updatePursuit(s: SimState, inc: Incident, dtMin: number): boolean {
  const p = inc.pursuit;
  if (!p || p.ended || dtMin <= 0) return false;
  return withRng(s, (rng) => stepPursuit(s, inc, p, dtMin, rng));
}

function stepPursuit(s: SimState, inc: Incident, p: PursuitState, dtMin: number, rng: Rng): boolean {
  const units = pursuers(s, inc);
  const ground = units.filter((u) => u.type !== 'heli');

  // ── Helicopter arrival ─────────────────────────────────────────────────────
  if (!p.heli) {
    const heliUnit = units.find((u) => u.type === 'heli');
    const eta = fnum(s, key(inc, 'heliEta'));
    if ((heliUnit && haversineKm(heliUnit.pos, p.suspectPos) <= PURSUIT.heliKm) || (eta !== undefined && s.now >= eta)) {
      p.heli = true;
      radio(
        s,
        inc,
        { et: 'Oleme sihtmärgi kohal, hoiame sõidukit termokaameraga silmas. Maapealsed ekipaažid võivad distantsi hoida.', en: 'Over the target, tracking the vehicle on the thermal camera. Ground units can hold back.' },
        'priority',
        heliUnit?.callsign ?? 'KOPTER',
        heliUnit?.id,
      );
    }
  }

  // ── Suspect motion ─────────────────────────────────────────────────────────
  const nearest = ground.reduce<Unit | undefined>((a, u) => (!a || haversineKm(u.pos, p.suspectPos) < haversineKm(a.pos, p.suspectPos) ? u : a), undefined);
  const nearestKm = nearest ? haversineKm(nearest.pos, p.suspectPos) : Infinity;
  let h = p.heading + rng.normal(0, 22) * Math.sqrt(dtMin);
  if (rng.chance(0.12 * dtMin)) h += (rng.chance(0.5) ? 1 : -1) * rng.range(55, 100); // sharp turn at a junction
  if (nearest && nearestKm < 3 && nearestKm > 0.01) {
    const away = bearing(nearest.pos, p.suspectPos);
    h += angDiff(h, away) * Math.min(1, 0.35 * dtMin);
  }
  const road = nearbyRoadBearing(p.suspectPos, 1.2);
  if (road !== undefined) {
    const along = Math.abs(angDiff(h, road)) <= 90 ? road : road + 180;
    h += angDiff(h, along) * Math.min(1, 0.5 * dtMin);
  }
  p.heading = norm(h);
  // Speedometer speed drifts; spikes and the end of a long chase slow the car.
  const spikesHit = fnum(s, key(inc, 'spikesHitUntil'));
  const crippled = spikesHit !== undefined;
  const target = crippled ? 35 : p.speedKmh + rng.normal(0, 9) * Math.sqrt(dtMin);
  p.speedKmh = Math.round(Math.max(crippled ? 20 : PURSUIT.minSpeed, Math.min(PURSUIT.maxSpeed, crippled ? p.speedKmh + (target - p.speedKmh) * 0.5 : target)));
  let mapKmh = p.speedKmh * PURSUIT.mapSpeedFactor;
  if (nearest && nearestKm < 3) mapKmh = Math.min(mapKmh, unitMapSpeed(nearest) * (fnum(s, key(inc, 'cap')) ?? 1.15));
  const stepKm = (mapKmh / 60) * dtMin;
  let next = destination(p.suspectPos, stepKm, p.heading);
  if (!validPos(s, next)) {
    let found = false;
    for (const off of [30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180]) {
      const hh = norm(p.heading + (rng.chance(0.5) ? off : -off));
      const cand = destination(p.suspectPos, stepKm, hh);
      if (validPos(s, cand)) {
        next = cand;
        p.heading = hh;
        found = true;
        break;
      }
    }
    if (!found) {
      next = p.suspectPos;
      p.pressure += 0.1 * dtMin; // cornered against the coast
    }
  }
  p.suspectPos = next;
  const last = p.trail[p.trail.length - 1];
  if (!last || haversineKm(last, next) >= PURSUIT.trailStepKm) {
    p.trail.push(next);
    if (p.trail.length > PURSUIT.trailMax) p.trail.splice(0, p.trail.length - PURSUIT.trailMax);
  }

  // ── Spikes ─────────────────────────────────────────────────────────────────
  const spikesAt = fnum(s, key(inc, 'spikesAt'));
  if (p.spikes && spikesAt !== undefined && s.now >= spikesAt && spikesHit === undefined) {
    if (rng.chance(0.7)) {
      s.flags[key(inc, 'spikesHitUntil')] = s.now + 3 * MIN;
      radio(s, inc, { et: 'Naelamatt tabas! Sõiduki rehvid on tühjad, kiirus langeb.', en: 'Spike strip hit! Tyres deflating, the vehicle is slowing down.' }, 'priority', fspikesUnit(s, inc));
    } else {
      p.spikes = false;
      delete s.flags[key(inc, 'spikesAt')];
      radio(s, inc, { et: 'Naelamatt jäi tabamata, sõiduk põikas kõrvalteele!', en: 'Spike strip missed, the vehicle swerved onto a side road!' }, 'priority', fspikesUnit(s, inc));
    }
  }
  const hitUntil = fnum(s, key(inc, 'spikesHitUntil'));
  const spikesBiting = p.spikes && hitUntil !== undefined && s.now <= hitUntil;

  // ── Pressure & risk ───────────────────────────────────────────────────────
  const close = ground.filter((u) => haversineKm(u.pos, p.suspectPos) < PURSUIT.closeKm).length;
  p.pressure += (PURSUIT.pressurePerUnit * close + (p.heli ? PURSUIT.pressureHeli : 0) + (spikesBiting ? PURSUIT.pressureSpikes : 0)) * dtMin;
  const speedFactor = (p.speedKmh / 100) * (isNight(s, p.suspectPos) ? 1.3 : 1) * weatherRiskFactor(s) * (p.heli ? 0.6 : 1);
  p.risk = Math.min(0.6, p.risk + PURSUIT.riskPerMin * speedFactor * dtMin);
  p.pressure = Math.min(1, p.pressure);

  // ── Ending conditions ─────────────────────────────────────────────────────
  if (p.pressure >= 1) return endPursuit(s, inc, 'caught', rng);
  const crashP = 1 - Math.pow(1 - Math.min(0.9, p.risk * PURSUIT.crashFactor), dtMin);
  if (rng.chance(crashP)) return endPursuit(s, inc, 'crashed', rng);
  // Lost visual contact: the driver may slip away into side streets.
  const lost = !p.heli && nearestKm > PURSUIT.closeKm;
  const lostMin = lost ? (fnum(s, key(inc, 'lost')) ?? 0) + dtMin : 0;
  s.flags[key(inc, 'lost')] = Math.round(lostMin * 1000) / 1000;
  if (lostMin >= PURSUIT.lostMin && rng.chance(1 - Math.pow(1 - PURSUIT.lostEscapePerMin, dtMin))) return endPursuit(s, inc, 'escaped', rng);
  const far = !p.heli && nearestKm > PURSUIT.escapeKm;
  const farMin = far ? (fnum(s, key(inc, 'far')) ?? 0) + dtMin : 0;
  s.flags[key(inc, 'far')] = Math.round(farMin * 1000) / 1000;
  if (farMin >= PURSUIT.escapeMin) return endPursuit(s, inc, 'escaped', rng);
  if ((s.now - p.startedAt) / MIN >= PURSUIT.maxMin && !p.heli) return endPursuit(s, inc, 'escaped', rng);

  // ── Re-target units each game-minute; radio updates every 2 min ───────────
  if (s.now - (fnum(s, key(inc, 'rt')) ?? 0) >= MIN) retarget(s, inc, p);
  if (s.now - (fnum(s, key(inc, 'upd')) ?? p.startedAt) >= 2 * MIN) {
    s.flags[key(inc, 'upd')] = s.now;
    const dir = compass(p.heading);
    const where = onStreet(nearestStreetName(s, p.suspectPos, inc));
    radio(s, inc, {
      et: `Jälitus jätkub ${where.et}, liigub ${dir.et}, kiirus ${p.speedKmh} km/h.`,
      en: `Pursuit continuing ${where.en}, ${dir.en}, speed ${p.speedKmh} km/h.`,
    });
  }
  return false;
}

function fspikesUnit(s: SimState, inc: Incident): string | undefined {
  const id = s.flags[key(inc, 'spikesUnit')];
  return typeof id === 'string' ? s.units[id]?.callsign : undefined;
}

function endPursuit(s: SimState, inc: Incident, how: NonNullable<PursuitState['ended']>, rng: Rng): boolean {
  const p = inc.pursuit!;
  p.ended = how;
  const e = inc.effects;
  const pos = p.suspectPos;
  const where = onStreet(nearestStreetName(s, pos, inc));
  switch (how) {
    case 'caught':
      e.success += 0.3;
      e.arrests += 1;
      s.stats.pursuitsCaught++;
      radio(s, inc, { et: `Sõiduk peatatud ${where.et}, juht kinni peetud! Jälitus lõpetatud.`, en: `Vehicle stopped ${where.en}, driver detained! Pursuit over.` }, 'emergency');
      break;
    case 'crashed': {
      e.success -= 0.4;
      e.risk += 0.15;
      const civ = rng.chance(0.35);
      if (civ) {
        s.stats.civilianInjuries++;
        inc.tags.push('pursuit:civilian_injury');
      }
      if (rng.chance(0.6)) e.arrests += 1; // driver detained at the wreck
      if (!inc.agencyNeeds.some((a) => a.agency === 'kiirabi')) {
        inc.agencyNeeds.push({ agency: 'kiirabi', reason: { et: 'Jälitatav sõiduk tegi avarii, on vigastatuid.', en: 'The pursued vehicle crashed, there are injuries.' } });
      }
      radio(
        s,
        inc,
        {
          et: `Jälitatav sõiduk kaotas juhitavuse ja sõitis ${where.et} teelt välja! ${civ ? 'Pihta sai ka kõrvaline sõiduk. ' : ''}Vajame kiirabi!`,
          en: `The pursued vehicle lost control and left the road ${where.en}! ${civ ? 'A bystander vehicle was hit too. ' : ''}We need an ambulance!`,
        },
        'emergency',
      );
      break;
    }
    case 'escaped':
      e.success -= 0.25;
      inc.tags.push('pursuit:escaped');
      radio(s, inc, { et: 'Kaotasime sõiduki silmist, jälitus katkestatud. Teen otsimise piirkonnas.', en: 'We lost sight of the vehicle, pursuit broken off. Searching the area.' }, 'priority');
      break;
    case 'terminated':
      e.success -= 0.1;
      e.trust -= 1;
      inc.tags.push('pursuit:terminated');
      break;
  }
  addTimeline(s, inc, 'radio', {
    et: `Jälitus lõppes: ${{ caught: 'kinni peetud', crashed: 'avarii', escaped: 'põgenes', terminated: 'lõpetati JK korraldusel', handedOver: 'anti üle naabersektorile' }[how]}.`,
    en: `Pursuit ended: ${{ caught: 'caught', crashed: 'crashed', escaped: 'escaped', terminated: 'terminated by dispatch', handedOver: 'handed over to the neighbouring sector' }[how]}.`,
  });
  emit(s, { type: 'pursuit_end', incidentId: inc.id, text: { et: 'Jälitus lõppes', en: 'Pursuit ended' } });
  // Close the pursuit beat and steer the outcome; then mark the end as handled so engine-core's
  // generic onPursuitEnded bookkeeping (same effects/stats) is not applied a second time.
  const tpl = tplOf(inc);
  for (const b of inc.beats) if (b.status === 'active' && tpl?.beats?.[b.index]?.kind === 'pursuit') b.status = 'done';
  if (how === 'escaped' || how === 'terminated') {
    const o = tpl?.outcomes.find((x) => x.result === 'escaped');
    if (o) e.outcome = o.id;
  }
  s.flags[`i:${inc.id}:pend`] = true;
  // Units: to the stop/crash site to deal with the driver, otherwise back to the original scene.
  const dest = how === 'caught' || how === 'crashed' ? pos : inc.location.coord;
  for (const u of pursuers(s, inc)) {
    if (u.type === 'heli') {
      // The helicopter has no work on the ground: it leaves the event and flies back to base.
      // (Left assigned with a 'pursuit' purpose it would hover 'en route' forever and keep the
      // event open once the ground units are recalled.)
      inc.assigned = inc.assigned.filter((id) => id !== u.id);
      if (u.incidentId === inc.id) delete u.incidentId;
      releaseUnit(s, u, true, inc);
      continue;
    }
    try {
      moveUnitTo(s, u, dest, 'incident', false);
    } catch {
      /* not wired */
    }
  }
  return true;
}

/** Is a helicopter overhead, alerted or on its way to this pursuit? (The button waits while it is.) */
export function heliRequested(s: SimState, inc: Incident): boolean {
  const p = inc.pursuit;
  return !!p && (!!p.heli || fnum(s, key(inc, 'heliEta')) !== undefined || inc.assigned.some((id) => s.units[id]?.type === 'heli'));
}

export function pursuitCommand(s: SimState, inc: Incident, a: 'terminate' | 'heli' | 'spikes'): void {
  const p = inc.pursuit;
  if (!p || p.ended) return;
  if (a === 'terminate') {
    pushRadio(s, {
      from: 'JK',
      text: { et: 'Kõik ekipaažid: jälitus lõpetada! Kordan, jälitus lõpetada.', en: 'All units: terminate the pursuit! I repeat, terminate the pursuit.' },
      level: 'emergency',
      kind: 'pursuit',
      incidentId: inc.id,
    });
    radio(s, inc, { et: 'Selge, lõpetame jälituse.', en: 'Copy, terminating the pursuit.' }, 'priority');
    withRng(s, (rng) => endPursuit(s, inc, 'terminated', rng));
    return;
  }

  if (a === 'heli') {
    if (heliRequested(s, inc)) {
      // Said once a pursuit: asking again (a second player, a double click) does not fill the radio.
      if (!s.flags[key(inc, 'heliTold')]) {
        s.flags[key(inc, 'heliTold')] = true;
        pushRadio(s, { from: 'JK', text: { et: 'Helikopter on juba teel.', en: 'The helicopter is already on its way.' }, level: 'routine', kind: 'system', incidentId: inc.id });
      }
      return;
    }
    // Only a helicopter that can actually take the job: free (or on a break that gets cut short),
    // never one that is off duty, in an emergency or busy elsewhere.
    const heli = Object.values(s.units).find((u) => u.type === 'heli' && (u.status === 'available' || u.status === 'break') && !u.incidentId);
    let ok = false;
    if (heli) {
      try {
        ok = dispatchUnits(s, inc.id, [heli.id]).ok && inc.assigned.includes(heli.id);
      } catch {
        ok = false;
      }
    }
    if (heli && ok) {
      try {
        moveUnitTo(s, heli, p.suspectPos, 'pursuit', true);
      } catch {
        /* not wired */
      }
      pushRadio(s, { from: 'JK', text: { et: `${heli.callsign}, toetage jälitust, sihtmärk liigub kiirusel ${p.speedKmh} km/h.`, en: `${heli.callsign}, support the pursuit, target moving at ${p.speedKmh} km/h.` }, level: 'priority', kind: 'pursuit', incidentId: inc.id, unitId: heli.id });
      return;
    }
    if (s.flags['upg:heli_hours']) {
      const etaMin = PURSUIT.heliActivationMin + (haversineKm(HELI_BASE, p.suspectPos) / PURSUIT.heliKmh) * 60;
      s.flags[key(inc, 'heliEta')] = s.now + Math.round(etaMin * MIN);
      pushRadio(s, {
        from: 'JK',
        text: { et: `Lennusalk teavitatud, helikopter jõuab kohale umbes ${Math.round(etaMin)} minutiga.`, en: `Air unit alerted, the helicopter will be overhead in about ${Math.round(etaMin)} minutes.` },
        level: 'priority',
        kind: 'pursuit',
        incidentId: inc.id,
      });
      return;
    }
    pushRadio(s, { from: 'JK', text: { et: 'Helikopter ei ole saadaval.', en: 'No helicopter available.' }, level: 'routine', kind: 'system', incidentId: inc.id });
    return;
  }

  // spikes
  if (!s.flags['upg:spikes']) {
    pushRadio(s, { from: 'JK', text: { et: 'Naelamatte meil ei ole (vaja täiendust „Naelamatid“).', en: 'We have no spike strips (requires the "Spike strips" upgrade).' }, level: 'routine', kind: 'system', incidentId: inc.id });
    return;
  }
  if (p.spikes) return;
  let best: Unit | undefined;
  let bestKm = Infinity;
  for (const u of Object.values(s.units)) {
    if (u.type !== 'traffic' && u.type !== 'patrol') continue;
    const mine = inc.assigned.includes(u.id);
    if (!mine && u.status !== 'available') continue;
    const d = haversineKm(p.suspectPos, u.pos);
    if (d > PURSUIT.spikesKm || d < 0.2) continue;
    const ahead = Math.abs(angDiff(p.heading, bearing(p.suspectPos, u.pos))) <= 60;
    if (!ahead) continue;
    if (d < bestKm) {
      best = u;
      bestKm = d;
    }
  }
  if (!best) {
    pushRadio(s, { from: 'JK', text: { et: 'Ühtegi liiklus- ega patrullekipaaži ei ole 3 km raadiuses sõidusuunas ees.', en: 'No traffic or patrol unit within 3 km ahead of the vehicle.' }, level: 'routine', kind: 'system', incidentId: inc.id });
    return;
  }
  p.spikes = true;
  s.flags[key(inc, 'spikesUnit')] = best.id;
  const mapKmh = Math.max(30, p.speedKmh * PURSUIT.mapSpeedFactor);
  s.flags[key(inc, 'spikesAt')] = s.now + Math.round(Math.max(0.5, (bestKm / mapKmh) * 60) * MIN);
  if (!inc.assigned.includes(best.id)) {
    try {
      dispatchUnits(s, inc.id, [best.id]);
    } catch {
      /* not wired */
    }
  }
  pushRadio(s, { from: 'JK', text: { et: `${best.callsign}, paigaldage naelamatt, sõiduk läheneb teile.`, en: `${best.callsign}, deploy the spike strip, the vehicle is approaching you.` }, level: 'priority', kind: 'pursuit', incidentId: inc.id, unitId: best.id });
  pushRadio(s, { from: best.callsign, unitId: best.id, text: { et: 'Selge, paigaldame naelamati.', en: 'Copy, deploying the spike strip.' }, level: 'priority', kind: 'pursuit', incidentId: inc.id });
}

/** Distance (km) from the suspect to the nearest pursuing ground unit (UI helper). */
export function pursuitGapKm(s: SimState, inc: Incident): number | null {
  const p = inc.pursuit;
  if (!p) return null;
  const ds = pursuers(s, inc)
    .filter((u) => u.type !== 'heli')
    .map((u) => haversineKm(u.pos, p.suspectPos));
  return ds.length ? Math.min(...ds) : null;
}
