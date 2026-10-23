/**
 * The co-op session of this tab: one room's shared shift, in one of two ways.
 *
 * - On the game server (docs/MULTIPLAYER.md section 9, `ServerSession`): the server runs the shift. The tab holds a
 *   copy, sends commands up a WebSocket and applies the server's patches as they come, about twenty a second; a
 *   command shows its effect a tenth of a second after the click. Used when the room says `engine: 'server'`.
 * - In lockstep (section 4, `CoopSession`, the fallback when the game server is not there): the tab polls the room's
 *   command log about once a second, plays the shift turn by turn from it (src/sim/coop.ts) instead of real time x
 *   speed, sends this player's commands in small batches, reports the state digest every ten turns, uploads the
 *   host's snapshot every sixty, and resyncs from the latest snapshot when the server says this client drifted. A
 *   reload, a closed tab or a lost connection rejoins the same way: the latest snapshot plus the log since.
 *
 * Single-player shifts never touch this module: the game loop calls it only while the running shift has `sim.coop`.
 */
import { create } from 'zustand';
import { createShift } from '@/sim/engine';
import {
  roleHolders as rolesHolders,
  beginTurn,
  HASH_EVERY,
  initCoop,
  rolesOf,
  simDigest,
  SNAPSHOT_EVERY,
  stepPiece,
  TURN_PIECES,
  type CmdResult,
  type CoopCommand,
  type CoopRole,
  type LogCmd,
  type TurnPlan,
} from '@/sim/coop';
import { markRoom, roomDesks, roomShiftOptions, teamName, type RoomShift } from '@/sim/room';
import { callDesk, incidentDesk, msgDesk, seatDesk, unitDesk } from '@/sim/desks';
import type { ActiveCall, Incident, RadioMsg, SimState, Unit } from '@/sim/types';
import { fetchLog, fetchSnapshot, postCommands, putSnapshot, type LogReply } from '@/net/coop';
import { pollDelay, pollRoom, type RoomEngine } from '@/net/rooms';
import { ApiError, toApiError } from '@/net/api';
import { fetchTicket, socketUrl } from '@/net/mp';
import { applyPatch, type PatchOp } from '@/sim/patch';
import type { GameEvent } from '@/sim/types';
import { loopHooks, useGame } from './game';

/** Turns the playback stays behind the server's clock (the log of the last turn or two may still be arriving). */
const LAG_TURNS = 1;
/** Behind by more than this many turns: catching up (no per-piece rendering, a status line instead). */
const CATCH_UP_TURNS = 4;
/** Batches go out at most this often (the server allows two a second). */
const FLUSH_EVERY_MS = 500;
const MAX_BATCH = 20;

export type CoopStatus =
  'connecting' | 'catching' | 'live' | 'waiting' | 'resync' | 'offline' | 'ended' | 'gone';

/** One of this player's commands on its way: sent, then applied by everybody two or three seconds later. */
export interface PendingCmd {
  key: number;
  k: string;
  a: unknown[];
  /** Log id once the server took it. */
  id?: number;
  sentAt: number;
}

interface CoopUi {
  code: string | null;
  seat: number;
  host: number;
  isHost: boolean;
  status: CoopStatus;
  /** Turns behind the server's clock (catching up). */
  behind: number;
  pending: PendingCmd[];
  /** Pings seen by this player (the panel's unread mark). */
  pingsSeen: number;
  /** How many resyncs this session did (shown in the status line; tests read it). */
  resyncs: number;
  error: string | null;
}

export const useCoop = create<CoopUi>()(() => ({
  code: null,
  seat: -1,
  host: 0,
  isHost: false,
  status: 'connecting',
  behind: 0,
  pending: [],
  pingsSeen: 0,
  resyncs: 0,
  error: null,
}));

type ResultListener = (cmd: LogCmd, r: CmdResult) => void;
const ownResults = new Set<ResultListener>();
/** Results of this player's own commands as they are applied (the UI shows a refused dispatch, for example). */
export function onOwnResult(fn: ResultListener): () => void {
  ownResults.add(fn);
  return () => ownResults.delete(fn);
}

const now = () => Date.now();

