/**
 * The AI colleagues at the neighbouring desks of a sector shift (docs/SECTORS.md, "AI colleagues").
 *
 * - Help requests: now and then a colleague whose crews are all out asks for help with a call just across
 *   the border. It is an ordinary event in the queue, tagged `help:<sectorId>`, with a short timeout: a unit
 *   that gets there counts in ReportExtras.helpGiven (the career's Staatus bonus); when nobody goes, the
 *   colleague takes it back (closedBy 'colleague', no penalty).
 * - Pursuit hand-over: a pursuit that leaves the area gets an offer from the desk it ran into. Handing over
 *   closes the event for the player as the neighbour's (neutral); keeping it (or not answering) changes nothing.
 * - Night cover: on some career night shifts a small neighbouring sector is added for the night
 *   (SimState.coverSectors): its colleague is off, its calls spawn for the player, no crew is based there.
 * - Radio: short lines from the neighbouring desks, flavour only, a few a shift at most.
 *
 * Everything runs on `SimState.colleagues.rng`, a stream of its own seeded from the shift seed, so the
 * spawner's and the player's draws stay where they were. createShift sets `SimState.colleagues` only on a
 * sector shift outside the daily challenge, the tutorial and the director; a save without it (every older
 * save) never sees any of this. Rates and timeouts: COLLEAGUES in src/data/sectors.ts.
 */
import { REGIONS } from '@/data/regions';
import { COLLEAGUES } from '@/data/sectors';
import { closeByColleague, isHidden, openIncidentIds } from './incidents';
import { addTimeline, allTemplates, publishIncident, pushRadio, regionOf } from './internal';
import { nearestStreetName, onStreet } from './pursuit';
import { phrase } from './radio';
import { hashString, Rng, withRng } from './rng';
import { areaOf, areaShare, mainStation, neighbourSectors, sectorAt, sectorById } from './sectors';
import { borderLocation, createIncident, nearLocation, pickTemplate } from './spawner';
import { unitPosAt, unitStation } from './units';
import { MIN, wall } from './time';
import type { ColleagueState, Incident, IncidentLocation, IncidentTemplate, LngLat, NewShiftOptions, PlaceKind, RadioMsg, RadioReply, RegionId, SectorDef, SimState, Text } from './types';

const T = (et: string, en: string): Text => ({ et, en });

/** Tag of a colleague's call for help: `help:<sectorId>`. */
export const HELP_TAG = 'help:';

/** Sector of the colleague who asked for help with this event, or undefined for any other event. */
export function helpSector(inc: Pick<Incident, 'tags'>): string | undefined {
  const tag = (inc.tags ?? []).find((x) => typeof x === 'string' && x.startsWith(HELP_TAG));
  return tag ? tag.slice(HELP_TAG.length) : undefined;
}

/** "Maarja Mägi": who holds a sector's desk. */
export function colleagueName(sector: Pick<SectorDef, 'colleague'>): string {
  return `${sector.colleague.firstName} ${sector.colleague.lastName}`.trim();
}

/** The desk on the radio ("JK VILJANDIMAA"): their juhtimiskeskus desk, apart from the player's "JK". */
export function deskCallsign(sector: Pick<SectorDef, 'short'>): string {
  return `JK ${sector.short}`;
}

/** Reply buttons of a hand-over offer. */
export const HANDOVER_REPLIES: RadioReply[] = [
  { id: 'handover', label: T('Anna üle naaberlauale', 'Hand over to the next desk') },
  { id: 'keep', label: T('Jätkame ise', 'We keep it') },
];

// ─────────────────────────────────────────────────────────────────────────────
// Set-up
// ─────────────────────────────────────────────────────────────────────────────

/** True for a shift whose neighbouring desks have AI colleagues that act (see the module comment). */
export function colleaguesFor(o: Pick<NewShiftOptions, 'mode' | 'fixedSchedule'>, sectors: readonly string[]): boolean {
  return sectors.length > 0 && !o.fixedSchedule && (o.mode === 'career' || o.mode === 'free');
}

/**
 * Tonight's night cover of a career shift: none by day, else with COLLEAGUES.nightCoverChance one small
 * neighbouring sector of the prefecture (at most nightCoverMaxShare of its residents, reachable by road from
 * the area's main stations). Pure: the briefing shows what createShift will pick from the same seed.
 */
