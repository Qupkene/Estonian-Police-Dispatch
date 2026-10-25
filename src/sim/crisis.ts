/**
 * Suurõnnetus (2.37.0, docs/CRISIS.md): a crisis for several desks at once. A shift that allows one decides from its
 * seed whether it comes, which scenario (src/data/crises/) and when. At its time it breaks out at a place of the
 * shift's area: its tasks become ordinary incidents (tagged `crisis:<scenario>:<task>`), later ones open as it
 * unfolds, a task that waits past its deadline escalates the crisis and opens its follow-up, the commander's decisions
 * change the tasks, the neighbours' AI colleagues take over a task that waited too long when help was asked, and it
 * ends when every task is closed. Pure and deterministic: its own random stream, no clock, the same on every co-op
 * client and on the game server.
 */
import { CRISES, crisisById } from '@/data/crises';
import { haversineKm, destination } from './geo';
import { closeByColleague, escalateIncident } from './incidents';
import { addTimeline, emit, publishIncident, pushRadio, regionOf } from './internal';
import { hashString, withRng, type Rng } from './rng';
import { areaOf, inArea, sectorAt, sectorOf } from './sectors';
import { COORD_WORD, createIncident, locationFromCoord } from './spawner';
import { MIN, wall } from './time';
import type {
  Incident,
  IncidentLocation,
  IncidentTemplate,
  LngLat,
  PlaceKind,
  Priority,
  RegionDef,
  SimState,
  Text,
} from './types';

const T = (et: string, en: string): Text => ({ et, en });

// ── Scenarios (the data's shape) ─────────────────────────────────────────────

/** One task of a crisis: an ordinary incident of its own template, opened at its time and place. */
export interface CrisisTaskSpec {
  /** Id within the scenario ('scene', 'traffic', 'cordon'...). */
  id: string;
  /** What the staff panel calls it ("Liikluse ümbersuunamine"). */
  name: Text;
  /** The incident it becomes: a template of weight 0 that never spawns by itself (registered with the others). */
  template: IncidentTemplate;
  /** Opens this many minutes after the outbreak (missing: at once). */
  atMin?: number;
  /** Minutes it may wait for its first crew before the crisis escalates. */
  deadlineMin: number;
  /** Placed this many km off the crisis point, in a direction of its own (missing: on the spot). */
  offsetKm?: [number, number];
  /** The kind of place it is at (the relatives' point at the nearest school); found within PLACE_KM, else the offset. */
  place?: PlaceKind;
  /** The follow-up (an id of the scenario's `followUps`) that opens when this task escalates. */
  followUp?: string;
}

/** One option of a staff decision and what it does. */
export interface CrisisOption {
  id: string;
  label: Text;
  /** What the staff says when it is chosen (on the radio and the panel). */
  effect: Text;
  /** Added to the success of every task of the crisis, open and to come. */
  success?: number;
  /** Every task's remaining time to its first crew is multiplied by this. */
  deadline?: number;
  /** The neighbours' colleagues take over a task that waited too long. */
  help?: boolean;
}

/** A decision the commander makes; nobody deciding in DECIDE_MIN makes it the default. */
export interface CrisisDecision {
  id: string;
  /** Short, for the panel ("Maantee"). */
  title: Text;
  question: Text;
  options: CrisisOption[];
  defaultOption: string;
  /** Asked this many minutes after the outbreak. */
  atMin: number;
}

export interface CrisisScenario {
  /** Also names its drawing, if the owner drew it (src/ui/game/crisis/crisis-<id>.webp; else a text card). */
  id: string;
  title: Text;
  /** Kinds of place it breaks out at, the first the likeliest. */
  places: PlaceKind[];
  /** Months it can happen in (missing: any). */
  months?: number[];
  /** What happened, for the briefing ({address}, {place}). */
  briefing: Text;
  tasks: CrisisTaskSpec[];
  followUps: CrisisTaskSpec[];
  decisions: CrisisDecision[];
  /** Häirekeskus on the radio: the outbreak ({address}), an escalation, the end. */
  radio: { outbreak: Text; escalate: Text; end: Text };
}

// ── State ────────────────────────────────────────────────────────────────────

export interface CrisisTaskState {
  /** The spec's id (a follow-up's too). */
  id: string;
  opensAt: number;
  /** Game time its first crew must be sent by. */
  deadline: number;
  incidentId?: string;
  /** Waited past its deadline: the crisis escalated for it. */
  escalated?: boolean;
  /** The neighbours took it over. */
  helped?: boolean;
}

