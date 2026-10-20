/**
 * Player commands (engine-core public API, DESIGN §5). All mutate the SimState in place.
 */
import { callAnswer, callAsk, callEnd, callInterpreter } from './calls';
import { answerColleague } from './colleagues';
import { haversineKm } from './geo';
import { addTimeline, pushRadio, regionOf, templateById, tplOf } from './internal';
import {
  checkBackup,
  closeWithoutUnits,
  findRadio,
  handleRadioReply,
  isHidden,
  requestAgencyInternal,
  setIF,
  upgradeToSiren,
} from './incidents';
import { pursuitCommand } from './pursuit';
import { agencyName, jkSay, phrase, radioVars, spokenCallsign, unitPhrase } from './radio';
import { addTrust } from './scoring';
import { locationFromCoord, spawnIncident } from './spawner';
import { fillText } from './text';
import { MIN } from './time';
import {
  atBase,
  boatCanReach,
  endBreak,
  moveUnit,
  ONCALL_DELAY_MIN,
  releaseUnit,
  returnToPatrol,
  setStatus,
  startBreak,
  stopUnit,
  unitEta,
  zoneAt,
} from './units';
import type { Agency, CallQuestionId, Incident, LngLat, Priority, RadioMsg, SimState, Text, Unit } from './types';

const T = (et: string, en: string): Text => ({ et, en });

function incOf(s: SimState, id: string): Incident | undefined {
  const inc = s.incidents[id];
  return inc && inc.state !== 'closed' ? inc : undefined;
}

export function acknowledge(s: SimState, incidentId: string): void {
  const inc = incOf(s, incidentId);
  if (!inc || inc.state !== 'incoming') return;
  inc.state = 'queued';
  inc.acknowledgedAt = s.now;
  if (inc.hiddenDetails.length) inc.details.push(inc.hiddenDetails.shift()!);
  addTimeline(s, inc, 'system', T('Sündmus kinnitatud', 'Event acknowledged'));
}

export function setPriority(s: SimState, incidentId: string, p: Priority): void {
  const inc = incOf(s, incidentId);
  if (!inc || inc.priority === p) return;
  const old = inc.priority;
  inc.priority = p;
  setIF(s, inc, 'prioSet', p);
  addTimeline(s, inc, 'system', T(`Prioriteet muudetud: P${old} → P${p}`, `Priority changed: P${old} → P${p}`));
  if (p < old) upgradeToSiren(s, inc);
}

const STATUS_REASON: Partial<Record<Unit['status'], Text>> = {
  offduty: T('Üksus ei ole teenistuses', 'Unit is off duty'),
  emergency: T('Üksus on hädaolukorras', 'Unit is in an emergency'),
  onscene: T('Üksus on teisel sündmuskohal', 'Unit is busy at another scene'),
  transport: T('Üksus toimetab kinnipeetut', 'Unit is transporting a detainee'),
  busy: T('Üksus vormistab menetlust', 'Unit is busy with paperwork'),
};

