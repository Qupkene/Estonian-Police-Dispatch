/**
 * What follows a wrong answer to a crew's registry query (2.25.0).
 *
 * The crew cannot see the registry: they act on what JK tells them. A person wrongly called wanted is cuffed and
 * taken in, a wanted one wrongly called clean is let go. Nobody knows at the time. The truth comes out later, the way
 * it does in real life: the custody suite checks the warrant at intake, the person contests the fine, the wanted man
 * is caught somewhere else, the victim calls again. Then the internal review (sisekontroll) takes up the complaint.
 *
 * - A crew with terminals (the MDT upgrade) sometimes re-checks a heavy call itself and stops in time.
 * - JK may correct its own answer on the radio for CORRECT_WINDOW_MS while the incident is open ("Parandus!").
 * - Body cameras halve the trust a complaint costs (addTrust's complaint flag).
 * - At the end of the shift whatever was still to come out is settled into the report, and the shift review counts
 *   every wrong answer in the incident's decision score.
 *
 * All rolls come from a stream of their own (seed, incident, beat), so a wrong answer never moves the spawner's or the
 * incidents' draws. A save without `fallout` (every older save) simply has nothing pending.
 */
import { addTimeline, emit, pushRadio, tplOf } from './internal';
import { PERSON_REPLIES, VEHICLE_REPLIES } from './radio';
import { Rng, hashString } from './rng';
import { addTrust, decisionScore, updateShiftScore } from './scoring';
import { fillText, T, type Vars } from './text';
import { hhmm, MIN } from './time';
import type { Fallout, FalloutKind, FalloutLine, Incident, SimState, Text } from './types';

/** How long JK may still correct an answer on the radio. */
export const CORRECT_WINDOW_MS = 10 * MIN;

interface Rule {
  /** Who tells JK (the radio's sender). */
  from: string;
  /** Minutes after the answer when it comes out, and the chance it does during the shift. */
  reveal: [number, number];
  revealChance: number;
  /** Chance of a complaint or claim once it is out, and its delay after that in minutes. */
  complaintChance: number;
  complaintDelay: [number, number];
  /** Trust lost when it comes out and when the complaint arrives. */
  trustReveal: number;
  trustComplaint: number;
  /** Shift score points: when it comes out, and the complaint on top. */
  penalty: number;
  complaintPenalty: number;
  /** A heavy call: a crew with terminals re-checks it more often. */
  heavy: boolean;
  /** Placeholders: {who} the person (a vehicle: its driver), {about} "isiku X" / "sõiduki X" before kohta. */
  text: Text;
  /** The text for a vehicle check, where it differs. */
  textVehicle?: Text;
  complaint?: Text;
}

const SISE = 'SISEKONTROLL';

