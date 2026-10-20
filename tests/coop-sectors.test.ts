/**
 * Sektorite koostöö (sector co-op, src/sim/desks.ts, docs/MULTIPLAYER.md section 8): each seat runs one sector's
 * desk of the same prefecture over the lockstep core.
 *
 * The lockstep test plays a whole shift in every prefecture with three desks and two players, so one desk is the AI
 * colleague's: a bot reads client A each turn and issues what each desk's player would (answer their own 112 calls,
 * acknowledge and send their own crews, ask a neighbour for a crew when none of theirs is free, answer the lend
 * requests and hand-over offers that reach them), stamped two turns ahead like the server; client B steps the same
 * log in pieces and a third client joins from a JSON copy halfway. All three keep the same digest every ten turns and
 * build the same report. Then: the permission check by desk, lending (ask, offer, decline, lapse, the colleague's
 * answer), help counting, the pursuit hand-over between players, and a player leaving and coming back.
 */
import { describe, expect, it } from 'vitest';
import { REGIONS } from '@/data/regions';
import { TEMPLATES } from '@/data/incidents';
import { createShift, finalizeShift } from '@/sim/engine';
import { publishIncident } from '@/sim/internal';
import { startPursuit } from '@/sim/pursuit';
import { createIncident } from '@/sim/spawner';
import { roomShiftOptions, type RoomShift } from '@/sim/room';
import { pendingRadio, queue, recommendUnits } from '@/sim/selectors';
import {
  applyCommand,
  beginTurn,
  coopReport,
  coopXp,
  emptySeatStats,
  initCoop,
  INPUT_DELAY,
  runTurn,
  SERVER_SEAT,
  simDigest,
  stepPiece,
  TURN_PIECES,
  type LogCmd,
} from '@/sim/coop';
import {
  addableDesks,
  callDesk,
  connected,
  defaultDesks,
  deskHolders,
  heldDesks,
  incidentDesk,
  LEND_TURNS,
  removableDesk,
  unitDesk,
  validDesks,
} from '@/sim/desks';
import { sectorAt, sectorsOf } from '@/sim/sectors';
import type { Incident, LngLat, RegionId, SimState } from '@/sim/types';

const ROOMS: { regionId: RegionId; desks: string[] }[] = [
  { regionId: 'pohja', desks: ['pohja-kesklinn', 'pohja-lasnamae', 'pohja-idaharju'] },
  { regionId: 'ida', desks: ['ida-narva', 'ida-johvi', 'ida-laaneviru'] },
  { regionId: 'louna', desks: ['louna-tartu', 'louna-tartumaa', 'louna-jogeva'] },
  { regionId: 'laane', desks: ['laane-parnu', 'laane-parnumaa', 'laane-jarva'] },
];
const SEED = 31337;

function shiftFor(regionId: RegionId, desks: string[], seed = SEED, hours = 2): RoomShift {
  return {
    code: 'S3K7RT',
    mode: 'sector',
    seed,
    day: '2026-10-20',
    options: { regionId, sector: desks[0], desks, difficulty: 'normal', hours, slot: 'evening' },
  };
}

function client(shift: RoomShift): SimState {
  const s = createShift(roomShiftOptions(shift, `Meeskond ${shift.code}`));
  s.flags.room = shift.code;
  initCoop(s, shift.code, 'sector', shift.options.desks);
  return s;
}

/** Two players at the first two desks; the third desk is nobody's (its AI colleague runs it). */
const setup = (
  desks: string[],
  rows: [number, string, string][] = [
    [0, desks[0], 'Hanna'],
    [1, desks[1], 'Ivo'],
  ],
): LogCmd => ({ id: 1, t: 0, s: SERVER_SEAT, k: 'setup', a: [0, rows] });

