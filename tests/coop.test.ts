/**
 * Mitmikmängu ühisvahetus (src/sim/coop.ts, docs/MULTIPLAYER.md 4 and 5): lockstep determinism, the permission
 * matrix, seats leaving and coming back, the digest, and the co-op XP.
 *
 * The lockstep test plays a whole shift in every prefecture: a bot reads client A's state each turn and issues the
 * commands three seats would (call-taker, dispatcher, radio), stamped two turns ahead like the server does; client
 * B gets the same log and never looks at A. A third client joins from a JSON copy of A halfway (a snapshot). All
 * three must keep the same digest every turn until the shift ends, and build the same report.
 */
import { describe, expect, it } from 'vitest';
import { createShift, finalizeShift } from '@/sim/engine';
import { roomShiftOptions, type RoomShift } from '@/sim/room';
import { pendingRadio, queue, recommendUnits } from '@/sim/selectors';
import {
  applyCommand,
  beginTurn,
  CALL_SPEED,
  coopPaidKey,
  coopReport,
  coopXp,
  emptySeatStats,
  initCoop,
  INPUT_DELAY,
  roleHolders,
  rolesOf,
  runTurn,
  SERVER_SEAT,
  simDigest,
  stepPiece,
  TURN_PIECES,
  TURN_SPEEDS,
  turnGameMs,
  type LogCmd,
} from '@/sim/coop';
import { SPEEDS } from '@/store/game';
import type { RegionId, SimState } from '@/sim/types';

/** Whole prefectures with a seed whose two evening hours bring 112 calls everywhere. */
const REGIONS: { regionId: RegionId; sector: string }[] = [
  { regionId: 'pohja', sector: '' },
  { regionId: 'ida', sector: '' },
  { regionId: 'louna', sector: '' },
  { regionId: 'laane', sector: '' },
];
const LOCKSTEP_SEED = 31337;

function shiftFor(regionId: RegionId, sector: string, seed = 424242): RoomShift {
  return {
    code: 'K7M2QX',
    seed,
    day: '2026-10-20',
    options: { regionId, sector, difficulty: 'normal', hours: 2, slot: 'evening' },
  };
}

/** A fresh co-op client of the room's shift (what every browser builds before the log). */
function client(shift: RoomShift): SimState {
  const s = createShift(roomShiftOptions(shift, `Meeskond ${shift.code}`));
  s.flags.room = shift.code;
  initCoop(s, shift.code);
  return s;
}

const SETUP = (
  seats: [number, string, string][] = [
    [0, 'dispatch', 'Hanna'],
    [1, 'calls', 'Ivo'],
    [2, 'radio', 'Jaan'],
  ],
  host = 0,
): LogCmd => ({
  id: 1,
  t: 0,
  s: SERVER_SEAT,
  k: 'setup',
  a: [host, seats],
});

/** The server: numbers commands and stamps them two turns after the turn they were posted in. */
class Sequencer {
  log: LogCmd[] = [];
  private id = 1;
  constructor(setup: LogCmd) {
    this.log.push(setup);
  }
  post(turn: number, seat: number, k: string, a: unknown[]): void {
    this.log.push({ id: ++this.id, t: turn + INPUT_DELAY, s: seat, k, a });
  }
  turn(t: number): LogCmd[] {
    return this.log.filter((x) => x.t === t);
  }
}

/** What three diligent players would do at this moment (reads A only). */
function bot(s: SimState, seq: Sequencer, turn: number, issued: Set<string>): void {
  const once = (key: string, seat: number, k: string, a: unknown[]) => {
    if (issued.has(key)) return;
    issued.add(key);
    seq.post(turn, seat, k, a);
  };
  if (turn === 100) once('speed:2', 0, 'speed', [2]);
  if (turn === 160) once('speed:1', 0, 'speed', [1]);
  // Kõnevastuvõtja (seat 1): answer, ask where and what, then create the incident at its true priority.
  for (const call of s.calls) {
    if (call.endedAt) continue;
    if (!call.answeredAt) once(`answer:${call.id}`, 1, 'answer', [call.id]);
    else if (!call.asked.includes('where')) once(`where:${call.id}`, 1, 'ask', [call.id, 'where']);
    else if (!call.asked.includes('what')) once(`what:${call.id}`, 1, 'ask', [call.id, 'what']);
    else {
      const inc = s.incidents[call.incidentId];
      once(`end:${call.id}`, 1, 'endcall', [
        call.id,
        call.prank ? 'prank' : 'create',
        inc?.truePriority ?? 3,
        '',
      ]);
    }
  }
  // Dispetšer (seat 0): acknowledge, send the best crew.
  for (const inc of queue(s)) {
    if (inc.state === 'incoming') once(`ack:${inc.id}`, 0, 'ack', [inc.id]);
    else if (inc.state === 'queued' && !inc.assigned.length) {
      const best = recommendUnits(s, inc.id).find(
        (r) => r.fit === 'ideal' || r.fit === 'need' || r.fit === 'weak',
      );
      if (best) once(`send:${inc.id}:${turn >> 3}`, 0, 'send', [inc.id, [best.unit.id]]);
    }
  }
  // Raadio ja registrid (seat 2): answer the crews, run a query now and then.
  for (const m of pendingRadio(s)) once(`reply:${m.id}`, 2, 'reply', [m.id, m.replies![0].id]);
  if (turn % 97 === 5) once(`q:${turn}`, 2, 'q', ['person', 'Tamm']);
  // Out of role: the call-taker tries to send a crew (refused everywhere alike).
  if (turn % 131 === 7) {
    const inc = queue(s)[0];
    const u = s.unitOrder[0];
    if (inc && u) once(`bad:${turn}`, 1, 'send', [inc.id, [u]]);
  }
  if (turn % 211 === 11) once(`ping:${turn}`, turn % 3, 'ping', [`Kontroll ${turn}`]);
}

