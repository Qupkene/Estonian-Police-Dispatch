/**
 * Entry tickets (docs/MULTIPLAYER.md section 9.2). The PHP API hands a room member a ticket for the room's running
 * shift: `base64url(json).base64url(hmac-sha256)`, signed with the secret both services read from the shared data
 * folder (`<dir>/secret`, written by PHP on first use). It names the room, the shift (seed, day, options), who sits
 * where, the player's seat and account, and expires after a minute. The game server trusts nothing else a client
 * says about who it is.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The room as the ticket describes it (the PHP room row at the start of the shift). */
export interface TicketRoom {
  code: string;
  mode: 'role' | 'sector';
  seed: number;
  day: string;
  /** The room's options in the API's JSON shape (src/net/rooms.ts parseOptions reads them). */
  options: unknown;
  /** Server ms when the shift started: tells a new shift of a reused code from the old one. */
  started: number;
  /** The setup command's arguments: [hostSeat, [[seat, role or desk, name], ...]]. */
  setup: [number, [number, string, string][]];
}

export interface Ticket {
  v: 1;
  code: string;
  user: number;
  seat: number;
  name: string;
  /** Server ms after which the ticket is refused. */
  exp: number;
  room: TicketRoom;
}

const b64url = (buf: Buffer): string => buf.toString('base64url');

/** The shared secret, re-read when the file changes (PHP creates it lazily, so it may appear after we start). */
export class SecretFile {
  private value: string | null = null;
  private mtime = -1;
  constructor(private readonly dir: string) {}

  get(): string | null {
    const file = join(this.dir, 'secret');
    try {
      const st = statSync(file);
      if (st.mtimeMs !== this.mtime) {
        this.value = readFileSync(file, 'utf8').trim() || null;
        this.mtime = st.mtimeMs;
      }
    } catch {
      this.value = null;
      this.mtime = -1;
    }
    return this.value;
  }
}

/** Sign a payload the way server/lib/mp.php does (tests and tools). */
export function signTicket(payload: object, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const mac = createHmac('sha256', secret).update(body).digest();
  return `${body}.${b64url(mac)}`;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseRoom(v: unknown): TicketRoom | null {
  if (!isObj(v)) return null;
  const { code, mode, seed, day, started, setup } = v;
  if (typeof code !== 'string' || !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return null;
  if (mode !== 'role' && mode !== 'sector') return null;
  if (typeof seed !== 'number' || typeof day !== 'string' || typeof started !== 'number') return null;
  if (!Array.isArray(setup) || typeof setup[0] !== 'number' || !Array.isArray(setup[1])) return null;
  const rows: [number, string, string][] = [];
  for (const r of setup[1] as unknown[]) {
    if (!Array.isArray(r) || typeof r[0] !== 'number') return null;
    rows.push([r[0], typeof r[1] === 'string' ? r[1] : '', typeof r[2] === 'string' ? r[2] : '']);
  }
  return { code, mode, seed, day, options: v.options, started, setup: [setup[0], rows] };
}

/** The payload of a token signed with the shared secret, or null when the signature does not hold. */
function verifySigned(token: unknown, secret: string | null): Record<string, unknown> | null {
  if (!secret || typeof token !== 'string' || token.length > 16000) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = Buffer.from(token.slice(dot + 1), 'base64url');
  const want = createHmac('sha256', secret).update(body).digest();
  if (mac.length !== want.length || !timingSafeEqual(mac, want)) return null;
  try {
    const p: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return isObj(p) ? p : null;
  } catch {
    return null;
  }
}

/** A kick from the PHP API (server/lib/mp.php epd_mp_kick): the room, the seat and the account, if it holds. */
export function verifyKick(
  token: unknown,
  secret: string | null,
  now = Date.now(),
): { code: string; seat: number; user: number } | null {
  const p = verifySigned(token, secret);
  if (!p || p.v !== 1 || p.kind !== 'kick' || typeof p.exp !== 'number' || p.exp < now) return null;
  if (typeof p.code !== 'string' || typeof p.seat !== 'number' || typeof p.user !== 'number') return null;
  return { code: p.code, seat: p.seat, user: p.user };
}

/** The ticket if its signature holds and it has not expired, else null. */
export function verifyTicket(token: unknown, secret: string | null, now = Date.now()): Ticket | null {
  const p = verifySigned(token, secret);
  if (!p || p.v !== 1 || p.kind !== undefined || typeof p.exp !== 'number' || p.exp < now) return null;
  if (typeof p.code !== 'string' || typeof p.user !== 'number' || typeof p.seat !== 'number') return null;
  const room = parseRoom(p.room);
  if (!room || room.code !== p.code) return null;
  return {
    v: 1,
    code: p.code,
    user: p.user,
    seat: p.seat,
    name: typeof p.name === 'string' ? p.name : '',
    exp: p.exp,
    room,
  };
}
