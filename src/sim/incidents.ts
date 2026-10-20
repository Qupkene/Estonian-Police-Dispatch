/**
 * Incident lifecycle (engine-core): publish, acknowledgement timeout, expiry, escalation,
 * on-scene work, beats, outcome (DESIGN §4.3-4.5).
 */
import { ageOf, describePerson, vehicleName, withArticleEn } from '@/gen/describe';
import { JK_QUERY_REPLY } from '@/data/radioPhrases';
import { bearing, destination, haversineKm } from './geo';
import { addTimeline, emit, publishIncident, regionOf, tplOf } from './internal';
import { startPursuit, updatePursuit } from './pursuit';
import {
  agencyName,
  placeText,
  hkPhrase,
  jkSay,
  phrase,
  pickFill,
  PERSON_REPLIES,
  radioVars,
  unitPhrase,
  unitSay,
  VEHICLE_REPLIES,
} from './radio';
import { correctReply } from './registry';
import { Rng, hashString, withRng } from './rng';
import {
  addTrust,
  closureBreakdown,
  computeSuccess,
  injuryChance,
  isBestChoice,
  pickOutcome,
  scoreIncident,
  slaFor,
  updateShiftScore,
  ZERO_BREAKDOWN,
} from './scoring';
import { startSearch, updateSearch } from './search';
import { radioClosure } from './radioText';
import { fillText, genitiveName, type Vars } from './text';
import { hhmm, isoDate, MIN } from './time';
import {
  custodyDestination,
  coverage,
  crewSkill,
  moveUnit,
  nearestHospital,
  nearestStation,
  releaseUnit,
  setStatus,
  stopUnit,
  typeFits,
} from './units';
import type {
  Agency,
  AgencyBeat,
  BackupBeat,
  BeatSpec,
  BeatState,
  ChoiceBeat,
  Effects,
  EscalateBeat,
  Incident,
  IncidentTemplate,
  OutcomeResult,
  Person,
  PersonRole,
  Priority,
  QueryBeat,
  RadioMsg,
  SearchBeat,
  SimState,
  Text,
  TransportBeat,
  Unit,
} from './types';

const T = (et: string, en: string): Text => ({ et, en });

// ─────────────────────────────────────────────────────────────────────────────
// Bookkeeping helpers
// ─────────────────────────────────────────────────────────────────────────────

const openCache = new WeakMap<SimState, { len: number; ids: string[] }>();

/** Ids of incidents that are not closed (derived cache: JSON-safe, rebuilt after load). */
export function openIncidentIds(s: SimState): string[] {
  let c = openCache.get(s);
  if (!c || c.len > s.incidentOrder.length) {
    c = { len: 0, ids: [] };
    openCache.set(s, c);
  }
  if (c.len !== s.incidentOrder.length) {
    for (let i = c.len; i < s.incidentOrder.length; i++) {
      const id = s.incidentOrder[i];
      if (s.incidents[id] && s.incidents[id].state !== 'closed') c.ids.push(id);
    }
    c.len = s.incidentOrder.length;
  }
  if (c.ids.some((id) => !s.incidents[id] || s.incidents[id].state === 'closed')) {
    c.ids = c.ids.filter((id) => s.incidents[id] && s.incidents[id].state !== 'closed');
  }
  return c.ids;
}

export function isHidden(s: SimState, inc: Incident): boolean {
  return !!s.flags[`hidden:${inc.id}`];
}

const IF_KEYS = ['arr', 'acklate', 'needmsg', 'bk', 'bkwait', 'pub', 'ps', 'wk', 'pend', 'send', 'prioSet', 'left'];

/** An incident left without units after the first arrival lapses after this long. */
const ABANDON_MS = 45 * MIN;

export function getIF(s: SimState, inc: { id: string }, k: string): number | string | boolean | undefined {
  return s.flags[`i:${inc.id}:${k}`];
}
export function setIF(s: SimState, inc: { id: string }, k: string, v: number | string | boolean): void {
  s.flags[`i:${inc.id}:${k}`] = v;
}
export function delIF(s: SimState, inc: { id: string }, k: string): void {
  delete s.flags[`i:${inc.id}:${k}`];
}
function clearIncidentFlags(s: SimState, inc: Incident): void {
  for (const k of IF_KEYS) if (k !== 'arr') delIF(s, inc, k);
}

function listIF(s: SimState, inc: Incident, k: string): string[] {
  const v = getIF(s, inc, k);
  return typeof v === 'string' && v ? v.split(',') : [];
}

export function personOf(s: SimState, inc: Incident, role: string): Person | undefined {
  const ref = inc.persons.find((p) => p.role === role);
  return ref ? s.persons[ref.personId] : undefined;
}

function speakerOf(s: SimState, inc: Incident): Unit | undefined {
  const on = inc.assigned.map((id) => s.units[id]).filter((u): u is Unit => !!u && u.status === 'onscene');
  if (on.length) return on[0];
  const any = inc.assigned.map((id) => s.units[id]).filter((u): u is Unit => !!u);
  return any[0] ?? (inc.unitHistory.length ? s.units[inc.unitHistory[0]] : undefined);
}

function fullName(p: Person | undefined): string | undefined {
  return p ? `${p.firstName} ${p.lastName}` : undefined;
}

function safeDescribe(p: Person | undefined, now: number): Text | undefined {
  if (!p) return undefined;
  try {
    // Templates put {suspect} inside English sentences ("the attacker is a man, about 30…").
    const d = describePerson(p, now);
    return T(d.et, withArticleEn(d.en));
  } catch {
    const age = safeAge(p, now);
    return p.gender === 'M' ? T(`mees, u ${age}a`, `a man, about ${age}`) : T(`naine, u ${age}a`, `a woman, about ${age}`);
  }
}

function safeAge(p: Person, now: number): number {
  try {
    return ageOf(p, now);
  } catch {
    return 30;
  }
}

/** {car}: colour, make and model without the plate ("hall Toyota Avensis"); templates add {plate} themselves. */
export function safeCar(s: SimState, plate: string | undefined): Text | undefined {
  if (!plate) return undefined;
  const v = s.vehicles[plate];
  if (!v) return T('sõiduk', 'vehicle');
  try {
    return vehicleName(v);
  } catch {
    return T(`${v.color?.et?.toLowerCase() ?? ''} ${v.make} ${v.model}`.trim(), `${v.color?.en?.toLowerCase() ?? ''} ${v.make} ${v.model}`.trim());
  }
}

// Bare English directions: the templates supply the verb ("moving {direction}", "Heading {direction}").
const COMPASS: Text[] = [
  T('põhja suunas', 'north'),
  T('kirde suunas', 'north-east'),
  T('ida suunas', 'east'),
  T('kagu suunas', 'south-east'),
  T('lõuna suunas', 'south'),
  T('edela suunas', 'south-west'),
  T('lääne suunas', 'west'),
  T('loode suunas', 'north-west'),
];

/** Deterministic direction of travel for {direction} (derived from the incident id). */
export function directionText(s: SimState, inc: Pick<Incident, 'id' | 'location'>): Text {
  const r = new Rng(hashString(`dir:${inc.id}`));
  const region = regionOf(s);
  const roll = r.next();
  const here = inc.location.coord;
  if (roll < 0.45) {
    const streets = region.streets.filter((st) => st.city === inc.location.city && st.points.length && haversineKm(st.points[0], here) < 4);
    if (streets.length) {
      const st = r.pick(streets);
      return T(`${genitiveName(st.name)} suunas`, `towards ${st.name}`);
    }
  }
  if (roll < 0.8) {
    const towns = region.towns.filter((t) => t.name !== inc.location.city && haversineKm(t.coord, here) < 60);
    if (towns.length) {
      const t = r.pick(towns.slice(0, 12));
      // "suunas" takes the genitive: "Tallinna suunas", "Tõnismäe suunas".
      return T(`${genitiveName(t.name)} suunas`, `towards ${t.name}`);
    }
    if (region.towns.length > 1 && roll < 0.6) return T('kesklinna suunas', 'towards the town centre');
  }
  const idx = Math.floor(((r.range(0, 360) + 22.5) % 360) / 45);
  return COMPASS[idx];
}

