/**
 * EPD mänguserver (docs/MULTIPLAYER.md section 9): runs the shared shifts of the co-op rooms. A small Node service
 * next to the PHP API: HTTP `GET /mp/health`, `POST /mp/kick` (the PHP API's signed notice that the host removed a
 * player) and a WebSocket at `/mp/ws`. A client connects, sends its entry ticket
 * (from `POST /api/rooms/{code}/ticket`), gets the room's whole state and then a patch every piece; its commands go
 * up the same socket and take effect at the next piece, about a tenth of a second after the click.
 *
 * Environment: EPD_MP_PORT (8790), EPD_MP_HOST (127.0.0.1), EPD_MP_DIR (the shared folder with `secret`; the rooms
 * are saved under `rooms/` there every 30 s and on shutdown, so a restart continues them).
 */
import { createServer } from 'node:http';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { WebSocketServer, type WebSocket } from 'ws';
import { MpRoom, PIECE_MS, socketPeer, type Peer, type SavedRoom } from './room';
import { SecretFile, signTicket, verifyKick, verifyTicket } from './ticket';

const PORT = Number(process.env.EPD_MP_PORT ?? 8790);
const HOST = process.env.EPD_MP_HOST ?? '127.0.0.1';
const DIR = process.env.EPD_MP_DIR ?? './data-dev/mp';
const ROOMS_DIR = join(DIR, 'rooms');
/** A room nobody is connected to is dropped after this long (an ended one sooner). */
const IDLE_MS = 15 * 60_000;
const ENDED_IDLE_MS = 2 * 60_000;
const SAVE_EVERY_MS = 30_000;
/** A connection has this long to send its ticket. */
const AUTH_MS = 10_000;
const HEARTBEAT_MS = 15_000;

const secret = new SecretFile(DIR);
const rooms = new Map<string, MpRoom>();

/** A room of this server: signs its result with the shared secret at the end. */
function withSigner(r: MpRoom): MpRoom {
  r.signer = (payload) => {
    const key = secret.get();
    return key ? signTicket(payload, key) : null;
  };
  return r;
}

function log(msg: string): void {
  console.log(`${new Date().toISOString()} ${msg}`);
}

// ── Saving and loading rooms ─────────────────────────────────────────────────

function saveRoom(r: MpRoom): void {
  try {
    mkdirSync(ROOMS_DIR, { recursive: true });
    const file = join(ROOMS_DIR, `${r.code}.json.gz`);
    writeFileSync(`${file}.tmp`, gzipSync(JSON.stringify(r.save())));
    renameSync(`${file}.tmp`, file);
  } catch (err) {
    log(`save ${r.code} failed: ${String(err)}`);
  }
}

function forgetRoom(r: MpRoom): void {
  rooms.delete(r.code);
  rmSync(join(ROOMS_DIR, `${r.code}.json.gz`), { force: true });
}

function loadRooms(): void {
  let files: string[] = [];
  try {
    files = readdirSync(ROOMS_DIR).filter((f) => f.endsWith('.json.gz'));
  } catch {
    return;
  }
  const now = Date.now();
  for (const f of files) {
    const file = join(ROOMS_DIR, f);
    try {
      if (now - statSync(file).mtimeMs > IDLE_MS) {
        rmSync(file, { force: true });
        continue;
      }
      const saved = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as SavedRoom;
      if (saved?.v !== 1 || !saved.room || !saved.sim?.coop) throw new Error('not a saved room');
      const r = withSigner(new MpRoom(saved.room, saved, now));
      rooms.set(r.code, r);
      log(`room ${r.code} restored`);
    } catch (err) {
      log(`room file ${f} skipped: ${String(err)}`);
      rmSync(file, { force: true });
    }
  }
}

// ── The piece clock ──────────────────────────────────────────────────────────

let clock = Date.now();
let lastSave = Date.now();
let timer: ReturnType<typeof setTimeout> | null = null;