/** Send units to an incident. Partial success returns ok with a reason listing the rejects. */
export function dispatchUnits(s: SimState, incidentId: string, unitIds: string[]): { ok: boolean; reason?: Text } {
  const inc = incOf(s, incidentId);
  if (!inc) return { ok: false, reason: T('Sündmus on lõpetatud või puudub', 'Event is closed or missing') };
  if (isHidden(s, inc)) return { ok: false, reason: T('Sündmus on alles 112 kõnes', 'Event is still in a 112 call') };
  const rejects: Text[] = [];
  const warns: Text[] = [];
  const sent: Unit[] = [];
  const siren = Math.min(inc.priority, inc.truePriority) <= 2;
  for (const id of unitIds) {
    const u = s.units[id];
    if (!u) continue;
    if (inc.assigned.includes(u.id)) continue;
    const cs = spokenCallsign(s, u);
    const bad = STATUS_REASON[u.status];
    if (bad && !(u.status === 'enroute' && u.incidentId !== inc.id)) {
      rejects.push(T(`${cs}: ${bad.et}`, `${cs}: ${bad.en}`));
      continue;
    }
    // A boat sails in a straight line: only to events on or by its own water body.
    if (u.type === 'boat' && !boatCanReach(s, u, inc)) {
      rejects.push(T(`${cs}: veesõidukiga kättesaamatu`, `${cs}: unreachable by boat`));
      continue;
    }
    const eta = unitEta(s, u, inc.location.coord, inc.location.zone, siren);
    if (!eta) {
      rejects.push(T(`${cs}: maismaad pidi kättesaamatu`, `${cs}: unreachable by road`));
      continue;
    }
    // Leaving another job / break.
    if (u.status === 'enroute' && u.incidentId && u.incidentId !== inc.id) {
      const old = s.incidents[u.incidentId];
      if (old) detachUnit(s, old, u);
      warns.push(T(`${cs} lahkus eelmiselt sündmuselt`, `${cs} left its previous event`));
      jkSay(s, phrase(s, 'reassign', radioVars(s, u, inc)), { unit: u, inc });
    }
    const wasOnBreak = u.status === 'break';
    if (wasOnBreak) {
      endBreak(s, u);
      warns.push(T(`${cs}: paus katkestati`, `${cs}: break interrupted`));
    }
    const delay = u.onCall && atBase(s, u) ? ONCALL_DELAY_MIN : 0;
    delete s.flags[`hold:${u.id}`];
    u.incidentId = inc.id;
    if (!moveUnit(s, u, inc.location.coord, 'incident', siren, { zone: inc.location.zone, delayMin: delay })) {
      delete u.incidentId;
      rejects.push(T(`${cs}: maismaad pidi kättesaamatu`, `${cs}: unreachable by road`));
      continue;
    }
    inc.assigned.push(u.id);
    if (!inc.unitHistory.includes(u.id)) inc.unitHistory.push(u.id);
    sent.push(u);
    const etaMin = Math.max(1, Math.round(eta.etaMin));
    const key = wasOnBreak ? 'dispatchBreak' : siren ? 'dispatchUrgent' : 'dispatch';
    jkSay(s, phrase(s, key, radioVars(s, u, inc)), { unit: u, inc, kind: 'dispatch', level: inc.priority === 1 ? 'priority' : 'routine' });
    if (delay) unitPhrase(s, u, 'onCallActivate', inc);
    // A 1-minute ETA gets a variant without "{n} minutit" (no "1 minutit" / "1 minutes" on the radio).
    else unitPhrase(s, u, etaMin > 25 ? 'ackFar' : siren ? 'ackUrgent' : 'ack', inc, etaMin > 1 ? { n: String(etaMin) } : {});
    addTimeline(s, inc, 'dispatch', fillText(T('{callsign} saadetud, saabumine u {n} min', '{callsign} dispatched, ETA about {n} min'), radioVars(s, u, inc, { n: String(etaMin) })));
  }
  if (!sent.length) {
    return { ok: false, reason: rejects.length ? joinTexts(rejects) : T('Ühtegi üksust ei saadetud', 'No unit was dispatched') };
  }
  if (inc.state === 'incoming' || inc.state === 'queued') {
    if (inc.acknowledgedAt === undefined) inc.acknowledgedAt = s.now;
    inc.state = inc.firstArrivalAt !== undefined && inc.assigned.some((id) => s.units[id]?.status === 'onscene') ? 'onscene' : 'dispatched';
  }
  if (inc.firstDispatchAt === undefined) inc.firstDispatchAt = s.now;
  checkBackup(s, inc);
  const notes = [...warns, ...rejects];
  return notes.length ? { ok: true, reason: joinTexts(notes) } : { ok: true };
}

function joinTexts(ts: Text[]): Text {
  return { et: ts.map((t) => t.et).join('; '), en: ts.map((t) => t.en).join('; ') };
}

/** Remove a unit from an incident (it keeps its movement until re-routed). */
function detachUnit(s: SimState, inc: Incident, u: Unit): void {
  inc.assigned = inc.assigned.filter((id) => id !== u.id);
  if (u.incidentId === inc.id) delete u.incidentId;
  addTimeline(s, inc, 'dispatch', fillText(T('{callsign} eemaldati sündmuselt', '{callsign} removed from the event'), radioVars(s, u, inc)));
  if (inc.state !== 'closed' && !inc.assigned.length) inc.state = inc.acknowledgedAt !== undefined ? 'queued' : 'incoming';
  else if (inc.state === 'onscene' && !inc.assigned.some((id) => s.units[id]?.status === 'onscene')) inc.state = 'dispatched';
}