describe('co-op lockstep', () => {
  let callsAnswered = 0;
  it('uses the single-player speeds and splits every turn evenly', () => {
    expect([...TURN_SPEEDS]).toEqual([...SPEEDS]);
    for (const sp of [...TURN_SPEEDS, CALL_SPEED]) expect(((sp * 1000) / TURN_PIECES) % 1).toBe(0);
  });

  for (const { regionId, sector } of REGIONS) {
    it(
      `keeps two clients and a late joiner hash-equal for a whole shift: ${regionId}`,
      { timeout: 120_000 },
      () => {
        const shift = shiftFor(regionId, sector, LOCKSTEP_SEED);
        const a = client(shift);
        const b = client(shift);
        const seq = new Sequencer(SETUP());
        const issued = new Set<string>();
        let c: SimState | null = null;
        let turn = 0;
        for (; turn < 30_000 && !a.ended; turn++) {
          bot(a, seq, turn, issued);
          const cmds = seq.turn(turn);
          runTurn(a, cmds);
          // B steps the same turn in pieces, as the browser does between frames.
          const plan = beginTurn(b, cmds);
          for (let i = 0; i < TURN_PIECES; i++) stepPiece(b, plan, i);
          if (c) runTurn(c, cmds);
          if (turn === 150) c = JSON.parse(JSON.stringify(a)) as SimState;
          if (turn % 10 === 0) {
            const h = simDigest(a);
            expect(simDigest(b), `turn ${turn}`).toBe(h);
            if (c) expect(simDigest(c), `turn ${turn} (joined)`).toBe(h);
          }
        }
        expect(a.ended, 'the shift ends').toBe(true);
        expect(b.ended).toBe(true);
        expect(simDigest(b)).toBe(simDigest(a));
        expect(simDigest(c!)).toBe(simDigest(a));
        expect(a.stats.incidents).toBeGreaterThan(3);
        expect(a.stats.callsAnswered).toBeGreaterThan(0);
        const st = a.coop!.stats;
        callsAnswered += st['1'].calls;
        expect(st['1'].calls).toBe(a.stats.callsAnswered);
        expect(st['0'].sent).toBeGreaterThan(0);
        // Same state, same report: score, grade and every seat's counters.
        const ra = finalizeShift(a);
        const rb = finalizeShift(b);
        expect(rb.score).toBe(ra.score);
        expect(rb.grade).toBe(ra.grade);
        expect(rb.stats).toEqual(ra.stats);
        expect(coopReport(b)).toEqual(coopReport(a));
      },
    );
  }

  it('had the call-taker answer 112 calls along the way', () => {
    expect(callsAnswered).toBeGreaterThan(0);
  });
});