const RULES: Record<FalloutKind, Rule> = {
  unfounded_detention: {
    from: 'ARESTIMAJA',
    reveal: [12, 30],
    revealChance: 1,
    complaintChance: 0.75,
    complaintDelay: [30, 90],
    trustReveal: 2,
    trustComplaint: 6,
    penalty: 3,
    complaintPenalty: 2,
    heavy: true,
    text: T(
      'JK, arestimaja. {Who} toodi sisse märkega „{said}“, aga registris seda ei ole. Vabastame, kinnipidamine oli alusetu ({code}).',
      'Control, custody suite. {Who} was brought in as "{said}", but the registry has nothing of the kind. Releasing; the detention had no grounds ({code}).',
    ),
    complaint: T(
      'Sisekontroll: {who} esitas kaebuse alusetu kinnipidamise kohta ({code}, {time}). Raadiopäringule anti vale vastus, kaebus on põhjendatud.',
      'Internal review: {who} filed a complaint about an unfounded detention ({code}, {time}). The registry check was answered wrongly; the complaint is upheld.',
    ),
  },
  false_restraining: {
    from: 'JAOSKOND',
    reveal: [20, 50],
    revealChance: 0.9,
    complaintChance: 0.55,
    complaintDelay: [30, 90],
    trustReveal: 1,
    trustComplaint: 4,
    penalty: 2,
    complaintPenalty: 1.5,
    heavy: true,
    text: T(
      'JK, jaoskond. Registris ei ole lähenemiskeeldu {about} kohta. Menetlus lõpetati, isik viidi kohalt ära alusetult ({code}).',
      'Control, station. There is no restraining order on {about}. The case was dropped; they were removed from the place without grounds ({code}).',
    ),
    complaint: T(
      'Sisekontroll: {who} kaebas, et ta viidi kell {time} alusetult kodust ära ({code}).',
      'Internal review: {who} complained of being removed from home without grounds at {time} ({code}).',
    ),
  },
  needless_identification: {
    from: 'JAOSKOND',
    reveal: [15, 40],
    revealChance: 1,
    complaintChance: 0.35,
    complaintDelay: [30, 90],
    trustReveal: 1,
    trustComplaint: 3,
    penalty: 1.5,
    complaintPenalty: 1,
    heavy: false,
    text: T(
      'JK, jaoskond. {Who} on registris olemas, isikukood klapib. Ta toodi tuvastamiseks jaoskonda asjata ({code}).',
      'Control, station. {Who} is in the registry and the ID code matches. They were brought in for identification for nothing ({code}).',
    ),
    complaint: T(
      'Sisekontroll: {who} kaebas, et ta viidi kell {time} asjata jaoskonda ({code}).',
      'Internal review: {who} complained of being taken to the station for nothing at {time} ({code}).',
    ),
  },
  false_missing: {
    from: 'HK',
    reveal: [5, 15],
    revealChance: 1,
    complaintChance: 0.15,
    complaintDelay: [30, 90],
    trustReveal: 0,
    trustComplaint: 2,
    penalty: 1,
    complaintPenalty: 1,
    heavy: false,
    text: T(
      'HK: {about} lähedased on segaduses, keegi ei ole teda kadunuks kuulutanud. Patrull teavitas peret asjata ({code}).',
      'ERC: the family of {about} is confused; nobody reported them missing. The patrol contacted the family for nothing ({code}).',
    ),
    complaint: T(
      'Sisekontroll: {about} pere kaebas eksitava teate üle ({code}, {time}).',
      'Internal review: the family of {about} complained about the misleading message ({code}, {time}).',
    ),
  },
  false_alert: {
    from: SISE,
    reveal: [30, 90],
    revealChance: 0.4,
    complaintChance: 1,
    complaintDelay: [0, 0],
    trustReveal: 0,
    trustComplaint: 3,
    penalty: 1,
    complaintPenalty: 1,
    heavy: false,
    text: T(
      'Sisekontroll: {about} kohta anti raadios märge „{said}“, registris seda ei ole ({code}). Patrull kohtles inimest kui ohtlikku.',
      'Internal review: control said "{said}" about {about}, the registry has nothing of the kind ({code}). The patrol treated the person as dangerous.',
    ),
    complaint: T(
      'Sisekontroll: {who} esitas kaebuse karmi kohtlemise üle ({code}, {time}).',
      'Internal review: {who} complained of rough treatment ({code}, {time}).',
    ),
  },
  unfounded_fine: {
    from: SISE,
    reveal: [40, 120],
    revealChance: 0.7,
    complaintChance: 1,
    complaintDelay: [0, 0],
    trustReveal: 0,
    trustComplaint: 2,
    penalty: 1,
    complaintPenalty: 1,
    heavy: false,
    text: T(
      'Sisekontroll: {who} vaidlustas otsuse ({code}). Raadios öeldi „{said}“, registris on „{truth}“. Trahv tühistati.',
      'Internal review: {who} contested the decision ({code}). Control said "{said}", the registry says "{truth}". The fine was cancelled.',
    ),
    complaint: T(
      'Sisekontroll: {who} nõuab alusetu trahvi eest vabandust ({code}, {time}).',
      'Internal review: {who} wants an apology for the unfounded fine ({code}, {time}).',
    ),
  },
  missed_wanted: {
    from: 'VALVEKORRAPIDAJA',
    reveal: [30, 120],
    revealChance: 0.85,
    complaintChance: 0,
    complaintDelay: [0, 0],
    trustReveal: 6,
    trustComplaint: 0,
    penalty: 4,
    complaintPenalty: 0,
    heavy: true,
    text: T(
      'Valvekorrapidaja: tagaotsitav {who} peeti kinni mujal. Kell {time} kontrollis teda {callsign} ({code}) ja laskis minna, sest JK vastas „{said}“. Sisekontroll uurib.',
      'Duty officer: {who}, who is wanted, was caught elsewhere. At {time} {callsign} checked them ({code}) and let them go because control said "{said}". Internal review is looking into it.',
    ),
    textVehicle: T(
      'Valvekorrapidaja: sõiduki {plate} tagaotsitav omanik peeti kinni mujal. Kell {time} kontrollis {callsign} seda autot ({code}) ja laskis sõita, sest JK vastas „{said}“. Sisekontroll uurib.',
      'Duty officer: the wanted owner of {plate} was caught elsewhere. At {time} {callsign} checked that car ({code}) and let it go because control said "{said}". Internal review is looking into it.',
    ),
  },
  missed_stolen: {
    from: 'HK',
    reveal: [20, 90],
    revealChance: 0.9,
    complaintChance: 0,
    complaintDelay: [0, 0],
    trustReveal: 4,
    trustComplaint: 0,
    penalty: 3,
    complaintPenalty: 0,
    heavy: true,
    text: T(
      'HK: omanik teatas, et auto {plate} on varastatud. {callsign} kontrollis seda autot kell {time} ({code}) ja laskis sõita, sest JK vastas „{said}“.',
      'ERC: the owner reported {plate} stolen. {callsign} checked that car at {time} ({code}) and let it go because control said "{said}".',
    ),
  },
  missed_missing: {
    from: 'HK',
    reveal: [30, 120],
    revealChance: 0.9,
    complaintChance: 0,
    complaintDelay: [0, 0],
    trustReveal: 4,
    trustComplaint: 0,
    penalty: 3,
    complaintPenalty: 0,
    heavy: true,
    text: T(
      'HK: kadunuks tunnistatud {about} otsingud jätkusid veel tunde. Kell {time} oli ta patrulli {callsign} juures ({code}), aga JK vastas „{said}“.',
      'ERC: the search for {about}, reported missing, went on for hours. At {time} they were with {callsign} ({code}), but control said "{said}".',
    ),
  },
  missed_restraining: {
    from: 'HK',
    reveal: [15, 60],
    revealChance: 0.7,
    complaintChance: 0,
    complaintDelay: [0, 0],
    trustReveal: 5,
    trustComplaint: 0,
    penalty: 3,
    complaintPenalty: 0,
    heavy: true,
    text: T(
      'HK: kannatanu helistas uuesti. Lähenemiskeeluga {who} jäeti kell {time} kohale ({code}), sest JK vastas „{said}“.',
      'ERC: the victim called again. {who}, who has a restraining order, was left there at {time} ({code}) because control said "{said}".',
    ),
  },
  missed_weapon: {
    from: SISE,
    reveal: [20, 60],
    revealChance: 0.5,
    complaintChance: 0,
    complaintDelay: [0, 0],
    trustReveal: 0,
    trustComplaint: 0,
    penalty: 2,
    complaintPenalty: 0,
    heavy: true,
    text: T(
      'Ohutusülevaade: {who} omab relvaluba, aga JK vastas kell {time} „{said}“ ({code}). Patrull läks kohale hoiatuseta.',
      'Safety review: {who} holds a firearms permit, but at {time} control said "{said}" ({code}). The patrol went in unwarned.',
    ),
  },
  false_identity: {
    from: 'JAOSKOND',
    reveal: [40, 120],
    revealChance: 0.6,
    complaintChance: 0,
    complaintDelay: [0, 0],
    trustReveal: 2,
    trustComplaint: 0,
    penalty: 2,
    complaintPenalty: 0,
    heavy: false,
    text: T(
      'JK, jaoskond. Isikut {who} registris ei ole, andmed olid võltsitud. {callsign} laskis ta kell {time} minna ({code}), sest JK vastas „{said}“.',
      'Control, station. {Who} is not in the registry; the details were false. {callsign} let them go at {time} ({code}) because control said "{said}".',
    ),
    textVehicle: T(
      'JK, jaoskond. Numbrit {plate} registris ei ole, numbrimärgid olid võltsitud. {callsign} laskis auto kell {time} sõita ({code}), sest JK vastas „{said}“.',
      'Control, station. {plate} is not in the registry; the plates were false. {callsign} let the car go at {time} ({code}) because control said "{said}".',
    ),
  },
  missed_violation: {
    from: SISE,
    reveal: [60, 180],
    revealChance: 0.35,
    complaintChance: 0,
    complaintDelay: [0, 0],
    trustReveal: 0,
    trustComplaint: 0,
    penalty: 1,
    complaintPenalty: 0,
    heavy: false,
    text: T(
      'Järelkontroll: {about} kohta on registris „{truth}“, raadios öeldi „{said}“ ({code}). Rikkumine jäi menetlemata.',
      'Follow-up check: the registry says "{truth}" about {about}, control said "{said}" ({code}). The offence went unprocessed.',
    ),
  },
  minor: {
    from: SISE,
    reveal: [60, 180],
    revealChance: 0.3,
    complaintChance: 0,
    complaintDelay: [0, 0],
    trustReveal: 0,
    trustComplaint: 0,
    penalty: 0.5,
    complaintPenalty: 0,
    heavy: false,
    text: T(
      'Järelkontroll: {about} kohta öeldi raadios „{said}“, registris on „{truth}“ ({code}).',
      'Follow-up check: control said "{said}" about {about}, the registry says "{truth}" ({code}).',
    ),
  },
};

