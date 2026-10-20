/**
 * One room's shared shift on the game server (docs/MULTIPLAYER.md section 9). The server holds the only running
 * simulation: a player's command is checked and applied the moment it arrives, the shift steps one piece (50 ms of
 * real time) at a time, and after every piece the players get what changed (src/sim/patch.ts). A player who joins
 * or comes back gets the whole state once.
 *
 * Seats: a seat whose last connection closed a minute ago leaves the shift (`left`: its desk or role passes on, as
 * in the lockstep rooms), coming back is `back`, and the host's role (speed, ending early) passes to the lowest seat
 * still connected when the host's seat leaves. Nobody connected: the clock stops until somebody returns.
 */
import type { WebSocket } from 'ws';
import { createShift, drainEvents } from '@/sim/engine';
import {
  applyCommand,
  initCoop,
  livePiece,
  SERVER_SEAT,
  TURN_PIECES,
  type CmdResult,
  type LogCmd,
} from '@/sim/coop';
import { diffInto, jsonClone, type PatchOp } from '@/sim/patch';
import { markRoom, roomDesks, roomShiftOptions, teamName, type RoomShift } from '@/sim/room';
import { parseOptions } from '@/net/rooms';
import type { GameEvent, SimState } from '@/sim/types';
import type { TicketRoom } from './ticket';
import { validCommand } from './validate';

/** Real ms of one piece: a twentieth of a turn (src/sim/coop.ts TURN_MS / TURN_PIECES). */
export const PIECE_MS = 50;
/** A seat with no connection for this long leaves the shift until it reconnects. */
export const AWAY_MS = 60_000;
/** Commands per seat: a bucket of this many, refilled at this rate per second. */
const BURST = 12;
const RATE = 6;
/** Commands per room in all (the lockstep log's limit). */
const ROOM_MAX = 20_000;
/** Events kept for one patch at most (a long pause in the middle of a busy shift cannot flood a client). */
const MAX_EVENTS = 200;

/** What a connection needs from the room: send JSON, close. Real sockets and the tests' fakes both fit. */
export interface Peer {
  seat: number;
  user: number;
  send(data: string): void;
  close(code: number, reason: string): void;
}

/** A WebSocket as a Peer. */
export function socketPeer(ws: WebSocket, seat: number, user: number): Peer {
  return {
    seat,
    user,
    send: (data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    },
    close: (code, reason) => ws.close(code, reason),
  };
}

interface Queued {
  cmd: LogCmd;
  peer?: Peer;
  key?: number;
}

/** A room saved to disk (a restart of the game server continues it). */
export interface SavedRoom {
  v: 1;
  room: TicketRoom;
  sim: SimState;
  nextId: number;
  piece: number;
  seq: number;
  cmdCount: number;
}

const SKIP = new Set(['events']);

/** The shift of a ticket's room, as every client of the room would build it. */
export function shiftOfRoom(r: TicketRoom): RoomShift {
  return { code: r.code, mode: r.mode, seed: r.seed, day: r.day, options: parseOptions(r.options) };
}

export class MpRoom {
  readonly code: string;
  readonly room: TicketRoom;
  readonly sim: SimState;
  private shadow: Record<string, unknown>;
  private peers = new Set<Peer>();
  private queue: Queued[] = [];
  private nextId: number;
  private piece: number;
  private seq: number;
  private cmdCount: number;
  /** Seat: when its last connection closed. */
  private awaySince = new Map<number, number>();
  private tokens = new Map<number, { n: number; at: number }>();
  /** When the last peer left (null while somebody is connected). */
  emptySince: number | null;
  private endSent: boolean;

  constructor(room: TicketRoom, saved?: SavedRoom, now = Date.now()) {
    this.code = room.code;
    this.room = room;
    if (saved) {
      this.sim = saved.sim;
      if (!Array.isArray(this.sim.events)) this.sim.events = [];
      this.nextId = saved.nextId;
      this.piece = saved.piece;
      this.seq = saved.seq;
      this.cmdCount = saved.cmdCount;
      this.endSent = !!this.sim.ended;
      // Everybody reconnects after a restart: their seats count as away from now.
      for (const s of this.sim.coop?.seats ?? []) if (s.present) this.awaySince.set(s.seat, now);
    } else {
      const shift = shiftOfRoom(room);
      const sim = createShift(roomShiftOptions(shift, teamName(room.code)));
      markRoom(sim, room.code);
      const desks = roomDesks(shift);
      initCoop(sim, room.code, desks.length ? 'sector' : 'role', desks);
      applyCommand(sim, { id: 1, t: 0, s: SERVER_SEAT, k: 'setup', a: room.setup });
      this.sim = sim;
      this.nextId = 2;
      this.piece = 0;
      this.seq = 0;
      this.cmdCount = 0;
      this.endSent = false;
      // Every seat of the setup has a minute to connect before it counts as away.
      for (const s of sim.coop?.seats ?? []) this.awaySince.set(s.seat, now);
    }
    drainEvents(this.sim);
    this.shadow = jsonClone({ ...this.sim, events: undefined }) as unknown as Record<string, unknown>;
    this.emptySince = now;
  }

  get connected(): number {
    return this.peers.size;
  }

  get ended(): boolean {
    return !!this.sim.ended;
  }

  /** A player connects (or reconnects): the whole state, then patches. An older connection of the seat is closed. */
  join(peer: Peer, now = Date.now()): void {
    for (const p of this.peers) {
      if (p.seat === peer.seat) {
        this.peers.delete(p);
        p.close(4001, 'replaced');
      }
    }
    this.peers.add(peer);
    this.awaySince.delete(peer.seat);
    this.emptySince = null;
    const seat = this.sim.coop?.seats.find((s) => s.seat === peer.seat);
    if (seat && !seat.present) this.system('back', [peer.seat]);
    peer.send(
      JSON.stringify({
        t: 'hello',
        v: this.seq,
        seat: peer.seat,
        now,
        state: this.shadow,
      }),
    );
  }