/** Recall a unit: leave its incident (en route or on scene), end a break, or return to base. */
export function recallUnit(s: SimState, unitId: string): void {
  const u = s.units[unitId];
  if (!u) return;
  if (u.status === 'break') {
    endBreak(s, u);
    unitPhrase(s, u, 'breakEnd');
    returnToPatrol(s, u);
    return;
  }
  if (u.status === 'transport' || u.status === 'busy' || u.status === 'offduty' || u.status === 'emergency') return;
  const inc = u.incidentId ? s.incidents[u.incidentId] : undefined;
  if (inc && inc.state !== 'closed' && (u.status === 'enroute' || u.status === 'onscene')) {
    jkSay(s, phrase(s, 'recall', radioVars(s, u, inc)), { unit: u, inc });
    unitPhrase(s, u, 'recallAck', inc);
    detachUnit(s, inc, u);
    releaseUnit(s, u, false);
    return;
  }
  // Idle unit: back to its station.
  delete u.incidentId;
  const st = regionOf(s).stations.find((x) => x.id === u.stationId);
  jkSay(s, phrase(s, 'recall', radioVars(s, u)), { unit: u });
  if (st) moveUnit(s, u, st.coord, 'return', false, { zone: st.zone });
  else stopUnit(s, u);
}

function isNuisance(inc: Incident): boolean {
  return inc.category === 'public_order' || inc.category === 'assist' || inc.category === 'environment' || inc.category === 'traffic';
}

/** Close without (further) units: referral, phone advice, duplicate, prank. */
export function closeIncident(
  s: SimState,
  incidentId: string,
  how: 'referral' | 'phone' | 'duplicate' | 'prank',
  agency?: Agency,
): void {
  const inc = incOf(s, incidentId);
  if (!inc) return;
  const tpl = tplOf(inc);
  let correct = false;
  switch (how) {
    case 'referral':
      correct = (!!inc.referral && agency === inc.referral) || (!!tpl?.referral && agency === tpl.referral.agency && inc.truePriority >= 3);
      if (agency) inc.referral = inc.referral ?? agency;
      break;
    case 'phone': {
      const expSoon = inc.expiresAt !== undefined && inc.expiresAt - s.now < 30 * MIN;
      correct = inc.truePriority === 4 || !!inc.falseAlarm || (inc.truePriority === 3 && isNuisance(inc) && expSoon);
      break;
    }
    case 'duplicate': {
      correct = s.incidentOrder.some((id) => {
        if (id === inc.id) return false;
        const o = s.incidents[id];
        if (!o || o.createdAt > inc.createdAt + 5 * MIN || o.createdAt < inc.createdAt - 45 * MIN) return false;
        if (o.closedAt !== undefined && o.closedAt < s.now - 30 * MIN) return false;
        return (o.templateId === inc.templateId || o.category === inc.category) && haversineKm(o.location.coord, inc.location.coord) < 0.4;
      });
      break;
    }
    case 'prank':
      correct = !!(tpl?.easterEgg || inc.easterEgg || inc.falseAlarm || inc.category === 'easter' || inc.tags.includes('prank') || tpl?.tags?.includes('prank'));
      break;
  }
  if (correct) {
    s.stats.referralsCorrect++;
    addTrust(s, 0.5);
  } else {
    s.stats.referralsWrong++;
    const pen: Record<Priority, number> = { 1: -10, 2: -6, 3: -3, 4: -1 };
    addTrust(s, pen[inc.truePriority]);
  }
  const labels: Record<typeof how, Text> = {
    referral: fillText(T('Suunatud: {agency}', 'Referred to {agency}'), { agency: agencyName(agency ?? inc.referral) }),
    phone: T('Lahendatud telefoni teel (nõuanne)', 'Resolved by phone (advice)'),
    duplicate: T('Topeltteade, liidetud varasema sündmusega', 'Duplicate, merged with an earlier event'),
    prank: T('Valeväljakutse / pahatahtlik kõne', 'False / prank call'),
  };
  const text = correct ? labels[how] : T(`${labels[how].et} (vale otsus)`, `${labels[how].en} (wrong decision)`);
  closeWithoutUnits(s, inc, how, correct, text);
}

export function requestAgency(s: SimState, incidentId: string, agency: Agency): void {
  const inc = incOf(s, incidentId);
  if (!inc) return;
  requestAgencyInternal(s, inc, agency);
}