const FINES = ['noinsurance', 'noinspection', 'suspended'];

/** What kind of consequence JK's `said` has when the registry holds `truth`. Null when they agree. */
export function falloutKind(said: string, truth: string, vehicle: boolean): FalloutKind | null {
  if (said === truth) return null;
  if (vehicle) {
    if (truth === 'stolen') return 'missed_stolen';
    if (truth === 'ownerwanted') return 'missed_wanted';
    if (said === 'stolen') return 'unfounded_detention';
    if (said === 'ownerwanted') return 'false_alert';
    if (truth === 'notfound') return 'false_identity';
    if (said === 'notfound') return 'minor';
    if (FINES.includes(said)) return 'unfounded_fine';
    return FINES.includes(truth) ? 'missed_violation' : 'minor';
  }
  if (truth === 'wanted') return 'missed_wanted';
  if (said === 'wanted') return 'unfounded_detention';
  if (truth === 'missing') return 'missed_missing';
  if (truth === 'restraining') return 'missed_restraining';
  if (said === 'restraining') return 'false_restraining';
  if (said === 'missing') return 'false_missing';
  if (said === 'notfound') return 'needless_identification';
  if (truth === 'notfound') return 'false_identity';
  if (said === 'weapon') return 'false_alert';
  if (truth === 'weapon') return 'missed_weapon';
  if (said === 'nolicense') return 'unfounded_fine';
  if (truth === 'nolicense' || truth === 'probation') return 'missed_violation';
  return 'minor';
}