/** What the game loop and the UI need from either kind of session. */
interface Session {
  readonly code: string;
  issue(cmd: CoopCommand): void;
  frame(sim: SimState): boolean;
  stop(): void;
  debug(): unknown;
}

class CoopSession implements Session {
  readonly code: string;
  private readonly shift: RoomShift;
  private log: LogCmd[] = [];
  private byTurn = new Map<number, LogCmd[]>();
  private lastId = 0;
  /** Every command up to this turn is known (the server's turn at the last complete poll + delay - 1). */
  private safeTurn = -1;
  private started: number | null = null;
  private turnMs = 1000;
  private offset = 0;
  private bestRtt = Infinity;
  private plan: TurnPlan | null = null;
  private piece = 0;
  private outbox: { key: number; cmd: CoopCommand }[] = [];
  private flushing = false;
  private lastFlush = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private stopped = false;
  private hash: { turn: number; hash: string } | null = null;
  private ackResync = false;
  private resyncing = false;
  private wantSnapshot = false;
  private uploading = false;
  private lastSnapTurn = -1;
  private lastReply: LogReply | null = null;
  private keySeq = 0;
  private loading = true;
  /** The latest digests this client computed (every HASH_EVERY turns), for the status line and tests. */
  private history: { turn: number; hash: string }[] = [];

  constructor(code: string, shift: RoomShift) {
    this.code = code;
    this.shift = shift;
  }

  // ── Start, rejoin, resync ──

  /** A fresh client of the room's shift, before the first command. */
  private freshSim(): SimState {
    const sim = createShift(roomShiftOptions(this.shift, teamName(this.code)));
    markRoom(sim, this.code);
    const desks = roomDesks(this.shift);
    initCoop(sim, this.code, desks.length ? 'sector' : 'role', desks);
    return sim;
  }

  /** The latest snapshot (or a fresh shift when there is none) and the log after it. */
  async load(): Promise<SimState> {
    let sim: SimState | null = null;
    let after = 0;
    try {
      const snap = await fetchSnapshot(this.code);
      if (snap) {
        const parsed = JSON.parse(snap.json) as SimState;
        if (parsed && parsed.coop && parsed.coop.code === this.code && Array.isArray(parsed.incidentOrder)) {
          parsed.events = [];
          sim = parsed;
          after = parsed.coop.lastCmd;
          this.lastSnapTurn = snap.turn;
        }
      }
    } catch (e) {
      console.warn('[EPD coop] snapshot unavailable, replaying from the start', e);
    }
    sim ??= this.freshSim();
    this.history = [];
    this.log = [];
    this.byTurn.clear();
    this.lastId = after;
    this.safeTurn = sim.coop!.turn;
    this.plan = null;
    this.piece = 0;
    return sim;
  }

  start(): void {
    this.stopped = false;
    this.loading = false;
    void this.poll();
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.pollTimer = null;
    this.flushTimer = null;
  }

  private async resync(): Promise<void> {
    if (this.resyncing || this.stopped) return;
    this.resyncing = true;
    setUi({ status: 'resync' });
    try {
      // Give the host a moment to upload a fresh snapshot (the server asked it to); the shift plays on meanwhile.
      const seen = this.lastReply?.snap ?? null;
      for (let i = 0; i < 6 && !this.stopped; i++) {
        if ((this.lastReply?.snap ?? null) !== seen) break;
        await sleep(1000);
      }
      if (this.stopped) return;
      this.loading = true;
      const sim = await this.load();
      const g = useGame.getState();
      if (g.sim?.coop?.code !== this.code) return;
      useGame.setState({ sim });
      g.bump();
      this.ackResync = true;
      useCoop.setState((u) => ({ resyncs: u.resyncs + 1 }));
    } catch (e) {
      console.warn('[EPD coop] resync failed', e);
    } finally {
      this.loading = false;
      this.resyncing = false;
      setUi({ status: 'catching' });
    }
  }

  // ── Polling ──