export interface CrisisState {
  /** The scenario. */
  id: string;
  /** 'due' until it breaks out, 'on' while it runs, 'over' once every task is closed (or the shift ended). */
  phase: 'due' | 'on' | 'over';
  /** When it breaks out (game time). */
  due: number;
  /** Its own random stream. */
  rng: number;
  /** The crisis point, its address and the sector it is in. */
  center: LngLat;
  address: string;
  placeName?: string;
  sector?: string;
  at?: number;
  tasks: CrisisTaskState[];
  /** 0 kontrolli all, 1 pingeline, 2 kriitiline, 3 väga kriitiline. */
  level: number;
  /** The commander's seat: 0 in single player; in co-op -1 until a player takes command. */
  lead: number;
  /** Decision id: the option taken. */
  decisions: Record<string, string>;
  /** Decision id: when, unanswered, it falls to its default. */
  asked: Record<string, number>;
  /** Decisions the staff took by default (nobody decided in time). */
  defaulted?: Record<string, 1>;
  /** The neighbours take over tasks that waited too long (a decision asked for help). */
  help?: boolean;
  /** Tasks the neighbours took over. */
  helped: number;
  endedAt?: number;
  /** 0..100, set when it is over. */
  result?: number;
}

/** Minutes a decision waits for the commander before the staff takes its default. */
export const DECIDE_MIN = 10;
/** Minutes past its deadline a task waits before the neighbours take it over (when help was asked). */
export const HELP_AFTER_MIN = 10;
/** Points off the result per level reached, and for no help needed. */
const LEVEL_COST = 8;
const NO_HELP_BONUS = 5;
/** What a task the neighbours took over counts in the result. */
const HELPED_SCORE = 40;
/** The highest level. */
export const MAX_LEVEL = 3;
/** How far a task looks for its kind of place (a school for the relatives' point). */
const PLACE_KM = 15;

/** Tag of a crisis task's incident: `crisis:<scenario>:<task>`. */
export const CRISIS_TAG = 'crisis:';
export const crisisTag = (scenario: string, task: string): string => `${CRISIS_TAG}${scenario}:${task}`;

/** The crisis task an incident is, or undefined for any other incident. */
export function crisisTaskOf(
  inc: Pick<Incident, 'tags'> | undefined,
): { scenario: string; task: string } | undefined {
  const tag = (inc?.tags ?? []).find((x) => typeof x === 'string' && x.startsWith(CRISIS_TAG));
  if (!tag) return undefined;
  const [scenario, task] = tag.slice(CRISIS_TAG.length).split(':');
  return scenario && task ? { scenario, task } : undefined;
}

/** The spec of a task (a follow-up's too). */
export function taskSpec(sc: CrisisScenario, id: string): CrisisTaskSpec | undefined {
  return sc.tasks.find((t) => t.id === id) ?? sc.followUps.find((t) => t.id === id);
}

// ── Scheduling ───────────────────────────────────────────────────────────────

/**
 * The chance of a crisis in a shift the player starts alone (docs/CRISIS.md section 6): a free shift's random
 * setting and a career shift, by difficulty, in proportion to its length (four hours the full chance).
 */
export function crisisChance(
  mode: SimState['mode'],
  difficulty: SimState['difficulty'],
  hours: number,
): number {
  const base =
    mode === 'career'
      ? 0.08
      : difficulty === 'cadet'
        ? 0.05
        : difficulty === 'veteran' || difficulty === 'realistic'
          ? 0.15
          : 0.1;
  return Math.max(0, Math.min(1, (base * Math.max(0, hours)) / 4));
}

/** Places a scenario can break out at in the shift's area, each with its weight. */
function candidates(
  s: SimState,
  region: RegionDef,
  sc: CrisisScenario,
): {
  coord: LngLat;
  address: string;
  city: string;
  district?: string;
  name: string;
  kind: PlaceKind;
  w: number;
}[] {
  const desks = areaOf(s);
  const out: {
    coord: LngLat;
    address: string;
    city: string;
    district?: string;
    name: string;
    kind: PlaceKind;
    w: number;
  }[] = [];
  for (const p of region.places) {
    const rank = sc.places.indexOf(p.kind);
    if (rank < 0 || (p.zone && p.zone !== 'mainland')) continue;
    const loc = { coord: p.coord, city: p.city, district: p.district };
    if (desks.length && !inArea(s, region, loc)) continue;
    // The scenario's first kind of place is its likeliest.
    let w = rank === 0 ? 3 : 1;
    // A room of several desks: a place near a border between two of them falls to more than one.
    if (desks.length > 1) {
      const own = sectorOf(region, loc);
      const near = [0, 60, 120, 180, 240, 300].some((b) => {
        const other = sectorAt(region, destination(p.coord, 1.5, b));
        return other !== own && desks.includes(other);
      });
      if (near) w *= 4;
    }
    out.push({
      coord: p.coord,
      address: p.address,
      city: p.city,
      district: p.district,
      name: p.name,
      kind: p.kind,
      w,
    });
  }
  return out;
}