export function replyRadio(s: SimState, msgId: string, replyId: string): void {
  const msg = findRadio(s, msgId);
  if (!msg || msg.answered || !msg.replies?.length) return;
  if (msg.expiresAt !== undefined && msg.expiresAt < s.now) return;
  // A neighbouring desk's offer to take over a pursuit (src/sim/colleagues.ts).
  if (answerColleague(s, msg, replyId)) return;
  handleRadioReply(s, msg, replyId);
}

export function setUnitBreak(s: SimState, unitId: string, onBreak: boolean): void {
  const u = s.units[unitId];
  if (!u) return;
  if (onBreak) startBreak(s, u, false);
  else if (u.status === 'break') {
    endBreak(s, u);
    unitPhrase(s, u, 'breakEnd');
    returnToPatrol(s, u);
  }
}

export function markChecked(s: SimState, incidentId: string, ref: { personId?: string; plate?: string }): void {
  const inc = s.incidents[incidentId];
  if (!inc) return;
  if (ref.personId) for (const p of inc.persons) if (p.personId === ref.personId) p.checked = true;
  if (ref.plate) {
    const k = ref.plate.replace(/\s+/g, '').toUpperCase();
    for (const v of inc.vehicles) if (v.plate.replace(/\s+/g, '').toUpperCase() === k) v.checked = true;
  }
}

export function answerCall(s: SimState, callId: string): void {
  callAnswer(s, callId);
}
export function askCall(s: SimState, callId: string, q: CallQuestionId): void {
  callAsk(s, callId, q);
}
export function toggleInterpreter(s: SimState, callId: string): void {
  callInterpreter(s, callId);
}
export function endCall(
  s: SimState,
  callId: string,
  d: { action: 'create' | 'prank' | 'refer' | 'advice'; priority?: Priority; agency?: Agency },
): void {
  callEnd(s, callId, d);
}

export function pursuitAction(s: SimState, incidentId: string, a: 'terminate' | 'heli' | 'spikes'): void {
  const inc = incOf(s, incidentId);
  if (!inc || !inc.pursuit || inc.pursuit.ended) return;
  pursuitCommand(s, inc, a);
}

// ── Director mode ───────────────────────────────────────────────────────────

/** Spawn any template anywhere (director). Returns the new incident id ('' if the template is unknown). */
export function directorSpawn(
  s: SimState,
  o: { templateId: string; coord?: LngLat; priority?: Priority; summary?: Text },
): string {
  const tpl = templateById(o.templateId);
  if (!tpl) return '';
  const location = o.coord ? locationFromCoord(s, o.coord, tpl.places.length === 1 ? tpl.places[0] : undefined) : undefined;
  const inc = spawnIncident(s, tpl, { location, priority: o.priority, summary: o.summary, source: 'director' });
  return inc?.id ?? '';
}

export function directorRadio(s: SimState, from: string, text: Text, level: RadioMsg['level'] = 'routine'): void {
  const u = s.unitOrder.map((id) => s.units[id]).find((x) => x && (x.callsign === from || spokenCallsign(s, x) === from));
  pushRadio(s, { from, text, level, kind: 'info', unitId: u?.id, to: from === 'JK' ? undefined : 'JK' });
}

/**
 * Move a unit (director). Default: drive there without siren and park (no auto-patrol until
 * dispatched). `instant` teleports it.
 */
export function directorMoveUnit(s: SimState, unitId: string, coord: LngLat, opts: { instant?: boolean; siren?: boolean } = {}): void {
  const u = s.units[unitId];
  if (!u) return;
  if (u.status === 'offduty') return;
  s.flags[`hold:${u.id}`] = true;
  const inc = u.incidentId ? s.incidents[u.incidentId] : undefined;
  if (inc && inc.state !== 'closed' && (u.status === 'enroute' || u.status === 'onscene')) {
    detachUnit(s, inc, u);
    setStatus(s, u, 'available');
  }
  if (opts.instant) {
    stopUnit(s, u);
    u.pos = coord;
    u.zone = zoneAt(regionOf(s), coord);
    return;
  }
  moveUnit(s, u, coord, u.status === 'transport' ? 'transport' : 'patrol', !!opts.siren, { profile: opts.siren ? 'siren' : 'normal' });
}
