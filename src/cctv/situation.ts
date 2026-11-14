/**
 * What the game says about an incident right now, as a camera needs to know it (docs/CCTV.md section 6): which
 * crews are coming, close, on scene or gone, the other services, a pursuit, a search, the outcome. Read from the
 * simulation every frame and handed to the director (director.ts), which plays it on the street.
 *
 * Pure: it only reads the state, it never changes it.
 */
import { haversineKm } from '@/sim/geo';
import { workProgress } from '@/sim/incidents';
import type { Incident, LngLat, SimState, Unit } from '@/sim/types';
import { custodyDestination, nearestHospital, unitPosAt } from '@/sim/units';
import { frameAt, len, yawOf, yawOfHeading } from './math';
import type { AgencySit, Situation, UnitSit } from './stage';

/** A crew or another service this many real seconds from arriving is shown driving up. */
export const NEAR_S = 7;

/** A crew standing or stopping further from the incident than this is not at this camera's place. */
const HERE_KM = 0.15;
/** Two map points closer than this are the same place (a transport's destination). */
const SAME_KM = 0.05;
/** A crew on its way and closer than this comes from where its path's last turn is, not from where it is. */
const CLOSE_M = 300;

const lastOf = (path: readonly LngLat[]): LngLat | undefined => path[path.length - 1];

/** Is the crew driving to this incident's own place (and not to where a pursuit ended)? */
function drivingHere(inc: Incident, u: Unit): boolean {
  const m = u.move;
  if (!m || m.purpose !== 'incident' || u.incidentId !== inc.id || u.status !== 'enroute') return false;
  const end = lastOf(m.path);
  return !!end && haversineKm(end, inc.location.coord) < HERE_KM;
}

/**
 * Does the crew stand at this incident's place on a job there? On scene, writing its report in the car after the
 * incident closed (the engine keeps it 'busy' where it stands), or waiting for help with an injured officer (its job
 * is then the follow-up incident at the same address).
 */
function standingHere(s: SimState, inc: Incident, u: Unit): boolean {
  if (u.move) return false;
  if (u.status !== 'onscene' && u.status !== 'busy' && u.status !== 'emergency') return false;
  if (haversineKm(u.pos, inc.location.coord) >= HERE_KM) return false;
  if (u.incidentId === inc.id) return true;
  const job = u.incidentId ? s.incidents[u.incidentId] : undefined;
  return !!job && haversineKm(job.location.coord, inc.location.coord) < SAME_KM;
}

/** Whom a crew that left on a transport has aboard: the engine sends it to the cells or to the nearest hospital. */
function takesOf(s: SimState, inc: Incident, u: Unit): UnitSit['takes'] {
  if (u.incidentId !== inc.id || (u.status !== 'transport' && u.status !== 'busy')) return null;
  const end = u.move ? lastOf(u.move.path) : u.pos;
  if (!end || haversineKm(end, inc.location.coord) < SAME_KM) return null;
  const cells = custodyDestination(s, inc.location.coord, inc.location.zone)?.station.coord;
  if (cells && haversineKm(end, cells) < SAME_KM) return 'arrest';
  const hospital = nearestHospital(s, inc.location.coord, inc.location.zone)?.coord;
  if (hospital && haversineKm(end, hospital) < SAME_KM) return 'hospital';
  return null;
}

/** The scene yaw from the incident towards where the crew is, or comes from. */
function fromOf(s: SimState, inc: Incident, u: Unit, state: UnitSit['state']): number {
  const local = frameAt(inc.location.coord).toLocal;
  const back = yawOfHeading(u.heading) + Math.PI;
  const m = u.move;
  if (!m) {
    // Standing here: it came against its heading. Standing elsewhere: over there.
    const p = local(u.pos);
    return state === 'here' || len(p) < 1 ? back : yawOf(p);
  }
  const p = local(unitPosAt(u, s.now).pos);
  if ((state === 'near' || state === 'coming') && (state === 'near' || len(p) < CLOSE_M) && m.path.length >= 2) {
    // Close: the last stretch of its path is the way it drives up.
    const v = local(m.path[m.path.length - 2]);
    if (len(v) >= 1) return yawOf(v);
  }
  return len(p) < 1 ? back : yawOf(p);
}

function unitSit(s: SimState, inc: Incident, u: Unit, speed: number): UnitSit {
  let state: UnitSit['state'] = 'left';
  let eta = 0;
  if (standingHere(s, inc, u)) state = 'here';
  else if (drivingHere(inc, u)) {
    eta = Math.max(0, (u.move!.arriveAt - s.now) / 1000 / speed);
    state = eta <= NEAR_S ? 'near' : 'coming';
  }
  return {
    id: u.id,
    type: u.type,
    model: u.vehicle,
    crew: u.crew.map((o) => o.gender),
    state,
    eta: state === 'near' ? eta : 0,
    from: fromOf(s, inc, u, state),
    takes: state === 'left' ? takesOf(s, inc, u) : null,
  };
}

/**
 * The situation of an incident. `speed` is game seconds per real second while the game runs (the last running speed
 * while it is paused, with `paused` true).
 */
export function situationOf(sim: SimState, incident: Incident, speed: number, paused = false): Situation {
  const rate = speed > 0 && Number.isFinite(speed) ? speed : 1;
  const closed = incident.state === 'closed';
  // Everybody ever sent, in the order they were sent, then whoever else has this incident as its job.
  const ids = [...incident.unitHistory];
  for (const id of incident.assigned) if (!ids.includes(id)) ids.push(id);
  for (const id of sim.unitOrder) if (sim.units[id]?.incidentId === incident.id && !ids.includes(id)) ids.push(id);
  const units: UnitSit[] = [];
  for (const id of ids) {
    const u = sim.units[id];
    if (u) units.push(unitSit(sim, incident, u, rate));
  }
  const agencies: AgencySit[] = [];
  for (const need of incident.agencyNeeds) {
    const rq = need.requested;
    if (!rq) continue;
    const eta = Math.max(0, (rq.arriveAt - sim.now) / 1000 / rate);
    // The engine stops counting arrivals when the incident closes: whoever had not come by then is not shown coming.
    const state: AgencySit['state'] = rq.arrived ? 'here' : closed ? 'coming' : eta <= NEAR_S ? 'near' : 'coming';
    agencies.push({ agency: need.agency, state, eta: state === 'near' ? eta : 0 });
  }
  const search = incident.search;
  const out = incident.outcome;
  return {
    closed,
    units,
    agencies,
    pursuit: !incident.pursuit ? 'none' : incident.pursuit.ended ? 'over' : 'on',
    searching: !!search && !search.found && !closed && !sim.flags[`i:${incident.id}:send`],
    outcome: out ? { result: out.result, arrests: out.arrests, injuries: out.injuries } : null,
    progress: workProgress(incident),
    paused,
  };
}