  private schedule(ms: number): void {
    if (this.stopped) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => void this.poll(), ms);
  }

  private async poll(): Promise<void> {
    if (this.stopped) return;
    if (this.loading) return this.schedule(300);
    const hash = this.hash;
    const ack = this.ackResync;
    const t0 = now();
    let r: LogReply;
    try {
      r = await fetchLog(this.code, { after: this.lastId, hash: hash ?? undefined, ack });
    } catch (e) {
      if (this.stopped) return;
      const err = toApiError(e);
      this.failures++;
      if (err.status === 404 || err.status === 401) {
        setUi({ status: 'gone', error: err.code });
        this.stop();
        return;
      }
      // The room has left this shift behind: back in the lobby it switched to a mode without a shared shift, or this
      // player left it. Either way the shift is over (the mode changes only in the lobby), not the connection.
      if (err.status === 409 && (err.code === 'not_coop' || err.code === 'left_room')) {
        setUi({ status: 'ended', error: 'round_over' });
        this.stop();
        return;
      }
      if (this.failures >= 3) setUi({ status: 'offline', error: err.code });
      return this.schedule(pollDelay(true, this.failures));
    }
    if (this.stopped || this.loading) return this.schedule(300);
    const t1 = now();
    this.failures = 0;
    if (hash && this.hash === hash) this.hash = null;
    if (ack) this.ackResync = false;
    // The server's clock: the sample with the shortest round trip wins, the others nudge it.
    const rtt = t1 - t0;
    const sample = r.now - (t0 + t1) / 2;
    if (rtt <= this.bestRtt + 30) {
      this.bestRtt = Math.min(this.bestRtt, rtt);
      this.offset = sample;
    } else this.offset += (sample - this.offset) * 0.1;
    // The room has moved on to its next round (the host ended this one, docs/MULTIPLAYER.md section 11): the log is no
    // longer this shift's.
    if (r.state === 'lobby' || (this.started !== null && r.started !== null && r.started !== this.started)) {
      setUi({ status: 'ended' });
      this.stop();
      return;
    }
    this.started = r.started;
    this.turnMs = r.turnMs;
    for (const c of r.cmds) {
      if (c.id <= this.lastId) continue;
      this.lastId = c.id;
      this.log.push(c);
      const list = this.byTurn.get(c.t);
      if (list) list.push(c);
      else this.byTurn.set(c.t, [c]);
    }
    // Every command up to S + delay - 1 is known once the answer holds the whole log.
    if (!r.more) this.safeTurn = Math.max(this.safeTurn, r.turn + r.delay - 1);
    this.lastReply = r;
    setUi({ seat: r.seat, host: r.host, isHost: r.isHost, error: null });
    if (r.snapReq && r.isHost) this.wantSnapshot = true;
    if (r.state === 'finished' || r.state === 'closed') {
      setUi({ status: 'ended' });
      this.stop();
      return;
    }
    if (r.resync && !this.ackResync && !this.resyncing) void this.resync();
    const status = useCoop.getState().status;
    if (status === 'offline' || status === 'connecting') setUi({ status: 'catching' });
    this.schedule(
      r.more ? 0 : pollDelay(typeof document === 'undefined' || document.visibilityState !== 'hidden', 0),
    );
  }

  // ── Commands ──

  issue(cmd: CoopCommand): void {
    if (this.stopped) return;
    const key = ++this.keySeq;
    this.outbox.push({ key, cmd });
    useCoop.setState((u) => ({ pending: [...u.pending, { key, k: cmd.k, a: cmd.a, sentAt: now() }] }));
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.flushing || !this.outbox.length || this.stopped) return;
    const wait = Math.max(30, this.lastFlush + FLUSH_EVERY_MS - now());
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, wait);
  }

  private async flush(): Promise<void> {
    if (this.flushing || !this.outbox.length || this.stopped) return;
    this.flushing = true;
    this.lastFlush = now();
    const batch = this.outbox.splice(0, MAX_BATCH);
    try {
      const r = await postCommands(
        this.code,
        batch.map((b) => b.cmd),
      );
      const ids = new Map(batch.map((b, i) => [b.key, r.ids[i]]));
      useCoop.setState((u) => ({
        pending: u.pending.map((p) => (ids.has(p.key) ? { ...p, id: ids.get(p.key) } : p)),
      }));
    } catch (e) {
      const err = toApiError(e);
      if (err.retryable) this.outbox.unshift(...batch);
      else {
        const keys = new Set(batch.map((b) => b.key));
        useCoop.setState((u) => ({ pending: u.pending.filter((p) => !keys.has(p.key)), error: err.code }));
        console.warn('[EPD coop] commands refused', err.code);
      }
    } finally {
      this.flushing = false;
      this.scheduleFlush();
    }
  }

  // ── Turns ──

  /** Fractional turn the playback should be at now. */
  private target(): number {
    if (this.started === null) return -1;
    return (now() + this.offset - this.started) / this.turnMs - LAG_TURNS;
  }

  /** Called every animation frame by the game loop. Returns whether game time moved. */
  frame(sim: SimState): boolean {
    const c = sim.coop;
    if (!c || this.loading || this.stopped) return false;
    const goal = this.target();
    const at = () => c.turn + 1 + (this.plan ? this.piece / TURN_PIECES : 0);
    const behind = goal - at();
    const catching = behind > CATCH_UP_TURNS;
    const budget = catching ? 30 : 8;
    const t0 = performance.now();
    const before = sim.now;
    let waiting = false;
    while (at() < goal) {
      if (!this.plan) {
        const next = c.turn + 1;
        if (next > this.safeTurn) {
          waiting = true;
          break;
        }
        const cmds = (this.byTurn.get(next) ?? []).slice().sort((x, y) => x.id - y.id);
        this.plan = beginTurn(sim, cmds);
        this.piece = 0;
        this.afterCommands(sim, cmds, this.plan);
      }
      stepPiece(sim, this.plan, this.piece);
      this.piece++;
      if (this.piece >= TURN_PIECES) {
        const done = this.plan.turn;
        this.plan = null;
        this.piece = 0;
        this.afterTurn(sim, done);
      }
      if (performance.now() - t0 > budget) break;
    }
    const left = Math.max(0, goal - at());
    const u = useCoop.getState();
    const status: CoopStatus = sim.ended
      ? 'ended'
      : left > CATCH_UP_TURNS
        ? 'catching'
        : waiting && left > 1.5
          ? 'waiting'
          : 'live';
    if (!this.resyncing && (u.status !== status || Math.abs(u.behind - left) >= 1)) {
      if (u.status !== 'offline' && u.status !== 'gone') setUi({ status, behind: Math.round(left) });
    }
    // The store mirrors the shared speed for the top bar.
    const g = useGame.getState();
    if (g.speedIndex !== c.speed)
      useGame.setState({ speedIndex: c.speed, lastSpeedIndex: c.speed || g.lastSpeedIndex });
    return sim.now !== before;
  }

  private afterCommands(sim: SimState, cmds: LogCmd[], plan: TurnPlan): void {
    const seat = useCoop.getState().seat;
    const mine = cmds.filter((x) => x.s === seat);
    if (!mine.length) return;
    const ids = new Set(mine.map((x) => x.id));
    useCoop.setState((u) => ({ pending: u.pending.filter((p) => p.id === undefined || !ids.has(p.id)) }));
    for (const x of mine) {
      const r = plan.results.get(x.id);
      if (r) for (const l of ownResults) l(x, r);
    }
    void sim;
  }

  private afterTurn(sim: SimState, turn: number): void {
    if (turn % HASH_EVERY === 0) {
      this.hash = { turn, hash: simDigest(sim) };
      this.history.push(this.hash);
      if (this.history.length > 30) this.history.shift();
    }
    const u = useCoop.getState();
    if (
      u.isHost &&
      !this.uploading &&
      (this.wantSnapshot || (turn > 0 && turn % SNAPSHOT_EVERY === 0 && turn !== this.lastSnapTurn))
    ) {
      this.wantSnapshot = false;
      this.lastSnapTurn = turn;
      // Serialised now, at the turn boundary; compressed and sent in the background.
      const json = JSON.stringify({ ...sim, events: [] });
      const cmd = sim.coop!.lastCmd;
      this.uploading = true;
      putSnapshot(this.code, turn, cmd, json)
        .catch((e: unknown) => {
          const err = toApiError(e);
          if (err.status !== 429) console.warn('[EPD coop] snapshot upload failed', err.code);
        })
        .finally(() => {
          this.uploading = false;
        });
    }
  }

  /** Tests: the state of the session. */
  debug() {
    return {
      lastId: this.lastId,
      safeTurn: this.safeTurn,
      log: this.log.length,
      offset: this.offset,
      plan: this.plan?.turn ?? null,
      piece: this.piece,
      hashes: this.history.slice(),
    };
  }
}

