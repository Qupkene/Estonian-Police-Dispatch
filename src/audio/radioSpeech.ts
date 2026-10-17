// Which radio lines the voice reads, and when a line is no longer worth reading. Owned by ui-shell.
// Pure functions over the sim state, no DOM: tests/speech-tts.test.ts.
//
// - Each spoken line carries a tag: the radio message, its incident and unit, and the unit's status
//   when it was said. A line goes stale (and is dropped or cut) once the player has answered the
//   message, the beat it asks about is over, the incident was closed after it, Häirekeskus asked for
//   units that are now sent, or the unit has moved on to another status.
// - The faster the game runs, the less is read: at 2x only lines that need a reply or matter
//   (pursuit, officer in danger, backup request, P1) with at most one waiting; at 4x and faster only
//   lines that need a reply and emergencies. Paused: nothing.
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
  if (speedIndex === 1) return PRIO.routine;
  if (speedIndex === 2) return PRIO.important;
  return PRIO.reply;
}

/** Is a line of this priority read at this speed step? */
export function speakableAt(prio: SpeechPrio, speedIndex: number): boolean {
  const min = minPrioAt(speedIndex);
  return min !== null && prio >= min;
}

/** Lines that may wait behind the one playing (undefined = the queue's own limit). */
export function maxWaitingAt(speedIndex: number): number | undefined {
  return speedIndex >= 2 ? 1 : undefined;
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