/** The shift's consequences (created on first use). */
function list(s: SimState): Fallout[] {
  if (!s.fallout) s.fallout = [];
  return s.fallout;
}

const between = (r: Rng, [lo, hi]: [number, number]) => (hi > lo ? r.range(lo, hi) : lo) * MIN;

/**
 * JK answered a query wrongly: record what the crew does with it and roll when it comes out. `crewChecks` is the
 * chance the crew re-checks it on its own terminal. Replaces an earlier record for the same beat (a correction).
 */
export function recordFallout(
  s: SimState,
  inc: Incident,
  beat: number,
  subj: { personId?: string; plate?: string },
  said: string,
  truth: string,
  unitId: string | undefined,
  crewChecks: number,
): Fallout | null {
  dropFallout(s, inc.id, beat);
  const kind = falloutKind(said, truth, !!subj.plate);
  if (!kind) return null;
  const rule = RULES[kind];
  // Its own stream: the same answer always has the same consequence, whatever else happened in the shift.
  const r = new Rng(hashString(`fallout:${s.seed}:${inc.id}:${beat}:${said}`));
  const f: Fallout = {
    id: `${inc.id}:${beat}`,
    incidentId: inc.id,
    beat,
    unitId,
    personId: subj.personId,
    plate: subj.plate,
    said,
    truth,
    kind,
    at: s.now,
    stage: 'hidden',
    trust: 0,
    penalty: 0,
  };
  const check = rule.heavy ? crewChecks : crewChecks * 0.4;
  if (r.chance(check)) f.catchAt = s.now + r.range(2, 5) * MIN;
  if (r.chance(rule.revealChance)) {
    f.revealAt = s.now + between(r, rule.reveal);
    if (rule.complaint && r.chance(rule.complaintChance))
      f.complaintAt = f.revealAt + between(r, rule.complaintDelay);
  }
  list(s).push(f);
  return f;
}

/** Forget a beat's pending consequence (JK corrected the answer before anything came of it). */
export function dropFallout(s: SimState, incidentId: string, beat: number): void {
  if (!s.fallout?.length) return;
  const i = s.fallout.findIndex(
    (f) => f.incidentId === incidentId && f.beat === beat && f.stage === 'hidden',
  );
  if (i >= 0) s.fallout.splice(i, 1);
}

