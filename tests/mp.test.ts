/**
 * Mänguserver (server/mp, src/sim/patch.ts, docs/MULTIPLAYER.md section 9): the server runs a co-op room's shift and
 * every client holds a copy built from the patches. The tests drive a room with fake connections: the copies stay
 * equal to the server's shadow for a whole shift, commands take effect at the next piece with their result sent back
 * to the issuer, malformed and forbidden ones are refused, a seat that stays away leaves and the host's role moves,
 * nobody connected stops the clock, and a saved room continues where it was. Since 2.34.0: a seat the host removed
 * is closed at once and never let in again, and the end comes with the result signed the way every report builds it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyPatch, diffInto, jsonClone, type PatchOp } from '@/sim/patch';
import { pendingRadio, queue, recommendUnits } from '@/sim/selectors';
import { finalizeShift } from '@/sim/engine';
import { coopReport, coopXp, PLAYER_KINDS, simDigest, TURN_PIECES } from '@/sim/coop';
import { roomResultBody } from '@/net/rooms';
import type { SimState } from '@/sim/types';
import { AWAY_MS, MpRoom, PIECE_MS, type Peer } from '../server/mp/room';
import { signTicket, verifyKick, verifyTicket, type TicketRoom } from '../server/mp/ticket';
import { COMMAND_SHAPES, validCommand } from '../server/mp/validate';

const ROOM: TicketRoom = {
  code: 'K7M2QX',
  mode: 'role',
  seed: 424242,
  day: '2026-10-20',
  options: { regionId: 'pohja', sector: '', difficulty: 'normal', hours: 2, slot: 'evening' },
  started: 1_792_500_000_000,
  setup: [
    0,
    [
      [0, 'dispatch', 'Hanna'],
      [1, 'calls', 'Ivo'],
    ],
  ],
};

type Msg = Record<string, unknown> & { t: string };

/** A client: what it was sent, and its copy of the shift built from it. */
class FakePeer implements Peer {
  msgs: Msg[] = [];
  copy: Record<string, unknown> | null = null;
  closed: { code: number; reason: string } | null = null;
  events = 0;
  constructor(
    readonly seat: number,
    readonly user: number,
  ) {}
  send(data: string): void {
    const m = JSON.parse(data) as Msg;
    this.msgs.push(m);
    if (m.t === 'hello' || m.t === 'full') this.copy = m.state as Record<string, unknown>;
    else if (m.t === 'p' && this.copy) applyPatch(this.copy, m.ops as PatchOp[]);
    if (Array.isArray(m.ev)) this.events += m.ev.length;
  }
  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }
  acks(): Msg[] {
    return this.msgs.filter((m) => m.t === 'ack');
  }
  sim(): SimState {
    return this.copy as unknown as SimState;
  }
}

/** A room at a fake clock. */
function room(at = ROOM.started) {
  let now = at;
  const r = new MpRoom(ROOM, undefined, now);
  return {
    r,
    now: () => now,
    tick(n = 1) {
      for (let i = 0; i < n; i++) {
        now += PIECE_MS;
        r.tick(now);
      }
    },
    wait(ms: number) {
      now += ms;
    },
  };
}