function weighted<T extends { w: number }>(r: Rng, list: T[]): T | undefined {
  const total = list.reduce((a, x) => a + x.w, 0);
  if (!(total > 0)) return undefined;
  let k = r.range(0, total);
  for (const x of list) {
    k -= x.w;
    if (k < 0) return x;
  }
  return list[list.length - 1];
}

/**
 * Decide at the start of a shift whether a crisis comes (`chance`, NewShiftOptions.crisis), which and when: between
 * 20 % and 50 % of the shift, at a place of the area, the same for every client of the seed. Never in an island-only
 * area, nor when no scenario fits the area and the month.
 */
export function initCrisis(s: SimState, chance: number | undefined): void {
  if (!(chance && chance > 0)) return;
  const region = regionOf(s);
  if (!region) return;
  const rng = hashString(`epd-crisis:${s.seed}`) || 1;
  const holder = { rng };
  const month = wall(s.startTime).month;
  withRng(holder, (r) => {
    // The chance first, always one draw, so the rest of the stream does not depend on it.
    if (!r.chance(Math.min(1, chance))) return;
    const fits = CRISES.filter((sc) => !sc.months || sc.months.includes(month))
      .map((sc) => ({ sc, places: candidates(s, region, sc) }))
      .filter((x) => x.places.length > 0);
    if (!fits.length) return;
    const pick = fits[r.int(0, fits.length - 1)];
    const place = weighted(r, pick.places)!;
    const length = s.endTime - s.startTime;
    const due = Math.round(s.startTime + length * r.range(0.2, 0.5));
    s.crisis = {
      id: pick.sc.id,
      phase: 'due',
      due,
      rng: 0,
      center: place.coord,
      address: place.address,
      placeName: place.name,
      sector: sectorAt(region, place.coord) || undefined,
      tasks: [],
      level: 0,
      lead: s.coop ? -1 : 0,
      decisions: {},
      asked: {},
      helped: 0,
    };
  });
  if (s.crisis) s.crisis.rng = holder.rng;
}

/**
 * Start a crisis now (the director, the tests): the scenario at the place, or at the first place of its kind in the
 * area. False when it does not fit.
 */
export function startCrisisNow(s: SimState, id: string, at?: LngLat): boolean {
  const sc = crisisById(id);
  const region = regionOf(s);
  if (!sc || !region || (s.crisis && s.crisis.phase !== 'over')) return false;
  const place = at ? undefined : candidates(s, region, sc)[0];
  const coord = at ?? place?.coord;
  if (!coord) return false;
  const loc = locationFromCoord(s, coord, sc.places[0]);
  s.crisis = {
    id: sc.id,
    phase: 'due',
    due: s.now,
    rng: hashString(`epd-crisis:${s.seed}:${s.now}`) || 1,
    center: coord,
    address: place?.address ?? loc.address,
    placeName: place?.name ?? loc.placeName,
    sector: sectorAt(region, coord) || undefined,
    tasks: [],
    level: 0,
    lead: s.coop ? -1 : 0,
    decisions: {},
    asked: {},
    helped: 0,
  };
  breakOut(s, s.crisis, sc);
  return true;
}

// ── The crisis runs ──────────────────────────────────────────────────────────