/** Placeholder values for template texts (DESIGN text.ts TEMPLATE_PLACEHOLDERS). */
export function incidentVars(s: SimState, inc: Incident): Vars {
  const now = inc.createdAt;
  const suspect = personOf(s, inc, 'suspect') ?? personOf(s, inc, 'driver');
  const victim = personOf(s, inc, 'victim') ?? personOf(s, inc, 'missing') ?? personOf(s, inc, 'deceased');
  const ageP = personOf(s, inc, 'missing') ?? suspect ?? victim ?? (inc.persons[0] ? s.persons[inc.persons[0].personId] : undefined);
  const veh = inc.vehicles.find((v) => v.role === 'suspect') ?? inc.vehicles[0];
  const r = new Rng(hashString(`n:${inc.id}`));
  const ag = inc.agencyNeeds[0]?.agency ?? inc.referral;
  return {
    address: inc.location.address,
    place: placeText(inc.location),
    city: inc.location.city,
    district: inc.location.district ?? inc.location.city,
    suspect: safeDescribe(suspect, now) ?? T('tundmatu isik', 'unknown person'),
    suspectName: fullName(suspect) ?? T('tundmatu', 'unknown'),
    victim: safeDescribe(victim, now) ?? T('kannatanu', 'the victim'),
    victimName: fullName(victim) ?? T('kannatanu', 'the victim'),
    caller: inc.caller?.name ?? T('teataja', 'the caller'),
    plate: veh?.plate ?? T('teadmata', 'unknown'),
    car: safeCar(s, veh?.plate) ?? T('sõiduk', 'vehicle'),
    direction: directionText(s, inc),
    age: ageP ? String(safeAge(ageP, now)) : String(r.int(20, 50)),
    n: String(2 + (hashString(inc.id) % 5)),
    time: hhmm(now),
    agency: ag ? agencyName(ag) : undefined,
  };
}

function beatVars(s: SimState, inc: Incident, u: Unit | undefined, extra: Vars = {}): Vars {
  return { ...incidentVars(s, inc), ...radioVars(s, u, inc), ...extra };
}

function applyEffects(s: SimState, inc: Incident, e: Effects | undefined): void {
  if (!e) return;
  inc.effects.success += e.success ?? 0;
  inc.effects.risk += e.risk ?? 0;
  inc.effects.trust += e.trust ?? 0;
  inc.effects.time += e.time ?? 0;
  inc.effects.arrests += e.arrests ?? 0;
  if (e.outcome) inc.effects.outcome = e.outcome;
  if (e.escalate) escalateIncident(s, inc, 1, undefined, 'unit');
}

function revealDetail(inc: Incident, all = false): void {
  if (!inc.hiddenDetails.length) return;
  if (all) {
    inc.details.push(...inc.hiddenDetails);
    inc.hiddenDetails = [];
  } else inc.details.push(inc.hiddenDetails.shift()!);
}

// ─────────────────────────────────────────────────────────────────────────────
// Publish (internal.publishIncident)
// ─────────────────────────────────────────────────────────────────────────────