describe('state patches', () => {
  it('rebuild any change of a JSON tree, appends, cuts, deletions and type changes included', () => {
    const live: Record<string, unknown> = { a: 1, b: [1, 2, 3], c: { d: 'x', e: [{ f: 1 }] }, g: null };
    const shadow = jsonClone(live);
    const copy = jsonClone(live);
    const step = (mutate: (x: Record<string, unknown>) => void) => {
      mutate(live);
      const ops: PatchOp[] = [];
      diffInto(shadow, live, [], ops);
      applyPatch(copy, ops);
      expect(copy).toEqual(jsonClone(live));
      expect(shadow).toEqual(jsonClone(live));
      return ops;
    };
    step((x) => (x.a = 2));
    step((x) => (x.b as number[]).push(4, 5));
    step((x) => ((x.b as number[]).length = 1));
    step((x) => delete (x.c as Record<string, unknown>).d);
    step((x) => ((x.c as Record<string, unknown>).e = 'now a string'));
    step((x) => (x.g = { h: [1, { i: 2 }] }));
    step((x) => (x.u = undefined));
    expect(step(() => {})).toEqual([]);
    // Infinity travels as null, like JSON, and does not repeat.
    step((x) => (x.a = Infinity));
    expect(step(() => {})).toEqual([]);
  });

  it('sends a display-only number once it moved by more than its slack', () => {
    const live = { units: { u1: { fatigue: 0.1, pos: [24.7, 59.4], status: 'available' } } };
    const shadow = jsonClone(live);
    const ops = (): PatchOp[] => {
      const out: PatchOp[] = [];
      diffInto(shadow, live, [], out);
      return out;
    };
    live.units.u1.fatigue = 0.102;
    live.units.u1.pos[0] = 24.700001;
    expect(ops()).toEqual([]);
    live.units.u1.fatigue = 0.11;
    live.units.u1.status = 'enroute';
    expect(ops()).toEqual([
      [['units', 'u1', 'fatigue'], 0.11],
      [['units', 'u1', 'status'], 'enroute'],
    ]);
  });
});