function setUi(p: Partial<CoopUi>): void {
  useCoop.setState(p);
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

// ── On the game server ───────────────────────────────────────────────────────

/** Reconnect waits after a lost connection (ms), the last one repeating. */
const RECONNECT_MS = [300, 1000, 2000, 4000, 8000];
/** The first state has to arrive within this long, or the start fails. */
const FIRST_STATE_MS = 15_000;
/** The room is polled this often meanwhile: the API counts the player as here and says when the room is over. */
const PRESENCE_MS = 10_000;
/** A digest of the copy every this many patches (about once a second; the status line and tests compare them). */
const HASH_SEQ = 20;
/** Events a tab keeps for its next frame at most (a hidden tab draws no frames). */
const MAX_PENDING_EVENTS = 60;
/** Close codes of the game server (server/mp/main.ts): the session ends for good. */
const FINAL_CLOSE: Record<number, string> = {
  4001: 'replaced',
  4410: 'room_replaced',
};

type ServerMsg =
  | { t: 'hello'; v: number; seat: number; state: SimState }
  | { t: 'p'; v: number; ops: PatchOp[]; ev?: GameEvent[] }
  | { t: 'full'; v: number; state: SimState; ev?: GameEvent[] }
  | { t: 'ack'; key: number; id: number; r: CmdResult };

/** Replace the contents of the running shift's object in place (the map and the panels keep their reference). */
function replaceInPlace(sim: SimState, next: SimState): void {
  const target = sim as unknown as Record<string, unknown>;
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, next);
  if (!Array.isArray(sim.events)) sim.events = [];
}