/** Every substep (engine.ts): break out at its time, open tasks, escalate, help, decide by default, end. */
export function updateCrisis(s: SimState): void {
  const c = s.crisis;
  if (!c || c.phase === 'over') return;
  const sc = crisisById(c.id);
  if (!sc) return;
  if (c.phase === 'due') {
    if (s.now < c.due || s.ended) return;
    breakOut(s, c, sc);
    return;
  }
  for (const task of c.tasks) {
    const spec = taskSpec(sc, task.id);
    if (!spec) continue;
    if (!task.incidentId) {
      if (s.now >= task.opensAt) openTask(s, c, sc, task, spec);
      continue;
    }
    const inc = s.incidents[task.incidentId];
    if (!inc || inc.state === 'closed') continue;
    const waiting = inc.firstDispatchAt === undefined;
    if (waiting && !task.escalated && s.now >= task.deadline) escalate(s, c, sc, task, inc, spec);
    if (waiting && c.help && s.now >= task.deadline + HELP_AFTER_MIN * MIN)
      neighboursTake(s, c, sc, task, inc);
  }
  for (const d of sc.decisions) {
    const until = c.asked[d.id];
    if (until !== undefined && c.decisions[d.id] === undefined && s.now >= until)
      decide(s, d.id, d.defaultOption, -1);
    if (until === undefined && s.now >= (c.at ?? s.now) + d.atMin * MIN) ask(s, c, d);
  }
  if (s.ended || c.tasks.every((t) => t.incidentId && s.incidents[t.incidentId]?.state === 'closed'))
    end(s, c, sc);
}

function hk(
  s: SimState,
  text: Text,
  level: 'routine' | 'priority' | 'emergency' = 'priority',
  incidentId?: string,
): void {
  pushRadio(s, { from: 'HK', to: 'JK', text, level, kind: 'info', ...(incidentId ? { incidentId } : {}) });
}

const fill = (t: Text, c: CrisisState): Text => ({
  et: t.et.replaceAll('{address}', c.address).replaceAll('{place}', c.placeName ?? c.address),
  en: t.en.replaceAll('{address}', c.address).replaceAll('{place}', c.placeName ?? c.address),
});

function breakOut(s: SimState, c: CrisisState, sc: CrisisScenario): void {
  c.phase = 'on';
  c.at = s.now;
  // Single player commands from the start; in co-op a player takes command (the room is set up after the schedule).
  c.lead = s.coop ? -1 : 0;
  c.tasks = sc.tasks.map((t) => ({
    id: t.id,
    opensAt: s.now + (t.atMin ?? 0) * MIN,
    deadline: s.now + ((t.atMin ?? 0) + t.deadlineMin) * MIN,
  }));
  hk(s, fill(sc.radio.outbreak, c), 'emergency');
  emit(s, { type: 'crisis_start', text: sc.title });
  for (const task of c.tasks) {
    const spec = taskSpec(sc, task.id);
    if (spec && s.now >= task.opensAt) openTask(s, c, sc, task, spec);
  }
}

/** Where a task is: on the spot, at the nearest place of its kind, or off the crisis point; always in the area. */
function taskLocation(s: SimState, c: CrisisState, spec: CrisisTaskSpec): IncidentLocation {
  const region = regionOf(s);
  const center = locationFromCoord(s, c.center);
  const atCenter: IncidentLocation = {
    ...center,
    address: c.address,
    ...(c.placeName ? { placeName: c.placeName } : {}),
  };
  const ok = (loc: IncidentLocation) => !areaOf(s).length || inArea(s, region, loc);
  if (spec.place) {
    const near = region.places
      .filter((p) => p.kind === spec.place && (!p.zone || p.zone === 'mainland'))
      .map((p) => ({ p, km: haversineKm(p.coord, c.center) }))
      .filter((x) => x.km <= PLACE_KM)
      .sort((a, b) => a.km - b.km)[0];
    if (near) {
      const loc: IncidentLocation = {
        address: near.p.address,
        coord: near.p.coord,
        city: near.p.city,
        district: near.p.district,
        placeName: near.p.name,
        placeKind: near.p.kind,
        zone: near.p.zone ?? 'mainland',
      };
      if (ok(loc)) return loc;
    }
  }
  if (!spec.offsetKm) return atCenter;
  const [lo, hi] = spec.offsetKm;
  for (let k = 0; k < 4; k++) {
    const coord = withRng(c, (r) => destination(c.center, r.range(lo, hi), r.range(0, 360)));
    const loc = locationFromCoord(s, coord);
    if (!ok(loc) || (loc.zone ?? 'mainland') !== (center.zone ?? 'mainland')) continue;
    // Off a road with no address (a highway between villages): its own spot on the map, the crisis's address.
    return loc.address.includes(COORD_WORD)
      ? { ...loc, address: c.address, ...(c.placeName ? { placeName: c.placeName } : {}) }
      : loc;
  }
  return atCenter;
}