export function nightCoverFor(o: { regionId: RegionId; sectors: readonly string[]; seed: number; start: number }): string[] {
  const own = [...new Set(o.sectors)];
  if (!own.length) return [];
  const h = wall(o.start).hour;
  if (h >= 6 && h < 18) return [];
  const region = REGIONS[o.regionId];
  if (!region) return [];
  const zones = new Set(own.map((id) => mainStation(region, id)?.zone ?? 'mainland'));
  const cands = neighbourSectors(own)
    .filter((x) => x.regionId === o.regionId)
    .filter((x) => areaShare(region, [x.id]) <= COLLEAGUES.nightCoverMaxShare)
    .filter((x) => zones.has(mainStation(region, x.id)?.zone ?? 'mainland'));
  if (!cands.length) return [];
  const r = new Rng(hashString(`epd-cover:${o.seed >>> 0}:${own.join(',')}`) || 1);
  if (!r.chance(COLLEAGUES.nightCoverChance)) return [];
  return [r.pick(cands).id];
}

/**
 * createShift, after the units and the career load: the colleagues' stream and first times, and a career
 * night shift's cover. Nothing on a shift colleaguesFor rules out.
 */
export function initColleagues(s: SimState, o: Pick<NewShiftOptions, 'mode' | 'fixedSchedule' | 'seed' | 'start'>): void {
  const sectors = s.sectors ?? [];
  if (!colleaguesFor(o, sectors)) return;
  if (o.mode === 'career') {
    const cover = nightCoverFor({ regionId: s.regionId, sectors, seed: o.seed, start: o.start });
    if (cover.length) s.coverSectors = cover;
  }
  s.colleagues = newColleagueState(s, o.seed, sectors);
}

/**
 * A fresh colleagues' state: their own stream seeded from the seed, the prefecture and the sectors, and the first
 * help and radio times. initColleagues uses it; so does a sector co-op shift (src/sim/desks.ts), whose AI colleagues
 * also run the desks nobody holds.
 */
export function newColleagueState(s: Pick<SimState, 'regionId' | 'startTime'>, seed: number, sectors: readonly string[]): ColleagueState {
  const r = new Rng(hashString(`epd-desk:${seed >>> 0}:${s.regionId}:${sectors.join(',')}`) || 1);
  const st: ColleagueState = { rng: 0, nextHelpAt: 0, nextChatterAt: 0, helps: 0, chatter: 0, handover: {} };
  st.nextHelpAt = s.startTime + COLLEAGUES.helpQuietStartMin * MIN + r.exp(COLLEAGUES.helpPerHour / 60) * MIN;
  st.nextChatterAt = s.startTime + (COLLEAGUES.chatterGapMin / 2) * MIN + r.exp(COLLEAGUES.chatterPerHour / 60) * MIN;
  st.rng = r.state || 1;
  return st;
}

/** The sectors the colleagues work around: the players' desks in sector co-op (ColleagueState.area), else the shift's area. */
function deskArea(s: SimState): string[] {
  return s.colleagues?.area ?? areaOf(s);
}