describe('game server room', () => {
  it('runs a whole shift with two clients whose copies match the server every piece', () => {
    const t = room();
    const host = new FakePeer(0, 11);
    const calls = new FakePeer(1, 12);
    t.r.join(host, t.now());
    t.r.join(calls, t.now());
    expect(host.msgs[0]).toMatchObject({ t: 'hello', seat: 0, v: 0 });
    expect(host.sim().coop?.seats.map((s) => [s.seat, s.role, s.name])).toEqual([
      [0, 'dispatch', 'Hanna'],
      [1, 'calls', 'Ivo'],
    ]);
    const issued = new Set<string>();
    let key = 0;
    const once = (id: string, peer: FakePeer, k: string, a: unknown[]) => {
      if (issued.has(id)) return;
      issued.add(id);
      t.r.command(peer, ++key, k, a, t.now());
    };
    once('speed', host, 'speed', [3]);
    let pieces = 0;
    while (!t.r.sim.ended && pieces < 40_000) {
      const s = t.r.sim;
      // The players read their own copies, like the browsers do.
      const mine = calls.sim();
      for (const call of mine.calls) {
        if (call.endedAt) continue;
        if (!call.answeredAt) once(`a${call.id}`, calls, 'answer', [call.id]);
        else if (!call.asked.includes('where')) once(`w${call.id}`, calls, 'ask', [call.id, 'where']);
        else if (!call.asked.includes('what')) once(`h${call.id}`, calls, 'ask', [call.id, 'what']);
        else
          once(`e${call.id}`, calls, 'endcall', [
            call.id,
            call.prank ? 'prank' : 'create',
            s.incidents[call.incidentId]?.truePriority ?? 3,
            '',
          ]);
      }
      for (const inc of queue(host.sim())) {
        if (inc.state === 'incoming') once(`k${inc.id}`, host, 'ack', [inc.id]);
        else if (inc.state === 'queued' && !inc.assigned.length) {
          const best = recommendUnits(s, inc.id).find(
            (r) => r.fit === 'ideal' || r.fit === 'need' || r.fit === 'weak',
          );
          if (best) once(`s${inc.id}:${pieces >> 6}`, host, 'send', [inc.id, [best.unit.id]]);
        }
      }
      for (const m of pendingRadio(host.sim())) once(`r${m.id}`, host, 'reply', [m.id, m.replies![0].id]);
      t.tick();
      pieces++;
      if (pieces % 200 === 0) {
        // Same digest everywhere (the digest rounds what the patches may hold back).
        expect(simDigest(host.sim())).toBe(simDigest(s));
        expect(simDigest(calls.sim())).toBe(simDigest(s));
      }
    }
    expect(t.r.sim.ended).toBe(true);
    // The end came as the exact state.
    expect(host.msgs.some((m) => m.t === 'full')).toBe(true);
    expect(host.copy).toEqual(jsonClone({ ...t.r.sim, events: undefined }));
    expect(calls.copy).toEqual(host.copy);
    const st = t.r.sim.coop!.stats;
    expect(st['1'].calls).toBeGreaterThan(0);
    expect(st['0'].sent).toBeGreaterThan(0);
    expect(st['0'].denied + st['1'].denied).toBe(0);
    expect(host.events).toBeGreaterThan(0);
    // Every command came back with its result.
    expect(host.acks().length + calls.acks().length).toBe(key);
  }, 120_000);

  it('applies a command at the next piece and answers the issuer, refusing malformed and forbidden ones', () => {
    const t = room();
    const host = new FakePeer(0, 11);
    const calls = new FakePeer(1, 12);
    t.r.join(host, t.now());
    t.r.join(calls, t.now());
    // A malformed command is refused at once, without a piece.
    t.r.command(calls, 1, 'answer', [42], t.now());
    expect(calls.acks()).toEqual([{ t: 'ack', key: 1, id: 0, r: { ok: false, reason: expect.any(Object) } }]);
    t.r.command(calls, 2, 'nope', [], t.now());
    expect(calls.acks()[1]).toMatchObject({ key: 2, r: { ok: false } });
    // The host changes the speed: in effect after one piece.
    t.r.command(host, 3, 'speed', [2], t.now());
    expect(t.r.sim.coop!.speed).toBe(1);
    t.tick();
    expect(t.r.sim.coop!.speed).toBe(2);
    expect(host.sim().coop!.speed).toBe(2);
    expect(host.acks().at(-1)).toMatchObject({ key: 3, r: { ok: true } });
    // The ack follows the patch that shows the effect.
    const last = host.msgs.slice(-2).map((m) => m.t);
    expect(last).toEqual(['p', 'ack']);
    // Out of role: the call-taker cannot change the speed or send crews.
    t.r.command(calls, 4, 'speed', [4], t.now());
    t.tick();
    expect(calls.acks().at(-1)).toMatchObject({ key: 4, r: { ok: false, denied: true } });
    expect(t.r.sim.coop!.speed).toBe(2);
    // Too many at once: the bucket refuses the rest.
    for (let i = 0; i < 30; i++) t.r.command(calls, 100 + i, 'ping', ['hei'], t.now());
    expect(
      calls.acks().filter((m) => (m.key as number) >= 100 && !(m.r as { ok: boolean }).ok).length,
    ).toBeGreaterThan(10);
  });

  it('moves seats and the host role with the connections and stops the clock while nobody is connected', () => {
    const t = room();
    const host = new FakePeer(0, 11);
    const calls = new FakePeer(1, 12);
    t.r.join(host, t.now());
    t.r.join(calls, t.now());
    t.tick(5);
    // The host's connection drops: still their seat for a minute.
    t.r.leave(host, t.now());
    t.tick(Math.floor((AWAY_MS - 1000) / PIECE_MS));
    expect(t.r.sim.coop!.seats.find((s) => s.seat === 0)?.present).toBe(true);
    t.tick(Math.ceil(2000 / PIECE_MS) + 1);
    const c = t.r.sim.coop!;
    expect(c.seats.find((s) => s.seat === 0)?.present).toBe(false);
    expect(c.host).toBe(1);
    // The call-taker now holds every desk (the role co-op hand-over).
    expect(calls.sim().coop!.host).toBe(1);
    // Back: the seat returns, the host role stays.
    const again = new FakePeer(0, 11);
    t.r.join(again, t.now());
    expect(again.msgs[0].t).toBe('hello');
    t.tick();
    expect(t.r.sim.coop!.seats.find((s) => s.seat === 0)?.present).toBe(true);
    expect(t.r.sim.coop!.host).toBe(1);
    // A second connection of a seat replaces the first.
    const tab2 = new FakePeer(1, 12);
    t.r.join(tab2, t.now());
    expect(calls.closed).toEqual({ code: 4001, reason: 'replaced' });
    // Nobody connected: the clock stands.
    t.r.leave(again, t.now());
    t.r.leave(tab2, t.now());
    const before = t.r.sim.now;
    t.tick(100);
    expect(t.r.sim.now).toBe(before);
    expect(t.r.emptySince).not.toBeNull();
  });

  it('closes a seat the host removed at once and never lets it in again, after a restart too', () => {
    const t = room();
    const host = new FakePeer(0, 11);
    const calls = new FakePeer(1, 12);
    t.r.join(host, t.now());
    t.r.join(calls, t.now());
    t.tick(3);
    t.r.kick(1, t.now());
    expect(calls.closed).toEqual({ code: 4403, reason: 'kicked' });
    // The seat leaves at the next piece: its role passes on, no minute's grace.
    t.tick();
    expect(t.r.sim.coop!.seats.find((s) => s.seat === 1)?.present).toBe(false);
    expect(host.sim().coop!.seats.find((s) => s.seat === 1)?.present).toBe(false);
    const again = new FakePeer(1, 12);
    t.r.join(again, t.now());
    expect(again.closed).toEqual({ code: 4403, reason: 'kicked' });
    expect(again.msgs).toEqual([]);
    const back = new MpRoom(ROOM, JSON.parse(JSON.stringify(t.r.save())), t.now());
    const after = new FakePeer(1, 12);
    back.join(after, t.now());
    expect(after.closed?.code).toBe(4403);
  });

  it('signs the result at the end the way every player’s report builds it', () => {
    const secret = 'c'.repeat(64);
    const t = room();
    t.r.signer = (p) => signTicket(p, secret);
    const host = new FakePeer(0, 11);
    const calls = new FakePeer(1, 12);
    t.r.join(host, t.now());
    t.r.join(calls, t.now());
    expect(t.r.signedResult()).toBeNull();
    t.r.command(host, 1, 'speed', [3], t.now());
    t.tick(TURN_PIECES * 40);
    t.r.command(host, 2, 'end', [], t.now());
    t.tick();
    const full = host.msgs.find((m) => m.t === 'full')!;
    expect(typeof full.res).toBe('string');
    expect(calls.msgs.find((m) => m.t === 'full')!.res).toBe(full.res);
    const token = full.res as string;
    const p = JSON.parse(Buffer.from(token.slice(0, token.indexOf('.')), 'base64url').toString('utf8'));
    // What the browser does with the same final state (src/store/game.ts endShift, ReportScreen).
    const copy = host.sim();
    copy.ended = true;
    const report = finalizeShift(copy);
    const coop = coopReport(copy)!;
    const team = roomResultBody(report);
    expect(p).toEqual({
      v: 1,
      kind: 'result',
      code: ROOM.code,
      seed: ROOM.seed,
      started: ROOM.started,
      score: team.score,
      grade: team.grade,
      incidents: team.incidents,
      arrests: team.arrests,
      xp: coop.seats.map((x) => [x.seat, Math.round(coopXp(report, x.stats))]),
    });
    expect(signTicket(p, secret)).toBe(token);
    // Back after the end: the same result again.
    const late = new FakePeer(1, 12);
    t.r.join(late, t.now());
    expect(late.msgs[0]).toMatchObject({ t: 'hello', res: token });
  });

  it('continues a saved room where it was', () => {
    const t = room();
    const host = new FakePeer(0, 11);
    t.r.join(host, t.now());
    t.r.command(host, 1, 'speed', [3], t.now());
    t.tick(TURN_PIECES * 30);
    const saved = JSON.parse(JSON.stringify(t.r.save()));
    const back = new MpRoom(ROOM, saved, t.now());
    expect(simDigest(back.sim)).toBe(simDigest(t.r.sim));
    const peer = new FakePeer(0, 11);
    back.join(peer, t.now());
    expect(simDigest(peer.sim())).toBe(simDigest(t.r.sim));
    back.tick(t.now() + PIECE_MS);
    t.r.tick(t.now() + PIECE_MS);
    expect(simDigest(back.sim)).toBe(simDigest(t.r.sim));
  });
});