/** The pending consequence of a beat, if any. */
export function falloutOf(s: SimState, incidentId: string, beat: number): Fallout | undefined {
  return s.fallout?.find((f) => f.incidentId === incidentId && f.beat === beat);
}

function replyLabel(id: string, vehicle: boolean): Text {
  const r = (vehicle ? VEHICLE_REPLIES : PERSON_REPLIES).find((x) => x.id === id);
  return r?.label ?? T(id, id);
}

function nameOf(s: SimState, f: Fallout): string {
  if (f.plate) return f.plate;
  const p = f.personId ? s.persons[f.personId] : undefined;
  return p ? `${p.firstName} ${p.lastName}` : '-';
}

function varsOf(s: SimState, f: Fallout): Vars {
  const inc = s.incidents[f.incidentId];
  const u = f.unitId ? s.units[f.unitId] : undefined;
  const veh = !!f.plate;
  const name = nameOf(s, f);
  return {
    // A name stays in the nominative ("isiku Mari Tamm kohta"): Estonian surnames do not decline by a rule.
    who: veh ? T(`sõiduki ${name} juht`, `the driver of ${name}`) : name,
    Who: veh ? T(`Sõiduki ${name} juht`, `The driver of ${name}`) : name,
    about: veh ? T(`sõiduki ${name}`, name) : T(`isiku ${name}`, name),
    plate: f.plate ?? '',
    said: replyLabel(f.said, veh),
    truth: replyLabel(f.truth, veh),
    code: inc?.code ?? '',
    time: hhmm(f.at),
    callsign: u?.callsign ?? T('patrull', 'the patrol'),
  };
}

const textOf = (rule: Rule, f: Fallout): Text => (f.plate && rule.textVehicle) || rule.text;

/** Apply the decision points of a wrong answer to an incident that is already closed. */
function rescore(s: SimState, inc: Incident): void {
  const o = inc.outcome;
  if (!o || inc.closedBy !== 'units') return;
  const b = o.breakdown;
  const d = Math.round(decisionScore(s, inc, tplOf(inc)) * 10) / 10;
  if (d === b.decisions) return;
  b.decisions = d;
  b.total = Math.round(
    Math.max(
      0,
      Math.min(100, b.response + b.resources + b.decisions + b.outcome + b.safety + b.classification),
    ),
  );
  o.score = b.total;
}

function beatOf(inc: Incident | undefined, f: Fallout) {
  return inc?.beats.find((b) => b.index === f.beat);
}

/** The crew re-checked it on their terminal and stopped in time. */
function catchIt(s: SimState, f: Fallout): void {
  const inc = s.incidents[f.incidentId];
  const b = beatOf(inc, f);
  f.stage = 'caught';
  if (b) {
    b.caught = true;
    b.revealed = true;
  }
  if (!inc) return;
  const u = f.unitId ? s.units[f.unitId] : undefined;
  const text = fillText(
    T(
      '{callsign}: JK, kontrollisime tahvlist üle. {Who}: registris on „{truth}“, mitte „{said}“. Toimime registri järgi.',
      '{callsign}: control, we re-checked on our terminal. {Who}: the registry says "{truth}", not "{said}". Acting on the registry.',
    ),
    varsOf(s, f),
  );
  pushRadio(s, {
    from: u?.callsign ?? 'PATRULL',
    to: 'JK',
    text,
    level: 'priority',
    kind: 'status',
    incidentId: inc.id,
    unitId: u?.id,
  });
  addTimeline(
    s,
    inc,
    'note',
    T(
      'Patrull kontrollis päringu ise üle ja parandas vea',
      'The crew re-checked the query and caught the error',
    ),
  );
  // Acting on the registry after all: the wanted one is held after all.
  if (inc.state !== 'closed' && (f.truth === 'wanted' || f.truth === 'stolen')) inc.effects.arrests += 1;
  rescore(s, inc);
}

/** It comes out: the message, the trust and the score. */
function reveal(s: SimState, f: Fallout, late: boolean): void {
  const rule = RULES[f.kind];
  const inc = s.incidents[f.incidentId];
  const b = beatOf(inc, f);
  f.stage = 'revealed';
  f.late = late;
  if (b) b.revealed = true;
  const text = fillText(textOf(rule, f), varsOf(s, f));
  if (!late) {
    pushRadio(s, {
      from: rule.from,
      to: 'JK',
      text,
      level: 'priority',
      kind: 'info',
      incidentId: f.incidentId,
    });
    emit(s, { type: 'complaint', incidentId: f.incidentId, text });
  }
  if (inc) addTimeline(s, inc, 'note', text);
  f.trust += -addTrust(s, -rule.trustReveal);
  f.penalty += rule.penalty;
  if (inc) rescore(s, inc);
  // The custody suite or the complaint arrives at once with it (false alert, contested fine).
  if (f.complaintAt !== undefined && f.complaintAt <= f.revealAt!) complain(s, f, late);
}