/**
 * The tab's side of a shift the game server runs. The tab never steps the simulation: it applies the server's
 * patches to its copy and draws it. Commands go up the socket at once and come back as an acknowledgement with the
 * result, right after the patch that shows their effect.
 */
class ServerSession implements Session {
  readonly code: string;
  private ws: WebSocket | null = null;
  private stopped = false;
  private dirty = false;
  private seq = -1;
  private seat = -1;
  /** The current connection has had its hello: commands may go up it. */
  private live = false;
  private attempt = 0;
  private keySeq = 0;
  private outbox: { key: number; cmd: CoopCommand }[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private roomTag = '';
  private first: { resolve: (s: SimState) => void; reject: (e: unknown) => void } | null = null;
  /** Round trips of the latest commands (ms, click to acknowledgement), for the status line and tests. */
  private trips: number[] = [];
  private sentAt = new Map<number, number>();
  /** Digests of the copy at every HASH_SEQ-th patch: every client of the room gets the same numbered patches. */
  private history: { turn: number; hash: string }[] = [];
  /** The shift's seed (from its first state): the room's next round is another shift (section 11). */
  private seed: number | null = null;

  constructor(code: string) {
    this.code = code;
  }

  /** Connect and wait for the first state. */
  start(): Promise<SimState> {
    const p = new Promise<SimState>((resolve, reject) => {
      this.first = { resolve, reject };
    });
    const timeout = setTimeout(() => {
      if (!this.first) return;
      this.first.reject(new ApiError(0, 'mp_unavailable', 'The game server did not answer'));
      this.first = null;
      this.stop();
    }, FIRST_STATE_MS);
    void p.finally(() => clearTimeout(timeout)).catch(() => {});
    void this.connect();
    this.presence();
    return p;
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    this.reconnectTimer = null;
    this.presenceTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000, 'leave');
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    let ticket: { ticket: string; url: string };
    try {
      ticket = await fetchTicket(this.code);
    } catch (e) {
      if (this.stopped) return;
      const err = toApiError(e);
      if (err.status === 404 || err.status === 401 || err.status === 409) return this.end('gone', err.code);
      return this.retry(err.code);
    }
    if (this.stopped) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(socketUrl(ticket.url));
    } catch {
      return this.retry('network');
    }
    this.ws = ws;
    this.live = false;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', ticket: ticket.ticket }));
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data)) as ServerMsg;
      } catch {
        return;
      }
      this.handle(msg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws || this.stopped) return;
      this.ws = null;
      this.live = false;
      const final = FINAL_CLOSE[e.code];
      if (final) return this.end('gone', final);
      this.retry('network');
    };
  }

  private retry(code: string): void {
    if (this.stopped) return;
    if (useCoop.getState().status !== 'connecting' || this.attempt >= 2)
      setUi({ status: 'offline', error: code });
    const wait = RECONNECT_MS[Math.min(this.attempt, RECONNECT_MS.length - 1)];
    this.attempt++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, wait);
  }

  private end(status: CoopStatus, error: string | null): void {
    setUi({ status, error });
    if (this.first) {
      this.first.reject(new ApiError(409, error ?? 'gone', 'The shared shift is not available'));
      this.first = null;
    }
    this.stop();
  }

  /** The API keeps the player counted as here (the room's idle rule) and says when the room is gone. */
  private presence(): void {
    if (this.stopped) return;
    this.presenceTimer = setTimeout(async () => {
      try {
        const r = await pollRoom(this.code, this.roomTag);
        this.roomTag = r.v;
        // The host ended this round and the room has opened for (or started) the next one: this shift is over.
        const room = r.room;
        if (
          room &&
          this.seed !== null &&
          (room.state === 'lobby' || (room.seed !== null && room.seed !== this.seed))
        )
          return this.end('ended', 'round_over');
      } catch (e) {
        const err = toApiError(e);
        if (err.status === 404 || err.status === 401) return this.end('gone', err.code);
      }
      this.presence();
    }, PRESENCE_MS);
  }

  private current(): SimState | null {
    const sim = useGame.getState().sim;
    return sim?.coop?.code === this.code ? sim : null;
  }

  private handle(msg: ServerMsg): void {
    switch (msg.t) {
      case 'hello': {
        const state = msg.state;
        if (!state || !state.coop || state.coop.code !== this.code) return;
        // A reconnect found the room's next round on the game server: not this shift any more.
        if (this.seed !== null && state.seed !== this.seed) return this.end('ended', 'round_over');
        this.seed = state.seed;
        state.events = [];
        this.seq = msg.v;
        this.seat = msg.seat;
        this.attempt = 0;
        setUi({ seat: msg.seat, status: state.ended ? 'ended' : 'live', error: null });
        this.mirrorHost(state);
        if (this.first) {
          this.first.resolve(state);
          this.first = null;
        } else {
          const sim = this.current();
          if (sim) replaceInPlace(sim, state);
        }
        this.dirty = true;
        this.live = true;
        // Commands sent up a connection that broke before their answer: whether they counted shows in the state
        // just received, so their pending marks go. The ones never sent go now.
        const unsent = new Set(this.outbox.map((o) => o.key));
        for (const key of this.sentAt.keys()) if (!unsent.has(key)) this.sentAt.delete(key);
        useCoop.setState((u) => ({ pending: u.pending.filter((x) => unsent.has(x.key)) }));
        this.flushOutbox();
        return;
      }
      case 'p': {
        const sim = this.current();
        if (!sim || msg.v <= this.seq) return;
        this.seq = msg.v;
        if (Array.isArray(msg.ops) && msg.ops.length)
          applyPatch(sim as unknown as Record<string, unknown>, msg.ops);
        this.events(sim, msg.ev);
        this.dirty = true;
        if (msg.v % HASH_SEQ === 0) {
          this.history.push({ turn: msg.v, hash: simDigest(sim) });
          if (this.history.length > 30) this.history.shift();
        }
        return;
      }
      case 'full': {
        const sim = this.current();
        if (!sim || !msg.state?.coop) return;
        this.seq = msg.v;
        msg.state.events = sim.events;
        replaceInPlace(sim, msg.state);
        this.events(sim, msg.ev);
        this.dirty = true;
        return;
      }
      case 'ack': {
        const sent = this.sentAt.get(msg.key);
        if (sent !== undefined) {
          this.sentAt.delete(msg.key);
          this.trips.push(now() - sent);
          if (this.trips.length > 20) this.trips.shift();
        }
        const p = useCoop.getState().pending.find((x) => x.key === msg.key);
        useCoop.setState((u) => ({ pending: u.pending.filter((x) => x.key !== msg.key) }));
        if (p && msg.r) {
          const cmd: LogCmd = { id: msg.id, t: 0, s: this.seat, k: p.k, a: p.a };
          for (const l of ownResults) l(cmd, msg.r);
        }
        return;
      }
    }
  }

  private events(sim: SimState, ev: GameEvent[] | undefined): void {
    if (!Array.isArray(ev) || !ev.length) return;
    if (!Array.isArray(sim.events)) sim.events = [];
    sim.events.push(...ev);
    if (sim.events.length > MAX_PENDING_EVENTS) sim.events.splice(0, sim.events.length - MAX_PENDING_EVENTS);
  }

  private mirrorHost(sim: SimState): void {
    const host = sim.coop?.host ?? 0;
    const u = useCoop.getState();
    if (u.host !== host || u.isHost !== (host === this.seat)) setUi({ host, isHost: host === this.seat });
  }

  issue(cmd: CoopCommand): void {
    if (this.stopped) return;
    const key = ++this.keySeq;
    useCoop.setState((u) => ({ pending: [...u.pending, { key, k: cmd.k, a: cmd.a, sentAt: now() }] }));
    this.outbox.push({ key, cmd });
    this.flushOutbox();
  }

  private flushOutbox(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.live) return;
    for (const { key, cmd } of this.outbox.splice(0)) {
      this.sentAt.set(key, now());
      ws.send(JSON.stringify({ t: 'cmd', key, k: cmd.k, a: cmd.a }));
    }
  }

  /** Called every animation frame: nothing to step, only whether a patch changed the copy since the last frame. */
  frame(sim: SimState): boolean {
    const c = sim.coop;
    if (!c) return false;
    this.mirrorHost(sim);
    const u = useCoop.getState();
    if (sim.ended && u.status === 'live') setUi({ status: 'ended' });
    const g = useGame.getState();
    if (g.speedIndex !== c.speed)
      useGame.setState({ speedIndex: c.speed, lastSpeedIndex: c.speed || g.lastSpeedIndex });
    const moved = this.dirty;
    this.dirty = false;
    return moved;
  }

  debug() {
    return { engine: 'server', seq: this.seq, trips: this.trips.slice(), hashes: this.history.slice() };
  }
}

