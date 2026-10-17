/**
 * Player command wrappers: run an engine command against the live sim, bump the store so the UI
 * refreshes immediately, and turn exceptions into an error toast instead of a crash.
 */
import * as C from '@/sim/commands';
import { useGame } from '@/store/game';
import type { Agency, Priority, SimState, Text } from '@/sim/types';
import { activeBackup, bestFor, selQueue, selRecs, type QuerySubject } from './data';
import { useGameUi } from './uiStore';

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Run a command. Returns the command's result, or undefined if there is no sim or it threw. */
export function run<T>(fn: (s: SimState) => T): T | undefined {
  const g = useGame.getState();
  const s = g.sim;
  if (!s) return undefined;
  try {
    const r = fn(s);
    useGame.getState().bump();
    return r;
  } catch (err) {
    console.error('[EPD game] command failed', err);
    useGameUi.getState().pushToast({ kind: 'error', title: 'game.toast.error', text: errText(err) });
    useGame.getState().bump();
    return undefined;
  }
}

export function acknowledge(incidentId: string) {
  run((s) => C.acknowledge(s, incidentId));
}

/** Acknowledge the selected incident if it is incoming, otherwise the oldest incoming one. */
export function acknowledgeNext(): string | undefined {
  const g = useGame.getState();
  const s = g.sim;
  if (!s) return undefined;
  const sel = g.selection.incidentId ? s.incidents[g.selection.incidentId] : undefined;
  let target = sel && sel.state === 'incoming' ? sel : undefined;
  if (!target) {
    const incoming = selQueue(s)
      .filter((i) => i.state === 'incoming')
      .sort((a, b) => a.createdAt - b.createdAt);
    target = incoming[0];
  }
  if (!target) return undefined;
  acknowledge(target.id);
  // Select it so the next D dispatches to it (A → D → A → D works through the queue).
  selectIncident(target.id);
  return target.id;
}

export function setPriority(incidentId: string, p: Priority) {
  run((s) => C.setPriority(s, incidentId, p));
}

export function dispatch(incidentId: string, unitIds: string[]): { ok: boolean; reason?: Text | string } {
  if (!unitIds.length) return { ok: false };
  const ui = useGameUi.getState();
  const r = run((s) => C.dispatchUnits(s, incidentId, unitIds));
  if (!r) return { ok: false };
  if (r.ok) {
    ui.clearPicks(incidentId);
    ui.set({ dispatchError: { ...useGameUi.getState().dispatchError, [incidentId]: undefined } });
  } else {
    ui.set({ dispatchError: { ...useGameUi.getState().dispatchError, [incidentId]: r.reason ?? 'game.inc.dispatchFailed' } });
  }
  return r;
}

/**
 * D hotkey / "Saada": send the picked units, or the automatic pick (bestFor) when nothing is
 * picked. With no automatic pick (need already covered, only specialists or ferry crossings left)
 * it sends nothing and says so: the player picks by hand.
 */
export function dispatchPicked(incidentId: string): boolean {
  const s = useGame.getState().sim;
  if (!s || !s.incidents[incidentId] || s.incidents[incidentId].state === 'closed') return false;
  const picks = useGameUi.getState().picks[incidentId] ?? [];
  if (picks.length) return dispatch(incidentId, picks).ok;
  const best = bestFor(selRecs(s, incidentId));
  if (!best) {
    useGameUi.getState().set({
      dispatchError: { ...useGameUi.getState().dispatchError, [incidentId]: 'game.inc.noneAvailable' },
    });
    return false;
  }
  return dispatch(incidentId, [best.unit.id]).ok;
}

/** "Saada abi!": send the best unit matching the active backup request. */
export function sendBackup(incidentId: string): boolean {
  const s = useGame.getState().sim;
  const inc = s?.incidents[incidentId];
  if (!s || !inc) return false;
  const bk = activeBackup(s, inc);
  const best = bestFor(selRecs(s, incidentId), bk?.need.type);
  if (!best) {
    useGameUi.getState().pushToast({ kind: 'error', title: 'game.inc.noneAvailable', incidentId });
    return false;
  }
  return dispatch(incidentId, [best.unit.id]).ok;
}

export function recallUnit(unitId: string) {
  run((s) => C.recallUnit(s, unitId));
}

export function closeIncident(incidentId: string, how: 'referral' | 'phone' | 'duplicate' | 'prank', agency?: Agency) {
  run((s) => C.closeIncident(s, incidentId, how, agency));
}

export function requestAgency(incidentId: string, agency: Agency) {
  run((s) => C.requestAgency(s, incidentId, agency));
}

export function replyRadio(msgId: string, replyId: string) {
  run((s) => C.replyRadio(s, msgId, replyId));
}

export function setUnitBreak(unitId: string, onBreak: boolean) {
  run((s) => C.setUnitBreak(s, unitId, onBreak));
}

export function pursuitAction(incidentId: string, a: 'terminate' | 'heli' | 'spikes') {
  run((s) => C.pursuitAction(s, incidentId, a));
}

/** Open a registry record and mark it checked on the incident it belongs to. */
export function checkRecord(sub: QuerySubject) {
  const g = useGame.getState();
  g.openRegistry(sub.kind, sub.q);
  if (sub.incidentId && (sub.personId || sub.plate)) {
    const ref = sub.kind === 'person' ? { personId: sub.personId } : { plate: sub.plate };
    const s = g.sim;
    if (!s) return;
    try {
      C.markChecked(s, sub.incidentId, ref);
    } catch (err) {
      // markChecked is cosmetic; fall back to flagging the reference locally.
      const inc = s.incidents[sub.incidentId];
      if (inc) {
        if (sub.personId) inc.persons.forEach((p) => p.personId === sub.personId && (p.checked = true));
        if (sub.plate) inc.vehicles.forEach((v) => v.plate === sub.plate && (v.checked = true));
      }
      console.warn('[EPD game] markChecked unavailable', errText(err));
    }
    g.bump();
  }
}

export function selectIncident(id: string, opts: { focus?: boolean } = {}) {
  const g = useGame.getState();
  g.select({ incidentId: id }, 'incident');
  useGameUi.getState().set({ queueCursor: id });
  if (opts.focus) {
    const inc = g.sim?.incidents[id];
    if (inc) g.focusMap(inc.location.coord, 14);
  }
}

export function selectUnit(id: string, opts: { focus?: boolean } = {}) {
  const g = useGame.getState();
  g.select({ ...g.selection, unitId: id }, 'unit');
  if (opts.focus) {
    const u = g.sim?.units[id];
    if (u) g.focusMap(u.pos, 14);
  }
}
