// Which radio lines the voice reads, and when a line is no longer worth reading. Owned by ui-shell.
// Pure functions over the sim state, no DOM: tests/speech-tts.test.ts.
//
// - Each spoken line carries a tag: the radio message, its incident and unit, and the unit's status
//   when it was said. A line goes stale (and is dropped or cut) once the player has answered the
//   message, the beat it asks about is over, the incident was closed after it, Häirekeskus asked for
//   units that are now sent, or the unit has moved on to another status.
// - At 1x and 2x every line is read (stale lines are still dropped or cut); at 4x and faster only
//   lines that need a reply and emergencies, with at most one waiting. Paused: nothing.
// - When the player resolves something a unit asked or reported (a reply, the backup it asked for,
//   the agency it wanted), that unit may answer with a short acknowledgement in its own voice
//   ("Ee, selge."), or stay silent, so the radio does not sound robotic. Lines that went stale by
//   themselves (status change, question timeout) are cut without one.
import type { RadioMsg, SimState } from '@/sim/types';

/** How much a line matters. */
export const PRIO = { routine: 0, important: 1, reply: 2, emergency: 3 } as const;
export type SpeechPrio = (typeof PRIO)[keyof typeof PRIO];

export interface SpeechTag {
  /** Radio message id. */
  msgId: string;
  /** Game time of the message. */
  t: number;
  incidentId?: string;
  /** Unit that speaks or is spoken to. */
  unitId?: string;
  /** Status of that unit when the line was queued: once it differs, the line is stale. */
  unitStatus?: string;
  /** Units on the incident when the line was queued (Häirekeskus asking for units). */
  assigned?: number;
  /** Who talks ('JK', 'HK', a callsign). */
  from: string;
  prio: SpeechPrio;
}

/** Game speed step (index into SPEEDS, 0 = paused) as far as the voice is concerned. */
export function voiceSpeedIndex(g: { speedIndex: number; realtime?: boolean }): number {
  if (g.speedIndex <= 0) return 0;
  return g.realtime ? 1 : g.speedIndex;
}

/** How much a radio message matters for the voice. */
export function speechPrio(sim: SimState, m: RadioMsg): SpeechPrio {
  if (m.level === 'emergency') return PRIO.emergency;
  if (m.replies?.length && !m.answered) return PRIO.reply;
  if (m.kind === 'pursuit' || m.kind === 'backup' || m.level === 'priority') return PRIO.important;
  const inc = m.incidentId ? sim.incidents[m.incidentId] : undefined;
  if (inc && inc.state !== 'closed' && (inc.priority === 1 || inc.truePriority === 1)) return PRIO.important;
  return PRIO.routine;
}

/** The least a line must matter to be read at a speed step; null = read nothing (paused). */
export function minPrioAt(speedIndex: number): SpeechPrio | null {
  if (speedIndex <= 0) return null;
  if (speedIndex <= 2) return PRIO.routine;
  return PRIO.reply;
}

/** Is a line of this priority read at this speed step? */
export function speakableAt(prio: SpeechPrio, speedIndex: number): boolean {
  const min = minPrioAt(speedIndex);
  return min !== null && prio >= min;
}

/** Lines that may wait behind the one playing (undefined = the queue's own limit). */
export function maxWaitingAt(speedIndex: number): number | undefined {
  return speedIndex >= 3 ? 1 : undefined;
}

/** Find a radio message by id (newest first: spoken lines are recent). */
function findMsg(sim: SimState, id: string): RadioMsg | undefined {
  for (let i = sim.radio.length - 1; i >= 0; i--) if (sim.radio[i].id === id) return sim.radio[i];
  return undefined;
}

/** Tag for a message about to be spoken. */
export function speechTag(sim: SimState, m: RadioMsg): SpeechTag {
  const inc = m.incidentId ? sim.incidents[m.incidentId] : undefined;
  const unit = m.unitId ? sim.units[m.unitId] : undefined;
  return {
    msgId: m.id,
    t: m.t,
    incidentId: m.incidentId,
    unitId: m.unitId,
    unitStatus: unit?.status,
    assigned: inc?.assigned.length,
    from: m.from,
    prio: speechPrio(sim, m),
  };
}

/** Has the line become pointless: the player acted on it, or the world moved past it? */
export function isStale(sim: SimState, tag: SpeechTag): boolean {
  const m = findMsg(sim, tag.msgId);
  if (m) {
    // Answered, or the question timed out.
    if (m.answered) return true;
    if (m.replies?.length && m.expiresAt !== undefined && sim.now > m.expiresAt) return true;
  }
  const inc = tag.incidentId ? sim.incidents[tag.incidentId] : undefined;
  if (inc) {
    // The beat this message opened (check, decision, backup request, agency) is over.
    const beat = inc.beats.find((b) => b.radioId === tag.msgId);
    if (beat && beat.status !== 'active') return true;
    // Closed after the line was said (the closing report itself comes at the closing time).
    if (inc.state === 'closed' && (inc.closedAt ?? sim.now) > tag.t) return true;
    // Häirekeskus asked for units and the player has sent them.
    if (tag.from === 'HK' && tag.assigned !== undefined && inc.assigned.length > tag.assigned) return true;
  }
  if (tag.unitId && tag.unitStatus) {
    const u = sim.units[tag.unitId];
    if (u && u.status !== tag.unitStatus) return true;
  }
  return false;
}