  leave(peer: Peer, now = Date.now()): void {
    if (!this.peers.delete(peer)) return;
    if (![...this.peers].some((p) => p.seat === peer.seat)) this.awaySince.set(peer.seat, now);
    if (!this.peers.size) this.emptySince = now;
  }

  /** A player's command: refused at once when malformed or too frequent, else applied at the next piece. */
  command(peer: Peer, rawKey: unknown, k: unknown, a: unknown, now = Date.now()): void {
    const key = typeof rawKey === 'number' && Number.isFinite(rawKey) ? rawKey : 0;
    const ack = (r: CmdResult, id = 0) => peer.send(JSON.stringify({ t: 'ack', key, id, r }));
    const cmd = validCommand(k, a);
    if (!cmd) return ack({ ok: false, reason: { et: 'Vigane käsk.', en: 'Invalid command.' } });
    if (!this.take(peer.seat, now))
      return ack({
        ok: false,
        reason: { et: 'Liiga palju käske korraga.', en: 'Too many commands at once.' },
      });
    if (this.cmdCount >= ROOM_MAX)
      return ack({ ok: false, reason: { et: 'Käskude piir on täis.', en: 'The command limit is reached.' } });
    this.cmdCount++;
    this.queue.push({ cmd: { id: 0, t: 0, s: peer.seat, k: cmd.k, a: cmd.a }, peer, key });
  }

  private take(seat: number, now: number): boolean {
    const b = this.tokens.get(seat) ?? { n: BURST, at: now };
    b.n = Math.min(BURST, b.n + ((now - b.at) / 1000) * RATE);
    b.at = now;
    this.tokens.set(seat, b);
    if (b.n < 1) return false;
    b.n -= 1;
    return true;
  }

  private system(k: string, a: unknown[]): void {
    this.queue.push({ cmd: { id: 0, t: 0, s: SERVER_SEAT, k, a } });
  }

  /** Seats away for a minute leave; the host's role moves to a connected seat when the host's seat is gone. */
  private seats(now: number): void {
    const c = this.sim.coop;
    if (!c) return;
    for (const [seat, since] of this.awaySince) {
      const s = c.seats.find((x) => x.seat === seat);
      if (
        s?.present &&
        now - since >= AWAY_MS &&
        !this.queue.some((q) => q.cmd.k === 'left' && q.cmd.a[0] === seat)
      )
        this.system('left', [seat]);
    }
    const host = c.seats.find((x) => x.seat === c.host);
    const hostGone = !host || (!host.present && this.awaySince.has(c.host));
    if (hostGone) {
      const next = c.seats
        .filter((x) => x.present && !this.awaySince.has(x.seat))
        .map((x) => x.seat)
        .sort((x, y) => x - y)[0];
      if (next !== undefined && next !== c.host && !this.queue.some((q) => q.cmd.k === 'host'))
        this.system('host', [next]);
    }
  }

  /**
   * One piece: apply what arrived, step the shift, send the changes. Nothing moves while nobody is connected.
   * Returns false when the room did nothing.
   */
  tick(now = Date.now()): boolean {
    if (!this.peers.size) return false;
    this.seats(now);
    const acks: { peer: Peer; key: number | undefined; id: number; r: CmdResult }[] = [];
    const c = this.sim.coop;
    for (const q of this.queue.splice(0)) {
      q.cmd.id = this.nextId++;
      q.cmd.t = (c?.turn ?? -1) + 1;
      const r = applyCommand(this.sim, q.cmd);
      if (q.peer) acks.push({ peer: q.peer, key: q.key, id: q.cmd.id, r });
    }
    if (!this.sim.ended) {
      try {
        livePiece(this.sim, this.piece);
      } catch (err) {
        console.error(`[mp ${this.code}] step failed`, err);
      }
      this.piece = (this.piece + 1) % TURN_PIECES;
    }
    let ev: GameEvent[] = drainEvents(this.sim);
    if (ev.length > MAX_EVENTS) ev = ev.slice(-MAX_EVENTS);
    if (this.sim.ended && !this.endSent) {
      // The end: the exact state (no display slack), so every report is built from the same numbers.
      this.endSent = true;
      this.shadow = jsonClone({ ...this.sim, events: undefined }) as unknown as Record<string, unknown>;
      this.broadcast(JSON.stringify({ t: 'full', v: ++this.seq, state: this.shadow, ev }));
    } else {
      const ops: PatchOp[] = [];
      this.shadow = diffInto(this.shadow, this.sim, [], ops, SKIP) as Record<string, unknown>;
      if (ops.length || ev.length) this.broadcast(JSON.stringify({ t: 'p', v: ++this.seq, ops, ev }));
    }
    for (const a of acks) a.peer.send(JSON.stringify({ t: 'ack', key: a.key, id: a.id, r: a.r }));
    return true;
  }

  private broadcast(data: string): void {
    for (const p of this.peers) p.send(data);
  }

  /** Close every connection (the server stops or the room is dropped). */
  closeAll(code: number, reason: string): void {
    for (const p of this.peers) p.close(code, reason);
    this.peers.clear();
  }

  save(): SavedRoom {
    return {
      v: 1,
      room: this.room,
      sim: { ...this.sim, events: [] },
      nextId: this.nextId,
      piece: this.piece,
      seq: this.seq,
      cmdCount: this.cmdCount,
    };
  }
}
