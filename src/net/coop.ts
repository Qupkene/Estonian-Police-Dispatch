// Ühisvahetus over plain HTTP (docs/MULTIPLAYER.md section 4, server/lib/coop.php): post command batches, read the
// log with the server's clock, report digests, and move the host's gzipped snapshot up and down. No UI strings and
// no store: src/store/coop.ts drives these.
import type { CoopCommand, CoopRole, LogCmd } from '@/sim/coop';
import { API_BASE, API_TIMEOUT_MS, ApiError, apiHeaders, request, toApiError } from './api';
import { isObj } from './sync';

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const path = (code: string, rest: string) => `/rooms/${encodeURIComponent(code)}${rest}`;

/** One answer of GET /api/rooms/{code}/log. */
export interface LogReply {
  state: string;
  /** The server's turn when it answered. */
  turn: number;
  /** The server's clock (ms) when it answered. */
  now: number;
  started: number | null;
  turnMs: number;
  delay: number;
  seat: number;
  host: number;
  isHost: boolean;
  /** This client's digest differed from the host's: load a snapshot and replay. */
  resync: boolean;
  /** The host is asked for a snapshot now. */
  snapReq: boolean;
  /** Turn of the latest snapshot, null when there is none yet. */
  snap: number | null;
  /** More commands wait after these (ask again at once). */
  more: boolean;
  cmds: LogCmd[];
}

function parseCmd(v: unknown): LogCmd | null {
  if (
    !isObj(v) ||
    typeof v.id !== 'number' ||
    typeof v.t !== 'number' ||
    typeof v.s !== 'number' ||
    typeof v.k !== 'string'
  )
    return null;
  return { id: v.id, t: v.t, s: v.s, k: v.k, a: Array.isArray(v.a) ? v.a : [] };
}

export function parseLog(v: unknown): LogReply {
  const o = isObj(v) ? v : {};
  if (!Array.isArray(o.cmds) || typeof o.turn !== 'number' || typeof o.now !== 'number')
    throw new ApiError(200, 'bad_response', 'Not a log answer');
  return {
    state: typeof o.state === 'string' ? o.state : 'closed',
    turn: num(o.turn),
    now: num(o.now),
    started: typeof o.started === 'number' ? o.started : null,
    turnMs: num(o.turnMs, 1000) || 1000,
    delay: num(o.delay, 2),
    seat: num(o.seat),
    host: num(o.host),
    isHost: o.isHost === true,
    resync: o.resync === true,
    snapReq: o.snapReq === true,
    snap: typeof o.snap === 'number' ? o.snap : null,
    more: o.more === true,
    cmds: o.cmds.map(parseCmd).filter((c): c is LogCmd => !!c),
  };
}

export interface LogQuery {
  after: number;
  /** Digest to report: turn and 16 hex digits. */
  hash?: { turn: number; hash: string };
  /** Just resynced: clear the flag. */
  ack?: boolean;
}

export async function fetchLog(code: string, q: LogQuery): Promise<LogReply> {
  const p = new URLSearchParams({ after: String(Math.max(0, Math.floor(q.after))) });
  if (q.hash) p.set('h', `${q.hash.turn}:${q.hash.hash}`);
  if (q.ack) p.set('ack', '1');
  return parseLog(await request<unknown>('GET', path(code, `/log?${p}`), undefined, { timeout: 6000 }));
}

export async function postCommands(
  code: string,
  cmds: CoopCommand[],
): Promise<{ turn: number; ids: number[] }> {
  const res = await request<unknown>('POST', path(code, '/cmd'), { cmds });
  const o = isObj(res) ? res : {};
  return {
    turn: num(o.turn),
    ids: Array.isArray(o.ids) ? o.ids.filter((x): x is number => typeof x === 'number') : [],
  };
}

export async function setRoomRole(code: string, role: CoopRole): Promise<unknown> {
  return request<unknown>('POST', path(code, '/role'), { role });
}

/** Sector co-op: this player's desk (one of the room's sectors) in the lobby. */
export async function setRoomDesk(code: string, desk: string): Promise<unknown> {
  return request<unknown>('POST', path(code, '/desk'), { desk });
}

// ── Snapshots ────────────────────────────────────────────────────────────────

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export const gzipText = (text: string): Promise<Uint8Array> =>
  pipe(new TextEncoder().encode(text), new CompressionStream('gzip'));
export const gunzipText = async (data: Uint8Array): Promise<string> =>
  new TextDecoder().decode(await pipe(data, new DecompressionStream('gzip')));

async function binary(
  method: 'GET' | 'PUT',
  url: string,
  body?: Uint8Array,
  timeout = API_TIMEOUT_MS * 2,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const headers = apiHeaders(method);
    if (body) headers['Content-Type'] = 'application/gzip';
    const res = await fetch(API_BASE + url, {
      method,
      headers,
      body: body as BodyInit | undefined,
      credentials: 'include',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let code = `http_${res.status}`;
      try {
        const j = (await res.json()) as unknown;
        if (isObj(j) && typeof j.error === 'string') code = j.error;
      } catch {
        /* not JSON */
      }
      throw new ApiError(res.status, code, `HTTP ${res.status}`);
    }
    return res;
  } catch (e) {
    throw toApiError(e);
  } finally {
    clearTimeout(timer);
  }
}

/** Upload the host's state at the end of `turn`, holding every command up to log id `cmd`. */
export async function putSnapshot(code: string, turn: number, cmd: number, json: string): Promise<number> {
  const gz = await gzipText(json);
  await binary('PUT', path(code, `/snapshot?turn=${turn}&cmd=${cmd}`), gz);
  return gz.length;
}

/** The latest snapshot, or null when the room has none yet. */
export async function fetchSnapshot(
  code: string,
): Promise<{ turn: number; cmd: number; json: string } | null> {
  try {
    const res = await binary('GET', path(code, '/snapshot'));
    const turn = Number(res.headers.get('X-EPD-Turn'));
    const cmd = Number(res.headers.get('X-EPD-Cmd'));
    const json = await gunzipText(new Uint8Array(await res.arrayBuffer()));
    if (!Number.isFinite(turn) || !Number.isFinite(cmd))
      throw new ApiError(200, 'bad_response', 'Snapshot without its turn');
    return { turn, cmd, json };
  } catch (e) {
    const err = toApiError(e);
    if (err.status === 404 && err.code === 'no_snapshot') return null;
    throw err;
  }
}