function openTask(
  s: SimState,
  c: CrisisState,
  sc: CrisisScenario,
  task: CrisisTaskState,
  spec: CrisisTaskSpec,
): void {
  const location = taskLocation(s, c, spec);
  const inc = createIncident(s, spec.template, { location, source: 'hk' });
  inc.tags.push(crisisTag(sc.id, spec.id));
  publishIncident(s, inc);
  // The staff opened it: it is in the queue already, nothing to acknowledge.
  inc.state = 'queued';
  inc.acknowledgedAt = s.now;
  task.incidentId = inc.id;
  // The decisions already made hold for it too.
  for (const d of sc.decisions) {
    const o = d.options.find((x) => x.id === c.decisions[d.id]);
    if (o?.success) inc.effects.success += o.success;
  }
  addTimeline(
    s,
    inc,
    'hk',
    T(`Suurõnnetus: ${sc.title.et}. ${spec.name.et}.`, `Major incident: ${sc.title.en}. ${spec.name.en}.`),
  );
}

function escalate(
  s: SimState,
  c: CrisisState,
  sc: CrisisScenario,
  task: CrisisTaskState,
  inc: Incident,
  spec: CrisisTaskSpec,
): void {
  task.escalated = true;
  c.level = Math.min(MAX_LEVEL, c.level + 1);
  escalateIncident(s, inc, 1 as Priority, sc.radio.escalate, 'hk');
  emit(s, { type: 'crisis_escalated', incidentId: inc.id, text: spec.name });
  const follow = spec.followUp ? sc.followUps.find((f) => f.id === spec.followUp) : undefined;
  if (follow && !c.tasks.some((t) => t.id === follow.id)) {
    c.tasks.push({ id: follow.id, opensAt: s.now, deadline: s.now + follow.deadlineMin * MIN });
    const added = c.tasks[c.tasks.length - 1];
    openTask(s, c, sc, added, follow);
  }
}

function neighboursTake(
  s: SimState,
  c: CrisisState,
  sc: CrisisScenario,
  task: CrisisTaskState,
  inc: Incident,
): void {
  task.helped = true;
  c.helped++;
  closeByColleague(
    s,
    inc,
    'help',
    T(
      `Naaberüksus võttis suurõnnetuse ülesande üle: ${taskSpec(sc, task.id)?.name.et ?? inc.title.et}.`,
      `A neighbouring unit took over the major incident's task: ${taskSpec(sc, task.id)?.name.en ?? inc.title.en}.`,
    ),
  );
}

function ask(s: SimState, c: CrisisState, d: CrisisDecision): void {
  c.asked[d.id] = s.now + DECIDE_MIN * MIN;
  hk(s, T(`Staap: ${d.question.et}`, `Staff: ${d.question.en}`), 'priority');
}

/**
 * The commander takes a decision (`seat`; -1 for the staff's default when nobody decided in time). False when there
 * is no such decision, it is already taken, or the seat does not command.
 */
export function decide(s: SimState, decisionId: string, optionId: string, seat: number): boolean {
  const c = s.crisis;
  const sc = c ? crisisById(c.id) : undefined;
  if (!c || !sc || c.phase !== 'on') return false;
  const d = sc.decisions.find((x) => x.id === decisionId);
  const o = d?.options.find((x) => x.id === optionId);
  if (!d || !o || c.decisions[d.id] !== undefined || c.asked[d.id] === undefined) return false;
  if (seat >= 0 && c.lead !== seat) return false;
  c.decisions[d.id] = o.id;
  if (seat < 0) (c.defaulted ??= {})[d.id] = 1;
  if (o.help) c.help = true;
  for (const task of c.tasks) {
    const inc = task.incidentId ? s.incidents[task.incidentId] : undefined;
    if (o.success && inc && inc.state !== 'closed') inc.effects.success += o.success;
    if (o.deadline && !task.escalated && task.deadline > s.now)
      task.deadline = s.now + Math.round((task.deadline - s.now) * o.deadline);
  }
  pushRadio(s, {
    from: 'JK',
    to: 'HK',
    text: seat < 0 ? T(`Staap otsustas: ${o.effect.et}`, `The staff decided: ${o.effect.en}`) : o.effect,
    level: 'routine',
    kind: 'info',
  });
  return true;
}

