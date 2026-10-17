/**
 * Area search (piirkonna läbikammimine), see DESIGN §4.7.
 *
 * Progress per game-minute = Σ unit weights × SEARCH_K / radius² (km), where the weights are
 * K9 2.5, helicopter 4 (thermal camera, unaffected by darkness), patrol 1, aux 1.2 (many eyes),
 * community 1.3 (local knowledge), border 1.5 (trained trackers) …, plus a drone (×3) when the
 * `drone` upgrade is owned. Darkness, fog and rain slow ground searching. Found at progress ≥ 1,
 * or earlier by luck (chance ∝ progress).
 *
 * With SEARCH_K = 0.035: two patrols find someone in a 1 km circle in ~14 min; K9 + two patrols
 * need ~55 min for a 3 km circle; adding the helicopter brings that to ~30 min.
 *
 * Owned by engine-systems.
 */
import { haversineKm } from './geo';
import { pushRadio, tplOf } from './internal';
import { withRng } from './rng';
import { sunAltitude } from './sun';
import type { Incident, SimState, UnitType } from './types';

export const SEARCH_K = 0.035;

export const SEARCH_WEIGHTS: Record<UnitType, number> = {
  k9: 2.5,
  heli: 4,
  patrol: 1,
  aux: 1.2,
  community: 1.3,
  rapid: 1,
  traffic: 0.8,
  criminal: 0.7,
  special: 1.5,
  border: 1.5,
  boat: 1,
  transport: 0.3,
};
/** Virtual drone contribution with the `drone` upgrade (needs at least one ground unit on site to fly it). */
export const DRONE_WEIGHT = 3;

export function startSearch(s: SimState, inc: Incident, radiusKm: number): void {
  if (inc.search && !inc.search.found) return;
  const r = Math.max(0.2, radiusKm);
  inc.search = { center: inc.location.coord, radiusKm: r, progress: 0, startedAt: s.now };
  // A template search beat already radioed its own line (engine-core); only announce ad-hoc searches.
  const tpl = tplOf(inc);
  if (inc.beats.some((b) => b.status === 'active' && tpl?.beats?.[b.index]?.kind === 'search')) return;
  const missing = inc.category === 'missing';
  const lead = inc.assigned.map((id) => s.units[id]).find(Boolean);
  pushRadio(s, {
    from: lead?.callsign ?? 'JK',
    unitId: lead?.id,
    text: missing
      ? { et: `Alustame otsinguid ${fmtKm(r)} km raadiuses. Palun saata lisajõude, koerajuht oleks abiks.`, en: `Starting a search within a ${fmtKm(r)} km radius. Requesting more units, a dog handler would help.` }
      : { et: `Kahtlustatav põgenes jalgsi, kammime piirkonda ${fmtKm(r)} km raadiuses.`, en: `The suspect fled on foot, combing the area within ${fmtKm(r)} km.` },
    level: 'priority',
    kind: 'info',
    incidentId: inc.id,
  });
}

function fmtKm(km: number): string {
  return (Math.round(km * 10) / 10).toString().replace('.', ',');
}

/** Units currently contributing to the search (assigned and inside/near the circle). */
export function searchingUnits(s: SimState, inc: Incident): { id: string; weight: number }[] {
  const st = inc.search;
  if (!st) return [];
  const out: { id: string; weight: number }[] = [];
  for (const id of inc.assigned) {
    const u = s.units[id];
    if (!u || u.status === 'break' || u.status === 'offduty' || u.status === 'transport') continue;
    const d = haversineKm(u.pos, st.center);
    if (d > st.radiusKm + 0.5 && u.status !== 'onscene') continue;
    out.push({ id, weight: SEARCH_WEIGHTS[u.type] ?? 1 });
  }
  return out;
}

/** Advance search by dtMin; returns true when the target was found this step. */
export function updateSearch(s: SimState, inc: Incident, dtMin: number): boolean {
  const st = inc.search;
  if (!st || st.found || dtMin <= 0) return false;
  const units = searchingUnits(s, inc);
  if (units.length === 0) return false;

  const night = sunAltitude(s.now, st.center[1], st.center[0]) < -6;
  const w = s.weather;
  let groundMod = 1;
  if (night) groundMod *= 0.7;
  if (w.kind === 'fog') groundMod *= 0.7;
  else if (w.kind === 'rain' || w.kind === 'storm') groundMod *= 0.85;
  else if (w.kind === 'snow') groundMod *= 1.1; // footprints in fresh snow

  let total = 0;
  for (const x of units) {
    const u = s.units[x.id];
    let wgt = x.weight;
    if (u.type === 'heli') wgt *= w.kind === 'fog' || w.kind === 'storm' ? 0.4 : 1; // thermal camera; limited in fog/gales
    else if (u.type === 'k9') wgt *= w.kind === 'rain' || w.kind === 'storm' ? 0.75 : 1; // dogs don't need light; rain washes scent
    else wgt *= groundMod;
    total += wgt;
  }
  if (s.flags['upg:drone']) total += DRONE_WEIGHT * (w.kind === 'storm' || w.kind === 'fog' ? 0.3 : 1);

  const gain = (total * SEARCH_K * dtMin) / (st.radiusKm * st.radiusKm);
  st.progress = Math.min(1, st.progress + gain);

  const lucky = withRng(s, (r) => r.chance(Math.min(0.5, st.progress * 0.06 * dtMin)));
  if (st.progress < 1 && !lucky) return false;

  st.found = true;
  st.progress = 1;
  // Credit the unit that contributes most.
  const best = units.reduce((a, b) => (b.weight > a.weight ? b : a));
  const u = s.units[best.id];
  const missing = inc.category === 'missing';
  const minutes = Math.max(1, Math.round((s.now - st.startedAt) / 60_000));
  pushRadio(s, {
    from: u?.callsign ?? 'JK',
    unitId: u?.id,
    text: missing
      ? u?.type === 'k9'
        ? { et: 'Koer võttis jälje ja viis meid otse isiku juurde. Leitud! Elus, alajahtunud, kutsume kiirabi kontrolliks.', en: 'The dog picked up the track and led us straight to the person. Found! Alive, cold, calling an ambulance to check.' }
        : u?.type === 'heli'
          ? { et: 'Termokaamera tuvastas isiku, juhatame maapealse ekipaaži kohale. Isik leitud!', en: 'Thermal camera has the person, guiding the ground unit in. Person found!' }
          : { et: 'Isik leitud! Ta on elus ja kontaktne.', en: 'Person found! Alive and responsive.' }
      : u?.type === 'k9'
        ? { et: 'Koer tabas kahtlustatava põõsastest, isik kinni peetud!', en: 'The dog found the suspect hiding in the bushes, detained!' }
        : { et: 'Kahtlustatav leitud ja kinni peetud!', en: 'Suspect found and detained!' },
    level: 'priority',
    kind: 'info',
    incidentId: inc.id,
  });
  s.flags[`search:${inc.id}:min`] = minutes;
  return true;
}