/**
 * The line to read from a batch of new radio messages, or undefined: the one that matters most
 * (the first of equals) among those read at this speed and not already stale.
 */
export function pickSpoken(
  sim: SimState,
  msgs: readonly RadioMsg[],
  speedIndex: number,
): { msg: RadioMsg; tag: SpeechTag } | undefined {
  let best: { msg: RadioMsg; tag: SpeechTag } | undefined;
  for (const msg of msgs) {
    const tag = speechTag(sim, msg);
    if (!speakableAt(tag.prio, speedIndex) || isStale(sim, tag)) continue;
    if (!best || tag.prio > best.tag.prio) best = { msg, tag };
  }
  return best;
}

// ── Acknowledgement after the player resolved a unit's message ─────────────

/** Short spoken acknowledgements from a unit after the player resolved what it asked or reported. */
export const ACK_PHRASES = {
  et: [
    'Ee, selge.',
    'Aa, okei.',
    'Selge-selge.',
    'Sain aru.',
    'Jah, nägin.',
    'Okei, liigume.',
    'Hästi.',
    'Mhm, selge.',
    'Aa, selge siis.',
    'Okei, sain.',
  ],
  en: ['Uh, copy.', 'Okay.', 'Got it.', 'Roger that.', 'Copy that.', 'Ah, okay.', 'Understood.'],
} as const;

/** How often a resolved message is followed by an acknowledgement (otherwise silence). */
export const ACK_CHANCE = 0.6;
/** At most one acknowledgement per unit in this much game time (ms). */
export const ACK_COOLDOWN_MS = 20_000;

/**
 * The acknowledgement to say, or null for silence: never at 4x and faster or while paused, never
 * when a more important line (`waiting`: reply needed or emergency) waits, ~60 % of the time
 * otherwise, and never the same phrase twice in a row.
 */
export function pickAck(
  lang: 'et' | 'en',
  o: { speedIndex: number; waiting: number; last?: string; rnd?: () => number },
): string | null {
  const rnd = o.rnd ?? Math.random;
  if (o.speedIndex <= 0 || o.speedIndex >= 3 || o.waiting > 0) return null;
  if (rnd() >= ACK_CHANCE) return null;
  const list = ACK_PHRASES[lang].filter((p) => p !== o.last);
  return list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
}

/** A message spoken by a unit (not the dispatcher, not Häirekeskus, not another agency). */
export function isUnitMsg(m: RadioMsg): boolean {
  return !!m.unitId && m.from !== 'JK' && m.from !== 'HK';
}

/** Does this unit message still wait for the player (a reply, or the beat it opened)? */
function isOpenAsk(sim: SimState, m: RadioMsg): boolean {
  if (!isUnitMsg(m) || m.answered) return false;
  if (m.replies?.length && !(m.expiresAt !== undefined && sim.now > m.expiresAt)) return true;
  const inc = m.incidentId ? sim.incidents[m.incidentId] : undefined;
  return !!inc?.beats?.some((b) => b.radioId === m.id && b.status === 'active');
}

/** Ids of the unit messages that wait for the player now (snapshot before a player command). */
export function openUnitAsks(sim: SimState): Set<string> {
  const out = new Set<string>();
  for (const m of sim.radio) if (isOpenAsk(sim, m)) out.add(m.id);
  return out;
}

/**
 * The unit messages that were open in `before` and are not any more. Taken around a player command
 * (no game time passes), so whatever closed them was the player, never a timeout or the unit itself.
 */
export function resolvedSince(sim: SimState, before: ReadonlySet<string>): RadioMsg[] {
  const out: RadioMsg[] = [];
  if (!before.size) return out;
  for (const m of sim.radio) if (before.has(m.id) && !isOpenAsk(sim, m)) out.push(m);
  return out;
}

/**
 * Which resolved message gets an acknowledgement and with what phrase, or null: the first unit
 * message whose unit has not acknowledged in the last ACK_COOLDOWN_MS of game time, subject to
 * pickAck (speed, chance, no repeat) and no more important line (reply needed, emergency) playing
 * or waiting, other than the resolved ones themselves.
 */
export function pickResolvedAck(
  sim: SimState,
  resolved: readonly RadioMsg[],
  o: {
    lang: 'et' | 'en';
    speedIndex: number;
    /** Tags of the line playing and the waiting ones. */
    queued: readonly SpeechTag[];
    last?: string;
    /** Game time of each unit's last acknowledgement. */
    lastAt: ReadonlyMap<string, number>;
    rnd?: () => number;
  },
): { msg: RadioMsg; phrase: string } | null {
  const msg = resolved.find((m) => {
    if (!isUnitMsg(m)) return false;
    const at = o.lastAt.get(m.unitId as string);
    return at === undefined || sim.now - at >= ACK_COOLDOWN_MS || sim.now < at;
  });
  if (!msg) return null;
  const ids = new Set(resolved.map((m) => m.id));
  const waiting = o.queued.filter((t) => t.prio >= PRIO.reply && !ids.has(t.msgId) && !isStale(sim, t)).length;
  const phrase = pickAck(o.lang, { speedIndex: o.speedIndex, waiting, last: o.last, rnd: o.rnd });
  return phrase ? { msg, phrase } : null;
}