class Sequencer {
  log: LogCmd[] = [];
  private id = 1;
  constructor(first: LogCmd) {
    this.log.push(first);
  }
  post(turn: number, seat: number, k: string, a: unknown[]): number {
    this.log.push({ id: ++this.id, t: turn + INPUT_DELAY, s: seat, k, a });
    return this.id;
  }
  turn(t: number): LogCmd[] {
    return this.log.filter((x) => x.t === t);
  }
}

/** What each desk's player would do now (reads A only). */
function bot(s: SimState, seq: Sequencer, turn: number, issued: Set<string>): void {
  const c = s.coop!;
  const once = (key: string, seat: number, k: string, a: unknown[]) => {
    if (issued.has(key)) return;
    issued.add(key);
    seq.post(turn, seat, k, a);
  };
  if (turn === 90) once('speed:2', 0, 'speed', [2]);
  for (const x of c.seats) {
    if (!x.present || !x.desk) continue;
    const desk = x.desk;
    const seat = x.seat;
    for (const call of s.calls) {
      if (call.endedAt || callDesk(s, call) !== desk) continue;
      if (!call.answeredAt) once(`answer:${call.id}`, seat, 'answer', [call.id]);
      else if (!call.asked.includes('where')) once(`where:${call.id}`, seat, 'ask', [call.id, 'where']);
      else {
        const inc = s.incidents[call.incidentId];
        once(`end:${call.id}`, seat, 'endcall', [
          call.id,
          call.prank ? 'prank' : 'create',
          inc?.truePriority ?? 3,
          '',
        ]);
      }
    }
    for (const inc of queue(s)) {
      if (incidentDesk(s, inc) !== desk) continue;
      if (inc.state === 'incoming') once(`ack:${inc.id}`, seat, 'ack', [inc.id]);
      else if (inc.state === 'queued' && !inc.assigned.length) {
        const recs = recommendUnits(s, inc.id).filter(
          (r) => r.fit === 'ideal' || r.fit === 'need' || r.fit === 'weak',
        );
        const own = recs.find((r) => ['', desk].includes(unitDesk(s, r.unit)));
        // The nearest fitting crew is a neighbour's (or none of ours fits): ask for it.
        const top = recs[0];
        const asked = [...issued].some((k) => k.startsWith(`lend:${inc.id}:`));
        if (top && !asked && top.unit.status === 'available' && !['', desk].includes(unitDesk(s, top.unit)))
          once(`lend:${inc.id}:${top.unit.id}`, seat, 'lend', [inc.id, top.unit.id]);
        else if (own) once(`send:${inc.id}:${turn >> 3}`, seat, 'send', [inc.id, [own.unit.id]]);
      }
    }
    // Now and then a desk offers a free crew to a neighbour's incident that has none.
    if (turn % 37 === seat) {
      const theirs = queue(s).find(
        (i) =>
          i.state === 'queued' &&
          !i.assigned.length &&
          incidentDesk(s, i) !== desk &&
          heldDesks(c).includes(incidentDesk(s, i)),
      );
      const crew = s.unitOrder
        .map((id) => s.units[id])
        .find((u) => u.status === 'available' && !u.incidentId && unitDesk(s, u) === desk);
      if (theirs && crew) once(`offer:${theirs.id}`, seat, 'lend', [theirs.id, crew.id]);
    }
    // Lend requests to this desk: yes, except every third one.
    for (const req of c.sec!.lends)
      if (req.state === 'open' && req.to === desk)
        once(`ans:${req.id}`, seat, 'lendans', [req.id, req.id % 3 === 0 ? 0 : 1]);
    for (const m of pendingRadio(s)) {
      const inc = m.incidentId ? s.incidents[m.incidentId] : undefined;
      const unit = m.unitId ? s.units[m.unitId] : undefined;
      const d = unit && unitDesk(s, unit) ? unitDesk(s, unit) : inc ? incidentDesk(s, inc) : '';
      if (d && d !== desk) continue;
      // Hand-overs: give them to the neighbour.
      const reply = m.replies!.find((r) => r.id === 'handover') ?? m.replies![0];
      once(`reply:${m.id}`, seat, 'reply', [m.id, reply.id]);
    }
  }
  // Out of desk: seat 1 tries to acknowledge or send for seat 0's desk (refused everywhere alike).
  if (turn % 131 === 7) {
    const inc = queue(s).find((i) => incidentDesk(s, i) === c.seats[0].desk);
    if (inc) once(`bad:${turn}`, 1, 'ack', [inc.id]);
  }
  if (turn % 211 === 11) once(`ping:${turn}`, turn % 2, 'ping', [`Kontroll ${turn}`]);
}