/** The complaint or claim arrives (sisekontroll). */
function complain(s: SimState, f: Fallout, late: boolean): void {
  const rule = RULES[f.kind];
  if (f.complained || !rule.complaint) return;
  f.complained = true;
  const inc = s.incidents[f.incidentId];
  const text = fillText(rule.complaint, varsOf(s, f));
  if (!late) {
    pushRadio(s, { from: SISE, to: 'JK', text, level: 'priority', kind: 'info', incidentId: f.incidentId });
    emit(s, { type: 'complaint', incidentId: f.incidentId, text });
  }
  if (inc) addTimeline(s, inc, 'note', text);
  f.trust += -addTrust(s, -rule.trustComplaint, true);
  f.penalty += rule.complaintPenalty;
  s.stats.complaints = (s.stats.complaints ?? 0) + 1;
}

/** Every substep: crews re-checking, things coming out, complaints arriving. */
export function updateFallout(s: SimState): void {
  const all = s.fallout;
  if (!all?.length) return;
  let changed = false;
  for (const f of all) {
    if (f.stage === 'hidden') {
      if (
        f.catchAt !== undefined &&
        s.now >= f.catchAt &&
        (f.revealAt === undefined || f.catchAt <= f.revealAt)
      ) {
        catchIt(s, f);
        changed = true;
      } else if (f.revealAt !== undefined && s.now >= f.revealAt) {
        reveal(s, f, false);
        changed = true;
      }
    } else if (
      f.stage === 'revealed' &&
      !f.complained &&
      f.complaintAt !== undefined &&
      s.now >= f.complaintAt
    ) {
      complain(s, f, false);
      changed = true;
    }
  }
  if (changed) updateShiftScore(s);
}

/**
 * The shift is over: what was still to come out comes out now (for the report), and the shift review counts every
 * wrong answer in its incident's decision score. Idempotent.
 */
export function settleFallout(s: SimState): void {
  for (const f of s.fallout ?? []) {
    if (f.stage === 'hidden' && f.revealAt !== undefined) reveal(s, f, true);
    else if (f.stage === 'revealed' && !f.complained && f.complaintAt !== undefined) complain(s, f, true);
  }
  for (const id of s.incidentOrder) {
    const inc = s.incidents[id];
    if (!inc) continue;
    let any = false;
    for (const b of inc.beats) {
      if (b.correct === false && !b.revealed) {
        b.revealed = true;
        any = true;
      }
    }
    if (any) rescore(s, inc);
  }
}

/** The report's lines, in the order the answers were given. */
export function falloutLines(s: SimState): FalloutLine[] {
  const out: FalloutLine[] = [];
  for (const f of s.fallout ?? []) {
    const inc = s.incidents[f.incidentId];
    const rule = RULES[f.kind];
    const v = varsOf(s, f);
    const outcome: FalloutLine['outcome'] =
      f.stage === 'caught'
        ? 'caught'
        : f.complained
          ? 'complaint'
          : f.stage === 'revealed'
            ? 'revealed'
            : 'unseen';
    const text =
      outcome === 'caught'
        ? fillText(
            T(
              'Patrull kontrollis ise üle ja toimis registri järgi.',
              'The crew re-checked it and acted on the registry.',
            ),
            v,
          )
        : outcome === 'unseen'
          ? fillText(
              T(
                'Vahetuse ajal ei tulnud välja. Vahetuse ülevaatus märkas vea.',
                'It did not come out during the shift. The shift review found the error.',
              ),
              v,
            )
          : fillText(f.complained && rule.complaint ? rule.complaint : textOf(rule, f), v);
    out.push({
      incidentId: f.incidentId,
      code: inc?.code ?? '',
      t: f.at,
      kind: f.kind,
      who: nameOf(s, f),
      said: replyLabel(f.said, !!f.plate),
      truth: replyLabel(f.truth, !!f.plate),
      outcome,
      late: !!f.late,
      text,
      trust: Math.round(f.trust * 10) / 10,
      penalty: f.penalty,
    });
  }
  return out.sort((a, b) => a.t - b.t);
}