describe('co-op commands', () => {
  const fresh = () => {
    const s = client(shiftFor('louna', 'louna-tartu', 777));
    applyCommand(s, SETUP());
    return s;
  };

  it('sets up seats and roles from the server’s first command only', () => {
    const s = fresh();
    expect(s.coop!.seats.map((x) => [x.seat, x.role, x.present])).toEqual([
      [0, 'dispatch', true],
      [1, 'calls', true],
      [2, 'radio', true],
    ]);
    expect(applyCommand(s, { id: 9, t: 1, s: 0, k: 'setup', a: [0, []] })).toMatchObject({
      ok: false,
      denied: true,
    });
    expect(s.coop!.seats).toHaveLength(3);
  });

  it('checks the permission matrix inside the sim', () => {
    const s = client(shiftFor('pohja', '', 424242));
    applyCommand(s, SETUP());
    for (let i = 0; i < 700 && !s.calls.length; i++) runTurn(s, []);
    const call = s.calls[0];
    expect(call).toBeTruthy();
    // The dispatcher may not answer 112, the call-taker may.
    expect(applyCommand(s, { id: 10, t: 0, s: 0, k: 'answer', a: [call.id] })).toMatchObject({
      denied: true,
    });
    expect(call.answeredAt).toBeUndefined();
    expect(applyCommand(s, { id: 11, t: 0, s: 1, k: 'answer', a: [call.id] })).toMatchObject({ ok: true });
    expect(call.answeredAt).toBeDefined();
    // Only the host sets the speed.
    expect(applyCommand(s, { id: 12, t: 0, s: 1, k: 'speed', a: [4] })).toMatchObject({ denied: true });
    expect(s.coop!.speed).toBe(1);
    expect(applyCommand(s, { id: 13, t: 0, s: 0, k: 'speed', a: [4] })).toMatchObject({ ok: true });
    expect(s.coop!.speed).toBe(4);
    // A seat that is not in the room, unknown kinds and broken arguments are refused, never thrown.
    expect(applyCommand(s, { id: 14, t: 0, s: 3, k: 'ping', a: ['hei'] })).toMatchObject({ denied: true });
    expect(applyCommand(s, { id: 15, t: 0, s: 0, k: 'nuke', a: [] }).ok).toBe(false);
    expect(applyCommand(s, { id: 16, t: 0, s: 0, k: 'send', a: [null, 'x'] }).ok).toBe(false);
    expect(applyCommand(s, { id: 17, t: 0, s: 1, k: 'left', a: [0] })).toMatchObject({ denied: true });
    expect(s.coop!.stats['1'].denied).toBe(1);
    expect(s.coop!.lastCmd).toBe(17);
  });

  it('lets any player answer a crew’s registry query, but keeps the other radio replies at the radio desk', () => {
    const s = fresh();
    const unit = s.unitOrder[0];
    const reply = [{ id: 'clean', label: { et: 'Puhas', en: 'Clean' } }];
    const msg = (id: string, kind: 'query' | 'backup') => {
      s.radio.push({ id, t: s.now, from: 'PÕHJA 11', text: { et: 'Kontrollige', en: 'Check' }, level: 'routine', kind, unitId: unit, replies: reply as never });
    };
    msg('r9001', 'query');
    msg('r9002', 'backup');
    // The call-taker (seat 1) answers the query for the radio desk...
    expect(applyCommand(s, { id: 40, t: 0, s: 1, k: 'reply', a: ['r9001', 'clean'] })).toMatchObject({ ok: true });
    expect(s.radio.find((m) => m.id === 'r9001')!.answered).toBe('clean');
    // A second reply is a correction: refused for a message with no query behind it, and never thrown.
    expect(applyCommand(s, { id: 43, t: 0, s: 0, k: 'reply', a: ['r9001', 'wanted'] }).ok).toBe(false);
    expect(s.radio.find((m) => m.id === 'r9001')!.answered).toBe('clean');
    // ...but a backup request stays the radio desk's.
    expect(applyCommand(s, { id: 41, t: 0, s: 1, k: 'reply', a: ['r9002', 'clean'] })).toMatchObject({ denied: true });
    // Marking a record as checked is anybody's too.
    const inc = s.incidentOrder[0];
    if (inc) expect(applyCommand(s, { id: 42, t: 0, s: 1, k: 'check', a: [inc, '', ''] }).denied).toBeUndefined();
  });

  it('hands a role over while its seat is away and gives it back', () => {
    const s = fresh();
    const c = s.coop!;
    expect(rolesOf(c, 0)).toEqual(['dispatch']);
    applyCommand(s, { id: 2, t: 0, s: SERVER_SEAT, k: 'left', a: [2] });
    expect(rolesOf(c, 0)).toEqual(['dispatch', 'radio']);
    applyCommand(s, { id: 3, t: 0, s: SERVER_SEAT, k: 'left', a: [1] });
    // With one player left, they hold every desk.
    expect(rolesOf(c, 0)).toEqual(['calls', 'dispatch', 'radio']);
    applyCommand(s, { id: 4, t: 0, s: SERVER_SEAT, k: 'back', a: [1] });
    expect(roleHolders(c, 'calls')).toEqual([1]);
    expect(roleHolders(c, 'radio')).toEqual([0]);
    applyCommand(s, { id: 5, t: 0, s: SERVER_SEAT, k: 'host', a: [1] });
    expect(c.host).toBe(1);
    expect(applyCommand(s, { id: 6, t: 0, s: 0, k: 'speed', a: [0] })).toMatchObject({ denied: true });
  });

  it('keeps two call-takers to their own calls', () => {
    const s = client(shiftFor('pohja', '', 424242));
    applyCommand(
      s,
      SETUP([
        [0, 'calls', 'A'],
        [1, 'calls', 'B'],
        [2, 'dispatch', 'C'],
      ]),
    );
    for (let i = 0; i < 700 && !s.calls.length; i++) runTurn(s, []);
    const call = s.calls[0];
    expect(applyCommand(s, { id: 20, t: 0, s: 1, k: 'answer', a: [call.id] }).ok).toBe(true);
    expect(applyCommand(s, { id: 21, t: 0, s: 0, k: 'answer', a: [call.id] }).ok).toBe(false);
    expect(applyCommand(s, { id: 22, t: 0, s: 0, k: 'ask', a: [call.id, 'where'] })).toMatchObject({
      denied: true,
    });
    expect(applyCommand(s, { id: 23, t: 0, s: 1, k: 'ask', a: [call.id, 'where'] }).ok).toBe(true);
  });

  it('slows the shared clock while a call is open and stops when paused or over', () => {
    const s = client(shiftFor('pohja', '', 424242));
    applyCommand(s, SETUP());
    expect(turnGameMs(s)).toBe(15_000);
    applyCommand(s, { id: 30, t: 0, s: 0, k: 'speed', a: [4] });
    expect(turnGameMs(s)).toBe(120_000);
    applyCommand(s, { id: 29, t: 0, s: 0, k: 'speed', a: [1] });
    for (let i = 0; i < 700 && !s.calls.some((x) => !x.endedAt); i++) runTurn(s, []);
    applyCommand(s, { id: 30, t: 0, s: 0, k: 'speed', a: [4] });
    expect(turnGameMs(s)).toBe(CALL_SPEED * 1000);
    applyCommand(s, { id: 31, t: 0, s: 0, k: 'speed', a: [0] });
    const now = s.now;
    runTurn(s, []);
    expect(s.now).toBe(now);
    applyCommand(s, { id: 32, t: 0, s: 0, k: 'speed', a: [1] });
    applyCommand(s, { id: 33, t: 0, s: 0, k: 'end', a: [] });
    expect(s.ended).toBe(true);
    expect(turnGameMs(s)).toBe(0);
    expect(applyCommand(s, { id: 34, t: 0, s: 0, k: 'ping', a: ['x'] }).ok).toBe(false);
  });

  it('applies a turn’s commands once, in id order', () => {
    const s = fresh();
    const cmds: LogCmd[] = [
      { id: 5, t: 0, s: 0, k: 'speed', a: [3] },
      { id: 4, t: 0, s: 0, k: 'speed', a: [2] },
    ];
    runTurn(
      s,
      [...cmds].sort((x, y) => x.id - y.id),
    );
    expect(s.coop!.speed).toBe(3);
    expect(s.coop!.turn).toBe(0);
    // A command already applied (a replay after a snapshot) is skipped.
    const again = beginTurn(s, [{ id: 5, t: 1, s: 0, k: 'speed', a: [1] }]);
    expect(again.results.size).toBe(0);
    expect(s.coop!.speed).toBe(3);
  });

  it('logs registry queries only through the room command', () => {
    const s = fresh();
    const before = s.stats.queries;
    applyCommand(s, { id: 40, t: 0, s: 1, k: 'q', a: ['person', 'Tamm'] });
    expect(s.stats.queries).toBe(before + 1);
    expect(s.coop!.stats['1'].queries).toBe(1);
  });

  it('notices drift in the digest and survives a JSON round trip', () => {
    const s = fresh();
    for (let i = 0; i < 30; i++) runTurn(s, []);
    const h = simDigest(s);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(simDigest(JSON.parse(JSON.stringify(s)))).toBe(h);
    const t = JSON.parse(JSON.stringify(s)) as SimState;
    t.rng ^= 1;
    expect(simDigest(t)).not.toBe(h);
    const u = JSON.parse(JSON.stringify(s)) as SimState;
    u.trust += 3;
    expect(simDigest(u)).not.toBe(h);
  });

  it('gives each player the team XP plus a capped share of their own work', () => {
    const own = { ...emptySeatStats(), calls: 4, created: 3, sent: 5 };
    expect(coopXp({ xp: 200 }, own)).toBe(200 + 4 * 2 + 3 * 3 + 5 * 2);
    expect(coopXp({ xp: 20 }, own)).toBe(30);
    expect(coopXp({ xp: 200 }, undefined)).toBe(200);
    expect(coopPaidKey('K7M2QX')).toBe('room:K7M2QX');
  });
});