// ── The tab's session ────────────────────────────────────────────────────────

let session: Session | null = null;

/**
 * Into a co-op room's shift (also a rejoin after a reload): on the game server when the room says so, else the
 * latest snapshot plus the log.
 */
export async function startCoop(code: string, shift: RoomShift, engine: RoomEngine = ''): Promise<void> {
  stopCoop();
  if (engine === 'server') {
    const s = new ServerSession(code);
    session = s;
    resetUi(code);
    const sim = await s.start();
    if (session !== s) return;
    useGame.getState().resumeShift(sim);
    useGame.setState({ speedIndex: sim.coop?.speed ?? 1 });
    return;
  }
  const s = new CoopSession(code, shift);
  session = s;
  resetUi(code);
  const sim = await s.load();
  if (session !== s) return;
  useGame.getState().resumeShift(sim);
  // A co-op shift is never paused locally: the host's speed applies.
  useGame.setState({ speedIndex: sim.coop?.speed ?? 1 });
  s.start();
}

function resetUi(code: string): void {
  useCoop.setState({
    code,
    seat: -1,
    host: 0,
    isHost: false,
    status: 'connecting',
    behind: 0,
    pending: [],
    pingsSeen: 0,
    resyncs: 0,
    error: null,
  });
}

export function stopCoop(): void {
  session?.stop();
  session = null;
  useCoop.setState({ code: null, pending: [] });
}