/** A player takes command (co-op `lead`): when nobody holds it, or the host takes it over. */
export function takeCommand(s: SimState, seat: number, host: boolean): boolean {
  const c = s.crisis;
  if (!c || c.phase !== 'on') return false;
  if (c.lead === seat) return false;
  if (c.lead >= 0 && !host) return false;
  c.lead = seat;
  return true;
}

/** A seat left the shift: its command is free for the next player. */
export function commandLeft(s: SimState, seat: number): void {
  if (s.crisis && s.crisis.lead === seat && s.coop) s.crisis.lead = -1;
}

function end(s: SimState, c: CrisisState, sc: CrisisScenario): void {
  c.phase = 'over';
  c.endedAt = s.now;
  c.result = crisisResult(s, c);
  if (!s.ended) hk(s, fill(sc.radio.end, c), 'routine');
  emit(s, { type: 'crisis_end', text: sc.title });
}

/** The crisis's result: its tasks' average score (a task the neighbours took counts HELPED_SCORE), less the levels. */
export function crisisResult(s: SimState, c: CrisisState): number {
  const scores: number[] = [];
  for (const task of c.tasks) {
    const inc = task.incidentId ? s.incidents[task.incidentId] : undefined;
    if (!inc) continue;
    if (task.helped) scores.push(HELPED_SCORE);
    else if (inc.state === 'closed') scores.push(inc.outcome?.score ?? 0);
    else scores.push(0);
  }
  const avg = scores.length ? scores.reduce((a, x) => a + x, 0) / scores.length : 0;
  const v = avg - LEVEL_COST * c.level + (c.helped === 0 && scores.length ? NO_HELP_BONUS : 0);
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Canonical text of the crisis for the co-op digest. */
export function crisisDigest(c: CrisisState | undefined): string {
  if (!c) return '';
  const tasks = c.tasks
    .map((t) => `${t.id}:${t.incidentId ?? ''}:${t.escalated ? 1 : 0}${t.helped ? 1 : 0}`)
    .join(',');
  const decisions = Object.keys(c.decisions)
    .sort()
    .map((k) => `${k}=${c.decisions[k]}`)
    .join(',');
  return `C${c.id}|${c.phase}|${c.level}|${c.lead}|${tasks}|${decisions}|${c.helped}`;
}

// ── The report ───────────────────────────────────────────────────────────────

/** The crisis in the shift's report (2.37.0; missing without one, and in older reports). */
export interface CrisisReport {
  id: string;
  title: Text;
  address: string;
  at: number;
  endedAt?: number;
  /** The highest level reached. */
  level: number;
  /** 0..100. */
  result: number;
  helped: number;
  /** The commander's seat (co-op), -1 when nobody took command. */
  lead: number;
  tasks: {
    id: string;
    name: Text;
    title: Text;
    score?: number;
    helped?: boolean;
    escalated?: boolean;
    closedBy?: string;
  }[];
  decisions: { id: string; title: Text; option: Text; byDefault?: boolean }[];
}

/** The crisis of a finished shift for its report, or undefined when none broke out. */
export function crisisReport(s: SimState): CrisisReport | undefined {
  const c = s.crisis;
  const sc = c ? crisisById(c.id) : undefined;
  if (!c || !sc || c.at === undefined) return undefined;
  return {
    id: sc.id,
    title: sc.title,
    address: c.address,
    at: c.at,
    ...(c.endedAt !== undefined ? { endedAt: c.endedAt } : {}),
    level: c.level,
    result: c.result ?? crisisResult(s, c),
    helped: c.helped,
    lead: c.lead,
    tasks: c.tasks.map((t) => {
      const spec = taskSpec(sc, t.id);
      const inc = t.incidentId ? s.incidents[t.incidentId] : undefined;
      return {
        id: t.id,
        name: spec?.name ?? T(t.id, t.id),
        title: inc?.title ?? spec?.template.title ?? T(t.id, t.id),
        ...(inc?.outcome ? { score: inc.outcome.score } : {}),
        ...(t.helped ? { helped: true } : {}),
        ...(t.escalated ? { escalated: true } : {}),
        ...(inc?.closedBy ? { closedBy: inc.closedBy } : {}),
      };
    }),
    decisions: sc.decisions
      .filter((d) => c.decisions[d.id] !== undefined)
      .map((d) => ({
        id: d.id,
        title: d.title,
        option: d.options.find((o) => o.id === c.decisions[d.id])?.label ?? T('?', '?'),
        ...(c.defaulted?.[d.id] ? { byDefault: true } : {}),
      })),
  };
}