/** Is this unit one of the player's crews (sector co-op: a crew of a desk a player holds)? */
function playerCrew(s: SimState, id: string): boolean {
  const own = s.colleagues?.crews;
  return !own || own.includes(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per substep
// ─────────────────────────────────────────────────────────────────────────────

/** Run `fn` with `s.rng` bound to the colleagues' stream (phrases, picks and the help call's generation). */
function withDesk<T>(s: SimState, st: ColleagueState, fn: () => T): T {
  const player = s.rng;
  s.rng = st.rng;
  try {
    return fn();
  } finally {
    st.rng = s.rng || 1;
    s.rng = player;
  }
}

/** The neighbouring desks with a colleague on duty: next to the area, of the prefecture, not tonight's cover. */
function desks(s: SimState): SectorDef[] {
  return neighbourSectors(deskArea(s)).filter((x) => x.regionId === s.regionId);
}

function say(s: SimState, sector: SectorDef, key: string, vars: Record<string, string | Text>, o: Partial<RadioMsg> = {}): RadioMsg {
  return pushRadio(s, {
    from: deskCallsign(sector),
    to: 'JK',
    text: phrase(s, key, { name: colleagueName(sector), ...vars }),
    level: o.level ?? 'routine',
    kind: o.kind ?? 'info',
    incidentId: o.incidentId,
    replies: o.replies,
    expiresAt: o.expiresAt,
  });
}

/** Engine substep (after the incidents): the colleagues' timers, help calls that lapse, hand-over offers. */
export function updateColleagues(s: SimState): void {
  const st = s.colleagues;
  if (!st || s.ended || !deskArea(s).length) return;
  withDesk(s, st, () => {
    followHelpCalls(s);
    offerHandovers(s, st);
    if (s.now >= st.nextHelpAt) {
      maybeAskHelp(s, st);
      st.nextHelpAt = s.now + Math.max(5, withRng(s, (r) => r.exp(COLLEAGUES.helpPerHour / 60))) * MIN;
    }
    if (s.now >= st.nextChatterAt) {
      maybeChatter(s, st);
      st.nextChatterAt = s.now + Math.max(COLLEAGUES.chatterGapMin, withRng(s, (r) => r.exp(COLLEAGUES.chatterPerHour / 60))) * MIN;
    }
  });
}

// ── Help requests ────────────────────────────────────────────────────────────

/** Place kinds a call for help can be read as at a border address (locationFromCoord makes them all). */
const HELP_KINDS: PlaceKind[] = ['residential', 'house', 'street', 'ruralroad', 'highway', 'village'];
/** Unit types a colleague asks for: an ordinary patrol job, never a specialist one. */
const HELP_UNITS = new Set(['patrol', 'traffic']);

/** Templates a colleague asks help with: an ordinary P2/P3 patrol job at an address, no story event. */
export function helpTemplates(): IncidentTemplate[] {
  return allTemplates().filter(
    (t) =>
      !t.easterEgg &&
      !t.id.startsWith('sys:') &&
      COLLEAGUES.helpPriorities.includes(t.priority) &&
      t.category !== 'major' &&
      !(t.tags ?? []).some((x) => x === 'anpr' || x === 'alarm') &&
      t.units.need.every((n) => HELP_UNITS.has(n.type)) &&
      t.units.need.reduce((a, n) => a + n.count, 0) <= 2 &&
      t.places.some((p) => HELP_KINDS.includes(p)),
  );
}

function openHelpCalls(s: SimState): Incident[] {
  return openIncidentIds(s)
    .map((id) => s.incidents[id])
    .filter((inc): inc is Incident => !!inc && inc.state !== 'closed' && helpSector(inc) !== undefined);
}

/**
 * A colleague asks for help: one of the desks next to the player's own sectors, a call in their sector
 * within COLLEAGUES.helpMaxKm of the player's nearest crew or station, reachable by road. Undefined when it is not the time (quiet start and end, the shift's
 * maximum, one already open) or nothing fits.
 */
export function maybeAskHelp(s: SimState, st: ColleagueState): Incident | undefined {
  if (st.helps >= COLLEAGUES.helpMax) return undefined;
  if (s.now < s.startTime + COLLEAGUES.helpQuietStartMin * MIN || s.now > s.endTime - COLLEAGUES.helpQuietEndMin * MIN) return undefined;
  if (openHelpCalls(s).length) return undefined;
  // Next to the player's own sectors, where the crews are based (a night's cover has none to lend).
  const own = st.area ?? s.sectors ?? [];
  const list = desks(s).filter((x) => x.neighbours.some((id) => own.includes(id)));
  if (!list.length) return undefined;
  const refs = helpRefs(s);
  const zones = new Set(
    s.unitOrder
      .filter((id) => playerCrew(s, id))
      .map((id) => s.units[id])
      .filter((u) => !!u && !u.onCall)
      .map((u) => u.zone || 'mainland'),
  );
  const pool = helpTemplates();
  const tpl = withRng(s, (r) => pickTemplate(s, r, pool, s.now));
  if (!tpl) return undefined;
  const kinds = withRng(s, (r) => r.shuffle(tpl.places.filter((p) => HELP_KINDS.includes(p))));
  const order = withRng(s, (r) => r.shuffle([...list]));
  // A few draws (each desk, each place kind the call fits); none close enough to the crews: no request.
  let found: { sector: SectorDef; location: IncidentLocation } | undefined;
  for (const sector of order) {
    for (const kind of kinds) {
      const location = withRng(s, (r) => nearLocation(s, r, sector.id, refs, COLLEAGUES.helpMaxKm, kind));
      if (location && zones.has(location.zone ?? 'mainland')) {
        found = { sector, location };
        break;
      }
    }
    if (found) break;
  }
  if (found) {
    const { sector, location } = found;
    const inc = createIncident(s, tpl, { location, source: 'hk' });
    inc.tags.push(`${HELP_TAG}${sector.id}`);
    inc.expiresAt = s.now + COLLEAGUES.helpTimeoutMin * MIN;
    st.helps++;
    publishIncident(s, inc);
    // Already taken in by the colleague's desk: no acknowledgement to miss.
    inc.state = 'queued';
    inc.acknowledgedAt = s.now;
    const msg = say(s, sector, 'colleagueHelp', { title: inc.title, address: inc.location.address }, { level: 'priority', incidentId: inc.id });
    addTimeline(s, inc, 'radio', T(`${colleagueName(sector)} (${sector.name.et}): ${msg.text.et}`, `${colleagueName(sector)} (${sector.name.en}): ${msg.text.en}`));
    return inc;
  }
  return undefined;
}

/**
 * Where the player's crews are: every crew's position and home station (on-call assets apart). A call for
 * help is placed within COLLEAGUES.helpMaxKm of one of them, so helping is worth a crew's drive.
 */
export function helpRefs(s: SimState): LngLat[] {
  const out: LngLat[] = [];
  for (const id of s.unitOrder) {
    const u = s.units[id];
    if (!u || u.onCall || !playerCrew(s, id)) continue;
    out.push(unitPosAt(u, s.now).pos);
    const st = unitStation(s, u);
    if (st) out.push(st.coord);
  }
  return out;
}

/** A unit that reached a call for help gets the colleague's thanks; one nobody went to goes back to them. */
function followHelpCalls(s: SimState): void {
  for (const inc of openHelpCalls(s)) {
    const sector = sectorById(helpSector(inc) ?? '');
    if (inc.firstArrivalAt !== undefined) {
      const k = `desk:thx:${inc.id}`;
      if (sector && !s.flags[k]) {
        s.flags[k] = true;
        say(s, sector, 'colleagueHelpThanks', {}, { incidentId: inc.id });
      }
      continue;
    }
    // Someone on the way: the caller waits, as for any event. Otherwise back to the colleague at the
    // timeout, or at the end of the shift (it never keeps the player in overtime).
    const enroute = inc.assigned.some((id) => s.units[id]?.status === 'enroute');
    const lapsed = inc.expiresAt !== undefined && s.now >= inc.expiresAt;
    if (enroute || !(lapsed || (s.now >= s.endTime && !inc.assigned.length))) continue;
    const text = sector
      ? say(s, sector, 'colleagueHelpBack', { address: inc.location.address }, { incidentId: inc.id }).text
      : T('Naabersektor võttis väljakutse üle.', 'The neighbouring sector took the call over.');
    closeByColleague(s, inc, 'help', sector ? T(`${colleagueName(sector)}: ${text.et}`, `${colleagueName(sector)}: ${text.en}`) : text);
  }
}

/** Calls for help the player's crews reached (ReportExtras.helpGiven): handled by units, or reached and still open. */
export function helpGivenCount(s: SimState): number {
  let n = 0;
  for (const id of s.incidentOrder) {
    const inc = s.incidents[id];
    if (!inc || helpSector(inc) === undefined) continue;
    if (inc.closedBy === 'units' || (inc.state !== 'closed' && inc.firstArrivalAt !== undefined)) n++;
  }
  return n;
}

// ── Pursuit hand-over ────────────────────────────────────────────────────────

/** A pursuit whose suspect left the area: the desk it ran into offers to take it over, once per pursuit. */
function offerHandovers(s: SimState, st: ColleagueState): void {
  const region = regionOf(s);
  const area = deskArea(s);
  for (const [incId, offer] of Object.entries(st.handover)) {
    const inc = s.incidents[incId];
    const msg = s.radio.find((m) => m.id === offer.msg);
    if (msg && !msg.answered && (!inc || inc.state === 'closed' || !inc.pursuit || inc.pursuit.ended)) msg.answered = 'closed';
  }
  for (const id of openIncidentIds(s)) {
    const inc = s.incidents[id];
    const p = inc?.pursuit;
    if (!inc || !p || p.ended || inc.state === 'closed' || isHidden(s, inc) || st.handover[inc.id]) continue;
    const sectorId = sectorAt(region, p.suspectPos);
    if (area.includes(sectorId)) continue;
    const sector = sectorById(sectorId);
    if (!sector || sector.regionId !== s.regionId) continue;
    const road = onStreet(nearestStreetName(s, p.suspectPos, inc));
    const msg = say(
      s,
      sector,
      'colleagueHandover',
      { road },
      { level: 'priority', kind: 'pursuit', incidentId: inc.id, replies: HANDOVER_REPLIES, expiresAt: s.now + COLLEAGUES.handoverOfferMin * MIN },
    );
    st.handover[inc.id] = { msg: msg.id, desk: sector.id };
    addTimeline(s, inc, 'radio', T(`Jälitus ületas sektori piiri: ${sector.name.et} pakub ülevõtmist.`, `The pursuit crossed the sector border: ${sector.name.en} offers to take over.`));
  }
}

/**
 * The player answered a hand-over offer (commands.replyRadio). True when the message was one; false leaves
 * it to the incidents' own replies.
 */
export function answerColleague(s: SimState, msg: RadioMsg, replyId: string): boolean {
  const st = s.colleagues;
  const offer = st && msg.incidentId ? st.handover[msg.incidentId] : undefined;
  if (!st || !offer || offer.msg !== msg.id) return false;
  if (!HANDOVER_REPLIES.some((r) => r.id === replyId)) return true;
  msg.answered = replyId;
  const inc = s.incidents[msg.incidentId!];
  const sector = sectorById(offer.desk);
  if (!inc || !sector || inc.state === 'closed' || !inc.pursuit || inc.pursuit.ended) return true;
  withDesk(s, st, () => {
    if (replyId === 'keep') {
      say(s, sector, 'colleagueHandoverKept', {}, { kind: 'pursuit', incidentId: inc.id });
      addTimeline(s, inc, 'radio', T(`JK jätkab jälitust ise (${sector.name.et} valmis aitama).`, `Control keeps the pursuit (${sector.name.en} standing by).`));
      return;
    }
    pushRadio(s, { from: 'JK', text: phrase(s, 'jkHandover', {}), level: 'priority', kind: 'pursuit', incidentId: inc.id });
    say(s, sector, 'colleagueHandoverTaken', {}, { level: 'priority', kind: 'pursuit', incidentId: inc.id });
    inc.pursuit!.ended = 'handedOver';
    inc.tags.push('pursuit:handover');
    closeByColleague(
      s,
      inc,
      'handover',
      T(`Jälitus anti üle naabersektorile: ${sector.name.et} (${colleagueName(sector)}).`, `Pursuit handed over to the neighbouring sector: ${sector.name.en} (${colleagueName(sector)}).`),
    );
  });
  return true;
}

// ── Radio ────────────────────────────────────────────────────────────────────

const CHATTER = ['colleagueOwn', 'colleagueBusy', 'colleagueTraffic'];

/** One short line from a neighbouring desk: their own crews, a busy night, a question about the traffic. */
function maybeChatter(s: SimState, st: ColleagueState): void {
  if (st.chatter >= COLLEAGUES.chatterMax || s.now >= s.endTime) return;
  const list = desks(s);
  if (!list.length) return;
  const sector = withRng(s, (r) => r.pick(list));
  const key = withRng(s, (r) => r.pick(CHATTER));
  const loc = withRng(s, (r) => borderLocation(s, r, sector.id));
  const town: string | Text = loc?.district || loc?.city || sector.name;
  say(s, sector, key, { town });
  st.chatter++;
}