describe('tickets and command shapes', () => {
  const secret = 'a'.repeat(64);
  const payload = {
    v: 1,
    code: ROOM.code,
    user: 5,
    seat: 1,
    name: 'Ivo',
    exp: Date.now() + 60_000,
    room: ROOM,
  };

  it('accepts a signed ticket until it expires', () => {
    const tk = signTicket(payload, secret);
    expect(verifyTicket(tk, secret)).toMatchObject({
      code: ROOM.code,
      seat: 1,
      user: 5,
      room: { setup: ROOM.setup },
    });
    expect(verifyTicket(tk, secret, payload.exp + 1)).toBeNull();
    expect(verifyTicket(tk, 'b'.repeat(64))).toBeNull();
    expect(verifyTicket(signTicket({ ...payload, code: 'AAAAAA' }, secret), secret)).toBeNull();
    expect(verifyTicket(signTicket({ ...payload, v: 2 }, secret), secret)).toBeNull();
    expect(verifyTicket('nonsense', secret)).toBeNull();
    expect(verifyTicket(tk, null)).toBeNull();
  });

  it('carries the largest custom force a room may have (src/sim/custom.ts)', () => {
    const crews = Array.from({ length: 40 }, (_, i) => [
      'community',
      'louna-tartu-politseijaoskond',
      ...(i < 10 ? [i * 6, i * 6 + 1, i * 6 + 2, i * 6 + 3, i * 6 + 4, i * 6 + 5] : []),
    ]);
    const big = {
      ...payload,
      room: { ...ROOM, options: { ...(ROOM.options as object), custom: { crews, budget: true } } },
    };
    const tk = signTicket(big, secret);
    // The first WebSocket message ({t:'auth', ticket}) stays under the game server's 16 KiB frame limit.
    expect(JSON.stringify({ t: 'auth', ticket: tk }).length).toBeLessThan(16384);
    expect(verifyTicket(tk, secret)?.room.options).toMatchObject({ custom: { crews } });
  });

  it('accepts a signed kick from the PHP API, never a ticket in its place', () => {
    const kick = { v: 1, kind: 'kick', code: ROOM.code, seat: 1, user: 5, exp: Date.now() + 60_000 };
    const tk = signTicket(kick, secret);
    expect(verifyKick(tk, secret)).toEqual({ code: ROOM.code, seat: 1, user: 5 });
    expect(verifyKick(tk, secret, kick.exp + 1)).toBeNull();
    expect(verifyKick(tk, 'b'.repeat(64))).toBeNull();
    expect(verifyKick(signTicket(payload, secret), secret)).toBeNull();
    expect(verifyTicket(tk, secret)).toBeNull();
  });

  it('takes the same command kinds as the PHP log and the sim', () => {
    const php = readFileSync('server/lib/coop.php', 'utf8');
    const block = php.slice(
      php.indexOf('const EPD_COOP_KINDS = ['),
      php.indexOf('];', php.indexOf('const EPD_COOP_KINDS = [')),
    );
    const phpKinds = [...block.matchAll(/'([a-z]+)' => \[/g)].map((m) => m[1]).sort();
    expect(Object.keys(COMMAND_SHAPES).sort()).toEqual(phpKinds);
    expect([...PLAYER_KINDS].sort()).toEqual(phpKinds);
    expect(validCommand('take', ['pohja-lasnamae'])).toEqual({ k: 'take', a: ['pohja-lasnamae'] });
    expect(validCommand('give', ['pohja-lasnamae'])).not.toBeNull();
    for (const a of [[], [3], ['pohja lasnamae'], ['a', 'b']])
      expect(validCommand('take', a), JSON.stringify(a)).toBeNull();
  });

  it('lets in the command shapes the PHP log takes, and nothing else', () => {
    expect(validCommand('send', ['i3', ['u1', 'u2']])).toEqual({ k: 'send', a: ['i3', ['u1', 'u2']] });
    expect(validCommand('close', ['i3', 'solved'])).not.toBeNull();
    expect(validCommand('close', ['i3', 'solved', ''])).not.toBeNull();
    expect(validCommand('endcall', ['c1', 'create', 0, ''])).not.toBeNull();
    expect(validCommand('ping', ['Tere!'])).not.toBeNull();
    for (const [k, a] of [
      ['send', ['i3', []]],
      ['send', ['i3', ['bad id']]],
      ['prio', ['i3', 5]],
      ['ping', ['']],
      ['ping', ['x'.repeat(141)]],
      ['ping', ['a\u0007b']],
      ['setup', [0, []]],
      ['left', [1]],
      ['toString', []],
      ['ack', 'i3'],
    ] as [string, unknown][])
      expect(validCommand(k, a), `${k} ${JSON.stringify(a)}`).toBeNull();
  });
});