export const coopActive = (): boolean => !!session;

/** Send a player command through the room. False when no co-op shift runs (the caller then acts locally). */
export function coopIssue(k: string, a: unknown[]): boolean {
  if (!session) return false;
  session.issue({ k, a });
  return true;
}

/** Roles this player covers in the running co-op shift, or null in single player. */
export function myRoles(sim: SimState | null | undefined): CoopRole[] | null {
  if (!sim?.coop) return null;
  return rolesOf(sim.coop, useCoop.getState().seat);
}

/** Can this player do a role's work right now? Always true in single player. */
export function useCan(role: CoopRole): boolean {
  const seat = useCoop((s) => s.seat);
  useGame((g) => g.tick);
  const sim = useGame((g) => g.sim);
  if (!sim?.coop) return true;
  return rolesOf(sim.coop, seat).includes(role);
}

/** Is one of this player's co-op commands of kind `k` about `id` still on its way (hook)? False in single player. */
export function usePending(k: string, id: string): boolean {
  return useCoop((s) => s.pending.some((p) => p.k === k && p.a[0] === id));
}

/** Names of the players covering a role now ('' when nobody), or null in single player and sector co-op (hook). */
export function useCoopNames(role: CoopRole): string | null {
  useGame((g) => g.tick);
  const sim = useGame((g) => g.sim);
  const c = sim?.coop;
  if (!c || c.mode === 'sector') return null;
  const seats = rolesHolders(c, role);
  return c.seats
    .filter((x) => seats.includes(x.seat))
    .map((x) => x.name)
    .join(', ');
}