export function publishIncidentImpl(s: SimState, inc: Incident): void {
  const wasHidden = isHidden(s, inc);
  delete s.flags[`hidden:${inc.id}`];
  if (inc.state === 'closed' || getIF(s, inc, 'pub') !== undefined) return;
  const delta = s.now - inc.createdAt;
  if (wasHidden && delta > 0) {
    if (inc.expiresAt !== undefined) inc.expiresAt += delta;
    if (inc.escalateAt !== undefined) inc.escalateAt += delta;
  }
  setIF(s, inc, 'pub', s.now);
  if (inc.source === 'call') {
    addTimeline(s, inc, 'system', T('Sündmus loodud 112 kõne põhjal', 'Event created from the 112 call'));
    if (inc.state === 'incoming') {
      inc.state = 'queued';
      inc.acknowledgedAt = s.now;
    }
  } else if (inc.source === 'director') {
    addTimeline(s, inc, 'system', T('Sündmus lisatud (režissöör)', 'Event added (director)'));
  } else if (inc.source === 'alarm') {
    addTimeline(s, inc, 'system', T('Valvekeskus edastas häire', 'The alarm monitoring centre forwarded an alarm'));
  } else if (inc.source === 'anpr') {
    addTimeline(s, inc, 'system', T('ANPR-kaamera tabas otsitava sõiduki', 'An ANPR camera flagged a wanted vehicle'));
  } else if (inc.source === 'field') {
    addTimeline(s, inc, 'radio', T('Välijuhi / üksuse algatatud sündmus', 'Event raised from the field'));
  } else {
    addTimeline(s, inc, 'hk', T('Häirekeskus edastas sündmuse', 'The Emergency Response Centre forwarded the event'));
  }
  emit(s, { type: inc.priority === 1 ? 'incident_p1' : 'incident_new', incidentId: inc.id, text: inc.title });
  if (inc.priority === 1 && inc.source === 'hk') hkPhrase(s, 'hkP1', inc, {}, { level: 'priority' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-substep update
// ─────────────────────────────────────────────────────────────────────────────

export function updateIncidents(s: SimState, dtMs: number): void {
  const ids = openIncidentIds(s);
  for (let i = 0; i < ids.length; i++) {
    const inc = s.incidents[ids[i]];
    if (!inc || inc.state === 'closed' || isHidden(s, inc)) continue;
    updateIncident(s, inc, dtMs);
  }
}

function updateIncident(s: SimState, inc: Incident, dtMs: number): void {
  const tpl = tplOf(inc);
  const now = s.now;
  const dtMin = dtMs / MIN;

  // Acknowledgement timeout (legacy "Aktsepteeri").
  if (inc.state === 'incoming' && !getIF(s, inc, 'acklate')) {
    const pub = Number(getIF(s, inc, 'pub') ?? inc.createdAt);
    if (now - pub > 2 * MIN) {
      setIF(s, inc, 'acklate', true);
      addTrust(s, -1);
      addTimeline(s, inc, 'system', T('Sündmus kinnitamata üle 2 minuti', 'Event unacknowledged for over 2 minutes'));
    }
  }

  // Agency arrivals.
  for (const n of inc.agencyNeeds) {
    const rq = n.requested;
    if (rq && !rq.arrived && now >= rq.arriveAt) {
      rq.arrived = true;
      addTimeline(s, inc, 'agency', fillText(T('Kohale jõudis: {agency}', 'Arrived on scene: {agency}'), { agency: agencyName(n.agency) }));
      const u = speakerOf(s, inc);
      if (u && u.status === 'onscene') unitPhrase(s, u, 'agencyArrive', inc, { agency: agencyName(n.agency) });
    }
  }

  // Pursuit / search driven by engine-systems (also ANPR pursuits without a beat).
  if (inc.pursuit && !getIF(s, inc, 'pend')) {
    if (!inc.pursuit.ended) {
      try {
        updatePursuit(s, inc, dtMin);
      } catch (err) {
        console.warn('[EPD] updatePursuit failed', err);
        inc.pursuit.ended = 'escaped';
      }
      // Safety net: a pursuit never runs longer than an hour of game time.
      if (!inc.pursuit.ended && now - inc.pursuit.startedAt > 60 * MIN) inc.pursuit.ended = 'escaped';
    }
    if (inc.pursuit.ended) onPursuitEnded(s, inc, tpl);
  }
  if (inc.search && !getIF(s, inc, 'send')) {
    let found = !!inc.search.found;
    if (!found) {
      try {
        found = updateSearch(s, inc, dtMin) || !!inc.search.found;
      } catch (err) {
        console.warn('[EPD] updateSearch failed', err);
      }
    }
    if (found) onSearchEnded(s, inc, tpl, true);
    else if (now - inc.search.startedAt > 120 * MIN) onSearchEnded(s, inc, tpl, false);
  }
  if (inc.state === 'closed') return;

  if (inc.firstArrivalAt === undefined) {
    // Expiry: nobody arrived in time.
    if (inc.expiresAt !== undefined && now >= inc.expiresAt) {
      let earliest = Infinity;
      for (const id of inc.assigned) {
        const u = s.units[id];
        if (u?.move && u.status === 'enroute') earliest = Math.min(earliest, u.move.arriveAt);
      }
      // A caller who knows the police are on the way keeps waiting; expiry punishes not sending anyone.
      // A colleague's call for help nobody went to goes back to their desk instead (src/sim/colleagues.ts).
      if (earliest === Infinity && !(s.colleagues && inc.tags.some((t) => t.startsWith('help:')))) {
        expireIncident(s, inc);
        return;
      }
    }
    // Escalation before arrival.
    const esc = tpl?.escalation;
    if (esc && inc.escalateAt !== undefined && !inc.escalated && now >= inc.escalateAt) {
      delete inc.escalateAt;
      if (withRng(s, (r) => r.chance(esc.chance))) escalateIncident(s, inc, esc.toPriority, esc.text, 'hk');
    }
    return;
  }
  // Abandoned after the first arrival (all units recalled): lapses unless someone returns.
  if (!inc.assigned.length) {
    const left = getIF(s, inc, 'left');
    if (left === undefined) setIF(s, inc, 'left', now);
    else if (now - Number(left) > ABANDON_MS) {
      expireIncident(s, inc, 'abandoned');
      return;
    }
  } else if (getIF(s, inc, 'left') !== undefined) delIF(s, inc, 'left');
  updateOnScene(s, inc, tpl, dtMin);
}

function workTarget(inc: Incident): number {
  return Math.max(1, inc.onSceneMin + inc.effects.time);
}

/** Progress 0..1 of the on-scene work. */
export function workProgress(inc: Incident): number {
  return Math.max(0, Math.min(1, inc.workDone / workTarget(inc)));
}

/** Why work is paused, if it is. */
export function workBlocked(s: SimState, inc: Incident, tpl: IncidentTemplate | undefined): 'backup' | 'pursuit' | 'search' | null {
  if (inc.pursuit && !inc.pursuit.ended) return 'pursuit';
  if (inc.search && !getIF(s, inc, 'send') && !inc.search.found) return 'search';
  for (const b of inc.beats) {
    if (b.status === 'active' && tpl?.beats?.[b.index]?.kind === 'backup') return 'backup';
  }
  const wait = listIF(s, inc, 'bkwait');
  if (wait.length) {
    const still = wait.filter((id) => inc.assigned.includes(id));
    if (!still.length) delIF(s, inc, 'bkwait');
    else if (!still.some((id) => s.units[id]?.status === 'onscene')) return 'backup';
  }
  return null;
}

function updateOnScene(s: SimState, inc: Incident, tpl: IncidentTemplate | undefined, dtMin: number): void {
  const onScene = inc.assigned.map((id) => s.units[id]).filter((u): u is Unit => !!u && u.status === 'onscene');
  processBeats(s, inc, tpl, onScene);
  if (inc.state === 'closed' || !onScene.length) return;

  const target = workTarget(inc);
  const cov = coverage(
    onScene.map((u) => u.type),
    inc.need,
  );
  const capacity = onScene.reduce((a, u) => a + (0.75 + 0.5 * crewSkill(u)) * (1 - 0.25 * u.fatigue), 0);
  const req = Math.max(1, cov.required);
  let rate: number;
  if (cov.met) {
    rate = Math.min(1.5, capacity / req);
    delIF(s, inc, 'ps');
  } else {
    let ps = getIF(s, inc, 'ps');
    if (ps === undefined) {
      setIF(s, inc, 'ps', s.now);
      ps = s.now;
      if (!getIF(s, inc, 'needmsg')) {
        setIF(s, inc, 'needmsg', true);
        unitPhrase(s, onScene[0], 'needMore', inc, {}, { level: 'priority' });
        addTimeline(s, inc, 'radio', T('Üksus vajab lisajõude', 'Unit requests more resources'));
      }
    }
    const waited = s.now - Number(ps);
    if (cov.countOk) rate = 0.4 * Math.min(1, capacity / req);
    else rate = waited > 20 * MIN ? 0.25 : 0;
    inc.effects.risk += 0.004 * dtMin;
  }
  if (workBlocked(s, inc, tpl)) rate = 0;
  inc.workDone = Math.min(target, inc.workDone + rate * dtMin);

  // Occasional flavour update half-way through.
  if (!getIF(s, inc, 'wk') && inc.workDone >= target * 0.5 && target >= 12) {
    setIF(s, inc, 'wk', true);
    const noBeats = !inc.beats.some((b) => b.status === 'done' || b.status === 'active');
    if (noBeats && withRng(s, (r) => r.chance(0.45))) unitPhrase(s, onScene[0], 'working', inc);
  }

  if (inc.workDone >= target - 1e-9 && beatsResolved(inc) && agenciesSettled(inc) && !workBlocked(s, inc, tpl)) {
    completeIncident(s, inc, tpl);
  }
}

function beatsResolved(inc: Incident): boolean {
  return inc.beats.every((b) => b.status !== 'pending' && b.status !== 'active');
}

/** Emergency agencies the crew must wait for before leaving the scene. */
const WAIT_FOR: Agency[] = ['kiirabi', 'paaste', 'merepaaste'];

function agenciesSettled(inc: Incident): boolean {
  return inc.agencyNeeds.every((n) => !n.requested || n.requested.arrived || !WAIT_FOR.includes(n.agency));
}

// ─────────────────────────────────────────────────────────────────────────────
// Beats (DESIGN §4.4)
// ─────────────────────────────────────────────────────────────────────────────

function processBeats(s: SimState, inc: Incident, tpl: IncidentTemplate | undefined, onScene: Unit[]): void {
  const specs = tpl?.beats;
  if (!specs || !inc.beats.length) return;
  const active = inc.beats.find((b) => b.status === 'active');
  if (active) {
    handleActiveBeat(s, inc, tpl!, active);
    if (active.status === 'active' || inc.state === 'closed') return;
  }
  if (!onScene.length) return;
  const workDone = inc.workDone >= workTarget(inc) - 1e-9;
  const pending = inc.beats
    .filter((b) => b.status === 'pending' && b.dueAt !== undefined)
    .sort((a, b) => a.dueAt! - b.dueAt! || a.index - b.index);
  for (const b of pending) {
    if (s.now < b.dueAt! && !workDone) break;
    fireBeat(s, inc, tpl!, b, onScene);
    if (b.status === 'active' || inc.state === 'closed') break;
  }
}

function handleActiveBeat(s: SimState, inc: Incident, tpl: IncidentTemplate, b: BeatState): void {
  const spec = tpl.beats?.[b.index];
  if (!spec) {
    b.status = 'skipped';
    return;
  }
  const timedOut = b.timeoutAt !== undefined && s.now >= b.timeoutAt;
  switch (spec.kind) {
    case 'query':
      if (timedOut) queryTimeout(s, inc, spec, b);
      break;
    case 'choice':
      if (timedOut) choiceTimeout(s, inc, spec, b);
      break;
    case 'backup':
      if (timedOut) {
        b.status = 'failed';
        s.stats.beatsMissed++;
        applyEffects(s, inc, spec.failEffects);
        markAnswered(s, b, 'timeout');
        const u = speakerOf(s, inc);
        if (u) unitPhrase(s, u, 'backupTimeout', inc, {}, { level: 'priority' });
        addTimeline(s, inc, 'radio', T('Toetust ei saadetud õigeks ajaks', 'Backup was not sent in time'));
        // Legacy "Toetust vajab" failure hits Staatus immediately (not again at close).
        if (spec.failEffects?.trust) {
          addTrust(s, spec.failEffects.trust);
          inc.effects.trust -= spec.failEffects.trust;
        }
      }
      break;
    case 'agency':
      if (timedOut) {
        b.status = 'failed';
        s.stats.beatsMissed++;
        applyEffects(s, inc, spec.failEffects);
        markAnswered(s, b, 'timeout');
        const u = speakerOf(s, inc);
        if (u) unitPhrase(s, u, 'agencyTimeout', inc, { agency: agencyName(spec.agency) });
      }
      break;
    case 'pursuit':
      if (!inc.pursuit) b.status = 'done';
      else if (inc.pursuit.ended && getIF(s, inc, 'pend')) b.status = 'done';
      break;
    case 'search':
      if (!inc.search) b.status = 'done';
      else if (getIF(s, inc, 'send')) b.status = inc.search.found ? 'done' : 'failed';
      break;
    default:
      b.status = 'done';
  }
}

function markAnswered(s: SimState, b: BeatState, ans: string): void {
  if (!b.radioId) return;
  const m = findRadio(s, b.radioId);
  if (m && !m.answered) m.answered = ans;
}

export function findRadio(s: SimState, id: string): RadioMsg | undefined {
  for (let i = s.radio.length - 1; i >= 0; i--) if (s.radio[i].id === id) return s.radio[i];
  return undefined;
}

/** Subject of a query beat (same rule as the UI: role person, or suspect vehicle / first vehicle). */
export function querySubjectOf(_s: SimState, inc: Incident, spec: QueryBeat): { personId?: string; plate?: string } | null {
  if (spec.queryType === 'vehicle' || spec.subject === 'vehicle') {
    const v = inc.vehicles.find((x) => x.role === 'suspect') ?? inc.vehicles[0];
    return v ? { plate: v.plate } : null;
  }
  const ref = inc.persons.find((p) => p.role === spec.subject);
  return ref ? { personId: ref.personId } : null;
}

/** Engine-side truth (used when registry.correctReply is unavailable). Most severe flag wins. */
export function truthReply(s: SimState, subj: { personId?: string; plate?: string }): string {
  if (subj.personId) {
    const p = s.persons[subj.personId];
    if (!p) return 'notfound';
    const today = isoDate(s.now);
    if (p.flags.wanted) return 'wanted';
    if (p.flags.missing) return 'missing';
    if (p.flags.restrainingOrder && p.flags.restrainingOrder.until >= today) return 'restraining';
    if (p.license && ['suspended', 'revoked', 'none', 'expired'].includes(p.license.status)) return 'nolicense';
    if (p.weaponPermit) return 'weapon';
    if (p.flags.probation && p.flags.probation.until >= today) return 'probation';
    return 'clean';
  }
  if (subj.plate) {
    const v = s.vehicles[subj.plate];
    if (!v) return 'notfound';
    if (v.flags.stolen) return 'stolen';
    const owner = v.ownerId ? s.persons[v.ownerId] : undefined;
    if (owner?.flags.wanted) return 'ownerwanted';
    if (v.flags.suspended) return 'suspended';
    if (!v.insurance.valid) return 'noinsurance';
    if (!v.inspection.valid) return 'noinspection';
    return 'clean';
  }
  return 'notfound';
}

/** Context for registry.correctReply (driving context matters for 'nolicense'). */
export function queryCtx(inc: Incident, spec: QueryBeat): { role?: PersonRole; traffic?: boolean; incidentId?: string } {
  return {
    role: spec.subject === 'vehicle' ? undefined : spec.subject,
    traffic: inc.category === 'traffic',
    incidentId: inc.id,
  };
}

/** The correct reply id for a query subject (registry first, engine fallback). */
export function expectedReply(
  s: SimState,
  subj: { personId?: string; plate?: string },
  ctx?: { role?: PersonRole; traffic?: boolean; incidentId?: string },
): string {
  let r: string | undefined;
  try {
    r = correctReply(s, subj, ctx);
  } catch {
    /* registry not available, fall back */
  }
  if (typeof r !== 'string' || !r) return truthReply(s, subj);
  // 'missing' ranks right after 'wanted' (until registry returns it itself).
  if (subj.personId && r !== 'wanted' && s.persons[subj.personId]?.flags.missing) return 'missing';
  return r;
}

const DEFAULT_QUERY_RADIO: Record<'person' | 'vehicle', Text> = {
  person: T('Juhtimiskeskus, {callsign}. Palun kontrolli isikut {name}, isikukood {idcode}.', 'Control, {callsign}. Please check {name}, ID code {idcode}.'),
  vehicle: T('Juhtimiskeskus, {callsign}. Palun kontrolli sõidukit {plate}.', 'Control, {callsign}. Please run the plate {plate}.'),
};

function fireBeat(s: SimState, inc: Incident, tpl: IncidentTemplate, b: BeatState, onScene: Unit[]): void {
  const spec = tpl.beats![b.index] as BeatSpec;
  const u = onScene[0];
  b.activeSince = s.now;
  const vars = beatVars(s, inc, u);
  switch (spec.kind) {
    case 'query': {
      const subj = querySubjectOf(s, inc, spec);
      if (!subj) {
        b.status = 'skipped';
        return;
      }
      const isVeh = !!subj.plate;
      const p = subj.personId ? s.persons[subj.personId] : undefined;
      const qv: Vars = {
        ...vars,
        idcode: p?.idcode ?? '',
        name: fullName(p) ?? '',
        plate: subj.plate ?? vars.plate,
        car: subj.plate ? safeCar(s, subj.plate) : vars.car,
      };
      const text = spec.radio?.length ? pickFill(s, spec.radio, qv) : fillText(DEFAULT_QUERY_RADIO[isVeh ? 'vehicle' : 'person'], qv);
      b.timeoutAt = s.now + 6 * MIN;
      const msg = unitSay(s, u, text, inc, {
        level: 'priority',
        kind: 'query',
        replies: isVeh ? VEHICLE_REPLIES : PERSON_REPLIES,
        expiresAt: b.timeoutAt,
      });
      b.radioId = msg.id;
      b.status = 'active';
      addTimeline(s, inc, 'radio', isVeh ? T('Üksus palub sõiduki päringut', 'Unit requests a vehicle check') : T('Üksus palub isikupäringut', 'Unit requests a person check'));
      return;
    }
    case 'choice': {
      if (!spec.options.length) {
        b.status = 'skipped';
        return;
      }
      b.timeoutAt = s.now + Math.max(1, spec.timeoutMin) * MIN;
      const msg = unitSay(s, u, pickFill(s, spec.radio, vars, 'working'), inc, {
        level: 'priority',
        kind: 'choice',
        replies: spec.options.map((o) => ({ id: o.id, label: o.label })),
        expiresAt: b.timeoutAt,
      });
      b.radioId = msg.id;
      b.status = 'active';
      return;
    }
    case 'backup': {
      b.timeoutAt = s.now + Math.max(1, spec.timeoutMin) * MIN;
      setIF(s, inc, 'bk', inc.assigned.filter((id) => s.units[id]?.status === 'onscene').join(','));
      const msg = unitSay(s, u, pickFill(s, spec.radio, vars, 'needMore'), inc, {
        level: 'emergency',
        kind: 'backup',
        expiresAt: b.timeoutAt,
      });
      b.radioId = msg.id;
      b.status = 'active';
      addTimeline(s, inc, 'radio', T('Toetust vajab!', 'Backup requested!'));
      checkBackup(s, inc);
      return;
    }
    case 'agency': {
      let need = inc.agencyNeeds.find((n) => n.agency === spec.agency);
      if (!need) {
        need = { agency: spec.agency, reason: pickFill(s, spec.radio, vars) };
        inc.agencyNeeds.push(need);
      }
      if (need.requested) {
        unitSay(s, u, pickFill(s, spec.radio, vars), inc);
        b.status = 'done';
        applyEffects(s, inc, spec.successEffects);
        return;
      }
      b.timeoutAt = s.now + Math.max(1, spec.timeoutMin) * MIN;
      const label = phrase(s, 'agencyRequestBtn', { agency: agencyName(spec.agency) });
      const msg = unitSay(s, u, pickFill(s, spec.radio, vars), inc, {
        level: 'priority',
        kind: 'agency',
        replies: [{ id: 'request', label }],
        expiresAt: b.timeoutAt,
      });
      b.radioId = msg.id;
      b.status = 'active';
      return;
    }
    case 'transport':
      unitSay(s, u, pickFill(s, spec.radio, vars), inc);
      b.status = 'done';
      return;
    case 'info':
      if (spec.radio?.length) unitSay(s, u, pickFill(s, spec.radio, vars), inc, { kind: 'info' });
      revealDetail(inc);
      b.status = 'done';
      return;
    case 'escalate': {
      const es = spec as EscalateBeat;
      unitSay(s, u, pickFill(s, es.radio, vars), inc, { level: 'priority', kind: 'info' });
      escalateIncident(s, inc, es.toPriority, undefined, 'unit');
      if (es.need) {
        const ex = inc.need.find((n) => n.type === es.need!.type);
        if (ex) ex.count = Math.max(ex.count, es.need.count);
        else inc.need.push({ ...es.need });
      }
      applyEffects(s, inc, es.effects);
      b.status = 'done';
      return;
    }
    case 'pursuit': {
      unitSay(s, u, pickFill(s, spec.radio, vars), inc, { level: 'priority', kind: 'pursuit' });
      b.status = 'active';
      s.stats.pursuits++;
      try {
        startPursuit(s, inc, u.pos);
      } catch (err) {
        console.warn('[EPD] startPursuit failed', err);
      }
      emit(s, { type: 'pursuit_start', incidentId: inc.id, unitId: u.id });
      addTimeline(s, inc, 'radio', T('Jälitus algas', 'Pursuit started'));
      if (!inc.pursuit) b.status = 'done';
      return;
    }
    case 'search': {
      const ss = spec as SearchBeat;
      unitSay(s, u, pickFill(s, ss.radio, vars), inc, { kind: 'info' });
      b.status = 'active';
      try {
        startSearch(s, inc, ss.radiusKm);
      } catch (err) {
        console.warn('[EPD] startSearch failed', err);
      }
      addTimeline(s, inc, 'radio', T('Otsingud algasid', 'Search started'));
      if (!inc.search) b.status = 'done';
      return;
    }
  }
}

function queryTimeout(s: SimState, inc: Incident, spec: QueryBeat, b: BeatState): void {
  const u = speakerOf(s, inc);
  const subj = querySubjectOf(s, inc, spec);
  const truth = subj ? expectedReply(s, subj, queryCtx(inc, spec)) : 'notfound';
  markAnswered(s, b, 'timeout');
  if (s.flags['upg:mdt'] === true) {
    b.status = 'done';
    inc.effects.time += 2;
    if (u) unitPhrase(s, u, 'queryTimeoutMdt', inc);
  } else {
    b.status = 'failed';
    s.stats.beatsMissed++;
    inc.effects.time += 8;
    inc.effects.success -= 0.05;
    if (u) unitPhrase(s, u, 'queryTimeout', inc);
    addTimeline(s, inc, 'radio', T('Päringule ei vastatud, üksus kontrollis ise', 'The check went unanswered, the unit checked itself'));
  }
  if (truth === 'wanted' || truth === 'stolen') inc.effects.arrests += 1;
}

function choiceTimeout(s: SimState, inc: Incident, spec: ChoiceBeat, b: BeatState): void {
  const opt = spec.options.find((o) => o.id === spec.defaultOption) ?? spec.options[0];
  markAnswered(s, b, 'timeout');
  b.status = 'failed';
  b.answer = opt?.id;
  b.correct = false;
  s.stats.beatsMissed++;
  if (opt) applyEffects(s, inc, opt.effects);
  const u = speakerOf(s, inc);
  if (u) unitPhrase(s, u, 'choiceTimeout', inc);
  if (opt) addTimeline(s, inc, 'radio', fillText(T('JK ei vastanud, üksus otsustas: {x}', 'No answer from control, the unit decided: {x}'), { x: opt.label }));
}

/** Player answered a radio message with replies. Returns true if it was handled. */
export function handleRadioReply(s: SimState, msg: RadioMsg, replyId: string): boolean {
  const inc = msg.incidentId ? s.incidents[msg.incidentId] : undefined;
  if (!inc || inc.state === 'closed') {
    msg.answered = replyId;
    return false;
  }
  const tpl = tplOf(inc);
  const b = inc.beats.find((x) => x.radioId === msg.id);
  const spec = b ? tpl?.beats?.[b.index] : undefined;
  if (!b || !spec || b.status !== 'active') {
    msg.answered = replyId;
    return false;
  }
  const u = (msg.unitId ? s.units[msg.unitId] : undefined) ?? speakerOf(s, inc);
  const label = msg.replies?.find((r) => r.id === replyId)?.label;
  switch (spec.kind) {
    case 'query': {
      if (!PERSON_REPLIES.concat(VEHICLE_REPLIES).some((r) => r.id === replyId)) return false;
      msg.answered = replyId;
      const subj = querySubjectOf(s, inc, spec);
      const truth = subj ? expectedReply(s, subj, queryCtx(inc, spec)) : 'notfound';
      const correct = replyId === truth;
      b.answer = replyId;
      b.correct = correct;
      b.status = 'done';
      const said = JK_QUERY_REPLY[subj?.plate ? 'vehicle' : 'person'][replyId];
      if (u) {
        const tx = said ? fillText(T('{callsign}, {x}', '{callsign}, {x}'), { ...radioVars(s, u, inc), x: said }) : fillText(T('{callsign}, {x}.', '{callsign}, {x}.'), { ...radioVars(s, u, inc), x: lower(label ?? T(replyId, replyId)) });
        jkSay(s, tx, { unit: u, inc, kind: 'reply' });
      }
      if (u) unitPhrase(s, u, `reply_${replyId}`, inc);
      if (label) addTimeline(s, inc, 'radio', fillText(T('JK vastus päringule: {x}', 'Control answered the check: {x}'), { x: label }));
      if (correct) {
        inc.effects.success += 0.15;
        s.stats.repliesCorrect++;
        if (truth === 'wanted' || truth === 'stolen') inc.effects.arrests += 1;
      } else {
        inc.effects.success -= 0.2;
        s.stats.repliesWrong++;
        const serious = ['wanted', 'missing', 'stolen', 'restraining', 'ownerwanted'];
        if (serious.includes(truth) && !serious.includes(replyId)) {
          addTrust(s, -5);
          addTimeline(s, inc, 'note', T('Tagaotsitav/keeluga isik jäi tuvastamata', 'A wanted/restricted subject was missed'));
        } else if ((replyId === 'wanted' || replyId === 'stolen') && truth === 'clean') {
          addTrust(s, -3, true);
          addTimeline(s, inc, 'note', T('Alusetu kinnipidamine', 'Unfounded detention'));
        }
        if (u) unitPhrase(s, u, 'queryMismatch', inc, {}, { level: 'priority' });
        if (truth === 'wanted' || truth === 'stolen') inc.effects.arrests += 1;
      }
      return true;
    }
    case 'choice': {
      const opt = spec.options.find((o) => o.id === replyId);
      if (!opt) return false;
      msg.answered = replyId;
      b.answer = opt.id;
      b.correct = isBestChoice(spec, opt.id);
      b.status = 'done';
      applyEffects(s, inc, opt.effects);
      if (inc.category === 'major' && s.flags['upg:negotiation'] === true) inc.effects.success += 0.1;
      jkSay(s, fillText(opt.reply, beatVars(s, inc, u)), { unit: u, inc, kind: 'reply' });
      if (u) unitPhrase(s, u, 'choiceAck', inc);
      addTimeline(s, inc, 'radio', fillText(T('JK otsus: {x}', 'Control decided: {x}'), { x: opt.label }));
      return true;
    }
    case 'agency':
      if (replyId !== 'request') return false;
      msg.answered = replyId;
      requestAgencyInternal(s, inc, (spec as AgencyBeat).agency);
      return true;
    default:
      msg.answered = replyId;
      return false;
  }
}

function lower(t: Text): Text {
  const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
  return { et: lc(t.et), en: lc(t.en) };
}

/** After units were dispatched to an incident: does an active backup request get satisfied? */
export function checkBackup(s: SimState, inc: Incident): void {
  const tpl = tplOf(inc);
  const b = inc.beats.find((x) => x.status === 'active' && tpl?.beats?.[x.index]?.kind === 'backup');
  if (!b) return;
  const spec = tpl!.beats![b.index] as BackupBeat;
  const present = new Set(listIF(s, inc, 'bk'));
  const fresh = inc.assigned
    .filter((id) => !present.has(id))
    .map((id) => s.units[id])
    .filter((u): u is Unit => !!u && (u.status === 'enroute' || u.status === 'onscene') && typeFits(spec.need.type, u.type));
  if (fresh.length < spec.need.count) return;
  b.status = 'done';
  applyEffects(s, inc, spec.successEffects);
  markAnswered(s, b, 'sent');
  const enroute = fresh.filter((u) => u.status === 'enroute');
  if (enroute.length) setIF(s, inc, 'bkwait', enroute.map((u) => u.id).join(','));
  const speaker = speakerOf(s, inc);
  const units = fresh.map((u) => radioVars(s, u).callsign as string).join(', ');
  if (speaker) {
    jkSay(s, phrase(s, 'backupSent', radioVars(s, speaker, inc, { units })), { unit: speaker, inc, kind: 'dispatch' });
  }
  addTimeline(s, inc, 'dispatch', fillText(T('Toetus saadetud: {units}', 'Backup sent: {units}'), { units }));
}

/** Player asked Häirekeskus for another agency. */
export function requestAgencyInternal(s: SimState, inc: Incident, agency: Agency): boolean {
  let need = inc.agencyNeeds.find((n) => n.agency === agency);
  if (need?.requested) return false;
  const region = regionOf(s);
  const rural = !inc.location.city || !region.towns.some((t) => t.name === inc.location.city && t.population >= 10_000);
  const base: Record<Agency, [number, number]> = {
    kiirabi: [8, 16],
    paaste: [8, 18],
    keskkonnaamet: [30, 60],
    kapo: [30, 60],
    kov: [20, 45],
    sotsiaal: [30, 60],
    merepaaste: [20, 40],
    tolliamet: [30, 60],
    transpordiamet: [30, 60],
    veterinaar: [30, 60],
  };
  const [lo, hi] = base[agency] ?? [8, 20];
  const mins = withRng(s, (r) => Math.round(r.range(lo, hi) * (rural ? 1.5 : 1)));
  const rq = { agency, requestedAt: s.now, arriveAt: s.now + mins * MIN };
  if (!need) {
    need = { agency, reason: T('Dispetšeri otsus', 'Dispatcher decision') };
    inc.agencyNeeds.push(need);
  }
  need.requested = rq;
  hkPhrase(s, 'agencyRequested', inc, { agency: agencyName(agency), n: String(mins) });
  addTimeline(s, inc, 'agency', fillText(T('Häirekeskust teavitatud: {agency}', 'ERC notified: {agency}'), { agency: agencyName(agency) }));
  const tpl = tplOf(inc);
  const b = inc.beats.find((x) => x.status === 'active' && tpl?.beats?.[x.index]?.kind === 'agency' && (tpl.beats![x.index] as AgencyBeat).agency === agency);
  if (b) {
    b.status = 'done';
    b.correct = true;
    markAnswered(s, b, 'request');
    applyEffects(s, inc, (tpl!.beats![b.index] as AgencyBeat).successEffects);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Arrival, escalation, pursuit/search end
// ─────────────────────────────────────────────────────────────────────────────

export function onUnitArrived(s: SimState, inc: Incident, u: Unit): void {
  const arr = listIF(s, inc, 'arr');
  if (!arr.includes(u.id)) setIF(s, inc, 'arr', [...arr, u.id].join(','));
  const first = inc.firstArrivalAt === undefined;
  const wait = listIF(s, inc, 'bkwait');
  if (first) {
    inc.firstArrivalAt = s.now;
    const resp = Math.round(((s.now - inc.createdAt) / MIN) * 10) / 10;
    s.stats.responseTimes[inc.truePriority].push(resp);
    revealDetail(inc, true);
    const tpl = tplOf(inc);
    if (inc.falseAlarm || inc.referral) {
      inc.onSceneMin = Math.max(3, Math.round(inc.onSceneMin * (inc.referral ? 0.25 : 0.4)));
      for (const b of inc.beats) {
        const kind = tpl?.beats?.[b.index]?.kind;
        if (b.status === 'pending' && kind !== 'info') b.status = 'skipped';
      }
    }
    let arriveIdx = 0;
    const cap = Math.max(1, inc.onSceneMin * 0.85);
    for (const b of inc.beats) {
      if (b.status !== 'pending') continue;
      const spec = tpl?.beats?.[b.index];
      if (!spec) {
        b.status = 'skipped';
        continue;
      }
      const at = spec.at === 'arrive' ? 0.3 * arriveIdx++ : Math.min(spec.at, cap);
      b.dueAt = s.now + at * MIN;
    }
    unitPhrase(s, u, 'arrive', inc);
    addTimeline(s, inc, 'status', fillText(T('{callsign} saabus sündmuskohale', '{callsign} arrived on scene'), radioVars(s, u, inc)));
    if (inc.falseAlarm) unitPhrase(s, u, 'falseAlarm', inc);
    else if (inc.referral) unitPhrase(s, u, 'referralOnScene', inc, { agency: agencyName(inc.referral) });
  } else if (!arr.includes(u.id)) {
    unitPhrase(s, u, 'backupArrive', inc);
    addTimeline(s, inc, 'status', fillText(T('{callsign} saabus toetuseks', '{callsign} arrived to assist'), radioVars(s, u, inc)));
  }
  if (wait.includes(u.id)) delIF(s, inc, 'bkwait');
  if (inc.state !== 'closed') inc.state = 'onscene';
  emit(s, { type: 'unit_arrived', incidentId: inc.id, unitId: u.id });
}

export function escalateIncident(s: SimState, inc: Incident, toPriority: Priority, text: Text | undefined, by: 'hk' | 'unit'): void {
  const tpl = tplOf(inc);
  const more = toPriority < inc.truePriority;
  inc.escalated = true;
  if (more) {
    inc.truePriority = toPriority;
    inc.priority = Math.min(inc.priority, toPriority) as Priority;
    inc.slaMin = Math.min(inc.slaMin, slaFor(s, inc, toPriority, tpl?.sla ? undefined : tpl));
  }
  if (by === 'hk') {
    const t = text ? fillText(text, incidentVars(s, inc)) : T('olukord halvenenud', 'situation worsening');
    hkPhrase(s, 'hkEscalate', inc, { text: t }, { level: 'priority' });
    addTimeline(s, inc, 'hk', t);
  } else {
    addTimeline(s, inc, 'radio', T('Olukord eskaleerus', 'Situation escalated'));
  }
  emit(s, { type: 'incident_escalated', incidentId: inc.id, text: inc.title });
  if (more) upgradeToSiren(s, inc);
}

/** Units already en route without lights switch to lights & siren when the event becomes P1/P2. */
export function upgradeToSiren(s: SimState, inc: Incident): void {
  if (Math.min(inc.priority, inc.truePriority) > 2) return;
  for (const id of inc.assigned) {
    const u = s.units[id];
    if (!u || u.status !== 'enroute' || !u.move || u.move.siren || u.move.purpose !== 'incident') continue;
    if (moveUnit(s, u, inc.location.coord, 'incident', true, { zone: inc.location.zone })) {
      jkSay(s, phrase(s, 'upgradeSiren', radioVars(s, u, inc)), { unit: u, inc, level: 'priority' });
    }
  }
}

function forceOutcome(inc: Incident, tpl: IncidentTemplate | undefined, result: OutcomeResult): void {
  const o = tpl?.outcomes.find((x) => x.result === result);
  if (o) inc.effects.outcome = o.id;
}

function onPursuitEnded(s: SimState, inc: Incident, tpl: IncidentTemplate | undefined): void {
  setIF(s, inc, 'pend', true);
  const end = inc.pursuit?.ended;
  emit(s, { type: 'pursuit_end', incidentId: inc.id });
  switch (end) {
    case 'caught':
      inc.effects.success += 0.2;
      inc.effects.arrests = Math.max(1, inc.effects.arrests);
      s.stats.pursuitsCaught++;
      addTimeline(s, inc, 'outcome', T('Jälitus lõppes kahtlustatava kinnipidamisega', 'Pursuit ended with the suspect caught'));
      break;
    case 'crashed':
      inc.effects.success -= 0.15;
      inc.effects.risk += 0.15;
      addTimeline(s, inc, 'outcome', T('Jälitus lõppes avariiga', 'Pursuit ended in a crash'));
      break;
    case 'terminated':
      inc.effects.success -= 0.1;
      addTrust(s, -1);
      forceOutcome(inc, tpl, 'escaped');
      addTimeline(s, inc, 'outcome', T('Jälitus katkestati', 'Pursuit terminated'));
      break;
    default:
      inc.effects.success -= 0.25;
      forceOutcome(inc, tpl, 'escaped');
      addTimeline(s, inc, 'outcome', T('Kahtlustatav pääses', 'Suspect escaped'));
  }
  for (const b of inc.beats) if (b.status === 'active' && tpl?.beats?.[b.index]?.kind === 'pursuit') b.status = 'done';
}

function onSearchEnded(s: SimState, inc: Incident, tpl: IncidentTemplate | undefined, found: boolean): void {
  setIF(s, inc, 'send', true);
  if (inc.search && found) inc.search.found = true;
  inc.effects.success += found ? 0.15 : -0.2;
  if (found && inc.category !== 'missing' && personOf(s, inc, 'suspect')) inc.effects.arrests = Math.max(1, inc.effects.arrests);
  addTimeline(s, inc, 'outcome', found ? T('Otsitav leitud', 'Target found') : T('Otsingud lõpetati tulemuseta', 'Search ended without result'));
  for (const b of inc.beats) if (b.status === 'active' && tpl?.beats?.[b.index]?.kind === 'search') b.status = found ? 'done' : 'failed';
}

// ─────────────────────────────────────────────────────────────────────────────
// Closing
// ─────────────────────────────────────────────────────────────────────────────

/** Common closing bookkeeping (state, units, stats, events). */
export function finalizeClose(s: SimState, inc: Incident, closedBy: NonNullable<Incident['closedBy']>, recall: boolean): void {
  inc.closedBy = closedBy;
  inc.state = 'closed';
  inc.closedAt = s.now;
  // Story beats that never ran (or were still waiting for an answer) end with the event.
  for (const b of inc.beats) if (b.status === 'active' || b.status === 'pending') b.status = 'skipped';
  for (const id of [...inc.assigned]) {
    const u = s.units[id];
    if (!u) continue;
    if (u.incidentId === inc.id && (u.status === 'enroute' || u.status === 'onscene')) {
      if (recall && u.status === 'enroute') jkSay(s, phrase(s, 'recall', radioVars(s, u, inc)), { unit: u, inc });
      releaseUnit(s, u, false);
    }
  }
  inc.assigned = [];
  // Reply prompts of a closed event are moot.
  for (let i = s.radio.length - 1; i >= 0; i--) {
    const m = s.radio[i];
    if (m.incidentId === inc.id && m.replies?.length && !m.answered) m.answered = 'closed';
  }
  s.stats.closed++;
  const od = s.flags[`od:${inc.id}`];
  if (typeof od === 'string') {
    const victim = s.units[od];
    if (victim && victim.status === 'emergency') {
      stopUnit(s, victim);
      setStatus(s, victim, 'offduty');
      delete victim.incidentId;
    }
    delete s.flags[`od:${inc.id}`];
  }
  clearIncidentFlags(s, inc);
  emit(s, { type: 'incident_closed', incidentId: inc.id, text: inc.title });
  updateShiftScore(s);
}

/**
 * Close an event that lapsed: 'expired' when nobody ever arrived, 'abandoned' when units did
 * arrive but were all recalled before the job was done (and nobody came back in time). Both
 * cost the same Staatus; only the wording differs.
 */
export function expireIncident(s: SimState, inc: Incident, reason: 'expired' | 'abandoned' = 'expired'): void {
  // Legacy "Staatus −7" for a missed emergency; low-priority events cost less.
  const pen: Record<Priority, number> = { 1: -7, 2: -4, 3: -2, 4: -1 };
  s.stats.expired++;
  addTrust(s, pen[inc.truePriority]);
  const abandoned = reason === 'abandoned';
  if (abandoned) {
    addTimeline(s, inc, 'system', T('Sündmus jäi pooleli: üksused lahkusid enne lõpetamist', 'Event abandoned: units left before it was resolved'));
  } else {
    hkPhrase(s, 'hkExpired', inc);
    addTimeline(s, inc, 'hk', T('Sündmus aegus: keegi ei jõudnud kohale', 'Event lapsed: nobody arrived'));
  }
  inc.outcome = {
    id: abandoned ? 'abandoned' : 'expired',
    result: 'unfounded',
    text: abandoned
      ? T('Sündmus jäi pooleli: politsei lahkus enne, kui töö sai tehtud.', 'Event abandoned: the police left before the job was done.')
      : T('Sündmus aegus: politsei ei jõudnud kohale.', 'Event lapsed: police never arrived.'),
    success: 0,
    arrests: 0,
    injuries: 0,
    officerInjured: false,
    score: 0,
    breakdown: { ...ZERO_BREAKDOWN },
  };
  finalizeClose(s, inc, 'expired', true);
}

/**
 * The neighbouring desk takes the event (docs/SECTORS.md, src/sim/colleagues.ts): a colleague's call for help
 * nobody was sent to (`help`), or a pursuit the player handed over (`handover`). Neutral: no outcome, so no
 * score, no Staatus and no penalty; the units on it are released without a recall call. A call for help never
 * was the player's, so it leaves the shift's incident counts too.
 */
export function closeByColleague(s: SimState, inc: Incident, how: 'help' | 'handover', text: Text): void {
  addTimeline(s, inc, 'radio', text);
  finalizeClose(s, inc, 'colleague', false);
  if (how === 'help') {
    s.stats.incidents = Math.max(0, s.stats.incidents - 1);
    s.stats.byPriority[inc.truePriority] = Math.max(0, s.stats.byPriority[inc.truePriority] - 1);
    s.stats.closed = Math.max(0, s.stats.closed - 1);
  }
}

/** Close an incident without on-scene work (referral, phone advice, duplicate, prank). */
export function closeWithoutUnits(
  s: SimState,
  inc: Incident,
  how: 'referral' | 'phone' | 'duplicate' | 'prank' | 'director',
  correct: boolean,
  text: Text,
): void {
  const result: OutcomeResult = how === 'prank' ? 'false_alarm' : how === 'duplicate' ? 'unfounded' : 'referred';
  const breakdown = how === 'director' ? { ...ZERO_BREAKDOWN } : closureBreakdown(correct, inc);
  inc.outcome = {
    id: `closed_${how}`,
    result,
    text,
    success: correct ? 0.8 : 0,
    arrests: 0,
    injuries: 0,
    officerInjured: false,
    score: breakdown.total,
    breakdown,
  };
  addTimeline(s, inc, 'outcome', text);
  finalizeClose(s, inc, how, true);
}

const DEFAULT_TRUST: Record<OutcomeResult, number> = {
  resolved: 1,
  arrest: 1.5,
  report: 0.5,
  warning: 0.3,
  fine: 0.2,
  referred: 0,
  false_alarm: 0,
  escaped: -1,
  unfounded: 0,
  hospital: 0,
  tragedy: -4,
};

function completeIncident(s: SimState, inc: Incident, tpl: IncidentTemplate | undefined): void {
  const success = withRng(s, (r) => computeSuccess(s, inc, r));
  let out = withRng(s, (r) => pickOutcome(r, tpl, inc, success));
  if (inc.referral && out.result !== 'referred') {
    out = tpl?.outcomes.find((o) => o.result === 'referred') ?? {
      id: 'referred',
      weight: 1,
      result: 'referred',
      text: T('{callsign}: politsei pädevusse ei kuulu, teataja suunatud: {agency}.', '{callsign}: not a police matter, caller referred to {agency}.'),
    };
  }
  const noArrest = out.result === 'escaped' || out.result === 'unfounded' || out.result === 'false_alarm' || out.result === 'referred';
  // Escaped: only people detained earlier on (e.g. a wanted person found by a registry check) count.
  const arrests =
    out.result === 'escaped' ? inc.effects.arrests : noArrest ? 0 : Math.max(out.arrests ?? (out.result === 'arrest' ? 1 : 0), inc.effects.arrests);
  const injuries = out.injuries ?? 0;
  const arrived = listIF(s, inc, 'arr')
    .map((id) => s.units[id])
    .filter((u): u is Unit => !!u);
  const onScene = inc.assigned.map((id) => s.units[id]).filter((u): u is Unit => !!u && u.status === 'onscene');
  const pInj = injuryChance(s, inc, tpl, success);
  const injured = onScene.length && withRng(s, (r) => r.chance(pInj)) ? withRng(s, (r) => r.pick(onScene)) : undefined;
  inc.closedBy = 'units';
  const speaker = onScene[0] ?? speakerOf(s, inc);
  const vars = beatVars(s, inc, speaker);
  const breakdown = scoreIncident(s, inc, tpl, { success, result: out.result, officerInjured: !!injured, injuries });
  const text = fillText(out.text, vars);
  inc.outcome = { id: out.id, result: out.result, text, success, arrests, injuries, officerInjured: !!injured, score: breakdown.total, breakdown };

  // Trust & stats.
  const pw: Record<Priority, number> = { 1: 1.5, 2: 1.2, 3: 1, 4: 0.6 };
  const base = out.trust ?? DEFAULT_TRUST[out.result] * pw[inc.truePriority];
  const dTrust = base + inc.effects.trust;
  if (dTrust) addTrust(s, dTrust, dTrust < 0);
  s.stats.arrests += arrests;
  s.stats.civilianInjuries += injuries;
  if (out.result === 'escaped') s.stats.escaped++;
  if (out.result === 'false_alarm' || inc.falseAlarm) s.stats.falseAlarms++;

  // On the air only a short report; the full summary goes to the timeline (and the report).
  if (speaker && text.et.trim()) unitSay(s, speaker, fillText(out.radio ?? radioClosure(out.text, out.result), vars), inc, { kind: 'status' });
  addTimeline(s, inc, 'outcome', text);

  // Officer stress.
  const stress = (inc.truePriority === 1 ? 0.08 : 0.03) + (out.result === 'tragedy' ? 0.15 : 0);
  for (const u of arrived) {
    u.handled++;
    for (const o of u.crew) o.stress = Math.min(1, Math.round((o.stress + stress) * 1000) / 1000);
  }

  // Unit dispositions: transports, paperwork, injuries.
  const free = new Set(onScene.map((u) => u.id));
  const transports: TransportBeat[] = [];
  for (const b of inc.beats) {
    const spec = tpl?.beats?.[b.index];
    if (spec?.kind === 'transport' && b.status === 'done') transports.push(spec);
  }
  const pickUnit = (): Unit | undefined => {
    const cands = onScene.filter((u) => free.has(u.id) && u !== injured && u.type !== 'heli' && u.type !== 'boat');
    const pref = cands.find((u) => u.type === 'transport') ?? cands.find((u) => u.type === 'patrol') ?? cands[0];
    if (pref) free.delete(pref.id);
    return pref;
  };
  let arrestTransport = false;
  for (const t of transports) {
    if (t.dest === 'arrest' && (noArrest || arrests === 0)) continue;
    const u = pickUnit();
    if (!u) break;
    startTransport(s, inc, u, t.dest, t.paperworkMin);
    if (t.dest === 'arrest') arrestTransport = true;
  }
  if (arrests > 0 && !arrestTransport) {
    const u = pickUnit();
    if (u) startTransport(s, inc, u, 'arrest', [15, 30]);
  }
  if (out.result === 'report' && free.size) {
    const u = onScene.find((x) => free.has(x.id) && x !== injured);
    if (u) {
      free.delete(u.id);
      const pwMin = withRng(s, (r) => r.int(8, 18));
      stopUnit(s, u);
      setStatus(s, u, 'busy');
      u.busyUntil = s.now + pwMin * MIN;
      unitPhrase(s, u, 'paperwork', inc, { n: String(pwMin) });
    }
  }
  // The injured unit leaves the incident first (status → emergency, follow-up event).
  if (injured) injureOfficer(s, inc, injured);
  const freeUnits = onScene.filter((u) => free.has(u.id) && u !== injured);
  if (freeUnits.length) unitPhrase(s, freeUnits[0], 'available', inc);
  // Remaining on-scene units and units still en route are released here.
  finalizeClose(s, inc, 'units', true);
}

function startTransport(s: SimState, inc: Incident, u: Unit, dest: TransportBeat['dest'], paperwork: [number, number]): void {
  let to = inc.location.coord;
  let place = '';
  let key = dest === 'home' ? 'transportHome' : 'transportStation';
  if (dest === 'arrest') {
    // Island arrests go to the island's own holding cells, not over the ferry to the mainland; far
    // from the arrest house the detainee goes to the nearest jaoskond first (custodyDestination).
    const c = custodyDestination(s, inc.location.coord, inc.location.zone);
    if (c) {
      to = c.station.coord;
      place = c.station.name.et;
    }
    key = c?.local ? 'transportArrestLocal' : 'transportArrest';
  } else if (dest === 'hospital') {
    const h = nearestHospital(s, inc.location.coord, inc.location.zone);
    if (h) {
      to = h.coord;
      place = h.name;
    }
    key = 'transportHospital';
  } else if (dest === 'station') {
    const st = nearestStation(s, inc.location.coord, inc.location.zone);
    if (st) {
      to = st.coord;
      place = st.name.et;
    }
  } else {
    const p = personOf(s, inc, 'victim') ?? personOf(s, inc, 'missing') ?? personOf(s, inc, 'suspect');
    if (p?.coord && haversineKm(p.coord, inc.location.coord) < 40) {
      to = p.coord;
      place = p.address;
    } else {
      to = withRng(s, (r) => destination(inc.location.coord, r.range(0.8, 3), r.range(0, 360)));
      place = p?.address ?? T('elukoht', 'home').et;
    }
  }
  const pwMin = withRng(s, (r) => r.int(paperwork[0], Math.max(paperwork[0], paperwork[1])));
  s.flags[`pw:${u.id}`] = pwMin;
  s.flags[`tdest:${u.id}`] = place;
  const ok = haversineKm(to, u.pos) > 0.05 && moveUnit(s, u, to, 'transport', false);
  if (!ok) {
    delete s.flags[`pw:${u.id}`];
    delete s.flags[`tdest:${u.id}`];
    stopUnit(s, u);
    setStatus(s, u, 'busy');
    u.busyUntil = s.now + pwMin * MIN;
    unitPhrase(s, u, 'paperwork', inc, { n: String(pwMin) });
    return;
  }
  unitSay(s, u, phrase(s, key, radioVars(s, u, inc, { place })), inc);
  addTimeline(s, inc, 'status', fillText(T('{callsign}: transport, sihtkoht {place}', '{callsign}: transport to {place}'), radioVars(s, u, inc, { place })));
}

// ─────────────────────────────────────────────────────────────────────────────
// Officer down (DESIGN §4.5)
// ─────────────────────────────────────────────────────────────────────────────

function injureOfficer(s: SimState, inc: Incident, u: Unit): void {
  const crew = u.crew.filter((o) => !o.injured);
  const officer = crew.length ? withRng(s, (r) => r.pick(crew)) : undefined;
  if (officer) {
    officer.injured = true;
    officer.stress = Math.min(1, officer.stress + 0.3);
  }
  s.stats.officerInjuries++;
  addTrust(s, -2);
  stopUnit(s, u);
  setStatus(s, u, 'emergency');
  unitPhrase(s, u, 'injury', inc, {}, { level: 'emergency' });
  const follow = createOfficerDown(s, inc, u);
  u.incidentId = follow.id;
  unitPhrase(s, u, 'emergency', follow, {}, { level: 'emergency' });
  publishIncident(s, follow);
  jkSay(s, phrase(s, 'emergencyJK', radioVars(s, u, follow)), { level: 'emergency', kind: 'info', inc: follow });
  if (inc.outcome) inc.outcome.officerInjured = true;
}

export const OFFICER_DOWN_ID = 'sys:officer_down';

export function createOfficerDown(s: SimState, inc: Incident, u: Unit): Incident {
  const id = `i${++s.seq.incident}`;
  const vars = radioVars(s, u, inc);
  const follow: Incident = {
    id,
    number: incidentNumberFor(s, inc.number, s.seq.incident),
    templateId: OFFICER_DOWN_ID,
    category: 'violence',
    code: 'AVA',
    title: T('Ametnik vajab abi', 'Officer needs assistance'),
    priority: 1,
    truePriority: 1,
    state: 'incoming',
    source: 'field',
    createdAt: s.now,
    location: { ...inc.location },
    summary: fillText(
      T('{callsign} teatab: ametnik vigastatud, {address}. Vajab kohe abi.', '{callsign} reports: officer injured, {address}. Needs help immediately.'),
      vars,
    ),
    details: [],
    hiddenDetails: [],
    persons: [],
    vehicles: [],
    assigned: [],
    unitHistory: [],
    need: [{ type: 'any', count: 1 }],
    ideal: [{ type: 'any', count: 2 }],
    onSceneMin: 12,
    workDone: 0,
    slaMin: slaFor(s, inc, 1),
    expiresAt: s.now + 35 * MIN,
    beats: [],
    agencyNeeds: [{ agency: 'kiirabi', reason: T('Vigastatud ametnik', 'Injured officer') }],
    effects: { success: 0, risk: 0, trust: 0, time: 0, arrests: 0 },
    timeline: [],
    tags: ['officer_down'],
  };
  s.incidents[id] = follow;
  s.incidentOrder.push(id);
  s.stats.incidents++;
  s.stats.byPriority[1]++;
  s.flags[`od:${id}`] = u.id;
  // Häirekeskus sends an ambulance straight away.
  requestAgencyInternal(s, follow, 'kiirabi');
  addTimeline(s, follow, 'radio', fillText(T('{callsign}: ametnik vajab abi!', '{callsign}: officer needs help!'), vars));
  return follow;
}

/** "PÕ-261017-0042"-style number for an extra incident created from another one. */
function incidentNumberFor(_s: SimState, base: string, seq: number): string {
  const m = base.match(/^(.*-)\d+$/);
  return m ? `${m[1]}${String(seq).padStart(4, '0')}` : `${base}-${seq}`;
}

/** Bearing from a unit to its incident (UI helper). */
export function bearingTo(u: Unit, inc: Incident): number {
  return bearing(u.pos, inc.location.coord);
}