describe('sector co-op lockstep', () => {
  let lends = 0;
  let offers = 0;
  let helped = 0;
  for (const { regionId, desks } of ROOMS) {
    it(
      `keeps two clients and a late joiner hash-equal for a whole shift: ${regionId}`,
      { timeout: 180_000 },
      () => {
        const shift = shiftFor(regionId, desks, SEED, 6);
        const a = client(shift);
        const b = client(shift);
        const seq = new Sequencer(setup(desks));
        const issued = new Set<string>();
        let c: SimState | null = null;
        for (let turn = 0; turn < 30_000 && !a.ended; turn++) {
          bot(a, seq, turn, issued);
          const cmds = seq.turn(turn);
          runTurn(a, cmds);
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
        expect(simDigest(b)).toBe(simDigest(a));
        expect(simDigest(c!)).toBe(simDigest(a));
        const sec = a.coop!.sec!;
        lends += sec.lends.filter((r) => r.state === 'accepted').length;
        offers += sec.lends.filter((r) => r.kind === 'offer').length;
        helped += a.coop!.stats['0'].helped + a.coop!.stats['1'].helped;
        // Every incident has a desk of the room; the AI desk's went back to its colleague.
        for (const id of a.incidentOrder) expect(desks).toContain(sec.incDesk[id]);
        const own = a.incidentOrder.filter((id) => a.incidents[id]?.closedBy !== 'colleague');
        expect(own.length).toBeGreaterThan(3);
        for (const id of own) expect([desks[0], desks[1]]).toContain(sec.incDesk[id]);
        const st = a.coop!.stats;
        expect(st['0'].sent + st['1'].sent).toBeGreaterThan(0);
        expect(st['1'].denied).toBeGreaterThan(0);
        const ra = finalizeShift(a);
        const rb = finalizeShift(b);
        expect(rb.score).toBe(ra.score);
        expect(rb.stats).toEqual(ra.stats);
        const rep = coopReport(a)!;
        expect(coopReport(b)).toEqual(rep);
        expect(rep.mode).toBe('sector');
        expect(rep.desks!.map((d) => d.desk)).toEqual(desks);
        expect(rep.desks![2].seats).toEqual([]);
        expect(rep.seats.map((x) => x.desk)).toEqual([desks[0], desks[1]]);
      },
    );
  }

  it('lent crews across borders and counted the help along the way', () => {
    expect(lends).toBeGreaterThan(0);
    expect(offers).toBeGreaterThan(0);
    expect(helped).toBeGreaterThan(0);
  });
});

describe('sector co-op desks', () => {
  it('accepts two to four neighbouring sectors of one prefecture only', () => {
    expect(validDesks('pohja', ['pohja-lasnamae', 'pohja-kesklinn'])).toEqual([
      'pohja-kesklinn',
      'pohja-lasnamae',
    ]);
    expect(validDesks('pohja', ['pohja-kesklinn'])).toBeNull();
    expect(validDesks('pohja', ['pohja-lasnamae', 'pohja-laaneharju'])).toBeNull();
    expect(validDesks('pohja', ['pohja-kesklinn', 'ida-narva'])).toBeNull();
    expect(
      validDesks('louna', ['louna-tartu', 'louna-tartumaa', 'louna-polva', 'louna-voru', 'louna-valga']),
    ).toBeNull();
    expect(validDesks('louna', ['louna-tartu', 'louna-tartu'])).toBeNull();
    for (const r of ['pohja', 'ida', 'louna', 'laane'] as RegionId[]) {
      const d = defaultDesks(r);
      expect(validDesks(r, d), r).toEqual(d);
      expect(connected(d)).toBe(true);
    }
    expect(addableDesks('pohja', ['pohja-lasnamae'])).toEqual(['pohja-kesklinn', 'pohja-idaharju']);
    expect(removableDesk(['pohja-laanetallinn', 'pohja-kesklinn', 'pohja-lasnamae'], 'pohja-kesklinn')).toBe(
      false,
    );
    expect(removableDesk(['pohja-laanetallinn', 'pohja-kesklinn', 'pohja-lasnamae'], 'pohja-lasnamae')).toBe(
      true,
    );
  });

  it('gives every crew a desk by its station and shares the on-call assets', () => {
    const desks = ['pohja-kesklinn', 'pohja-lasnamae', 'pohja-idaharju'];
    const s = client(shiftFor('pohja', desks));
    const per = new Map<string, number>();
    for (const id of s.unitOrder) {
      const u = s.units[id];
      const d = unitDesk(s, u);
      if (u.onCall) expect(d).toBe('');
      else expect(desks).toContain(d);
      per.set(d, (per.get(d) ?? 0) + 1);
    }
    for (const d of desks) expect(per.get(d), d).toBeGreaterThan(0);
  });
});

/** A fresh two-desk Tartu room, set up, run until `until` holds (or 900 turns). */
function tartu(until?: (s: SimState) => boolean, seed = 777): SimState {
  const desks = ['louna-tartu', 'louna-tartumaa'];
  const s = client(shiftFor('louna', desks, seed, 3));
  applyCommand(s, setup(desks));
  for (let i = 0; i < 900 && until && !until(s); i++) runTurn(s, []);
  return s;
}

let nextId = 100;
const cmd = (s: number, k: string, a: unknown[]): LogCmd => ({ id: ++nextId, t: 0, s, k, a });

function openOf(s: SimState, desk: string): Incident | undefined {
  return queue(s).find((i) => incidentDesk(s, i) === desk && !s.flags[`hidden:${i.id}`]);
}
const freeUnit = (s: SimState, desk: string) =>
  s.unitOrder
    .map((id) => s.units[id])
    .find((u) => u.status === 'available' && !u.incidentId && unitDesk(s, u) === desk);

describe('sector co-op commands', () => {
  it('lets a desk work only its own calls, incidents and crews', () => {
    const s = tartu((x) => !!openOf(x, 'louna-tartu') && !!openOf(x, 'louna-tartumaa'));
    const mine = openOf(s, 'louna-tartu')!;
    const theirs = openOf(s, 'louna-tartumaa')!;
    expect(mine && theirs).toBeTruthy();
    if (mine.state === 'incoming') {
      expect(applyCommand(s, cmd(1, 'ack', [mine.id]))).toMatchObject({ denied: true });
      expect(applyCommand(s, cmd(0, 'ack', [mine.id]))).toMatchObject({ ok: true });
    }
    // Sending a neighbour's crew is refused; the own crew goes.
    const ours = freeUnit(s, 'louna-tartu')!;
    const near = freeUnit(s, 'louna-tartumaa')!;
    expect(applyCommand(s, cmd(0, 'send', [mine.id, [near.id]]))).toMatchObject({ denied: true });
    expect(applyCommand(s, cmd(0, 'send', [theirs.id, [ours.id]]))).toMatchObject({ denied: true });
    expect(applyCommand(s, cmd(0, 'send', [mine.id, [ours.id]])).ok).toBe(true);
    expect(s.units[ours.id].incidentId).toBe(mine.id);
    expect(s.coop!.stats['0'].denied).toBeGreaterThanOrEqual(2);
  });

  it('lends a crew across the border on request: ask, accept, decline, offer', () => {
    const s = tartu((x) => !!openOf(x, 'louna-tartu') && !!openOf(x, 'louna-tartumaa'));
    const mine = openOf(s, 'louna-tartu')!;
    if (mine.state === 'incoming') applyCommand(s, cmd(0, 'ack', [mine.id]));
    const near = freeUnit(s, 'louna-tartumaa')!;
    // The incident's desk asks for the neighbour's crew; only the neighbour can answer.
    expect(applyCommand(s, cmd(0, 'lend', [mine.id, near.id])).ok).toBe(true);
    const req = s.coop!.sec!.lends.at(-1)!;
    expect(req).toMatchObject({ kind: 'ask', from: 'louna-tartu', to: 'louna-tartumaa', state: 'open' });
    expect(applyCommand(s, cmd(0, 'lendans', [req.id, 1]))).toMatchObject({ denied: true });
    expect(applyCommand(s, cmd(1, 'lendans', [req.id, 1])).ok).toBe(true);
    expect(req.state).toBe('accepted');
    expect(s.units[near.id].incidentId).toBe(mine.id);
    expect(s.coop!.stats['1'].lent).toBe(1);
    expect(s.coop!.stats['0'].borrowed).toBe(1);
    // A desk offers its own crew to a neighbour's incident; the neighbour declines.
    const theirs = openOf(s, 'louna-tartumaa')!;
    const ours = freeUnit(s, 'louna-tartu')!;
    expect(applyCommand(s, cmd(0, 'lend', [theirs.id, ours.id])).ok).toBe(true);
    const offer = s.coop!.sec!.lends.at(-1)!;
    expect(offer).toMatchObject({ kind: 'offer', to: 'louna-tartumaa' });
    expect(applyCommand(s, cmd(1, 'lendans', [offer.id, 0])).ok).toBe(true);
    expect(offer.state).toBe('declined');
    expect(s.units[ours.id].incidentId).toBeUndefined();
    // Neither desk's: refused. Same desk: nothing to lend.
    applyCommand(
      s,
      setup(
        ['louna-tartu', 'louna-tartumaa'],
        [
          [0, 'louna-tartu', 'Hanna'],
          [1, 'louna-tartumaa', 'Ivo'],
          [2, 'louna-tartu', 'Jaan'],
        ],
      ),
    );
    expect(applyCommand(s, cmd(0, 'lend', [mine.id, ours.id])).ok).toBe(false);
  });

  it('lets an unanswered request lapse and has the colleague of an empty desk answer', () => {
    const s = tartu((x) => !!openOf(x, 'louna-tartu'));
    const mine = openOf(s, 'louna-tartu')!;
    if (mine.state === 'incoming') applyCommand(s, cmd(0, 'ack', [mine.id]));
    const near = freeUnit(s, 'louna-tartumaa')!;
    applyCommand(s, cmd(0, 'lend', [mine.id, near.id]));
    const req = s.coop!.sec!.lends.at(-1)!;
    for (let i = 0; i <= LEND_TURNS && req.state === 'open'; i++) runTurn(s, []);
    expect(req.state).toBe('expired');
    // The neighbour leaves: their desk is the AI colleague's, which lends its free crew at once.
    applyCommand(s, { id: ++nextId, t: 0, s: SERVER_SEAT, k: 'left', a: [1] });
    expect(heldDesks(s.coop!)).toEqual(['louna-tartu']);
    expect(s.colleagues?.area).toEqual(['louna-tartu']);
    const inc = openOf(s, 'louna-tartu') ?? mine;
    const other = freeUnit(s, 'louna-tartumaa');
    if (other && inc.state !== 'closed') {
      expect(applyCommand(s, cmd(0, 'lend', [inc.id, other.id])).ok).toBe(true);
      const auto = s.coop!.sec!.lends.at(-1)!;
      expect(auto.by).toBe(-1);
      expect(['accepted', 'failed']).toContain(auto.state);
    }
  });

  it('runs a desk nobody holds through its AI colleague and gives it back', () => {
    const s = tartu();
    applyCommand(s, { id: ++nextId, t: 0, s: SERVER_SEAT, k: 'left', a: [1] });
    expect(deskHolders(s.coop!, 'louna-tartumaa')).toEqual([]);
    for (let i = 0; i < 900; i++) runTurn(s, []);
    const sec = s.coop!.sec!;
    // Nothing of the empty desk stays open without a crew, no 112 call of it rings, its colleague took them back.
    for (const inc of queue(s))
      if (incidentDesk(s, inc) === 'louna-tartumaa') expect(inc.assigned.length).toBeGreaterThan(0);
    for (const call of s.calls) if (!call.endedAt) expect(callDesk(s, call)).toBe('louna-tartu');
    expect(sec.taken['louna-tartumaa'] ?? 0).toBeGreaterThan(0);
    const taken = s.incidentOrder.filter(
      (id) => sec.incDesk[id] === 'louna-tartumaa' && s.incidents[id].closedBy === 'colleague',
    );
    expect(taken.length).toBe(sec.taken['louna-tartumaa']);
    // Back at the desk: its calls are the player's again.
    applyCommand(s, { id: ++nextId, t: 0, s: SERVER_SEAT, k: 'back', a: [1] });
    expect(heldDesks(s.coop!)).toEqual(['louna-tartu', 'louna-tartumaa']);
    const before = sec.taken['louna-tartumaa'];
    for (let i = 0; i < 300; i++) runTurn(s, []);
    expect(sec.taken['louna-tartumaa']).toBe(before);
  });

  it('counts a crew that reaches a neighbour’s incident as help for its seat', () => {
    const s = tartu((x) => !!openOf(x, 'louna-tartu'));
    const mine = openOf(s, 'louna-tartu')!;
    if (mine.state === 'incoming') applyCommand(s, cmd(0, 'ack', [mine.id]));
    const near = freeUnit(s, 'louna-tartumaa')!;
    applyCommand(s, cmd(0, 'lend', [mine.id, near.id]));
    applyCommand(s, cmd(1, 'lendans', [s.coop!.sec!.lends.at(-1)!.id, 1]));
    expect(s.units[near.id].incidentId).toBe(mine.id);
    expect(s.coop!.stats['1'].helped).toBe(0);
    for (let i = 0; i < 600 && s.units[near.id].status === 'enroute'; i++) runTurn(s, []);
    expect(s.units[near.id].status).not.toBe('enroute');
    // Counted once, for the lender's seat, however long the crew stays.
    expect(s.coop!.stats['1'].helped).toBe(1);
    for (let i = 0; i < 20; i++) runTurn(s, []);
    expect(s.coop!.stats['1'].helped).toBe(1);
    expect(s.coop!.stats['0'].helped).toBe(0);
    expect(coopXp({ xp: 200 }, { ...emptySeatStats(), helped: 1, lent: 1 })).toBe(205);
  });

  it('offers a pursuit that runs into a neighbour’s sector to that player and hands it over', () => {
    const { s, inc } = pursuitInto(['louna-tartu', 'louna-tartumaa']);
    const units = [...inc.assigned];
    runTurn(s, []);
    const offer = s.coop!.sec!.handover[inc.id];
    expect(offer?.desk).toBe('louna-tartumaa');
    const msg = s.radio.find((m) => m.id === offer.msg)!;
    expect(msg.replies!.map((r) => r.id)).toEqual(['handover', 'keep']);
    expect(msg.from).toBe('JK TARTUMAA');
    expect(msg.text.et).toContain('Ivo');
    // The single-player colleague does not offer it too: the neighbour is a player.
    expect(s.colleagues!.handover[inc.id]).toBeUndefined();
    // Only the incident's desk answers it; handing over moves the incident, the crews stay on it.
    expect(applyCommand(s, cmd(1, 'reply', [msg.id, 'handover']))).toMatchObject({ denied: true });
    expect(applyCommand(s, cmd(0, 'reply', [msg.id, 'handover'])).ok).toBe(true);
    expect(incidentDesk(s, inc)).toBe('louna-tartumaa');
    expect(inc.state).not.toBe('closed');
    expect(inc.assigned).toEqual(units);
    expect(s.coop!.stats['0'].handover).toBe(1);
    expect(s.coop!.stats['1'].takeover).toBe(1);
    // Now it is the neighbour's: they work it, the old desk does not.
    expect(applyCommand(s, cmd(0, 'prio', [inc.id, 1]))).toMatchObject({ denied: true });
    expect(applyCommand(s, cmd(1, 'prio', [inc.id, 1])).ok).toBe(true);
    // Asked once per pursuit.
    for (let i = 0; i < 5; i++) runTurn(s, []);
    expect(
      s.radio.filter((m) => m.incidentId === inc.id && m.replies?.some((r) => r.id === 'handover')).length,
    ).toBe(1);
  });

  it('leaves a pursuit into a desk nobody holds to that desk’s colleague', () => {
    const { s, inc } = pursuitInto(['louna-tartu', 'louna-tartumaa'], [[0, 'louna-tartu', 'Hanna']]);
    runTurn(s, []);
    expect(s.coop!.sec!.handover[inc.id]).toBeUndefined();
    const offer = s.colleagues!.handover[inc.id];
    expect(offer?.desk).toBe('louna-tartumaa');
    expect(applyCommand(s, cmd(0, 'reply', [offer.msg, 'handover'])).ok).toBe(true);
    expect(inc.closedBy).toBe('colleague');
    expect(inc.pursuit!.ended).toBe('handedOver');
  });

  it('every sector of a prefecture has a desk list it can join', () => {
    for (const r of ['pohja', 'ida', 'louna', 'laane'] as RegionId[])
      for (const sec of sectorsOf(r)) expect(addableDesks(r, [sec.id]).length, sec.id).toBeGreaterThan(0);
  });
});

/** A quiet Tartu room with a pursuit from Tartu whose suspect is already in Tartumaa, at Elva. */
function pursuitInto(desks: string[], rows?: [number, string, string][]): { s: SimState; inc: Incident } {
  const s = client(shiftFor('louna', desks, 4242, 3));
  applyCommand(s, setup(desks, rows));
  s.flags.autoSpawn = false;
  const tpl = TEMPLATES.find(
    (t) => !t.easterEgg && t.category === 'traffic' && t.units.need.every((n) => n.type === 'patrol'),
  )!;
  const inc = createIncident(s, tpl, {
    location: {
      address: 'Riia tn 2',
      coord: [26.7232, 58.3776],
      city: 'Tartu',
      placeKind: 'street',
      zone: 'mainland',
    },
    source: 'hk',
  });
  publishIncident(s, inc);
  expect(incidentDesk(s, inc, true)).toBe('louna-tartu');
  const unit = s.unitOrder
    .map((id) => s.units[id])
    .find((u) => u.type === 'patrol' && u.status === 'available' && unitDesk(s, u) === 'louna-tartu')!;
  expect(applyCommand(s, cmd(0, 'send', [inc.id, [unit.id]])).ok).toBe(true);
  startPursuit(s, inc, unit.pos);
  const elva: LngLat = REGIONS.louna.towns.find((t) => t.name === 'Elva')!.coord;
  expect(sectorAt(REGIONS.louna, elva)).toBe('louna-tartumaa');
  inc.pursuit!.suspectPos = elva;
  return { s, inc };
}