// ── Sector co-op: whose desk ─────────────────────────────────────────────────

/** Sector co-op: this player's desk ('' while away), or null on any other shift. */
export function myDesk(sim: SimState | null | undefined): string | null {
  if (!sim?.coop?.sec) return null;
  return seatDesk(sim.coop, useCoop.getState().seat);
}

/** Sector co-op: this player's desk (hook), or null on any other shift. */
export function useMyDesk(): string | null {
  const seat = useCoop((s) => s.seat);
  useGame((g) => g.tick);
  const sim = useGame((g) => g.sim);
  if (!sim?.coop?.sec) return null;
  return seatDesk(sim.coop, seat);
}

/** Something a desk may own: an incident, a crew, a radio message or a 112 call. */
export interface DeskTarget {
  incident?: Pick<Incident, 'id' | 'tags' | 'location'>;
  unit?: Unit;
  msg?: RadioMsg;
  call?: ActiveCall;
}

/** The desk a target belongs to ('' for anybody's: a shared on-call crew, a general radio message). Never writes. */
export function deskOfTarget(sim: SimState, t: DeskTarget): string {
  if (t.incident) return incidentDesk(sim, t.incident);
  if (t.unit) return unitDesk(sim, t.unit);
  if (t.msg) return msgDesk(sim, t.msg);
  if (t.call) return callDesk(sim, t.call);
  return '';
}

/** May this player work the target? Always true outside sector co-op (the role checks still apply). */
export function deskCan(sim: SimState | null | undefined, t: DeskTarget): boolean {
  const mine = myDesk(sim);
  if (mine === null || !sim) return true;
  const d = deskOfTarget(sim, t);
  return d === '' || (mine !== '' && d === mine);
}

/** deskCan as a hook (re-renders with the shift). */
export function useDeskCan(t: DeskTarget): boolean {
  useCoop((s) => s.seat);
  useGame((g) => g.tick);
  const sim = useGame((g) => g.sim);
  return deskCan(sim, t);
}

/** Is the running shift a co-op one (hook)? */
export function useIsCoop(): boolean {
  return useGame((g) => !!g.sim?.coop);
}

export function coopDebug() {
  return session?.debug() ?? null;
}

// The game loop asks here while a co-op shift runs (no import of this module from the store: no cycle).
loopHooks.coop = (sim) => session?.frame(sim) ?? false;
loopHooks.coopSpeed = (i) => {
  if (!session) return;
  const u = useCoop.getState();
  const g = useGame.getState();
  if (!u.isHost || !g.sim?.coop) return;
  session.issue({ k: 'speed', a: [i] });
};
loopHooks.coopStop = () => stopCoop();