function pieces(): void {
  const now = Date.now();
  // Late by more than a few pieces (the machine was busy or asleep): skip ahead instead of racing to catch up.
  if (now - clock > PIECE_MS * 5) clock = now - PIECE_MS;
  while (now - clock >= PIECE_MS) {
    clock += PIECE_MS;
    for (const r of rooms.values()) {
      try {
        r.tick(now);
      } catch (err) {
        log(`room ${r.code} tick failed: ${String(err)}`);
      }
    }
  }
  for (const r of [...rooms.values()]) {
    if (r.emptySince !== null && now - r.emptySince > (r.ended ? ENDED_IDLE_MS : IDLE_MS)) {
      log(`room ${r.code} dropped (nobody connected)`);
      forgetRoom(r);
    }
  }
  if (now - lastSave >= SAVE_EVERY_MS) {
    lastSave = now;
    for (const r of rooms.values()) if (r.connected || !r.ended) saveRoom(r);
  }
  timer = setTimeout(pieces, Math.max(5, clock + PIECE_MS - Date.now()));
}

// ── HTTP and WebSocket ───────────────────────────────────────────────────────

const http = createServer((req, res) => {
  const url = (req.url ?? '').split('?')[0];
  if (req.method === 'GET' && url === '/mp/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, secret: secret.get() !== null }));
    return;
  }
  if (req.method === 'POST' && url === '/mp/kick') {
    // The PHP API's signed notice (server/lib/mp.php epd_mp_kick): a removed player's seat leaves now.
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > 16384) req.destroy();
    });
    req.on('end', () => {
      let token: unknown = null;
      try {
        token = (JSON.parse(body) as { kick?: unknown }).kick;
      } catch {
        /* answered below */
      }
      const kick = verifyKick(token, secret.get());
      const room = kick ? rooms.get(kick.code) : undefined;
      if (kick && room) {
        room.kick(kick.seat);
        log(`room ${kick.code}: seat ${kick.seat} removed by the host`);
      }
      res.writeHead(kick ? 200 : 403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(kick ? { ok: true, found: !!room } : { ok: false, error: 'bad_kick' }));
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end('{"error":"not_found"}');
});

// 16 KiB: the first message carries the ticket, which carries a room's custom force (src/sim/custom.ts, up to 40 crews).
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 16384,
  perMessageDeflate: { threshold: 1024 },
});

http.on('upgrade', (req, socket, head) => {
  if ((req.url ?? '').split('?')[0] !== '/mp/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => connection(ws));
});

interface Live extends WebSocket {
  alive?: boolean;
}

function connection(ws: Live): void {
  let room: MpRoom | null = null;
  let peer: Peer | null = null;
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  const auth = setTimeout(() => ws.close(4401, 'no_ticket'), AUTH_MS);
  ws.on('message', (data) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(data)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (!peer) {
      if (msg.t !== 'auth') return;
      const ticket = verifyTicket(msg.ticket, secret.get());
      if (!ticket) {
        ws.close(4401, 'bad_ticket');
        return;
      }
      clearTimeout(auth);
      let r = rooms.get(ticket.code);
      // A code is reused only after the old room is long gone: a different start is a new shift.
      if (r && r.room.started !== ticket.room.started) {
        r.closeAll(4410, 'room_replaced');
        forgetRoom(r);
        r = undefined;
      }
      if (!r) {
        try {
          r = withSigner(new MpRoom(ticket.room));
        } catch (err) {
          log(`room ${ticket.code} could not start: ${String(err)}`);
          ws.close(4500, 'room_failed');
          return;
        }
        rooms.set(r.code, r);
        log(`room ${r.code} started (${ticket.room.mode})`);
      }
      room = r;
      peer = socketPeer(ws, ticket.seat, ticket.user);
      room.join(peer);
      return;
    }
    if (msg.t === 'cmd') room?.command(peer, msg.key, msg.k, msg.a);
  });
  ws.on('close', () => {
    clearTimeout(auth);
    if (room && peer) room.leave(peer);
  });
  ws.on('error', () => ws.terminate());
}

const heartbeat = setInterval(() => {
  for (const ws of wss.clients as Set<Live>) {
    if (ws.alive === false) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

function shutdown(sig: string): void {
  log(`${sig}: saving ${rooms.size} rooms`);
  if (timer) clearTimeout(timer);
  clearInterval(heartbeat);
  for (const r of rooms.values()) {
    saveRoom(r);
    r.closeAll(1012, 'restart');
  }
  http.close();
  setTimeout(() => process.exit(0), 200).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

mkdirSync(ROOMS_DIR, { recursive: true });
loadRooms();
http.listen(PORT, HOST, () => {
  log(`EPD mp listening on ${HOST}:${PORT}, data ${DIR}`);
  clock = Date.now();
  pieces();
});
