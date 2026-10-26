/**
 * Integration tests for the PHP API in server/ (contract: docs/SERVER.md). They start PHP's
 * built-in server with a temporary EPD_DATA and talk to it over HTTP like the frontend does.
 * The whole suite is skipped when `php` (8.1+ with pdo_sqlite and mbstring) is not installed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { signTicket, verifyKick, verifyTicket } from '../server/mp/ticket';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVER_DIR = join(ROOT, 'server');
const ROUTER = join(SERVER_DIR, 'dev-router.php');

function hasPhp(): boolean {
  const probe =
    'echo (PHP_VERSION_ID >= 80100 && extension_loaded("pdo_sqlite") && extension_loaded("mbstring")) ? "ok" : "no";';
  const r = spawnSync('php', ['-r', probe], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === 'ok';
}
const HAS_PHP = hasPhp();
/** NFC normalisation of names needs the intl extension (present in the production image). */
const HAS_INTL =
  HAS_PHP &&
  spawnSync('php', ['-r', 'echo class_exists("Normalizer") ? "ok" : "no";'], { encoding: 'utf8' }).stdout ===
    'ok';

// ------------------------------------------------------------------ helpers

function phpFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return phpFiles(path);
    return path.endsWith('.php') ? [path] : [];
  });
}

/** En and em dash, written as escapes so this file does not contain them either. */
const DASHES = new RegExp('[\\u2013\\u2014]');

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolvePort(port));
    });
  });
}

interface PhpServer {
  base: string;
  proc: ChildProcess;
  log: string[];
}

async function startPhp(env: Record<string, string>): Promise<PhpServer> {
  const port = await freePort();
  const proc = spawn('php', ['-S', `127.0.0.1:${port}`, ROUTER], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log: string[] = [];
  const keep = (chunk: Buffer) => {
    log.push(chunk.toString());
    if (log.length > 200) log.shift();
  };
  proc.stdout?.on('data', keep);
  proc.stderr?.on('data', keep);
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`php -S exited early:\n${log.join('')}`);
    try {
      // Any HTTP answer means the server is up (the broken-data server answers 500).
      const res = await fetch(`${base}/api/health`);
      await res.arrayBuffer();
      return { base, proc, log };
    } catch {
      await sleep(50);
    }
  }
  proc.kill();
  throw new Error(`php -S did not answer on ${base}:\n${log.join('')}`);
}

async function stopPhp(server: PhpServer | undefined): Promise<void> {
  if (!server || server.proc.exitCode !== null) return;
  const exited = new Promise((done) => server.proc.once('exit', done));
  server.proc.kill('SIGTERM');
  await Promise.race([exited, sleep(2000)]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

interface Reply {
  status: number;
  json: Json;
  text: string;
  headers: Headers;
  setCookies: string[];
}

interface RequestOptions {
  body?: unknown;
  raw?: string;
  /** Send `X-EPD: 1`; defaults to true for every method except GET. */
  csrf?: boolean;
  headers?: Record<string, string>;
}

/** A browser-like client: keeps cookies, sends X-EPD and (behind the "relay") X-Forwarded-For. */
class Client {
  readonly cookies = new Map<string, string>();

  constructor(
    private readonly base: string,
    private readonly ip?: string,
  ) {}

  get session(): string | undefined {
    return this.cookies.get('EPDSESS');
  }

  async req(method: string, path: string, opts: RequestOptions = {}): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (this.ip) headers['X-Forwarded-For'] = this.ip;
    if (opts.csrf ?? method !== 'GET') headers['X-EPD'] = '1';
    const body = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size > 0) headers['Cookie'] = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    Object.assign(headers, opts.headers);
    const res = await fetch(this.base + path, { method, headers, body });
    const setCookies = res.headers.getSetCookie();
    for (const line of setCookies) this.store(line);
    const text = await res.text();
    let json: Json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = undefined;
    }
    return { status: res.status, json, text, headers: res.headers, setCookies };
  }

  get = (path: string, opts?: RequestOptions) => this.req('GET', path, opts);
  post = (path: string, body?: unknown, opts?: RequestOptions) => this.req('POST', path, { ...opts, body });
  put = (path: string, opts?: RequestOptions) => this.req('PUT', path, opts);
  del = (path: string, body?: unknown, opts?: RequestOptions) => this.req('DELETE', path, { ...opts, body });

  private store(line: string): void {
    const [pair, ...attrs] = line.split(';');
    const eq = pair.indexOf('=');
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const expired = value === '' || value === 'deleted' || attrs.some((a) => /^\s*max-age=0\s*$/i.test(a));
    if (expired) this.cookies.delete(name);
    else this.cookies.set(name, value);
  }
}

/** Unique documentation-range client IPs, so tests do not share rate-limit buckets. */
let ipCounter = 10;
const nextIp = () => `203.0.113.${ipCounter++}`;

const SHIFT = {
  regionId: 'pohja',
  mode: 'career',
  difficulty: 'normal',
  score: 80,
  grade: 'A',
  incidents: 31,
  arrests: 4,
  start: 1_790_000_000_000,
};

const HOOK_SECRET = 'test-secret-1f2e3d';
const SHA = 'a'.repeat(39) + '1';

function workflowRun(
  over: Partial<
    Record<'action' | 'conclusion' | 'head_branch' | 'event' | 'name' | 'repo' | 'sha', string>
  > = {},
) {
  return {
    action: over.action ?? 'completed',
    workflow_run: {
      id: 42,
      name: over.name ?? 'CI',
      head_branch: over.head_branch ?? 'main',
      head_sha: over.sha ?? SHA,
      event: over.event ?? 'push',
      status: 'completed',
      conclusion: over.conclusion ?? 'success',
      head_repository: { full_name: over.repo ?? 'Qupkene/Estonian-Police-Dispatch' },
    },
    repository: { full_name: 'Qupkene/Estonian-Police-Dispatch' },
  };
}

const sign = (body: string, secret = HOOK_SECRET) =>
  'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

// ------------------------------------------------------------------ suite

describe.skipIf(!HAS_PHP)('PHP API server', { timeout: 60_000 }, () => {
  let dataDir: string;
  let main: PhpServer;
  let untrusted: PhpServer;
  let broken: PhpServer;
  let base: string;
  let alice: Client;
  let bob: Client;
  let bobId = 0;
  /** A room Bob hosts when his account is deleted. */
  let bobRoom = '';

  const client = (ip: string | undefined = nextIp()) => new Client(base, ip);
  const register = (c: Client, name: string, password = 'salajane-123') =>
    c.post('/api/register', { name, password });
  const login = (c: Client, name: string, password = 'salajane-123', headers?: Record<string, string>) =>
    c.post('/api/login', { name, password }, { headers });

  /** SQL against the test database through PHP's PDO (the test runner has no SQLite module). */
  const sql = (query: string): string => {
    const code = `$db = new PDO('sqlite:' . $argv[1]); echo json_encode($db->query($argv[2])->fetchAll(PDO::FETCH_NUM));`;
    const r = spawnSync('php', ['-r', code, join(dataDir, 'epd.sqlite'), query], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    return r.stdout;
  };

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'epd-server-test-'));
    writeFileSync(join(dataDir, 'not-a-dir'), 'x');
    // The built frontend's page, for a challenge link's preview (EPD_WWW, server/lib/challenges.php).
    mkdirSync(join(dataDir, 'www'));
    copyFileSync(join(ROOT, 'index.html'), join(dataDir, 'www', 'index.html'));
    [main, untrusted, broken] = await Promise.all([
      // The test runner plays the relay: X-Forwarded-For from 127.0.0.1 is trusted.
      // EPD_TEST_CLOCK: X-EPD-Test-Now sets the clock of the daily challenge's day rules.
      startPhp({
        EPD_DATA: dataDir,
        EPD_TRUSTED_PROXY: '127.0.0.1',
        EPD_FAST_HASH: '1',
        EPD_TEST_CLOCK: '1',
        EPD_WWW: join(dataDir, 'www'),
      }),
      // Same data, but the relay is somebody else: X-Forwarded-For must be ignored.
      startPhp({ EPD_DATA: dataDir, EPD_TRUSTED_PROXY: '10.99.0.1', EPD_FAST_HASH: '1' }),
      // Data directory cannot be created: every request fails with a clean 500.
      startPhp({ EPD_DATA: join(dataDir, 'not-a-dir', 'sub'), EPD_TRUSTED_PROXY: '' }),
    ]);
    base = main.base;
  }, 60_000);

  afterAll(async () => {
    await Promise.all([stopPhp(main), stopPhp(untrusted), stopPhp(broken)]);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  describe('basics', () => {
    it('answers /api/health with JSON and no-store', async () => {
      const r = await client().get('/api/health?probe=1');
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ ok: true, accounts: true });
      expect(typeof r.json.version).toBe('string');
      expect(r.json.version.length).toBeGreaterThan(0);
      expect(r.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect(existsSync(join(dataDir, 'epd.sqlite'))).toBe(true);
      expect(existsSync(join(dataDir, 'sessions'))).toBe(false);
    });

    it('answers unknown routes with 404 JSON and wrong methods with 405', async () => {
      const c = client();
      const missing = await c.get('/api/nope');
      expect(missing.status).toBe(404);
      expect(missing.json.error).toBe('not_found');
      expect(typeof missing.json.message).toBe('string');
      expect((await c.get('/api')).status).toBe(404);
      const outside = await c.get('/index.html');
      expect(outside.status).toBe(404);
      const wrong = await c.get('/api/login');
      expect(wrong.status).toBe(405);
      expect(wrong.json.error).toBe('method_not_allowed');
      expect(wrong.headers.get('allow')).toBe('POST');
    });

    it('requires X-EPD: 1 on state-changing requests', async () => {
      const c = client();
      const r = await c.post('/api/login', { name: 'whoever', password: 'whatever-1' }, { csrf: false });
      expect(r.status).toBe(403);
      expect(r.json.error).toBe('csrf');
      expect((await c.put('/api/save/career', { raw: '{}', csrf: false })).status).toBe(403);
      expect((await c.del('/api/me', { password: 'x' }, { csrf: false })).status).toBe(403);
      expect((await c.post('/api/logout', undefined, { headers: { 'X-EPD': '0' } })).status).toBe(403);
    });

    it('rejects malformed JSON bodies', async () => {
      const c = client();
      const r = await c.req('POST', '/api/register', { raw: '{"name": ' });
      expect(r.status).toBe(400);
      expect(r.json.error).toBe('bad_json');
      expect((await c.req('POST', '/api/register', { raw: '["a","b"]' })).status).toBe(400);
    });

    it('fails with a clean 500 when the data directory is unusable', async () => {
      const r = await new Client(broken.base).get('/api/health');
      expect(r.status).toBe(500);
      expect(r.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(r.json).toEqual({ error: 'server_error', message: expect.any(String) });
      expect(r.text).not.toMatch(/\.php|Stack trace|#0/);
    });
  });

  describe('register', () => {
    const c = () => client(registerIp);
    const registerIp = nextIp();

    it('validates names', async () => {
      const bad: unknown[] = [
        'ab',
        'x'.repeat(25),
        'with space',
        'semi;colon',
        'slash/name',
        'emoji😀x',
        'Привет',
        'José',
        '',
        42,
        null,
      ];
      for (const name of bad) {
        const r = await c().post('/api/register', { name, password: 'salajane-123' });
        expect(r.status, `name ${JSON.stringify(name)}`).toBe(400);
        expect(r.json.error).toBe('invalid_name');
        expect(r.json.message).not.toMatch(DASHES);
        // 'Привет' and 'José' consist of letters only: the message must say which letters are allowed.
        expect(r.json.message).toContain('ladina tähti (ka õ, ä, ö, ü, š, ž)');
      }
    });

    it('validates passwords', async () => {
      for (const password of ['short', '', 12345678, null, 'x'.repeat(257)]) {
        const r = await c().post('/api/register', { name: 'Paroolitu', password });
        expect(r.status, `password ${JSON.stringify(password)}`).toBe(400);
        expect(r.json.error).toBe('invalid_password');
      }
    });

    it('creates an account, logs it in and sets a safe session cookie', async () => {
      const u = c();
      const r = await register(u, 'Õnne.Mari_1');
      expect(r.status).toBe(200);
      expect(r.json.user).toEqual({
        id: expect.any(Number),
        name: 'Õnne.Mari_1',
        created: expect.any(Number),
      });
      expect(Math.abs(r.json.user.created - Date.now())).toBeLessThan(60_000);
      const cookie = r.setCookies.find((line) => line.startsWith('EPDSESS='));
      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).not.toMatch(/Secure/i);
      expect((await u.get('/api/me')).json.user.name).toBe('Õnne.Mari_1');
      // Stored as a password_hash() hash (argon2id where PHP has it), never as plain text.
      const [[hash]] = JSON.parse(sql(`SELECT pass_hash FROM users WHERE id = ${r.json.user.id}`));
      expect(hash).toMatch(/^\$(argon2id|2y)\$/);
      expect(hash).not.toContain('salajane');
    });

    it('accepts the shortest and longest names', async () => {
      expect((await register(c(), 'Ülo')).status).toBe(200);
      expect((await register(c(), 'z'.repeat(24))).status).toBe(200);
    });

    it('rejects taken names case-insensitively, including Õ and õ', async () => {
      for (const name of ['Õnne.Mari_1', 'õnne.mari_1', 'ÕNNE.MARI_1', 'üLO', 'Z'.repeat(24)]) {
        const r = await register(c(), name);
        expect(r.status, name).toBe(409);
        expect(r.json).toEqual({ error: 'name_taken', message: 'See nimi on juba võetud.', field: 'name' });
      }
    });

    it.skipIf(!HAS_INTL)('treats a decomposed õ (o + combining tilde) as the same letter', async () => {
      const r = await register(c(), 'O\u0303nne.mari_1');
      expect(r.status).toBe(409);
    });
  });

  describe('login and session', () => {
    it('registers Alice for the following tests', async () => {
      alice = client();
      const r = await register(alice, 'Alice', 'correct horse');
      expect(r.status).toBe(200);
    });

    it('gives guests no session', async () => {
      const r = await client().get('/api/me');
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ user: null });
      expect(r.setCookies).toEqual([]);
    });

    it('rejects a wrong password and an unknown name with the same answer', async () => {
      const c = client();
      const wrong = await login(c, 'Alice', 'wrong horse');
      expect(wrong.status).toBe(401);
      expect(wrong.json).toEqual({ error: 'bad_login', message: 'Vale kasutajanimi või parool.' });
      const unknown = await login(c, 'Nobody', 'correct horse');
      expect(unknown.status).toBe(401);
      expect(unknown.json).toEqual(wrong.json);
      expect(c.session).toBeUndefined();
    });

    it('logs in (name in any case) and keeps the session across requests', async () => {
      const c = client();
      const r = await login(c, 'aLiCe', 'correct horse');
      expect(r.status).toBe(200);
      expect(r.json.user).toEqual({ id: expect.any(Number), name: 'Alice', created: expect.any(Number) });
      expect(c.session).toBeDefined();
      const me = await c.get('/api/me');
      expect(me.json.user.name).toBe('Alice');
      expect((await c.get('/api/me')).json.user.id).toBe(r.json.user.id);
    });

    it('issues a new session id on every login', async () => {
      const c = client();
      await login(c, 'Alice', 'correct horse');
      const first = c.session;
      await login(c, 'Alice', 'correct horse');
      expect(c.session).toBeDefined();
      expect(c.session).not.toBe(first);
      // The old id is dead.
      const replay = new Client(base, nextIp());
      replay.cookies.set('EPDSESS', first as string);
      expect((await replay.get('/api/me')).json.user).toBeNull();
    });

    it('marks the cookie Secure when the trusted relay says HTTPS', async () => {
      const r = await login(client(), 'Alice', 'correct horse', { 'X-Forwarded-Proto': 'https' });
      expect(r.status).toBe(200);
      expect(r.setCookies.find((line) => line.startsWith('EPDSESS='))).toMatch(/;\s*Secure/i);
    });

    it('ignores X-Forwarded-Proto from anyone but the trusted relay', async () => {
      const r = await new Client(untrusted.base).post(
        '/api/login',
        { name: 'Alice', password: 'correct horse' },
        { headers: { 'X-Forwarded-Proto': 'https' } },
      );
      expect(r.status).toBe(200);
      expect(r.setCookies.find((line) => line.startsWith('EPDSESS='))).not.toMatch(/Secure/i);
    });

    it('clears an unknown session cookie', async () => {
      const c = new Client(base, nextIp());
      c.cookies.set('EPDSESS', 'abcdefabcdefabcdefabcdef12');
      const r = await c.get('/api/me');
      expect(r.json.user).toBeNull();
      expect(c.session).toBeUndefined();
    });

    it('logs out and destroys the session', async () => {
      const c = client();
      await login(c, 'Alice', 'correct horse');
      const old = c.session as string;
      const r = await c.post('/api/logout');
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ ok: true });
      expect(c.session).toBeUndefined();
      expect((await c.get('/api/me')).json.user).toBeNull();
      const replay = new Client(base, nextIp());
      replay.cookies.set('EPDSESS', old);
      expect((await replay.get('/api/me')).json.user).toBeNull();
      // Logging out as a guest is harmless.
      expect((await client().post('/api/logout')).json).toEqual({ ok: true });
    });
  });

  describe('saves', () => {
    it('needs a login', async () => {
      const r = await client().get('/api/save');
      expect(r.status).toBe(401);
      expect(r.json.error).toBe('auth_required');
      expect((await client().put('/api/save/career', { raw: '{}' })).status).toBe(401);
    });

    it('starts empty', async () => {
      const r = await alice.get('/api/save');
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ career: null, settings: null, autosave: null, updated: {} });
    });

    it('stores and returns a slot unchanged', async () => {
      const career = {
        name: 'Alice',
        money: 10_000,
        staatus: 25.5,
        staff: [],
        flags: {},
        nested: { a: [1, { b: null }] },
        text: 'Õhtu, „jutt“',
      };
      const put = await alice.put('/api/save/career', { body: career });
      expect(put.status).toBe(200);
      expect(put.json).toEqual({ ok: true, updated: expect.any(Number) });
      const r = await alice.get('/api/save');
      expect(r.json.career).toEqual(career);
      expect(r.json.settings).toBeNull();
      expect(r.json.updated).toEqual({ career: put.json.updated });
    });

    it('checks slot names and bodies', async () => {
      expect((await alice.put('/api/save/other', { raw: '{}' })).json.error).toBe('bad_slot');
      expect((await alice.put('/api/save/career', { raw: '[1,2]' })).json.error).toBe('not_object');
      expect((await alice.put('/api/save/career', { raw: '"text"' })).json.error).toBe('not_object');
      expect((await alice.put('/api/save/career', { raw: '' })).json.error).toBe('not_object');
      const broken = await alice.put('/api/save/career', { raw: '{"a": [1, 2' });
      expect(broken.status).toBe(400);
      expect(broken.json.error).toBe('bad_json');
      expect((await alice.put('/api/save/settings', { raw: '{}', csrf: false })).status).toBe(403);
    });

    it('enforces the size limits (career 512 kB, autosave 4 MB)', async () => {
      const big = await alice.put('/api/save/career', { body: { blob: 'x'.repeat(530 * 1024) } });
      expect(big.status).toBe(413);
      expect(big.json.error).toBe('too_large');
      const settingsOk = await alice.put('/api/save/settings', { body: { blob: 's'.repeat(500 * 1024) } });
      expect(settingsOk.status).toBe(200);
      const autosave = { blob: 'y'.repeat(3 * 1024 * 1024) };
      expect((await alice.put('/api/save/autosave', { body: autosave })).status).toBe(200);
      const tooBig = await alice.put('/api/save/autosave', {
        body: { blob: 'z'.repeat(4 * 1024 * 1024 + 10) },
      });
      expect(tooBig.status).toBe(413);
      const r = await alice.get('/api/save');
      expect(r.json.autosave.blob.length).toBe(autosave.blob.length);
      expect(r.json.career.name).toBe('Alice');
      expect(Object.keys(r.json.updated).sort()).toEqual(['autosave', 'career', 'settings']);
    });

    it('deletes a slot, leaving a marker with its own version so other devices see the deletion', async () => {
      expect((await alice.del('/api/save/career', undefined, { csrf: false })).status).toBe(403);
      const before = (await alice.get('/api/save')).json.updated.career;
      const r = await alice.del('/api/save/career');
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ ok: true, updated: expect.any(Number) });
      expect(r.json.updated).toBeGreaterThan(before);
      const after = await alice.get('/api/save');
      expect(after.json.career).toBeNull();
      expect(after.json.updated.career).toBe(r.json.updated);
      expect(after.json.autosave).not.toBeNull();
      const again = await alice.del('/api/save/career');
      expect(again.status).toBe(200);
      expect(again.json.updated).toBeGreaterThan(r.json.updated);
    });

    it('versions only grow, also for writes in the same millisecond', async () => {
      const versions: number[] = [];
      for (let i = 0; i < 5; i++)
        versions.push((await alice.put('/api/save/settings', { body: { n: i } })).json.updated);
      for (let i = 1; i < versions.length; i++) expect(versions[i]).toBeGreaterThan(versions[i - 1]);
    });

    it('writes with ?base= only while the server still has that version (409 save_conflict otherwise)', async () => {
      const cur = (await alice.get('/api/save')).json.updated.settings as number;
      // The desktop saves on top of the current version.
      const desk = await alice.put(`/api/save/settings?base=${cur}`, { body: { from: 'desktop' } });
      expect(desk.status).toBe(200);
      // A stale laptop tab still builds on the old version: refused, nothing written.
      const stale = await alice.put(`/api/save/settings?base=${cur}`, { body: { from: 'stale laptop' } });
      expect(stale.status).toBe(409);
      expect(stale.json.error).toBe('save_conflict');
      expect(stale.json.updated).toBe(desk.json.updated);
      expect((await alice.get('/api/save')).json.settings).toEqual({ from: 'desktop' });
      // A stale delete cannot wipe the newer save either.
      const staleDelete = await alice.del(`/api/save/settings?base=${cur}`);
      expect(staleDelete.status).toBe(409);
      expect((await alice.get('/api/save')).json.settings).toEqual({ from: 'desktop' });
      // After reading the cloud again, the laptop can save on top of the newest version.
      const ok = await alice.put(`/api/save/settings?base=${desk.json.updated}`, {
        body: { from: 'laptop' },
      });
      expect(ok.status).toBe(200);
      // A conditional delete on the current version leaves a marker.
      const del = await alice.del(`/api/save/settings?base=${ok.json.updated}`);
      expect(del.status).toBe(200);
      const after = await alice.get('/api/save');
      expect(after.json.settings).toBeNull();
      expect(after.json.updated.settings).toBe(del.json.updated);
      // The marker is a version like any other: writing on top of it works, on top of the old one not.
      expect((await alice.put(`/api/save/settings?base=${ok.json.updated}`, { body: { x: 1 } })).status).toBe(
        409,
      );
      expect(
        (await alice.put(`/api/save/settings?base=${del.json.updated}`, { body: { x: 1 } })).status,
      ).toBe(200);
    });

    it('base 0 means "the server has no such slot yet"', async () => {
      const c = client();
      expect((await register(c, 'BaseZero')).status).toBe(200);
      expect((await c.put('/api/save/autosave?base=5', { body: { a: 1 } })).status).toBe(409);
      const first = await c.put('/api/save/autosave?base=0', { body: { a: 1 } });
      expect(first.status).toBe(200);
      expect((await c.put('/api/save/autosave?base=0', { body: { a: 2 } })).status).toBe(409);
      expect((await c.get('/api/save')).json.autosave).toEqual({ a: 1 });
    });

    it('rejects a malformed base', async () => {
      for (const bad of ['-1', 'abc', '1.5', '', '12345678901234567']) {
        const r = await alice.put(`/api/save/settings?base=${encodeURIComponent(bad)}`, { body: {} });
        expect(r.status, bad).toBe(400);
        expect(r.json.error).toBe('bad_base');
      }
    });

    it('answers only the versions with ?versions=1', async () => {
      const full = await alice.get('/api/save');
      const v = await alice.get('/api/save?versions=1');
      expect(v.status).toBe(200);
      expect(v.json).toEqual({ updated: full.json.updated });
      expect((await client().get('/api/save?versions=1')).status).toBe(401);
    });

    it('refuses requests that expect another account (X-EPD-User): 409 user_mismatch', async () => {
      const me = (await alice.get('/api/me')).json.user;
      const wrong = { headers: { 'X-EPD-User': String(me.id + 1000) } };
      const put = await alice.put('/api/save/career', { body: { name: 'Mallory' }, ...wrong });
      expect(put.status).toBe(409);
      expect(put.json.error).toBe('user_mismatch');
      expect((await alice.get('/api/save', wrong)).status).toBe(409);
      expect((await alice.del('/api/save/autosave', undefined, wrong)).status).toBe(409);
      expect((await alice.post('/api/score', SHIFT, wrong)).status).toBe(409);
      expect((await alice.get('/api/save')).json.career).toBeNull();
      // The right account (or no header) works as before.
      const right = await alice.put('/api/save/career', {
        body: { name: 'Alice' },
        headers: { 'X-EPD-User': String(me.id) },
      });
      expect(right.status).toBe(200);
      expect((await alice.get('/api/save')).json.career).toEqual({ name: 'Alice' });
    });
  });

  describe('scores', () => {
    it('needs a login', async () => {
      const r = await client().post('/api/score', SHIFT);
      expect(r.status).toBe(401);
    });

    it('validates the fields', async () => {
      const cases: [Record<string, unknown>, string][] = [
        [{ score: 101 }, 'score'],
        [{ score: -1 }, 'score'],
        [{ score: '80' }, 'score'],
        [{ regionId: 'tartu' }, 'regionId'],
        [{ difficulty: 'easy' }, 'difficulty'],
        [{ grade: 'E' }, 'grade'],
        [{ grade: undefined }, 'grade'],
        [{ incidents: -3 }, 'incidents'],
        [{ arrests: true }, 'arrests'],
        [{ start: 'today' }, 'start'],
        [{ mode: 'arcade' }, 'mode'],
      ];
      for (const [patch, field] of cases) {
        const r = await alice.post('/api/score', { ...SHIFT, ...patch });
        expect(r.status, field).toBe(400);
        expect(r.json).toMatchObject({ error: 'invalid_score', field });
      }
      const director = await alice.post('/api/score', { ...SHIFT, mode: 'director' });
      expect(director.status).toBe(400);
      expect(director.json.error).toBe('unranked_mode');
      const empty = await alice.post('/api/score', { ...SHIFT, incidents: 0 });
      expect(empty.status).toBe(400);
      expect(empty.json).toMatchObject({ error: 'empty_shift', field: 'incidents' });
    });

    it('stores shifts and returns the rank within the region', async () => {
      expect((await alice.post('/api/score', { ...SHIFT, score: 70, grade: 'B' })).json).toEqual({
        ok: true,
        rank: 1,
      });
      expect((await alice.post('/api/score', { ...SHIFT, score: 85 })).json).toEqual({ ok: true, rank: 1 });
      expect(
        (await alice.post('/api/score', { ...SHIFT, regionId: 'ida', score: 95, grade: 'S', mode: 'free' }))
          .json.rank,
      ).toBe(1);

      bob = client();
      const reg = await register(bob, 'Bob');
      expect(reg.status).toBe(200);
      bobId = reg.json.user.id;
      expect((await bob.post('/api/score', { ...SHIFT, score: 80 })).json).toEqual({ ok: true, rank: 2 });
      expect(
        (await bob.post('/api/score', { ...SHIFT, score: 90, difficulty: 'veteran', grade: 'S' })).json.rank,
      ).toBe(1);
      expect(
        (await bob.post('/api/score', { ...SHIFT, regionId: 'louna', score: 50, grade: 'D' })).json.rank,
      ).toBe(1);
      // Alice's 60 would be behind Bob's best of 90.
      expect((await alice.post('/api/score', { ...SHIFT, score: 60, grade: 'C' })).json.rank).toBe(2);
    });

    it('lists the best shift per user, filtered by region', async () => {
      const pohja = await client().get('/api/scores?region=pohja');
      expect(pohja.status).toBe(200);
      expect(pohja.json.scores).toEqual([
        {
          name: 'Bob',
          score: 90,
          grade: 'S',
          regionId: 'pohja',
          difficulty: 'veteran',
          incidents: 31,
          at: expect.any(Number),
        },
        {
          name: 'Alice',
          score: 85,
          grade: 'A',
          regionId: 'pohja',
          difficulty: 'normal',
          incidents: 31,
          at: expect.any(Number),
        },
      ]);
      const all = await client().get('/api/scores');
      expect(all.json.scores.map((s: Json) => [s.name, s.score, s.regionId])).toEqual([
        ['Alice', 95, 'ida'],
        ['Bob', 90, 'pohja'],
      ]);
      const louna = await client().get('/api/scores?region=louna');
      expect(louna.json.scores.map((s: Json) => [s.name, s.score])).toEqual([['Bob', 50]]);
      expect((await client().get('/api/scores?region=laane')).json.scores).toEqual([]);
      expect((await client().get('/api/scores?limit=1')).json.scores).toHaveLength(1);
      expect((await client().get('/api/scores?limit=999&region=')).json.scores).toHaveLength(2);
      const bad = await client().get('/api/scores?region=tartu');
      expect(bad.status).toBe(400);
      expect(bad.json.error).toBe('bad_region');
    });
  });

  describe('daily challenge', () => {
    const DAY = '2026-10-19';
    /** Noon of DAY in Tallinn (EEST, UTC+3), and the midnight that ends it. */
    const NOON = Date.UTC(2026, 9, 19, 9, 0);
    const MIDNIGHT = Date.UTC(2026, 9, 19, 21, 0);
    const RUN = {
      day: DAY,
      regionId: 'louna',
      sector: 'louna-tartu',
      score: 70,
      grade: 'B',
      incidents: 12,
      arrests: 2,
    };
    const at = (ms: number) => ({ headers: { 'X-EPD-Test-Now': String(ms) } });
    let carol: Client;

    it('needs a login', async () => {
      const r = await client().post('/api/daily', RUN, at(NOON));
      expect(r.status).toBe(401);
      expect(r.json.error).toBe('auth_required');
      expect((await alice.post('/api/daily', RUN, { ...at(NOON), csrf: false })).status).toBe(403);
    });

    it('validates the fields like scores', async () => {
      const cases: [Record<string, unknown>, string][] = [
        [{ score: 101 }, 'score'],
        [{ score: '70' }, 'score'],
        [{ grade: 'E' }, 'grade'],
        [{ regionId: 'tartu' }, 'regionId'],
        [{ arrests: -1 }, 'arrests'],
        [{ day: '2026-02-30' }, 'day'],
        [{ day: '19.10.2026' }, 'day'],
        [{ day: undefined }, 'day'],
        [{ sector: 'Tartu linn' }, 'sector'],
        [{ sector: 7 }, 'sector'],
        [{ started: 'eile' }, 'started'],
        [{ started: NOON + 3_600_000 }, 'started'],
      ];
      for (const [patch, field] of cases) {
        const r = await alice.post('/api/daily', { ...RUN, ...patch }, at(NOON));
        expect(r.status, field).toBe(400);
        expect(r.json, field).toMatchObject({ error: 'invalid_score', field });
      }
      const empty = await alice.post('/api/daily', { ...RUN, incidents: 0 }, at(NOON));
      expect(empty.status).toBe(400);
      expect(empty.json).toMatchObject({ error: 'empty_shift', field: 'incidents' });
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM daily_scores`))).toEqual([[0]]);
    });

    it('counts the first run of the day; a replay is practice and changes nothing', async () => {
      const scoresBefore = (await client().get('/api/scores?limit=50')).json.scores;
      expect((await alice.post('/api/daily', RUN, at(NOON))).json).toEqual({
        ok: true,
        counted: true,
        rank: 1,
        players: 1,
      });
      expect(
        (await alice.post('/api/daily', { ...RUN, score: 99, grade: 'S' }, at(NOON + 60_000))).json,
      ).toEqual({
        ok: true,
        counted: false,
        rank: 1,
        players: 1,
      });
      expect(
        (await bob.post('/api/daily', { ...RUN, score: 80, grade: 'A' }, at(NOON + 120_000))).json,
      ).toEqual({
        ok: true,
        counted: true,
        rank: 1,
        players: 2,
      });
      // Alice's counted 70 is now behind Bob's 80; her replay still does not count.
      expect(
        (await alice.post('/api/daily', { ...RUN, score: 100, grade: 'S' }, at(NOON + 180_000))).json,
      ).toEqual({
        ok: true,
        counted: false,
        rank: 2,
        players: 2,
      });
      // Equal scores share a place.
      carol = client();
      expect((await register(carol, 'Carol')).status).toBe(200);
      expect(
        (await carol.post('/api/daily', { ...RUN, score: 80, grade: 'A', sector: '' }, at(NOON + 240_000)))
          .json,
      ).toEqual({
        ok: true,
        counted: true,
        rank: 1,
        players: 3,
      });
      expect(
        JSON.parse(
          sql(
            `SELECT score, grade FROM daily_scores d JOIN users u ON u.id = d.user_id WHERE u.name = 'Alice'`,
          ),
        ),
      ).toEqual([[70, 'B']]);
      // Daily runs stay off the normal leaderboard.
      expect((await client().get('/api/scores?limit=50')).json.scores).toEqual(scoresBefore);
    });

    it('takes only today, or yesterday shortly after midnight for a run started before it', async () => {
      const dora = client();
      expect((await register(dora, 'Dora')).status).toBe(200);
      const closed = async (body: Record<string, unknown>, now: number) => {
        const r = await dora.post('/api/daily', { ...RUN, ...body }, at(now));
        expect(r.status, JSON.stringify(body)).toBe(400);
        expect(r.json).toMatchObject({ error: 'day_closed', field: 'day' });
      };
      await closed({ day: '2026-10-18' }, NOON);
      await closed({ day: '2026-10-20' }, NOON);
      await closed({ day: '2026-10-18', started: NOON - 86_400_000 }, NOON);
      const after = MIDNIGHT + 90 * 60_000; // 01:30 on the 20th
      // Yesterday's run without a start time, or started after midnight: closed.
      await closed({}, after);
      await closed({ started: MIDNIGHT + 60_000 }, after);
      // Started before the day began: not that day's run.
      await closed({ started: MIDNIGHT - 25 * 3_600_000 }, after);
      // Started at 23:40 and sent too late (04:30): closed.
      await closed({ started: MIDNIGHT - 20 * 60_000 }, MIDNIGHT + 270 * 60_000);
      // Started at 23:40 and sent at 01:30: counts for the 19th.
      const ok = await dora.post(
        '/api/daily',
        { ...RUN, score: 50, grade: 'D', started: MIDNIGHT - 20 * 60_000 },
        at(after),
      );
      expect(ok.json).toEqual({ ok: true, counted: true, rank: 4, players: 4 });
      // And at 01:30 the 20th is today.
      const today = await dora.post(
        '/api/daily',
        { ...RUN, day: '2026-10-20', score: 60, grade: 'C' },
        at(after),
      );
      expect(today.json).toEqual({ ok: true, counted: true, rank: 1, players: 1 });
    });

    it('lists the day: top runs, the number of players and the caller', async () => {
      const r = await client().get(`/api/daily?day=${DAY}`);
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect(r.json).toEqual({
        day: DAY,
        players: 4,
        scores: [
          { name: 'Bob', score: 80, grade: 'A', incidents: 12, at: NOON + 120_000, rank: 1 },
          { name: 'Carol', score: 80, grade: 'A', incidents: 12, at: NOON + 240_000, rank: 1 },
          { name: 'Alice', score: 70, grade: 'B', incidents: 12, at: NOON, rank: 3 },
          { name: 'Dora', score: 50, grade: 'D', incidents: 12, at: MIDNIGHT + 90 * 60_000, rank: 4 },
        ],
        me: null,
      });
      expect((await alice.get(`/api/daily?day=${DAY}`)).json.me).toEqual({
        name: 'Alice',
        score: 70,
        grade: 'B',
        incidents: 12,
        at: NOON,
        rank: 3,
      });
      const empty = await alice.get('/api/daily?day=2026-10-01');
      expect(empty.json).toEqual({ day: '2026-10-01', players: 0, scores: [], me: null });
      // Without a day: today in Tallinn.
      const today = await client().get('/api/daily', at(MIDNIGHT + 60_000));
      expect(today.json.day).toBe('2026-10-20');
      expect(today.json.scores.map((s: Json) => s.name)).toEqual(['Dora']);
      for (const bad of ['2026-02-30', 'today', '2026-1-5']) {
        const b = await client().get(`/api/daily?day=${bad}`);
        expect(b.status, bad).toBe(400);
        expect(b.json.error).toBe('bad_day');
      }
      expect((await client().req('DELETE', '/api/daily')).status).toBe(405);
    });

    it('shows at most 50 runs, and the caller also when further down', async () => {
      const day = '2026-10-21';
      const noon = NOON + 2 * 86_400_000;
      const players: Client[] = [];
      for (let i = 0; i < 51; i++) {
        const c = client(`198.51.100.${i + 1}`);
        expect((await register(c, `Daily${i}`)).status).toBe(200);
        expect(
          (await c.post('/api/daily', { ...RUN, day, score: 100 - i, grade: 'A' }, at(noon + i))).json
            .counted,
        ).toBe(true);
        players.push(c);
      }
      const r = await players[50].get(`/api/daily?day=${day}`);
      expect(r.json.players).toBe(51);
      expect(r.json.scores).toHaveLength(50);
      expect(r.json.scores[49]).toMatchObject({ name: 'Daily49', rank: 50 });
      expect(r.json.me).toMatchObject({ name: 'Daily50', score: 50, rank: 51 });
    });
  });

  describe('multiplayer rooms', () => {
    const OPTS = {
      mode: 'race',
      regionId: 'louna',
      sector: 'louna-tartu',
      difficulty: 'normal',
      hours: 3,
      slot: 'evening',
    };
    const RESULT = { score: 74, grade: 'B', incidents: 11, arrests: 2 };
    const at = (ms: number) => ({ headers: { 'X-EPD-Test-Now': String(ms) } });
    let hanna: Client;
    let ivo: Client;
    let jaan: Client;
    let kati: Client;
    let code = '';

    const names = (r: Json) => r.json.room.players.map((p: Json) => p.name);
    const roomRow = (c: string) => JSON.parse(sql(`SELECT state, host_id FROM rooms WHERE code = '${c}'`));

    it('needs a login and X-EPD', async () => {
      const guest = client();
      expect((await guest.post('/api/rooms', OPTS)).status).toBe(401);
      expect((await guest.get('/api/rooms')).status).toBe(401);
      expect((await guest.post('/api/rooms/join', { code: 'ABCDEF' })).json.error).toBe('auth_required');
      expect((await guest.get('/api/rooms/ABCDEF')).status).toBe(401);
      hanna = client();
      ivo = client();
      jaan = client();
      kati = client();
      for (const [c, name] of [
        [hanna, 'Hanna'],
        [ivo, 'Ivo'],
        [jaan, 'Jaan'],
        [kati, 'Kati'],
      ] as const)
        expect((await register(c, name)).status).toBe(200);
      expect((await hanna.post('/api/rooms', OPTS, { csrf: false })).status).toBe(403);
      expect((await hanna.get('/api/rooms')).json).toEqual({ room: null });
    });

    it('validates the options, a sector room’s desks included', async () => {
      const cases: [Record<string, unknown>, string][] = [
        [{ regionId: 'tartu' }, 'regionId'],
        [{ sector: 'pohja-kesklinn' }, 'sector'],
        [{ sector: 'louna tartu' }, 'sector'],
        [{ difficulty: 'easy' }, 'difficulty'],
        [{ hours: 5 }, 'hours'],
        [{ hours: '3' }, 'hours'],
        [{ slot: 'noon' }, 'slot'],
        [{ mode: 'battle' }, 'mode'],
        // A custom force (src/sim/custom.ts): known types, the prefecture's stations, distinct pool officers.
        [{ custom: 'patrol' }, 'custom'],
        [{ custom: { crews: 'x' } }, 'custom'],
        [{ custom: { crews: [['tank', 'louna-tartu']] } }, 'custom'],
        [{ custom: { crews: [['patrol', 'pohja-hq']] } }, 'custom'],
        [{ custom: { crews: [['patrol']] } }, 'custom'],
        [{ custom: { crews: [['patrol', 'louna-tartu', 1], ['rapid', 'louna-tartu', 1]] } }, 'custom'],
        [{ custom: { crews: [['patrol', 'louna-tartu', 60]] } }, 'custom'],
        [{ custom: { crews: [['patrol', 'louna-tartu', '1']] } }, 'custom'],
        [{ custom: { crews: [['patrol', 'louna-tartu', 1, 2, 3, 4, 5, 6, 7]] } }, 'custom'],
        [{ custom: { crews: Array.from({ length: 41 }, () => ['patrol', 'louna-tartu']) } }, 'custom'],
        // Suurõnnetus (2.37.0): its chance, always or never.
        [{ crisis: 'maybe' }, 'crisis'],
        [{ crisis: 1 }, 'crisis'],
      ];
      for (const [patch, field] of cases) {
        const r = await hanna.post('/api/rooms', { ...OPTS, ...patch });
        expect(r.status, field).toBe(400);
        expect(r.json, field).toMatchObject({ error: 'invalid_room', field });
      }
      // A sector room needs two to four distinct sectors of its prefecture.
      for (const desks of [undefined, [], ['louna-tartu'], ['louna-tartu', 'louna-tartu'], ['louna-tartu', 'pohja-kesklinn'], ['louna-tartu', 'louna-a', 'louna-b', 'louna-c', 'louna-d'], 'louna-tartu']) {
        const r = await hanna.post('/api/rooms', { ...OPTS, mode: 'sector', desks });
        expect(r.status, JSON.stringify(desks)).toBe(400);
        expect(r.json).toMatchObject({ error: 'invalid_room', field: 'desks' });
      }
      expect(JSON.parse(sql('SELECT COUNT(*) FROM rooms'))).toEqual([[0]]);
    });

    it('creates a room with a code, the creator as host and no seed yet', async () => {
      const r = await hanna.post('/api/rooms', { ...OPTS, sector: '' });
      expect(r.status).toBe(200);
      const room = r.json.room;
      code = room.code;
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(room).toMatchObject({
        mode: 'race',
        state: 'lobby',
        max: 4,
        seed: null,
        day: null,
        started: null,
        results: [],
        options: { regionId: 'louna', sector: '', difficulty: 'normal', hours: 3, slot: 'evening', crisis: 'random' },
      });
      expect(room.host).toBe(room.me);
      expect(room.players).toEqual([
        {
          id: room.me,
          name: 'Hanna',
          seat: 0,
          host: true,
          ready: true,
          online: true,
          left: false,
          done: false,
          role: 'dispatch',
        },
      ]);
      expect((await hanna.get('/api/rooms')).json.room.code).toBe(code);
    });

    it('joins by code in any case, keeps rooms to their members and limits seats to four', async () => {
      const typed = `${code.slice(0, 3).toLowerCase()} ${code.slice(3)}`;
      const joined = await ivo.post('/api/rooms/join', { code: typed });
      expect(joined.status).toBe(200);
      expect(names(joined)).toEqual(['Hanna', 'Ivo']);
      expect(joined.json.room.players[1]).toMatchObject({ seat: 1, host: false, ready: false });
      // Joining again is coming back, not a second seat.
      expect(names(await ivo.post('/api/rooms/join', { code }))).toEqual(['Hanna', 'Ivo']);
      expect(names(await jaan.post('/api/rooms/join', { code }))).toEqual(['Hanna', 'Ivo', 'Jaan']);
      expect(names(await kati.post('/api/rooms/join', { code }))).toEqual(['Hanna', 'Ivo', 'Jaan', 'Kati']);
      const fifth = await alice.post('/api/rooms/join', { code });
      expect(fifth.status).toBe(409);
      expect(fifth.json.error).toBe('room_full');
      // Not a member: the room does not exist for Alice.
      const peek = await alice.get(`/api/rooms/${code}`);
      expect(peek.status).toBe(404);
      expect(peek.json.error).toBe('room_not_found');
      for (const bad of ['ZZZZZZ', 'abc', 'IIIIII', '']) {
        const r = await alice.post('/api/rooms/join', { code: bad });
        expect(r.status, bad).toBe(404);
        expect(r.json.error).toBe('room_not_found');
      }
      expect((await alice.req('DELETE', `/api/rooms/${code}`)).status).toBe(405);
    });

    it('answers an unchanged room in a few bytes and shows who is online', async () => {
      const first = await hanna.get(`/api/rooms/${code}`);
      const v = first.json.v;
      expect(v).toMatch(/^\d+\.15$/);
      const same = await hanna.get(`/api/rooms/${code}?v=${v}`);
      expect(same.json).toEqual({ v, unchanged: true });
      expect(same.text.length).toBeLessThan(40);
      // A minute later only the players who polled are online.
      const later = Date.now() + 60_000;
      await ivo.get(`/api/rooms/${code}`, at(later));
      const seen = await hanna.get(`/api/rooms/${code}?v=${v}`, at(later + 1000));
      expect(seen.json.room.players.map((p: Json) => [p.name, p.online])).toEqual([
        ['Hanna', true],
        ['Ivo', true],
        ['Jaan', false],
        ['Kati', false],
      ]);
      expect(seen.json.v).not.toBe(v);
    });

    it('lets only the host change the options and start, once everybody is ready', async () => {
      const notHost = await ivo.req('PUT', `/api/rooms/${code}`, { body: { ...OPTS, hours: 2 } });
      expect(notHost.status).toBe(403);
      expect(notHost.json.error).toBe('not_host');
      expect((await ivo.post(`/api/rooms/${code}/start`)).json.error).toBe('not_host');
      for (const c of [ivo, jaan, kati])
        expect((await c.post(`/api/rooms/${code}/ready`, { ready: true })).status).toBe(200);
      expect((await ivo.post(`/api/rooms/${code}/ready`, { ready: 'yes' })).json).toMatchObject({
        field: 'ready',
      });
      // A change of options clears the others' ready marks.
      const custom = { crews: [['patrol', 'louna-tartu', 3, 4], ['rapid', 'louna-tartu']], budget: true, extra: 1 };
      const changed = await hanna.req('PUT', `/api/rooms/${code}`, {
        body: { ...OPTS, hours: 2, slot: 'night', custom },
      });
      expect(changed.json.room.options).toMatchObject({ hours: 2, slot: 'night', sector: 'louna-tartu' });
      // The custom force is stored in its clean shape and every player gets it.
      expect(changed.json.room.options.custom).toEqual({ crews: custom.crews, budget: true });
      expect(changed.json.room.players.map((p: Json) => p.ready)).toEqual([true, false, false, false]);
      const early = await hanna.post(`/api/rooms/${code}/start`);
      expect(early.status).toBe(409);
      expect(early.json.error).toBe('not_ready');
      for (const c of [ivo, jaan, kati]) await c.post(`/api/rooms/${code}/ready`, { ready: true });
      const started = await hanna.post(`/api/rooms/${code}/start`);
      expect(started.status).toBe(200);
      const room = started.json.room;
      expect(room.state).toBe('running');
      expect(room.seed).toBeGreaterThan(0);
      expect(room.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Every player gets the same shift.
      const other = (await kati.get(`/api/rooms/${code}`)).json.room;
      expect([other.seed, other.day, other.options]).toEqual([room.seed, room.day, room.options]);
      expect((await hanna.post(`/api/rooms/${code}/start`)).json.error).toBe('room_started');
      expect((await ivo.post(`/api/rooms/${code}/ready`, { ready: false })).json.error).toBe('room_started');
      const late = await alice.post('/api/rooms/join', { code });
      expect(late.status).toBe(409);
      expect(late.json.error).toBe('room_started');
    });

    it('takes one result per player, ranks them and finishes once everybody still in has sent one', async () => {
      const scoresBefore = (await client().get('/api/scores?limit=50')).json.scores;
      const cases: [Record<string, unknown>, string][] = [
        [{ score: 101 }, 'score'],
        [{ grade: 'E' }, 'grade'],
        [{ incidents: 'many' }, 'incidents'],
      ];
      for (const [patch, field] of cases) {
        const r = await hanna.post(`/api/rooms/${code}/result`, { ...RESULT, ...patch });
        expect(r.status, field).toBe(400);
        expect(r.json, field).toMatchObject({ error: 'invalid_score', field });
      }
      expect((await hanna.post(`/api/rooms/${code}/result`, { ...RESULT, incidents: 0 })).json.error).toBe(
        'empty_shift',
      );
      expect((await alice.post(`/api/rooms/${code}/result`, RESULT)).status).toBe(404);

      const first = await hanna.post(`/api/rooms/${code}/result`, RESULT);
      expect(first.json).toMatchObject({ ok: true, counted: true, rank: 1 });
      expect(first.json.room.state).toBe('running');
      const again = await hanna.post(`/api/rooms/${code}/result`, { ...RESULT, score: 99, grade: 'S' });
      expect(again.json).toMatchObject({ ok: true, counted: false, rank: 1 });
      expect(
        (await ivo.post(`/api/rooms/${code}/result`, { ...RESULT, score: 88, grade: 'A' })).json.rank,
      ).toBe(1);
      expect((await jaan.post(`/api/rooms/${code}/result`, { ...RESULT, score: 74 })).json.rank).toBe(2);
      // Kati leaves without a result: she stays on the board as having left, and the room is finished.
      expect((await kati.post(`/api/rooms/${code}/leave`)).json).toEqual({ ok: true });
      const board = (await hanna.get(`/api/rooms/${code}`)).json.room;
      expect(board.state).toBe('finished');
      expect(board.results.map((r: Json) => [r.name, r.score, r.rank])).toEqual([
        ['Ivo', 88, 1],
        ['Hanna', 74, 2],
        ['Jaan', 74, 2],
      ]);
      expect(board.players.find((p: Json) => p.name === 'Kati')).toMatchObject({ left: true, done: false });
      expect((await kati.post(`/api/rooms/${code}/result`, RESULT)).json.error).toBe('left_room');
      // Between two rounds the room is still the players' own: the menu leads back to it (not Kati's: she left).
      expect((await hanna.get('/api/rooms')).json.room).toMatchObject({ code, state: 'finished', round: 1 });
      expect((await kati.get('/api/rooms')).json.room).toBeNull();
      // Room results never reach the normal leaderboard.
      expect((await client().get('/api/scores?limit=50')).json.scores).toEqual(scoresBefore);
    });

    it('opens the next round to whoever comes back first, with the same players and a new seed', async () => {
      const [[seed1]] = JSON.parse(sql(`SELECT seed FROM rooms WHERE code = '${code}'`));
      const options = (await hanna.get(`/api/rooms/${code}`)).json.room.options;
      // Kati left during the round, strangers are not in it, and the fields are checked.
      const gone = await kati.post(`/api/rooms/${code}/reopen`, { round: 1 });
      expect(gone.status).toBe(409);
      expect(gone.json.error).toBe('left_room');
      expect((await alice.post(`/api/rooms/${code}/reopen`, {})).status).toBe(404);
      expect((await jaan.post(`/api/rooms/${code}/reopen`, { round: 'x' })).json).toMatchObject({ error: 'invalid_room', field: 'round' });
      expect((await jaan.post(`/api/rooms/${code}/reopen`, { end: 1 })).json).toMatchObject({ error: 'invalid_room', field: 'end' });
      expect((await jaan.post(`/api/rooms/${code}/reopen`, {}, { csrf: false })).status).toBe(403);

      // Jaan, not the host, comes back first: the lobby opens again, nobody ready but the host, Kati's seat free.
      const back = await jaan.post(`/api/rooms/${code}/reopen`, { round: 1 });
      expect(back.status).toBe(200);
      const room = back.json.room;
      expect(room).toMatchObject({ state: 'lobby', round: 2, seed: null, day: null, started: null, results: [], options });
      expect(room.players.map((p: Json) => [p.name, p.seat, p.host, p.ready, p.left, p.done])).toEqual([
        ['Hanna', 0, true, true, false, false],
        ['Ivo', 1, false, false, false, false],
        ['Jaan', 2, false, false, false, false],
      ]);
      // The round just played is the room's last round, ranked as before.
      expect(room.last).toMatchObject({ round: 1, mode: 'race', seed: seed1 });
      expect(room.last.results.map((r: Json) => [r.name, r.score, r.rank])).toEqual([
        ['Ivo', 88, 1],
        ['Hanna', 74, 2],
        ['Jaan', 74, 2],
      ]);
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM room_results x JOIN rooms r ON r.id = x.room_id WHERE r.code = '${code}'`))).toEqual([[0]]);
      // The next round has a seed of its own, still secret.
      const [[seed2]] = JSON.parse(sql(`SELECT seed FROM rooms WHERE code = '${code}'`));
      expect(seed2).not.toBe(seed1);

      // Ivo comes back from the same round a moment later: nothing changes.
      const again = await ivo.post(`/api/rooms/${code}/reopen`, { round: 1 });
      expect(again.json.room).toMatchObject({ state: 'lobby', round: 2 });
      expect(again.json.room.v.split('.')[0]).toBe(room.v.split('.')[0]);
      // A result of the round that is over counts nowhere; the lobby has no shift yet.
      const late = await hanna.post(`/api/rooms/${code}/result`, { ...RESULT, seed: seed1 });
      expect(late.status).toBe(409);
      expect(late.json.error).toBe('round_over');
      expect((await hanna.post(`/api/rooms/${code}/result`, { ...RESULT, seed: 'x' })).json.field).toBe('seed');
      expect((await hanna.post(`/api/rooms/${code}/result`, RESULT)).json.error).toBe('not_started');
      expect((await ivo.get('/api/rooms')).json.room).toMatchObject({ code, state: 'lobby', round: 2 });
    });

    it('starts the next round without a player who is away, and does not wait for them', async () => {
      const later = Date.now() + 60_000;
      // Jaan is here and not ready: he holds the start up.
      expect((await ivo.post(`/api/rooms/${code}/ready`, { ready: true })).status).toBe(200);
      const early = await hanna.post(`/api/rooms/${code}/start`);
      expect(early.status).toBe(409);
      expect(early.json.error).toBe('not_ready');
      // A minute later Jaan has gone quiet (closed the tab): the others start without him.
      await ivo.get(`/api/rooms/${code}`, at(later));
      const started = await hanna.post(`/api/rooms/${code}/start`, undefined, at(later + 100));
      expect(started.status).toBe(200);
      const room = started.json.room;
      expect(room).toMatchObject({ state: 'running', round: 2 });
      expect(room.seed).toBe(JSON.parse(sql(`SELECT seed FROM rooms WHERE code = '${code}'`))[0][0]);
      expect(room.players.map((p: Json) => [p.name, p.ready])).toEqual([
        ['Hanna', true],
        ['Ivo', true],
        ['Jaan', false],
      ]);
      // The round is over once Hanna and Ivo have sent theirs; Jaan may still play it and send his.
      const seed = room.seed;
      expect((await hanna.post(`/api/rooms/${code}/result`, { ...RESULT, score: 60, seed }, at(later + 200))).json.room.state).toBe('running');
      const done = await ivo.post(`/api/rooms/${code}/result`, { ...RESULT, score: 70, seed }, at(later + 300));
      expect(done.json).toMatchObject({ counted: true, rank: 1 });
      expect(done.json.room.state).toBe('finished');
      expect((await jaan.post(`/api/rooms/${code}/result`, { ...RESULT, score: 80, seed }, at(later + 400))).json.rank).toBe(1);
      // Leaving between rounds keeps a player's result and takes the room out of their menu; coming back undoes it.
      expect((await jaan.post(`/api/rooms/${code}/leave`, undefined, at(later + 500))).status).toBe(200);
      expect((await jaan.get('/api/rooms', at(later + 600))).json.room).toBeNull();
      const board = (await hanna.get(`/api/rooms/${code}`, at(later + 700))).json.room;
      expect(board.results.map((r: Json) => r.name)).toEqual(['Jaan', 'Ivo', 'Hanna']);
      expect(board.players.find((p: Json) => p.name === 'Jaan')).toMatchObject({ left: true, done: true });
      expect((await jaan.post('/api/rooms/join', { code }, at(later + 800))).json.room.players.find((p: Json) => p.name === 'Jaan').left).toBe(false);
      // Somebody new may join a room between rounds: Kati is in the next one.
      const kat = await kati.post('/api/rooms/join', { code }, at(later + 900));
      expect(kat.status).toBe(200);
      expect(kat.json.room).toMatchObject({ state: 'finished', round: 2 });
      expect(names(kat)).toEqual(['Hanna', 'Ivo', 'Jaan', 'Kati']);
    });

    it('lets only the host end a round that waits for somebody', async () => {
      const t = Date.now() + 120_000;
      const reopened = await ivo.post(`/api/rooms/${code}/reopen`, { round: 2 }, at(t));
      expect(reopened.json.room).toMatchObject({ state: 'lobby', round: 3 });
      expect(reopened.json.room.last.results.map((r: Json) => r.name)).toEqual(['Jaan', 'Ivo', 'Hanna']);
      for (const c of [ivo, jaan, kati]) expect((await c.post(`/api/rooms/${code}/ready`, { ready: true }, at(t + 100))).status).toBe(200);
      const room = (await hanna.post(`/api/rooms/${code}/start`, undefined, at(t + 200))).json.room;
      expect(room).toMatchObject({ state: 'running', round: 3 });
      await hanna.post(`/api/rooms/${code}/result`, { ...RESULT, score: 66, seed: room.seed }, at(t + 300));
      // The others are still playing: coming back changes nothing, and only the host may end the round.
      expect((await ivo.post(`/api/rooms/${code}/reopen`, { round: 3 }, at(t + 400))).json.room.state).toBe('running');
      const notHost = await ivo.post(`/api/rooms/${code}/reopen`, { end: true }, at(t + 500));
      expect(notHost.status).toBe(403);
      expect(notHost.json.error).toBe('not_host');
      // Ending a round the room has already moved on from changes nothing either.
      expect((await hanna.post(`/api/rooms/${code}/reopen`, { end: true, round: 2 }, at(t + 600))).json.room.state).toBe('running');
      const ended = await hanna.post(`/api/rooms/${code}/reopen`, { end: true, round: 3 }, at(t + 700));
      expect(ended.status).toBe(200);
      expect(ended.json.room).toMatchObject({ state: 'lobby', round: 4, results: [] });
      expect(ended.json.room.last.results.map((r: Json) => [r.name, r.score])).toEqual([['Hanna', 66]]);
      // Ivo finishes after the end: his result counts nowhere.
      const late = await ivo.post(`/api/rooms/${code}/result`, { ...RESULT, seed: room.seed }, at(t + 800));
      expect(late.json.error).toBe('round_over');
      // Every round is kept for the room (the admin panel shows them); the players see the last one.
      expect(JSON.parse(sql(`SELECT x.round, COUNT(*) FROM room_round_results x JOIN rooms r ON r.id = x.room_id WHERE r.code = '${code}' GROUP BY x.round ORDER BY x.round`))).toEqual([
        [1, 3],
        [2, 3],
        [3, 1],
      ]);
    });

    it('lets the host switch the mode in the lobby; the players’ drafts go with the old mode', async () => {
      const t = Date.now() + 130_000;
      const put = (c: Client, body: Record<string, unknown>, ms = t) => c.put(`/api/rooms/${code}`, { body, ...at(ms) });
      const on = await put(hanna, { ...OPTS, custom: { crews: [], budget: true } });
      expect(on.status).toBe(200);
      expect((await ivo.post(`/api/rooms/${code}/custom`, { custom: { crews: [['patrol', 'louna-tartu', 7]] } }, at(t + 50))).status).toBe(200);
      expect((await put(ivo, { ...OPTS, mode: 'role' }, t + 100)).json.error).toBe('not_host');
      expect((await put(hanna, { ...OPTS, mode: 'battle' }, t + 100)).json).toMatchObject({ error: 'invalid_room', field: 'mode' });
      expect((await put(hanna, { ...OPTS, mode: 'sector' }, t + 100)).json).toMatchObject({ error: 'invalid_room', field: 'desks' });
      const sector = await put(hanna, { ...OPTS, mode: 'sector', desks: ['louna-tartu', 'louna-tartumaa'], custom: { crews: [] } }, t + 200);
      expect(sector.status).toBe(200);
      expect(sector.json.room).toMatchObject({ mode: 'sector', round: 4, options: { sector: 'louna-tartu', desks: ['louna-tartu', 'louna-tartumaa'] } });
      expect(sector.json.room.players.map((p: Json) => [p.name, p.desk, p.custom])).toEqual([
        ['Hanna', 'louna-tartu', undefined],
        ['Ivo', 'louna-tartumaa', undefined],
        ['Jaan', 'louna-tartu', undefined],
        ['Kati', 'louna-tartumaa', undefined],
      ]);
      const role = await put(hanna, { ...OPTS, mode: 'role' }, t + 300);
      expect(role.json.room.mode).toBe('role');
      expect(role.json.room.options.desks).toBeUndefined();
      expect(role.json.room.players.map((p: Json) => p.role)).toEqual(['dispatch', 'calls', 'radio', 'dispatch']);
      // Without `mode` the room keeps its own.
      expect((await hanna.put(`/api/rooms/${code}`, { body: { ...OPTS, mode: undefined, hours: 4 }, ...at(t + 400) })).json.room).toMatchObject({ mode: 'role', options: { hours: 4 } });
      // The crisis choice (2.37.0) is kept with the options, and a body without it means 'random'.
      expect((await put(hanna, { ...OPTS, mode: undefined, hours: 4, crisis: 'off' }, t + 450)).json.room.options).toMatchObject({ hours: 4, crisis: 'off' });
      expect((await put(hanna, { ...OPTS, mode: undefined, hours: 4 }, t + 500)).json.room.options.crisis).toBe('random');
    });

    it('hands a lobby to the earliest player here once its host has been away for five minutes', async () => {
      const t = Date.now() + 140_000;
      // Four minutes without the host: nothing changes.
      await ivo.get(`/api/rooms/${code}`, at(t + 4 * 60_000));
      expect((await ivo.get(`/api/rooms/${code}`, at(t + 4 * 60_000 + 6000))).json.room.players.find((p: Json) => p.host).name).toBe('Hanna');
      // Six minutes: Ivo, who joined first of those here, takes over (Jaan and Kati are quiet as well).
      await ivo.get(`/api/rooms/${code}`, at(t + 6 * 60_000));
      const r = await ivo.get(`/api/rooms/${code}`, at(t + 6 * 60_000 + 6000));
      expect(r.json.room.players.map((p: Json) => [p.name, p.host, p.ready])).toEqual([
        ['Hanna', false, false],
        ['Ivo', true, true],
        ['Jaan', false, false],
        ['Kati', false, false],
      ]);
      expect(roomRow(code)[0][1]).toBe(r.json.room.me);
      // Hanna comes back as a player.
      const back = await hanna.get(`/api/rooms/${code}`, at(t + 6 * 60_000 + 7000));
      expect(back.json.room.host).toBe(r.json.room.me);
      expect((await hanna.post(`/api/rooms/${code}/start`, undefined, at(t + 6 * 60_000 + 8000))).json.error).toBe('not_host');
    });

    it('keeps a host who finished a race last when the room opens for the next round', async () => {
      const [heino, urmas] = [client(), client()];
      expect((await register(heino, 'Heino')).status).toBe(200);
      expect((await register(urmas, 'Urmas')).status).toBe(200);
      const t = Date.now() + 200_000;
      const r = (await heino.post('/api/rooms', OPTS, at(t))).json.room;
      await urmas.post('/api/rooms/join', { code: r.code }, at(t + 100));
      await urmas.post(`/api/rooms/${r.code}/ready`, { ready: true }, at(t + 200));
      const room = (await heino.post(`/api/rooms/${r.code}/start`, undefined, at(t + 300))).json.room;
      expect(room.state).toBe('running');
      // A race shift polls nothing: Urmas finishes first and waits in the room, Heino sends his ten minutes in.
      const late = t + 10 * 60_000;
      await urmas.post(`/api/rooms/${r.code}/result`, { ...RESULT, seed: room.seed }, at(late - 60_000));
      await urmas.get(`/api/rooms/${r.code}`, at(late - 30_000));
      expect((await heino.post(`/api/rooms/${r.code}/result`, { ...RESULT, seed: room.seed }, at(late))).json.room.state).toBe('finished');
      // Urmas is back first and opens the next round: his next poll must not hand him the lobby.
      expect((await urmas.post(`/api/rooms/${r.code}/reopen`, { round: 1 }, at(late + 1000))).json.room.state).toBe('lobby');
      const host = async (ms: number) => (await urmas.get(`/api/rooms/${r.code}`, at(ms))).json.room.players.find((p: Json) => p.host).name;
      expect(await host(late + 7000)).toBe('Heino');
      // From the new lobby on the usual rule holds: five minutes away and the room passes on.
      await host(late + 6 * 60_000);
      expect(await host(late + 6 * 60_000 + 6000)).toBe('Urmas');
    });

    it('frees a seat in the lobby, passes the host on and closes an empty lobby', async () => {
      const r = (await ivo.post('/api/rooms', OPTS)).json.room;
      await jaan.post('/api/rooms/join', { code: r.code });
      await hanna.post('/api/rooms/join', { code: r.code });
      expect((await ivo.post(`/api/rooms/${r.code}/leave`)).status).toBe(200);
      const after = (await jaan.get(`/api/rooms/${r.code}`)).json.room;
      expect(after.players.map((p: Json) => [p.name, p.host])).toEqual([
        ['Jaan', true],
        ['Hanna', false],
      ]);
      expect((await ivo.get(`/api/rooms/${r.code}`)).status).toBe(404);
      // Joining another room leaves this one.
      const other = (await kati.post('/api/rooms', OPTS)).json.room;
      expect(names(await hanna.post('/api/rooms/join', { code: other.code }))).toEqual(['Kati', 'Hanna']);
      expect(names(await jaan.get(`/api/rooms/${r.code}`))).toEqual(['Jaan']);
      const alone = await jaan.post(`/api/rooms/${r.code}/start`);
      expect(alone.status).toBe(409);
      expect(alone.json.error).toBe('too_few');
      await jaan.post(`/api/rooms/${r.code}/leave`);
      expect(roomRow(r.code)).toEqual([['closed', null]]);
      expect((await alice.post('/api/rooms/join', { code: r.code })).json.error).toBe('room_not_found');
    });

    it('closes a lobby nobody polled for half an hour', async () => {
      const r = (await alice.post('/api/rooms', OPTS)).json.room;
      const soon = await alice.get(`/api/rooms/${r.code}`, at(Date.now() + 20 * 60_000));
      expect(soon.json.room.state).toBe('lobby');
      const later = await alice.get(`/api/rooms/${r.code}`, at(Date.now() + 51 * 60_000));
      expect(later.json.room.state).toBe('closed');
      expect((await bob.post('/api/rooms/join', { code: r.code })).status).toBe(404);
    });

    it('limits wrong codes per IP', async () => {
      const guesser = client();
      expect((await register(guesser, 'Arvaja')).status).toBe(200);
      for (let i = 0; i < 30; i++) {
        expect((await guesser.post('/api/rooms/join', { code: 'QQQQQQ' })).status).toBe(404);
      }
      const r = await guesser.post('/api/rooms/join', { code: 'QQQQQQ' });
      expect(r.status).toBe(429);
      expect(r.json.error).toBe('rate_limited');
    });

    it('lets the host remove a player, who cannot come back with the code (2.34.0)', async () => {
      const host = client();
      const guest = client();
      const third = client();
      for (const [c, name] of [
        [host, 'Kaido'],
        [guest, 'Liisa'],
        [third, 'Marko'],
      ] as const)
        expect((await register(c, name)).status).toBe(200);
      const r = (await host.post('/api/rooms', OPTS)).json.room;
      await guest.post('/api/rooms/join', { code: r.code });
      await guest.post(`/api/rooms/${r.code}/ready`, { ready: true });
      // Only the host removes, never themselves, and only somebody who is there.
      expect((await guest.post(`/api/rooms/${r.code}/kick`, { seat: 0 })).json.error).toBe('not_host');
      expect((await host.post(`/api/rooms/${r.code}/kick`, { seat: 0 })).json.error).toBe('kick_self');
      expect((await host.post(`/api/rooms/${r.code}/kick`, { seat: 2 })).json.error).toBe('player_not_found');
      expect((await host.post(`/api/rooms/${r.code}/kick`, { seat: '1' })).json).toMatchObject({ error: 'invalid_room', field: 'seat' });
      const out = await host.post(`/api/rooms/${r.code}/kick`, { seat: 1 });
      expect(out.status).toBe(200);
      expect(names(out)).toEqual(['Kaido']);
      // The removed player hears it at the next poll, and the code no longer lets them in.
      for (const res of [await guest.get(`/api/rooms/${r.code}`), await guest.post('/api/rooms/join', { code: r.code })]) {
        expect(res.status).toBe(403);
        expect(res.json.error).toBe('kicked');
      }
      expect((await guest.get('/api/rooms')).json).toEqual({ room: null });
      // Their seat is free for somebody else.
      expect(names(await third.post('/api/rooms/join', { code: r.code }))).toEqual(['Kaido', 'Marko']);
    });

    it('keeps a profile picture on the account and shows it in the room (2.35.0)', async () => {
      const me = client();
      const other = client();
      expect((await register(me, 'Pildike')).json.user).not.toHaveProperty('avatar');
      await register(other, 'Teine');
      for (const avatar of ['face:XYZ', 'face:abc', 'draw:-1', 'draw:12345678901', 'http://x', 7, null])
        expect((await me.put('/api/me/avatar', { body: { avatar } })).json, JSON.stringify(avatar)).toMatchObject({ error: 'invalid_avatar', field: 'avatar' });
      expect((await client().put('/api/me/avatar', { body: { avatar: '' } })).status).toBe(401);
      const set = await me.put('/api/me/avatar', { body: { avatar: 'face:0a1b2c3d4e' } });
      expect(set.status, JSON.stringify(set.json)).toBe(200);
      expect(set.json.user).toMatchObject({ name: 'Pildike', avatar: 'face:0a1b2c3d4e' });
      expect((await me.get('/api/me')).json.user.avatar).toBe('face:0a1b2c3d4e');
      const r = (await me.post('/api/rooms', OPTS)).json.room;
      const joined = await other.post('/api/rooms/join', { code: r.code });
      const seats = joined.json.room.players.map((p: Json) => [p.name, p.avatar]);
      expect(seats).toEqual([['Pildike', 'face:0a1b2c3d4e'], ['Teine', undefined]]);
      // And on the results board, as the player has it now.
      await other.post(`/api/rooms/${r.code}/ready`, { ready: true });
      expect((await me.post(`/api/rooms/${r.code}/start`)).json.room.state).toBe('running');
      const res = await me.post(`/api/rooms/${r.code}/result`, RESULT);
      expect(res.json.room.results.map((x: Json) => [x.name, x.avatar])).toEqual([['Pildike', 'face:0a1b2c3d4e']]);
      expect((await me.put('/api/me/avatar', { body: { avatar: 'draw:42' } })).json.user.avatar).toBe('draw:42');
      expect((await other.get(`/api/rooms/${r.code}`)).json.room.results[0].avatar).toBe('draw:42');
      expect((await me.put('/api/me/avatar', { body: { avatar: '' } })).json.user).not.toHaveProperty('avatar');
      expect((await other.get(`/api/rooms/${r.code}`)).json.room.results[0]).not.toHaveProperty('avatar');
      await me.post(`/api/rooms/${r.code}/leave`);
      await other.post(`/api/rooms/${r.code}/leave`);
    });

    it('puts Bob in a room he hosts, for the account deletion below', async () => {
      const r = (await bob.post('/api/rooms', OPTS)).json.room;
      bobRoom = r.code;
      await ivo.post('/api/rooms/join', { code: r.code });
      await ivo.post(`/api/rooms/${r.code}/ready`, { ready: true });
      expect((await bob.post(`/api/rooms/${r.code}/start`)).json.room.state).toBe('running');
      expect((await bob.post(`/api/rooms/${r.code}/result`, RESULT)).json.counted).toBe(true);
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM room_players WHERE user_id = ${bobId}`))).toEqual([[1]]);
    });
  });

  describe('challenges (2.38.0, docs/CHALLENGE.md)', () => {
    const SETUP = {
      seed: 777001,
      regionId: 'louna',
      difficulty: 'veteran',
      start: Date.UTC(2026, 9, 23, 16, 0),
      hours: 4,
      weather: 'rain',
      crisis: 0.15,
    };
    const RESULT = { score: 87, grade: 'A', closed: 14, arrests: 3, p1: 6.4, crisis: 71 };
    let mari: Client;
    let tonu: Client;
    let code = '';

    it('sends a challenge with the sender as its first row, the same shift again answering the same', async () => {
      mari = client();
      tonu = client();
      expect((await register(mari, 'Mari.V')).status).toBe(200);
      expect((await register(tonu, 'Tõnu.K')).status).toBe(200);
      // A guest has no name to send it with.
      expect((await client().post('/api/challenges', { setup: SETUP, result: RESULT, version: '2.38.0' })).status).toBe(401);
      const r = await mari.post('/api/challenges', { setup: SETUP, result: RESULT, version: '2.38.0' });
      expect(r.status, JSON.stringify(r.json)).toBe(200);
      const ch = r.json.challenge;
      code = ch.code;
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(ch).toMatchObject({ by: { name: 'Mari.V' }, setup: SETUP, version: '2.38.0', players: 1 });
      expect(ch.results).toEqual([
        { name: 'Mari.V', score: 87, grade: 'A', closed: 14, arrests: 3, p1: 6.4, crisis: 71, at: ch.created, rank: 1, me: true, sender: true },
      ]);
      expect(ch.me).toMatchObject({ rank: 1, me: true });
      const again = await mari.post('/api/challenges', { setup: SETUP, result: { ...RESULT, score: 99 }, version: '2.38.0' });
      expect(again.json.challenge.code).toBe(code);
      expect(again.json.challenge.results[0].score).toBe(87);
    });

    it('checks the setup and the result field by field', async () => {
      const cases: [Record<string, unknown>, string][] = [
        [{ setup: { ...SETUP, seed: -1 } }, 'seed'],
        [{ setup: { ...SETUP, seed: 2 ** 32 } }, 'seed'],
        [{ setup: { ...SETUP, regionId: 'mars' } }, 'regionId'],
        [{ setup: { ...SETUP, difficulty: 'easy' } }, 'difficulty'],
        [{ setup: { ...SETUP, start: 5 } }, 'start'],
        [{ setup: { ...SETUP, hours: 13 } }, 'hours'],
        [{ setup: { ...SETUP, hours: 4.001 } }, 'hours'],
        [{ setup: { ...SETUP, weather: 'tornado' } }, 'weather'],
        [{ setup: { ...SETUP, crisis: 0 } }, 'crisis'],
        [{ setup: 'x' }, 'setup'],
        [{ result: { ...RESULT, score: 101 } }, 'score'],
        [{ result: { ...RESULT, grade: 'Z' } }, 'grade'],
        [{ result: { ...RESULT, closed: -1 } }, 'closed'],
        [{ result: { ...RESULT, p1: 700 } }, 'p1'],
        [{ result: { ...RESULT, crisis: 12.5 } }, 'crisis'],
      ];
      for (const [patch, field] of cases) {
        const r = await tonu.post('/api/challenges', { setup: SETUP, result: RESULT, ...patch });
        expect(r.status, field).toBe(400);
        expect(r.json, field).toMatchObject({ error: 'invalid_challenge', field });
      }
    });

    it("opens to anybody, counts an account's first run and ranks the board", async () => {
      const guest = await client().get(`/api/challenges/${code.toLowerCase()}`);
      expect(guest.status).toBe(200);
      expect(guest.json.challenge).toMatchObject({ code, players: 1, me: null });
      expect(guest.json.challenge.results[0].me).toBeUndefined();
      expect((await client().get('/api/challenges/ZZZZZZ')).json.error).toBe('challenge_not_found');
      expect((await client().post(`/api/challenges/${code}/result`, { result: RESULT })).status).toBe(401);
      const first = await tonu.post(`/api/challenges/${code}/result`, { result: { ...RESULT, score: 91, grade: 'S', p1: null, crisis: null } });
      expect(first.status, JSON.stringify(first.json)).toBe(200);
      expect(first.json).toMatchObject({ counted: true, rank: 1, players: 2 });
      expect(first.json.challenge.results.map((x: Json) => [x.name, x.rank, x.p1, x.crisis])).toEqual([
        ['Tõnu.K', 1, null, null],
        ['Mari.V', 2, 6.4, 71],
      ]);
      // A replay is practice: it changes nothing.
      const replay = await tonu.post(`/api/challenges/${code}/result`, { result: { ...RESULT, score: 20 } });
      expect(replay.json).toMatchObject({ counted: false, rank: 1, players: 2 });
      expect((await mari.post(`/api/challenges/${code}/result`, { result: { ...RESULT, score: 100 } })).json.counted).toBe(false);
      // Each sees their own row; the sender's is marked.
      const seen = (await tonu.get(`/api/challenges/${code}`)).json.challenge;
      expect(seen.me).toMatchObject({ name: 'Tõnu.K', rank: 1, me: true });
      expect(seen.results.find((x: Json) => x.name === 'Mari.V').sender).toBe(true);
    });

    it("lists the player's challenges, sent and played", async () => {
      const mine = (await tonu.get('/api/challenges')).json.challenges;
      expect(mine.map((x: Json) => x.code)).toEqual([code]);
      expect(mine[0]).toMatchObject({ players: 2, me: { rank: 1 } });
      expect((await mari.get('/api/challenges')).json.challenges[0].code).toBe(code);
      expect((await client().get('/api/challenges')).status).toBe(401);
    });

    it('serves the link as the game with its preview tags; an unknown code as the game alone', async () => {
      const page = await client().get(`/v/${code}`);
      expect(page.status).toBe(200);
      expect(page.headers.get('content-type')).toMatch(/^text\/html/);
      expect(page.headers.get('x-robots-tag')).toBe('noindex');
      const meta = (key: string) =>
        page.text.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1];
      // 2026-10-23 16:00 UTC is a Friday, 19:00 in Tallinn: a night shift.
      expect(meta('og:title')).toBe('Mari.V: 87 punkti, Lõuna, reede öö. Kas teed paremini?');
      expect(meta('og:description')).toContain('Lõuna prefektuur, reede öö 19:00-23:00, raskus Veteran.');
      expect(meta('og:image')).toBe('https://politsei.eu/og/challenge-louna.png');
      expect(meta('og:url')).toBe(`https://politsei.eu/v/${code}`);
      expect(meta('twitter:title')).toBe(meta('og:title'));
      expect(meta('robots')).toBe('noindex');
      expect(page.text).toContain('<title>Mari.V: 87 punkti, Lõuna, reede öö. Kas teed paremini? · EPD</title>');
      // Still the game: its scripts and root are there.
      expect(page.text).toContain('<div id="root">');
      const plain = await client().get('/v/ZZZZZZ');
      expect(plain.status).toBe(200);
      expect(plain.text).toBe(readFileSync(join(ROOT, 'index.html'), 'utf8'));
    });

    it('goes with the account: its challenges with their boards, its rows on the others', async () => {
      const kati = client();
      expect((await register(kati, 'Kati.P')).status).toBe(200);
      const own = (await kati.post('/api/challenges', { setup: { ...SETUP, seed: 5 }, result: RESULT })).json.challenge.code;
      expect((await tonu.post(`/api/challenges/${own}/result`, { result: RESULT })).json.counted).toBe(true);
      expect((await kati.post(`/api/challenges/${code}/result`, { result: RESULT })).json.counted).toBe(true);
      expect((await kati.del('/api/me', { password: 'salajane-123' })).status).toBe(200);
      expect((await client().get(`/api/challenges/${own}`)).status).toBe(404);
      const left = (await client().get(`/api/challenges/${code}`)).json.challenge;
      expect(left.players).toBe(2);
      expect(left.results.map((x: Json) => x.name)).not.toContain('Kati.P');
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM challenge_results WHERE challenge_id NOT IN (SELECT id FROM challenges)`))).toEqual([[0]]);
    });
  });

  describe('friends, presence and invitations (2.40.0, docs/MULTIPLAYER.md section 18)', () => {
    const ROOM = { mode: 'role', regionId: 'pohja', sector: '', difficulty: 'normal', hours: 2, slot: 'evening' };
    const SETUP = { seed: 31, regionId: 'pohja', difficulty: 'normal', start: Date.UTC(2026, 9, 24, 16, 0), hours: 3 };
    const RESULT = { score: 77, grade: 'B', closed: 9, arrests: 1, p1: null, crisis: null };
    let liis: Client;
    let mart: Client;
    let nora: Client;
    let liisId = 0;
    let martId = 0;
    let noraId = 0;

    it('asks by user name; the other accepts, or asking back makes friends', async () => {
      liis = client();
      mart = client();
      nora = client();
      liisId = (await register(liis, 'Liis.K')).json.user.id;
      martId = (await register(mart, 'Mart.S')).json.user.id;
      noraId = (await register(nora, 'Nora_V')).json.user.id;
      expect((await client().get('/api/friends')).status).toBe(401);
      expect((await client().post('/api/friends', { name: 'Mart.S' })).status).toBe(401);
      expect((await liis.post('/api/friends', { name: 'nobody-here' })).json.error).toBe('friend_not_found');
      expect((await liis.post('/api/friends', { name: 'liis.k' })).json.error).toBe('friend_self');
      // Any case of the name finds the player.
      const asked = await liis.post('/api/friends', { name: 'mart.s' });
      expect(asked.status).toBe(200);
      expect(asked.json.state).toBe('asked');
      expect(asked.json.asked).toEqual([{ id: martId, name: 'Mart.S', since: expect.any(Number) }]);
      expect(asked.json.friends).toEqual([]);
      // Asking again changes nothing.
      expect((await liis.post('/api/friends', { name: 'Mart.S' })).json.asked).toHaveLength(1);
      const theirs = (await mart.get('/api/friends')).json;
      expect(theirs.asking).toEqual([{ id: liisId, name: 'Liis.K', since: expect.any(Number) }]);
      expect((await nora.post(`/api/friends/${liisId}/accept`)).json.error).toBe('request_not_found');
      const accepted = await mart.post(`/api/friends/${liisId}/accept`);
      expect(accepted.json.friends.map((f: Json) => f.name)).toEqual(['Liis.K']);
      expect(accepted.json.asking).toEqual([]);
      expect((await liis.get('/api/friends')).json.friends.map((f: Json) => [f.name, f.online])).toEqual([['Mart.S', false]]);
      // Nora asks Liis, and Liis asking Nora back makes them friends.
      expect((await nora.post('/api/friends', { name: 'Liis.K' })).json.state).toBe('asked');
      const back = await liis.post('/api/friends', { name: 'Nora_V' });
      expect(back.json.state).toBe('friends');
      expect(back.json.friends.map((f: Json) => f.name).sort()).toEqual(['Mart.S', 'Nora_V']);
    });

    it('shows friends only whether they are online now and what they do, in a room its code', async () => {
      expect((await liis.post('/api/presence', { what: 'dancing' })).json).toMatchObject({ error: 'invalid_presence' });
      const p = await mart.post('/api/presence', { what: 'menu' });
      expect(p.status).toBe(200);
      expect(p.json).toEqual({ invites: [], asking: 0, online: 0 });
      const list = (await liis.get('/api/friends')).json.friends;
      expect(list[0]).toMatchObject({ name: 'Mart.S', online: true, what: 'menu' });
      expect(list[0].room).toBeUndefined();
      expect(list[1]).toMatchObject({ name: 'Nora_V', online: false });
      expect(list[1].what).toBeUndefined();
      // In a room: the room and whether it takes players.
      const room = (await mart.post('/api/rooms', ROOM)).json.room;
      await mart.post('/api/presence', { what: 'room', room: room.code });
      const inRoom = (await liis.get('/api/friends')).json.friends.find((f: Json) => f.name === 'Mart.S');
      expect(inRoom).toMatchObject({ what: 'room', room: { code: room.code, mode: 'role', state: 'lobby', players: 1, max: 4 } });
      // Online is "seen in the last 150 s": later, offline, and what they did is not told.
      const later = { headers: { 'X-EPD-Test-Now': String(Date.now() + 10 * 60_000) } };
      const away = (await liis.get('/api/friends', later)).json.friends.find((f: Json) => f.name === 'Mart.S');
      expect(away).toMatchObject({ online: false });
      expect(away.what).toBeUndefined();
      // Not a friend: nothing at all.
      const stranger = client();
      await register(stranger, 'Olev.T');
      expect((await stranger.get('/api/friends')).json).toEqual({ friends: [], asked: [], asking: [] });
      // Liis's own presence counts as one friend online for Mart.
      await liis.post('/api/presence', { what: 'shift' });
      expect((await mart.post('/api/presence', { what: 'room', room: room.code })).json.online).toBe(1);
    });

    it('invites friends to the room one is in, and they find it with their next presence call', async () => {
      const room = (await mart.get('/api/rooms')).json.room;
      const stranger = client();
      const strangerId = (await register(stranger, 'Peep.U')).json.user.id;
      for (const [patch, field] of [
        [{ kind: 'party' }, 'kind'],
        [{ code: 'bad' }, 'code'],
        [{ to: [] }, 'to'],
        [{ to: ['x'] }, 'to'],
        [{ to: Array.from({ length: 11 }, (_, i) => i + 1) }, 'to'],
      ] as const) {
        const r = await mart.post('/api/invites', { kind: 'room', code: room.code, to: [liisId], ...patch });
        expect(r.json, field).toMatchObject({ error: 'invalid_invite', field });
      }
      // Only to a room one is in.
      expect((await nora.post('/api/invites', { kind: 'room', code: room.code, to: [liisId] })).json.error).toBe('room_not_found');
      // Friends only: the stranger is left out.
      const sent = await mart.post('/api/invites', { kind: 'room', code: room.code, to: [liisId, strangerId] });
      expect(sent.json).toEqual({ sent: 1 });
      expect((await mart.post('/api/invites', { kind: 'room', code: room.code, to: [liisId] })).json.sent).toBe(1);
      expect((await stranger.post('/api/presence', {})).json.invites).toEqual([]);
      const got = (await liis.post('/api/presence', { what: 'menu' })).json.invites;
      // Sent twice, waiting once.
      expect(got).toHaveLength(1);
      expect(got[0]).toMatchObject({
        kind: 'room',
        code: room.code,
        from: { id: martId, name: 'Mart.S' },
        room: { mode: 'role', players: 1, max: 4, regionId: 'pohja' },
      });
      // Joining with the code: the invitation is no longer shown (Liis is in the room).
      expect((await liis.post('/api/rooms/join', { code: room.code })).status).toBe(200);
      expect((await liis.post('/api/presence', { what: 'room', room: room.code })).json.invites).toEqual([]);
      // Another's invitation cannot be put away; one's own can (Nora and Mart become friends first).
      await nora.post('/api/friends', { name: 'Mart.S' });
      await mart.post(`/api/friends/${noraId}/accept`);
      expect((await mart.post('/api/invites', { kind: 'room', code: room.code, to: [noraId] })).json.sent).toBe(1);
      const forNora = (await nora.post('/api/presence', {})).json.invites[0];
      await liis.post(`/api/invites/${forNora.id}/done`);
      expect((await nora.post('/api/presence', {})).json.invites).toHaveLength(1);
      expect((await nora.post(`/api/invites/${forNora.id}/done`)).json).toEqual({ ok: true });
      expect((await nora.post('/api/presence', {})).json.invites).toEqual([]);
      // A room that started takes nobody: no invitations to it.
      await liis.post(`/api/rooms/${room.code}/leave`);
      await mart.post(`/api/rooms/${room.code}/leave`);
      expect((await mart.post('/api/invites', { kind: 'room', code: room.code, to: [liisId] })).json.error).toBe('room_not_found');
    });

    it('sends a challenge to friends', async () => {
      const ch = (await nora.post('/api/challenges', { setup: SETUP, result: RESULT })).json.challenge;
      expect((await nora.post('/api/invites', { kind: 'challenge', code: 'ZZZZZZ', to: [liisId] })).json.error).toBe('challenge_not_found');
      // Both are Nora's friends now; a stranger would be left out.
      expect((await nora.post('/api/invites', { kind: 'challenge', code: ch.code, to: [liisId, martId] })).json.sent).toBe(2);
      const got = (await liis.post('/api/presence', {})).json.invites;
      expect(got).toEqual([
        {
          id: expect.any(Number),
          kind: 'challenge',
          code: ch.code,
          at: expect.any(Number),
          from: { id: noraId, name: 'Nora_V' },
          challenge: { regionId: 'pohja', score: 77 },
        },
      ]);
      // A challenge invitation waits a week, a room's half an hour.
      const week = { headers: { 'X-EPD-Test-Now': String(Date.now() + 8 * 86_400_000) } };
      expect((await liis.post('/api/presence', {}, week)).json.invites).toEqual([]);
      // Opened: put away.
      await liis.post(`/api/invites/${got[0].id}/done`);
      expect((await liis.post('/api/presence', {})).json.invites).toEqual([]);
    });

    it('counts friend requests waiting; ending a friendship ends its invitations; a deleted account leaves nothing', async () => {
      const quinn = client();
      await register(quinn, 'Quinn.W');
      await quinn.post('/api/friends', { name: 'Liis.K' });
      expect((await liis.post('/api/presence', {})).json.asking).toBe(1);
      // Declining a request is removing it.
      const quinnId = (await liis.get('/api/friends')).json.asking[0].id;
      expect((await liis.del(`/api/friends/${quinnId}`)).json.asking).toEqual([]);
      expect((await quinn.get('/api/friends')).json.asked).toEqual([]);
      // Unfriending takes the invitations between them along.
      const ch = (await nora.post('/api/challenges', { setup: { ...SETUP, seed: 32 }, result: RESULT })).json.challenge;
      await nora.post('/api/invites', { kind: 'challenge', code: ch.code, to: [liisId] });
      expect((await liis.post('/api/presence', {})).json.invites).toHaveLength(1);
      const after = await liis.del(`/api/friends/${noraId}`);
      expect(after.json.friends.map((f: Json) => f.name)).toEqual(['Mart.S']);
      expect((await liis.post('/api/presence', {})).json.invites).toEqual([]);
      expect((await nora.post('/api/invites', { kind: 'challenge', code: ch.code, to: [liisId] })).json.sent).toBe(0);
      // Mart deletes his account: Liis's list loses him, and his rows are gone.
      expect((await mart.del('/api/me', { password: 'salajane-123' })).status).toBe(200);
      expect((await liis.get('/api/friends')).json.friends).toEqual([]);
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM friends WHERE user_id = ${martId} OR friend_id = ${martId}`))).toEqual([[0]]);
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM presence WHERE user_id = ${martId}`))).toEqual([[0]]);
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM invites WHERE from_id = ${martId} OR to_id = ${martId}`))).toEqual([[0]]);
    });
  });

  describe('co-op lockstep (role rooms)', () => {
    const OPTS = { mode: 'role', regionId: 'pohja', sector: '', difficulty: 'normal', hours: 2, slot: 'evening' };
    const T0 = Date.UTC(2026, 9, 20, 17, 0, 0);
    const at = (ms: number) => ({ headers: { 'X-EPD-Test-Now': String(T0 + ms) } });
    const HASH_A = 'a'.repeat(16);
    const HASH_B = 'b'.repeat(16);
    let lea: Client;
    let mati: Client;
    let nora: Client;
    let olev: Client;
    let code = '';
    let ids: Record<string, number> = {};
    let lastId = 0;

    const cmd = (c: Client, ms: number, cmds: unknown, opts: RequestOptions = {}) =>
      c.post(`/api/rooms/${code}/cmd`, { cmds }, { ...at(ms), ...opts });
    const log = (c: Client, ms: number, q = '') => c.get(`/api/rooms/${code}/log${q ? `?${q}` : ''}`, at(ms));
    /** A raw (binary) request with the client's session, for the snapshot routes. */
    const raw = async (c: Client, method: string, path: string, ms: number, body?: Buffer) => {
      const headers: Record<string, string> = { 'X-EPD': '1', 'X-EPD-Test-Now': String(T0 + ms) };
      headers['Cookie'] = [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
      if (body) headers['Content-Type'] = 'application/gzip';
      const res = await fetch(base + path, { method, headers, body: body ? new Uint8Array(body) : undefined });
      return { status: res.status, headers: res.headers, bytes: Buffer.from(await res.arrayBuffer()) };
    };
    const kinds = (r: Json) => r.json.cmds.map((c: Json) => [c.k, c.s, c.a]);

    it('opens role rooms with a role per seat, picked in the lobby', async () => {
      lea = client();
      mati = client();
      nora = client();
      olev = client();
      for (const [c, name] of [
        [lea, 'Lea'],
        [mati, 'Mati'],
        [nora, 'Nora'],
        [olev, 'Olev'],
      ] as const)
        expect((await register(c, name)).status).toBe(200);
      const created = await lea.post('/api/rooms', OPTS, at(0));
      expect(created.status).toBe(200);
      code = created.json.room.code;
      expect(created.json.room.mode).toBe('role');
      expect(created.json.room.players[0].role).toBe('dispatch');
      await mati.post('/api/rooms/join', { code }, at(100));
      const joined = await nora.post('/api/rooms/join', { code }, at(200));
      expect(joined.json.room.players.map((p: Json) => p.role)).toEqual(['dispatch', 'calls', 'radio']);
      await olev.post('/api/rooms/join', { code }, at(250));
      const picked = await nora.post(`/api/rooms/${code}/role`, { role: 'dispatch' }, at(300));
      expect(picked.status).toBe(200);
      expect(picked.json.room.players.map((p: Json) => p.role)).toEqual(['dispatch', 'calls', 'dispatch', 'dispatch']);
      await olev.post(`/api/rooms/${code}/role`, { role: 'radio' }, at(310));
      const bad = await nora.post(`/api/rooms/${code}/role`, { role: 'boss' }, at(320));
      expect(bad.json).toMatchObject({ error: 'invalid_room', field: 'role' });
      // Nothing runs before the start.
      expect((await cmd(mati, 400, [{ k: 'answer', a: ['c1'] }])).json.error).toBe('not_running');
      const early = await log(mati, 400);
      expect(early.json).toMatchObject({ state: 'lobby', cmds: [] });
      for (const c of [mati, nora, olev]) await c.post(`/api/rooms/${code}/ready`, { ready: true }, at(500));
      const started = await lea.post(`/api/rooms/${code}/start`, undefined, at(1000));
      expect(started.json.room.state).toBe('running');
      // The role picker closes with the lobby; race rooms have no log.
      expect((await nora.post(`/api/rooms/${code}/role`, { role: 'calls' }, at(1100))).json.error).toBe('room_started');
    });

    it('starts the log with the setup command at turn 0', async () => {
      const r = await log(lea, 1500, 'after=0');
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ state: 'running', turn: 0, turnMs: 1000, delay: 2, seat: 0, host: 0, isHost: true, resync: false, snap: null, more: false });
      expect(r.json.now).toBe(T0 + 1500);
      expect(r.json.started).toBe(T0 + 1000);
      expect(r.json.cmds).toEqual([
        {
          id: expect.any(Number),
          t: 0,
          s: -1,
          k: 'setup',
          a: [0, [[0, 'dispatch', 'Lea'], [1, 'calls', 'Mati'], [2, 'dispatch', 'Nora'], [3, 'radio', 'Olev']]],
        },
      ]);
      ids.setup = r.json.cmds[0].id;
      const other = await log(mati, 1600, 'after=0');
      expect(other.json).toMatchObject({ seat: 1, host: 0, isHost: false });
    });

    it('stamps commands two turns ahead, in id order, and relays them', async () => {
      const r = await cmd(mati, 4200, [
        { k: 'answer', a: ['c1'] },
        { k: 'ask', a: ['c1', 'where'] },
      ]);
      expect(r.status).toBe(200);
      // Started at +1000: at +4200 the server is at turn 3, the commands take effect at turn 5.
      expect(r.json.turn).toBe(5);
      expect(r.json.ids).toHaveLength(2);
      expect(r.json.ids[1]).toBeGreaterThan(r.json.ids[0]);
      const sent = await cmd(lea, 4300, [{ k: 'send', a: ['i3', ['u1', 'u2']] }, { k: 'speed', a: [3] }]);
      expect(sent.json.turn).toBe(5);
      const read = await log(nora, 4400, `after=${ids.setup}`);
      expect(read.json.turn).toBe(3);
      expect(read.json.cmds.map((c: Json) => [c.t, c.s, c.k, c.a])).toEqual([
        [5, 1, 'answer', ['c1']],
        [5, 1, 'ask', ['c1', 'where']],
        [5, 0, 'send', ['i3', ['u1', 'u2']]],
        [5, 0, 'speed', [3]],
      ]);
      lastId = read.json.cmds[3].id;
      expect((await log(nora, 4500, `after=${lastId}`)).json.cmds).toEqual([]);
    });

    it('lets only well-formed, small batches of known commands into the log', async () => {
      const cases: [unknown, string][] = [
        [[{ k: 'nuke', a: [] }], 'cmds[0].k'],
        [[{ k: 'ack', a: ['i 3'] }], 'cmds[0].a[0]'],
        [[{ k: 'ack', a: ['i3', 'extra'] }], 'cmds[0].a'],
        [[{ k: 'send', a: ['i3', 'u1'] }], 'cmds[0].a[1]'],
        [[{ k: 'prio', a: ['i3', 7] }], 'cmds[0].a[1]'],
        [[{ k: 'ping', a: ['rida\nkaks'] }], 'cmds[0].a[0]'],
        [[{ k: 'q', a: ['person', 'x'.repeat(65)] }], 'cmds[0].a[1]'],
        [[{ k: 'setup', a: [] }], 'cmds[0].k'],
        [[], 'cmds'],
        ['ack', 'cmds'],
      ];
      for (const [cmds, field] of cases) {
        const r = await cmd(nora, 5000, cmds);
        expect(r.status, field).toBe(400);
        expect(r.json, field).toMatchObject({ error: 'invalid_command', field });
      }
      const many = await cmd(nora, 5000, Array.from({ length: 21 }, () => ({ k: 'ack', a: ['i1'] })));
      expect(many.json.error).toBe('too_many_commands');
      const big = await nora.req('POST', `/api/rooms/${code}/cmd`, { raw: JSON.stringify({ cmds: [{ k: 'ping', a: ['x'] }], pad: 'y'.repeat(5000) }), ...at(5000) });
      expect(big.status).toBe(413);
      // Pause, speed and the end of the shift belong to the host; the end and a refer with no agency are fine.
      expect((await cmd(nora, 5000, [{ k: 'speed', a: [0] }])).json.error).toBe('not_host');
      expect((await cmd(mati, 5000, [{ k: 'endcall', a: ['c1', 'advice', 0, ''] }, { k: 'close', a: ['i2', 'phone'] }])).status).toBe(200);
      expect((await cmd(nora, 5000, [{ k: 'ack', a: ['i1'] }], { csrf: false })).status).toBe(403);
      expect((await client().post(`/api/rooms/${code}/cmd`, { cmds: [{ k: 'ack', a: ['i1'] }] })).status).toBe(401);
      const stranger = client();
      await register(stranger, 'Peeter');
      expect((await stranger.post(`/api/rooms/${code}/cmd`, { cmds: [{ k: 'ack', a: ['i1'] }] }, at(5000))).status).toBe(404);
      expect((await stranger.get(`/api/rooms/${code}/log`, at(5000))).status).toBe(404);
    });

    it('limits command batches per player', async () => {
      const t = 30_000;
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await cmd(olev, t, [{ k: 'ping', a: [`Proov ${i}`] }])).status);
      expect(codes).toEqual([200, 200, 200, 200, 429]);
      // Two batches a second come back.
      expect((await cmd(olev, t + 600, [{ k: 'ping', a: ['Uuesti'] }])).status).toBe(200);
    });

    it('compares digests with the host’s and flags a player who drifted', async () => {
      expect((await log(lea, 11_100, `h=10:${HASH_A}`)).json.resync).toBe(false);
      expect((await log(mati, 11_200, `h=10:${HASH_A}`)).json.resync).toBe(false);
      const drift = await log(nora, 11_300, `h=10:${HASH_B}`);
      expect(drift.json.resync).toBe(true);
      // The host is asked for a snapshot; the flag stays until the player says it resynced.
      expect((await log(lea, 11_400)).json.snapReq).toBe(true);
      expect((await log(nora, 11_500)).json.resync).toBe(true);
      expect((await log(nora, 11_600, 'ack=1')).json.resync).toBe(false);
      // The other way round: the player reports first, the host's digest arrives later.
      await log(mati, 21_100, `h=20:${HASH_B}`);
      await log(lea, 21_200, `h=20:${HASH_A}`);
      expect((await log(mati, 21_300)).json.resync).toBe(true);
      await log(mati, 21_400, 'ack=1');
      expect((await log(lea, 21_500, 'h=x:1')).json.error).toBe('invalid_hash');
    });

    it('keeps the host’s latest snapshot, gzipped and capped', async () => {
      const state = Buffer.from(JSON.stringify({ seed: 1, now: 2, coop: { turn: 20 } }));
      const gz = gzipSync(state);
      const path = (q: string) => `/api/rooms/${code}/snapshot?${q}`;
      expect((await raw(mati, 'PUT', path(`turn=20&cmd=${lastId}`), 22_000, gz)).status).toBe(403);
      expect((await raw(lea, 'PUT', path(`turn=20&cmd=${lastId}`), 22_000, state)).status).toBe(400);
      expect((await raw(lea, 'PUT', path(`turn=900&cmd=${lastId}`), 22_000, gz)).status).toBe(400);
      expect((await raw(lea, 'PUT', path(`turn=20&cmd=99999999`), 22_000, gz)).status).toBe(400);
      expect((await raw(lea, 'PUT', path('turn=20'), 22_000, gz)).status).toBe(400);
      const huge = Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.alloc(2 * 1024 * 1024)]);
      expect((await raw(lea, 'PUT', path(`turn=20&cmd=${lastId}`), 22_000, huge)).status).toBe(413);
      expect(await raw(nora, 'GET', `/api/rooms/${code}/snapshot`, 22_000)).toMatchObject({ status: 404 });
      const put = await raw(lea, 'PUT', path(`turn=20&cmd=${lastId}`), 22_000, gz);
      expect(put.status).toBe(200);
      const got = await raw(nora, 'GET', `/api/rooms/${code}/snapshot`, 22_100);
      expect(got.status).toBe(200);
      expect(got.headers.get('content-type')).toBe('application/gzip');
      expect(got.headers.get('x-epd-turn')).toBe('20');
      expect(got.headers.get('x-epd-cmd')).toBe(String(lastId));
      expect(gunzipSync(got.bytes).toString()).toBe(state.toString());
      const after = await log(lea, 22_200);
      expect(after.json).toMatchObject({ snap: 20, snapReq: false });
      // One a 10 s unless somebody asked for one.
      expect((await raw(lea, 'PUT', path(`turn=21&cmd=${lastId}`), 23_000, gz)).status).toBe(429);
      expect((await raw(lea, 'PUT', path(`turn=33&cmd=${lastId}`), 33_000, gz)).status).toBe(200);
    });

    it('hands a silent seat’s role to the others and gives it back when it polls again', async () => {
      // Mati, Nora and Olev have not polled for over a minute: their seats leave the shift.
      const r = await log(lea, 95_000, `after=${lastId}`);
      const left = kinds(r).filter((k: Json) => k[0] === 'left');
      expect(left).toEqual([
        ['left', -1, [1]],
        ['left', -1, [2]],
        ['left', -1, [3]],
      ]);
      expect(r.json.cmds.every((c: Json) => c.t === 94 + 2 || c.k !== 'left')).toBe(true);
      lastId = r.json.cmds[r.json.cmds.length - 1].id;
      // Polling stays a read while nothing changes.
      expect((await log(lea, 95_500, `after=${lastId}`)).json.cmds).toEqual([]);
      const back = await log(mati, 96_000, `after=${lastId}`);
      expect(kinds(back)).toEqual([['back', -1, [1]]]);
      lastId = back.json.cmds[0].id;
    });

    it('moves the host’s role when the host goes silent', async () => {
      await log(nora, 150_000);
      const r = await log(mati, 170_000, `after=${lastId}`);
      expect(kinds(r)).toEqual([
        ['back', -1, [2]],
        ['left', -1, [0]],
        ['host', -1, [1]],
      ]);
      expect(r.json).toMatchObject({ host: 1, isHost: true, snapReq: true });
      lastId = r.json.cmds[r.json.cmds.length - 1].id;
      const room = (await mati.get(`/api/rooms/${code}`, at(170_100))).json.room;
      expect(room.players.find((p: Json) => p.host).name).toBe('Mati');
      // Lea comes back as a player; Mati keeps the host's role.
      const back = await log(lea, 171_000, `after=${lastId}`);
      expect(kinds(back)).toEqual([['back', -1, [0]]]);
      expect(back.json).toMatchObject({ host: 1, isHost: false });
      lastId = back.json.cmds[0].id;
      expect((await cmd(lea, 171_100, [{ k: 'speed', a: [1] }])).json.error).toBe('not_host');
    });

    it('takes a deleted account’s seat, commands and snapshot out of the room', async () => {
      await log(olev, 172_000);
      // Olev hosts for a moment and uploads a snapshot, then deletes his account.
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM room_commands c JOIN users u ON u.id = c.user_id WHERE u.name = 'Olev'`))[0][0]).toBeGreaterThan(0);
      const olevId = JSON.parse(sql(`SELECT id FROM users WHERE name = 'Olev'`))[0][0];
      sql(`UPDATE rooms SET host_id = ${olevId} WHERE code = '${code}'`);
      const gz = gzipSync(Buffer.from('{"olev":1}'));
      expect((await raw(olev, 'PUT', `/api/rooms/${code}/snapshot?turn=171&cmd=${lastId}`, 172_100, gz)).status).toBe(200);
      sql(`UPDATE rooms SET host_id = (SELECT id FROM users WHERE name = 'Mati') WHERE code = '${code}'`);
      // On the room's test clock: the deletion sequences Olev's `left` at its time, whatever the real time is.
      expect((await olev.del('/api/me', { password: 'salajane-123' }, at(172_200))).status).toBe(200);
      for (const table of ['room_commands', 'room_snapshots', 'room_players'])
        expect(JSON.parse(sql(`SELECT COUNT(*) FROM ${table} WHERE user_id = ${olevId}`)), table).toEqual([[0]]);
      const r = await log(mati, 173_000, `after=${lastId}`);
      expect(kinds(r)).toEqual([
        ['back', -1, [3]],
        ['left', -1, [3]],
      ]);
      expect(r.json).toMatchObject({ snapReq: true, snap: null });
      lastId = r.json.cmds[r.json.cmds.length - 1].id;
    });

    it('sequences a player leaving with the button and drops the log when the room finishes', async () => {
      expect((await nora.post(`/api/rooms/${code}/leave`, undefined, at(174_000))).status).toBe(200);
      const r = await log(lea, 174_100, `after=${lastId}`);
      expect(kinds(r)).toEqual([['left', -1, [2]]]);
      const RESULT = { score: 71, grade: 'B', incidents: 9, arrests: 1 };
      expect((await lea.post(`/api/rooms/${code}/result`, { ...RESULT, xp: 310 }, at(175_000))).status).toBe(200);
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM room_commands c JOIN rooms r ON r.id = c.room_id WHERE r.code = '${code}'`))[0][0]).toBeGreaterThan(0);
      const done = await mati.post(`/api/rooms/${code}/result`, { ...RESULT, xp: 290 }, at(175_100));
      expect(done.json.room.state).toBe('finished');
      expect(done.json.room.results.map((x: Json) => [x.name, x.xp])).toEqual([
        ['Lea', 310],
        ['Mati', 290],
      ]);
      for (const table of ['room_commands', 'room_snapshots'])
        expect(JSON.parse(sql(`SELECT COUNT(*) FROM ${table} t JOIN rooms r ON r.id = t.room_id WHERE r.code = '${code}'`)), table).toEqual([[0]]);
      expect((await cmd(lea, 175_200, [{ k: 'ping', a: ['x'] }])).json.error).toBe('not_running');
      expect((await log(lea, 175_300)).json).toMatchObject({ state: 'finished', cmds: [] });
    });

    it('finishes a shared shift nobody polls for 15 minutes', async () => {
      const a = client();
      const b = client();
      await register(a, 'Rein');
      await register(b, 'Sirje');
      const r = (await a.post('/api/rooms', OPTS, at(200_000))).json.room;
      await b.post('/api/rooms/join', { code: r.code }, at(200_100));
      await b.post(`/api/rooms/${r.code}/ready`, { ready: true }, at(200_200));
      await a.post(`/api/rooms/${r.code}/start`, undefined, at(200_300));
      await a.post(`/api/rooms/${r.code}/cmd`, { cmds: [{ k: 'ping', a: ['Tere'] }] }, at(201_000));
      expect(JSON.parse(sql(`SELECT state FROM rooms WHERE code = '${r.code}'`))).toEqual([['running']]);
      const late = await b.get(`/api/rooms/${r.code}`, at(200_300 + 16 * 60_000 + 1000));
      expect(late.json.room.state).toBe('finished');
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM room_commands c JOIN rooms r ON r.id = c.room_id WHERE r.code = '${r.code}'`))).toEqual([[0]]);
      // A race room has no log.
      const race = (await a.post('/api/rooms', { ...OPTS, mode: 'race' }, at(300_000))).json.room;
      expect((await a.get(`/api/rooms/${race.code}/log`, at(300_100))).json.error).toBe('not_coop');
      expect((await a.post(`/api/rooms/${race.code}/role`, { role: 'calls' }, at(300_100))).json.error).toBe('not_coop');
    });

    it('opens again after the shared shift and starts the next one with a fresh log', async () => {
      const [[maxId]] = JSON.parse(sql('SELECT COALESCE(MAX(id), 0) FROM room_commands'));
      const back = await lea.post(`/api/rooms/${code}/reopen`, { round: 1 }, at(400_000));
      expect(back.status).toBe(200);
      const room = back.json.room;
      // Nora left during the shift and Olev is gone: Lea and Mati stay, with the roles they picked; Mati still hosts.
      expect(room).toMatchObject({ state: 'lobby', round: 2, engine: '' });
      expect(room.players.map((p: Json) => [p.name, p.seat, p.role, p.host, p.ready])).toEqual([
        ['Lea', 0, 'dispatch', false, false],
        ['Mati', 1, 'calls', true, true],
      ]);
      expect(room.last.results.map((r: Json) => [r.name, r.xp])).toEqual([
        ['Lea', 310],
        ['Mati', 290],
      ]);
      expect(JSON.parse(sql(`SELECT host_seat, cmd_count, ref_hashes, snap_req FROM rooms WHERE code = '${code}'`))).toEqual([[-1, 0, '', 0]]);
      expect(JSON.parse(sql(`SELECT MAX(away), MAX(resync), MAX(hash_turn) FROM room_players p JOIN rooms r ON r.id = p.room_id WHERE r.code = '${code}'`))).toEqual([[0, -1, -1]]);
      expect((await log(lea, 400_100)).json).toMatchObject({ state: 'lobby', cmds: [] });
      expect((await cmd(lea, 400_100, [{ k: 'ping', a: ['x'] }])).json.error).toBe('not_running');
      // Mati comes back from the same round: the room is already open.
      expect((await mati.post(`/api/rooms/${code}/reopen`, { round: 1 }, at(400_150))).json.room.round).toBe(2);
      await lea.post(`/api/rooms/${code}/ready`, { ready: true }, at(400_200));
      const started = await mati.post(`/api/rooms/${code}/start`, undefined, at(401_000));
      expect(started.json.room).toMatchObject({ state: 'running', round: 2, started: T0 + 401_000 });
      // The new shift's log: its own setup at turn 0, on the new clock, with the host's seat.
      const r = await log(lea, 401_500, 'after=0');
      expect(r.json).toMatchObject({ state: 'running', turn: 0, started: T0 + 401_000, seat: 0, host: 1, isHost: false });
      expect(kinds(r)).toEqual([['setup', -1, [1, [[0, 'dispatch', 'Lea'], [1, 'calls', 'Mati']]]]]);
      expect(r.json.cmds[0].id).toBeGreaterThan(maxId);
      expect((await cmd(lea, 404_200, [{ k: 'ack', a: ['i1'] }])).json.turn).toBe(5);
    });
  });

  describe('co-op lockstep (sector rooms)', () => {
    const OPTS = {
      mode: 'sector',
      regionId: 'pohja',
      sector: '',
      desks: ['pohja-kesklinn', 'pohja-lasnamae', 'pohja-idaharju'],
      difficulty: 'normal',
      hours: 2,
      slot: 'evening',
    };
    const T0 = Date.UTC(2026, 9, 21, 17, 0, 0);
    const at = (ms: number) => ({ headers: { 'X-EPD-Test-Now': String(T0 + ms) } });
    let pille: Client;
    let rasmus: Client;
    let code = '';

    it('opens sector rooms with their desks and a desk per player, picked in the lobby', async () => {
      pille = client();
      rasmus = client();
      expect((await register(pille, 'Pille')).status).toBe(200);
      expect((await register(rasmus, 'Rasmus')).status).toBe(200);
      const created = await pille.post('/api/rooms', OPTS, at(0));
      expect(created.status).toBe(200);
      const room = created.json.room;
      code = room.code;
      expect(room.mode).toBe('sector');
      // The first desk is the room's sector too.
      expect(room.options).toMatchObject({ regionId: 'pohja', sector: 'pohja-kesklinn', desks: OPTS.desks });
      expect(room.players[0].desk).toBe('pohja-kesklinn');
      const joined = await rasmus.post('/api/rooms/join', { code }, at(100));
      // Seats spread over the desks in order.
      expect(joined.json.room.players.map((p: Json) => p.desk)).toEqual(['pohja-kesklinn', 'pohja-lasnamae']);
      const picked = await rasmus.post(`/api/rooms/${code}/desk`, { desk: 'pohja-idaharju' }, at(200));
      expect(picked.status).toBe(200);
      expect(picked.json.room.players.map((p: Json) => p.desk)).toEqual(['pohja-kesklinn', 'pohja-idaharju']);
      for (const desk of ['pohja-laaneharju', 'louna-tartu', 'Kesklinn', 7]) {
        const bad = await rasmus.post(`/api/rooms/${code}/desk`, { desk }, at(250));
        expect(bad.status, String(desk)).toBe(400);
        expect(bad.json).toMatchObject({ error: 'invalid_room', field: 'desk' });
      }
      // The host drops the picked desk: the player falls back to their seat's default.
      const fewer = await pille.put(`/api/rooms/${code}`, { body: { ...OPTS, desks: ['pohja-kesklinn', 'pohja-lasnamae'] }, ...at(300) });
      expect(fewer.status, JSON.stringify(fewer.json)).toBe(200);
      expect(fewer.json.room.options.desks).toEqual(['pohja-kesklinn', 'pohja-lasnamae']);
      expect(fewer.json.room.players.map((p: Json) => p.desk)).toEqual(['pohja-kesklinn', 'pohja-lasnamae']);
      const badOpts = await pille.put(`/api/rooms/${code}`, { body: { ...OPTS, desks: ['pohja-kesklinn'] }, ...at(350) });
      expect(badOpts.json).toMatchObject({ error: 'invalid_room', field: 'desks' });
      // Without custom forces on nobody drafts.
      const early = await rasmus.post(`/api/rooms/${code}/custom`, { custom: { crews: [['patrol', 'pohja-hq']] } }, at(380));
      expect(early.json.error).toBe('not_custom');
      // Kohandatud mäng (2.27.0): custom forces on, every player drafts their own desk's crews.
      const on = await pille.put(`/api/rooms/${code}`, { body: { ...OPTS, custom: { crews: [], budget: true } }, ...at(400) });
      expect(on.status).toBe(200);
      expect(on.json.room.options.custom).toEqual({ crews: [], budget: true });
      expect((await rasmus.post(`/api/rooms/${code}/desk`, { desk: 'pohja-idaharju' }, at(450))).status).toBe(200);
      const mine = await pille.post(`/api/rooms/${code}/custom`, { custom: { crews: [['patrol', 'pohja-hq', 1, 2], ['rapid', 'pohja-hq']] } }, at(460));
      expect(mine.status).toBe(200);
      expect(mine.json.room.players[0].custom).toEqual({ crews: [['patrol', 'pohja-hq', 1, 2], ['rapid', 'pohja-hq']] });
      // An officer belongs to one player of the room.
      const taken = await rasmus.post(`/api/rooms/${code}/custom`, { custom: { crews: [['patrol', 'pohja-idaharju', 2]] } }, at(470));
      expect(taken.status).toBe(409);
      expect(taken.json).toMatchObject({ error: 'officer_taken', officer: 2 });
      expect((await rasmus.post(`/api/rooms/${code}/custom`, { custom: { crews: 'x' } }, at(475))).json).toMatchObject({ error: 'invalid_room', field: 'custom' });
      expect((await rasmus.post(`/api/rooms/${code}/custom`, { custom: { crews: [['patrol', 'pohja-idaharju', 3]] } }, at(480))).status).toBe(200);
      await rasmus.post(`/api/rooms/${code}/ready`, { ready: true }, at(500));
      const started = await pille.post(`/api/rooms/${code}/start`, undefined, at(1000));
      expect(started.json.room.state).toBe('running');
      // The shared shift's force: both drafts, in seat order.
      expect(started.json.room.options.custom).toEqual({
        crews: [['patrol', 'pohja-hq', 1, 2], ['rapid', 'pohja-hq'], ['patrol', 'pohja-idaharju', 3]],
        budget: true,
      });
      expect((await rasmus.post(`/api/rooms/${code}/custom`, { custom: { crews: [] } }, at(1050))).json.error).toBe('room_started');
      expect((await rasmus.post(`/api/rooms/${code}/desk`, { desk: 'pohja-lasnamae' }, at(1100))).json.error).toBe('room_started');
    });

    it('starts the log with every seat’s desk', async () => {
      const r = await pille.get(`/api/rooms/${code}/log?after=0`, at(1500));
      expect(r.json.cmds).toEqual([
        { id: expect.any(Number), t: 0, s: -1, k: 'setup', a: [0, [[0, 'pohja-kesklinn', 'Pille'], [1, 'pohja-idaharju', 'Rasmus']]] },
      ]);
    });

    it('takes lend requests and their answers into the log, well-formed only', async () => {
      const ok = await rasmus.post(
        `/api/rooms/${code}/cmd`,
        { cmds: [{ k: 'lend', a: ['i3', 'u12'] }, { k: 'lendans', a: [4, 1] }] },
        at(4200),
      );
      expect(ok.status).toBe(200);
      expect(ok.json.ids).toHaveLength(2);
      for (const a of [['i3'], ['i3', 'u1', 'u2'], [4, 'u1'], ['i3', 'bad id']])
        expect((await rasmus.post(`/api/rooms/${code}/cmd`, { cmds: [{ k: 'lend', a }] }, at(4300))).json.error, JSON.stringify(a)).toBe('invalid_command');
      for (const a of [[0, 1], [4, 2], ['4', 1], [4], [2_000_000, 0]])
        expect((await rasmus.post(`/api/rooms/${code}/cmd`, { cmds: [{ k: 'lendans', a }] }, at(4400))).json.error, JSON.stringify(a)).toBe('invalid_command');
      const r = await pille.get(`/api/rooms/${code}/log?after=0`, at(5000));
      expect(r.json.cmds.slice(1).map((c: Json) => [c.k, c.s, c.a])).toEqual([
        ['lend', 1, ['i3', 'u12']],
        ['lendans', 1, [4, 1]],
      ]);
    });

    it('takes desk take-overs into the log, and the host removes a player from the running shift (2.34.0)', async () => {
      const ok = await pille.post(`/api/rooms/${code}/cmd`, { cmds: [{ k: 'take', a: ['pohja-lasnamae'] }, { k: 'give', a: ['pohja-lasnamae'] }] }, at(6000));
      expect(ok.status).toBe(200);
      for (const a of [[], ['pohja lasnamae'], [3]])
        expect((await pille.post(`/api/rooms/${code}/cmd`, { cmds: [{ k: 'take', a }] }, at(6100))).json.error, JSON.stringify(a)).toBe('invalid_command');
      expect((await rasmus.post(`/api/rooms/${code}/kick`, { seat: 0 }, at(6200))).json.error).toBe('not_host');
      const kicked = await pille.post(`/api/rooms/${code}/kick`, { seat: 1 }, at(6500));
      expect(kicked.status, JSON.stringify(kicked.json)).toBe(200);
      expect(kicked.json.room.state).toBe('running');
      expect(kicked.json.room.players.find((p: Json) => p.seat === 1)).toMatchObject({ name: 'Rasmus', left: true });
      // The shared shift hears it at once: the seat leaves and its desk goes to the colleague.
      const log = await pille.get(`/api/rooms/${code}/log?after=0`, at(7000));
      expect(log.json.cmds.at(-1)).toMatchObject({ s: -1, k: 'left', a: [1] });
      // The removed player is out for good: no log, no commands, no ticket, no result, no way back in.
      for (const r of [
        await rasmus.get(`/api/rooms/${code}/log?after=0`, at(7100)),
        await rasmus.get(`/api/rooms/${code}`, at(7200)),
        await rasmus.post('/api/rooms/join', { code }, at(7300)),
        await rasmus.post(`/api/rooms/${code}/cmd`, { cmds: [{ k: 'ping', a: ['tere'] }] }, at(7400)),
        await rasmus.post(`/api/rooms/${code}/result`, { score: 50, grade: 'C', incidents: 3, arrests: 0 }, at(7500)),
      ]) {
        expect(r.status).toBe(403);
        expect(r.json.error).toBe('kicked');
      }
    });

    it('keeps desks out of the other modes', async () => {
      const race = (await pille.post('/api/rooms', { ...OPTS, mode: 'race' }, at(10_000))).json.room;
      expect(race.options.desks).toBeUndefined();
      expect(race.players[0].desk).toBeUndefined();
      expect(JSON.parse(sql(`SELECT desks FROM rooms WHERE code = '${race.code}'`))).toEqual([['']]);
      expect((await pille.post(`/api/rooms/${race.code}/desk`, { desk: 'pohja-kesklinn' }, at(10_100))).json.error).toBe('not_coop');
      const role = (await pille.post('/api/rooms', { ...OPTS, mode: 'role' }, at(10_200))).json.room;
      expect(role.options.desks).toBeUndefined();
      expect((await pille.post(`/api/rooms/${role.code}/desk`, { desk: 'pohja-kesklinn' }, at(10_300))).json.error).toBe('not_sector');
    });
  });

  describe('rate limiting', () => {
    it('blocks the 11th failed login for the same IP and name', async () => {
      expect((await register(client(), 'Ratty', 'right-password')).status).toBe(200);
      const attacker = client();
      for (let i = 1; i <= 10; i++) {
        expect((await login(attacker, 'Ratty', `wrong-${i}`)).status, `attempt ${i}`).toBe(401);
      }
      const blocked = await login(attacker, 'ratty', 'wrong-11');
      expect(blocked.status).toBe(429);
      expect(blocked.json).toEqual({
        error: 'rate_limited',
        message: 'Liiga palju katseid, proovi 15 minuti pärast uuesti.',
      });
      expect(blocked.headers.get('retry-after')).toBe('900');
      // Even the right password waits now, but only for this IP.
      expect((await login(attacker, 'Ratty', 'right-password')).status).toBe(429);
      expect((await login(client(), 'Ratty', 'right-password')).status).toBe(200);
    });

    it('forgets failed attempts after a successful login', async () => {
      expect((await register(client(), 'Forgetful', 'right-password')).status).toBe(200);
      const c = client();
      for (let i = 0; i < 6; i++) expect((await login(c, 'Forgetful', 'nope-nope')).status).toBe(401);
      expect((await login(c, 'Forgetful', 'right-password')).status).toBe(200);
      for (let i = 0; i < 6; i++) expect((await login(c, 'Forgetful', 'nope-nope')).status).toBe(401);
    });

    it('allows 40 attempts per IP across names', async () => {
      const c = client();
      for (let i = 0; i < 40; i++) {
        expect(
          (await c.post('/api/register', { name: `bad name ${i}`, password: 'salajane-123' })).status,
        ).toBe(400);
      }
      expect((await login(c, 'Alice', 'correct horse')).status).toBe(429);
      expect((await c.post('/api/register', { name: 'Fresh.Name', password: 'salajane-123' })).status).toBe(
        429,
      );
    });

    it('does not trust X-Forwarded-For from an unknown peer', async () => {
      for (let i = 1; i <= 10; i++) {
        const spoofer = new Client(untrusted.base, `198.51.100.${i}`);
        expect(
          (await spoofer.post('/api/register', { name: 'spoof me', password: 'salajane-123' })).status,
        ).toBe(400);
      }
      const r = await new Client(untrusted.base, '198.51.100.99').post('/api/register', {
        name: 'spoof me',
        password: 'salajane-123',
      });
      expect(r.status).toBe(429);
    });
  });

  describe('joint report and history (2.36.0)', () => {
    const OPTS = {
      mode: 'sector',
      regionId: 'pohja',
      sector: '',
      difficulty: 'normal',
      hours: 2,
      slot: 'evening',
      desks: ['pohja-kesklinn', 'pohja-lasnamae'],
    };
    const T0 = Date.UTC(2026, 9, 22, 17, 0, 0);
    const at = (ms: number) => ({ headers: { 'X-EPD-Test-Now': String(T0 + ms) } });
    const RESULT = { score: 66, grade: 'C', incidents: 12, arrests: 2 };
    /** A joint report as a browser sends it (src/sim/joint.ts roomSummary), for two seats. */
    const summary = (names: [string, string], score = 66) => ({
      v: 1,
      regionId: 'pohja',
      difficulty: 'normal',
      start: T0,
      end: T0 + 7_200_000,
      score,
      grade: 'C',
      incidents: 12,
      arrests: 2,
      xp: 300,
      coop: {
        code: 'ROOM',
        host: 0,
        mode: 'sector',
        seats: names.map((name, seat) => ({ seat, name, role: 'dispatch', present: true, stats: { calls: 3 }, worked: 4, p1: 1 })),
        desks: [],
        moments: [{ t: T0 + 60_000, k: 'lend', seat: 1, other: 0, unit: 'PÕHJA 21' }],
      },
    });
    let piret: Client;
    let raul: Client;
    let code = '';
    const play = async (round: number, ms: number, bodies: [Json, Json]) => {
      if (round > 1) {
        await piret.post(`/api/rooms/${code}/reopen`, { round: round - 1 }, at(ms));
        await raul.post(`/api/rooms/${code}/reopen`, { round: round - 1 }, at(ms + 100));
      }
      await raul.post(`/api/rooms/${code}/ready`, { ready: true }, at(ms + 200));
      const start = await piret.post(`/api/rooms/${code}/start`, undefined, at(ms + 300));
      expect(start.json.room, JSON.stringify(start.json)).toMatchObject({ state: 'running', round });
      expect((await piret.post(`/api/rooms/${code}/result`, { ...RESULT, ...bodies[0] }, at(ms + 60_000))).status).toBe(200);
      const done = await raul.post(`/api/rooms/${code}/result`, { ...RESULT, ...bodies[1] }, at(ms + 60_100));
      expect(done.json.room?.state, JSON.stringify(done.json)).toBe('finished');
    };

    it('keeps the first joint report of a co-op round and shows it in both players’ history', async () => {
      piret = client();
      raul = client();
      await register(piret, 'Piret.H');
      await register(raul, 'Raul.H');
      code = (await piret.post('/api/rooms', OPTS, at(0))).json.room.code;
      await raul.post('/api/rooms/join', { code }, at(100));
      expect((await piret.get('/api/rooms/history')).json).toEqual({ rounds: [] });
      await play(1, 1000, [{ summary: summary(['Piret.H', 'Raul.H']) }, { summary: summary(['Piret.H', 'Raul.H'], 99) }]);
      for (const c of [piret, raul]) {
        const h = (await c.get('/api/rooms/history')).json.rounds;
        expect(h).toHaveLength(1);
        expect(h[0]).toMatchObject({ code, round: 1, mode: 'sector', summary: summary(['Piret.H', 'Raul.H']) });
        expect(h[0].results.map((r: Json) => r.name).sort()).toEqual(['Piret.H', 'Raul.H']);
      }
      // Nobody else sees it, and a guest gets nothing.
      const stranger = client();
      expect((await register(stranger, 'Võõras.H')).status).toBe(200);
      expect((await stranger.get('/api/rooms/history')).json).toEqual({ rounds: [] });
      expect((await client().get('/api/rooms/history')).status).toBe(401);
    });

    it('leaves out what is not a joint report, and lists the rounds newest first', async () => {
      const huge = summary(['Piret.H', 'Raul.H']);
      (huge.coop.moments as Json[]).push(
        ...Array.from({ length: 70 }, (_, i) => ({ t: i, k: 'good', seats: [0], title: { et: 'x'.repeat(150), en: 'x' }, text: { et: 'y'.repeat(300), en: 'y' } })),
      );
      // Over the 32 kB a round keeps, under the 64 kB a request may carry.
      expect(JSON.stringify(huge).length).toBeGreaterThan(32_768);
      expect(JSON.stringify(huge).length).toBeLessThan(60_000);
      await play(2, 200_000, [{ summary: { ...summary(['Piret.H', 'Raul.H']), coop: { seats: [] } } }, { summary: huge }]);
      const h = (await piret.get('/api/rooms/history')).json.rounds;
      expect(h.map((r: Json) => [r.round, r.summary === null])).toEqual([
        [2, true],
        [1, false],
      ]);
      // A race round keeps no joint report, whatever a client sends.
      const race = (await piret.post('/api/rooms', { ...OPTS, mode: 'race' }, at(400_000))).json.room.code;
      await raul.post('/api/rooms/join', { code: race }, at(400_100));
      await raul.post(`/api/rooms/${race}/ready`, { ready: true }, at(400_200));
      await piret.post(`/api/rooms/${race}/start`, undefined, at(400_300));
      await piret.post(`/api/rooms/${race}/result`, { ...RESULT, summary: summary(['Piret.H', 'Raul.H']) }, at(460_000));
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM room_reports t JOIN rooms r ON r.id = t.room_id WHERE r.code = '${race}'`))).toEqual([[0]]);
      // Still running for Raul: not in the history yet.
      expect((await piret.get('/api/rooms/history')).json.rounds.map((r: Json) => r.code)).toEqual([code, code]);
      await raul.post(`/api/rooms/${race}/result`, RESULT, at(460_100));
      const all = (await piret.get('/api/rooms/history')).json.rounds;
      expect(all.map((r: Json) => [r.code, r.round, r.mode])).toEqual([
        [race, 1, 'race'],
        [code, 2, 'sector'],
        [code, 1, 'sector'],
      ]);
      expect(all[0].summary).toBeNull();
    });

    it('takes a deleted account’s name out of the joint reports and keeps the round for the others', async () => {
      expect((await raul.del('/api/me', { password: 'salajane-123' })).status).toBe(200);
      const h = (await piret.get('/api/rooms/history')).json.rounds;
      const first = h.find((r: Json) => r.code === code && r.round === 1);
      expect(first.summary.coop.seats.map((x: Json) => x.name)).toEqual(['Piret.H', '']);
      expect(first.results.map((r: Json) => r.name)).toEqual(['Piret.H']);
    });
  });

  describe('delete account', () => {
    it('needs a login, the current password and X-EPD', async () => {
      expect((await client().del('/api/me', { password: 'salajane-123' })).status).toBe(401);
      expect((await bob.put('/api/save/career', { body: { money: 1 } })).status).toBe(200);
      expect((await bob.del('/api/me', { password: 'salajane-123' }, { csrf: false })).status).toBe(403);
      const missing = await bob.del('/api/me', {});
      expect(missing.status).toBe(400);
      expect(missing.json.error).toBe('password_required');
      const wrong = await bob.del('/api/me', { password: 'not-my-password' });
      expect(wrong.status).toBe(403);
      expect(wrong.json.error).toBe('wrong_password');
      expect((await bob.get('/api/me')).json.user.name).toBe('Bob');
    });

    it('deletes the user with all saves and scores and ends the session', async () => {
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM scores WHERE user_id = ${bobId}`))).toEqual([[3]]);
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM daily_scores WHERE user_id = ${bobId}`))).toEqual([[1]]);
      const r = await bob.del('/api/me', { password: 'salajane-123' });
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ ok: true });
      expect(bob.session).toBeUndefined();
      expect((await bob.get('/api/me')).json.user).toBeNull();
      expect((await login(client(), 'Bob')).status).toBe(401);
      const tables = [
        'users WHERE id',
        'saves WHERE user_id',
        'scores WHERE user_id',
        'daily_scores WHERE user_id',
        'room_players WHERE user_id',
        'room_results WHERE user_id',
        'room_round_results WHERE user_id',
        'room_commands WHERE user_id',
        'room_snapshots WHERE user_id',
        'rooms WHERE host_id',
      ];
      for (const table of tables) {
        expect(JSON.parse(sql(`SELECT COUNT(*) FROM ${table} = ${bobId}`)), table).toEqual([[0]]);
      }
      // His room goes on without him: Ivo hosts it now, and Bob's result is off its board.
      const room = bobRoom;
      expect(room).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(
        JSON.parse(
          sql(`SELECT u.name FROM rooms r JOIN users u ON u.id = r.host_id WHERE r.code = '${room}'`),
        ),
      ).toEqual([['Ivo']]);
      expect(
        JSON.parse(
          sql(
            `SELECT COUNT(*) FROM room_results r JOIN rooms m ON m.id = r.room_id WHERE m.code = '${room}'`,
          ),
        ),
      ).toEqual([[0]]);
      const board = await client().get('/api/scores?region=pohja');
      expect(board.json.scores.map((s: Json) => s.name)).toEqual(['Alice']);
      // The name is free again, and the new account starts empty.
      const again = client();
      expect((await register(again, 'bob')).status).toBe(200);
      expect((await again.get('/api/save')).json.career).toBeNull();
    });
  });

  describe('admin panel', () => {
    let juhan: Client;
    let juhanId = 0;
    let kadriId = 0;
    let toomasId = 0;
    const patch = (c: Client, path: string, body: unknown) => c.req('PATCH', path, { body });
    const lastLog = (): Json => JSON.parse(sql('SELECT admin_name, action, target, detail, ip FROM admin_log ORDER BY id DESC LIMIT 1'))[0];

    it('needs an admin account and its password again', async () => {
      expect((await client().get('/api/admin/me')).status).toBe(401);
      juhan = client();
      juhanId = (await register(juhan, 'Juhan', 'admini-parool')).json.user.id;
      const notYet = await juhan.get('/api/admin/stats');
      expect(notYet.status).toBe(403);
      expect(notYet.json.error).toBe('not_admin');
      expect((await juhan.get('/api/me')).json.user.admin).toBeUndefined();

      sql(`UPDATE users SET role = 'admin' WHERE id = ${juhanId}`);
      expect((await juhan.get('/api/me')).json.user).toMatchObject({ name: 'Juhan', admin: true });
      expect((await juhan.get('/api/admin/me')).json).toMatchObject({ user: { id: juhanId, admin: true }, unlocked: false });
      const locked = await juhan.get('/api/admin/stats');
      expect(locked.status).toBe(403);
      expect(locked.json.error).toBe('admin_locked');

      expect((await juhan.post('/api/admin/unlock', { password: 'admini-parool' }, { csrf: false })).status).toBe(403);
      const wrong = await juhan.post('/api/admin/unlock', { password: 'vale-parool' });
      expect(wrong.status).toBe(403);
      expect(wrong.json.error).toBe('wrong_password');
      expect(lastLog()).toEqual(['Juhan', 'unlock_failed', '', '', expect.stringMatching(/^203\.0\.113\./)]);

      const before = juhan.session;
      const open = await juhan.post('/api/admin/unlock', { password: 'admini-parool' });
      expect(open.status).toBe(200);
      expect(open.json.until).toBeGreaterThan(Date.now() + 3600_000);
      expect(juhan.session).not.toBe(before);
      expect((await juhan.get('/api/admin/me')).json.unlocked).toBe(true);
      expect((await juhan.get('/api/admin/stats')).status).toBe(200);
      expect(lastLog()[1]).toBe('unlock');

      // Another browser of the same admin is still locked, and locking closes this one.
      const other = client();
      expect((await login(other, 'Juhan', 'admini-parool')).json.user.admin).toBe(true);
      expect((await other.get('/api/admin/stats')).json.error).toBe('admin_locked');
      expect((await juhan.post('/api/admin/lock')).status).toBe(200);
      expect((await juhan.get('/api/admin/stats')).json.error).toBe('admin_locked');
      expect((await juhan.get('/api/me')).json.user.name).toBe('Juhan');
      expect((await juhan.post('/api/admin/unlock', { password: 'admini-parool' })).status).toBe(200);
    });

    it('shows the statistics', async () => {
      const r = await juhan.get('/api/admin/stats');
      expect(r.json.users.total).toBe(Number(JSON.parse(sql('SELECT COUNT(*) FROM users'))[0][0]));
      expect(r.json.users.admins).toBe(1);
      expect(r.json.users.new1d).toBeGreaterThan(0);
      expect(r.json.scores.total).toBe(Number(JSON.parse(sql('SELECT COUNT(*) FROM scores'))[0][0]));
      expect(r.json.db).toEqual({ bytes: expect.any(Number), schema: expect.any(Number) });
      expect(r.json.db.schema).toBeGreaterThanOrEqual(10);
      expect(Object.values(r.json.series.signups).length).toBeGreaterThan(0);
      expect(Array.isArray(r.json.top)).toBe(true);
    });

    it('creates accounts, with a generated password shown once', async () => {
      const made = await juhan.post('/api/admin/users', { name: 'Kadri' });
      expect(made.status).toBe(200);
      expect(made.json.user).toMatchObject({ name: 'Kadri', admin: false, disabled: false, lastLogin: null });
      expect(made.json.password).toMatch(/^[a-zA-Z2-9]{14}$/);
      kadriId = made.json.user.id;
      expect((await login(client(), 'Kadri', made.json.password)).status).toBe(200);
      expect(lastLog()).toEqual(['Juhan', 'user_create', `user:${kadriId}`, '{"name":"Kadri","admin":false}', expect.any(String)]);

      const own = await juhan.post('/api/admin/users', { name: 'Toomas', password: 'toomase-parool' });
      expect(own.json.password).toBeUndefined();
      toomasId = own.json.user.id;
      expect((await juhan.post('/api/admin/users', { name: 'kadri' })).json.error).toBe('name_taken');
      expect((await juhan.post('/api/admin/users', { name: 'x' })).json.error).toBe('invalid_name');
      expect((await juhan.post('/api/admin/users', { name: 'Lühike', password: 'abc' })).status).toBe(400);
      // Only an admin writes here.
      const kadri = client();
      await login(kadri, 'Kadri', made.json.password);
      expect((await kadri.post('/api/admin/users', { name: 'Hiilija' })).json.error).toBe('not_admin');
    });

    it('lists and searches accounts with their totals', async () => {
      const r = await juhan.get('/api/admin/users?q=KAD');
      expect(r.json.total).toBe(1);
      expect(r.json.users[0]).toMatchObject({ id: kadriId, name: 'Kadri', shifts: 0, best: null, daily: 0, saveBytes: 0 });
      const all = await juhan.get('/api/admin/users?sort=name&dir=asc&limit=2');
      expect(all.json.users.length).toBe(2);
      expect(all.json.total).toBeGreaterThanOrEqual(3);
      expect((await juhan.get('/api/admin/users?limit=0')).status).toBe(400);
      // A search for "_" or "%" means those characters, not any.
      expect((await juhan.get('/api/admin/users?q=%25')).json.total).toBe(0);
    });

    it('renames, blocks and unblocks an account', async () => {
      const toomas = client();
      expect((await login(toomas, 'Toomas', 'toomase-parool')).status).toBe(200);
      const renamed = await patch(juhan, `/api/admin/users/${toomasId}`, { name: 'Toomas.T' });
      expect(renamed.json.user.name).toBe('Toomas.T');
      expect((await login(client(), 'Toomas', 'toomase-parool')).status).toBe(401);
      expect((await toomas.get('/api/me')).json.user.name).toBe('Toomas.T');
      expect((await patch(juhan, `/api/admin/users/${toomasId}`, { name: 'Kadri' })).json.error).toBe('name_taken');

      expect((await patch(juhan, `/api/admin/users/${toomasId}`, { disabled: true })).json.user.disabled).toBe(true);
      expect((await toomas.get('/api/me')).json.user).toBeNull();
      const blocked = await login(client(), 'Toomas.T', 'toomase-parool');
      expect(blocked.status).toBe(403);
      expect(blocked.json.error).toBe('account_disabled');
      // A wrong password does not learn that the account is blocked.
      expect((await login(client(), 'Toomas.T', 'vale-parool-1')).status).toBe(401);
      await patch(juhan, `/api/admin/users/${toomasId}`, { disabled: false });
      expect((await login(toomas, 'Toomas.T', 'toomase-parool')).status).toBe(200);
      expect((await patch(juhan, `/api/admin/users/${toomasId}`, { disabled: 'jah' })).status).toBe(400);
      expect((await patch(juhan, '/api/admin/users/999999', { disabled: true })).status).toBe(404);
    });

    it('makes admins and never locks the admins out', async () => {
      expect((await patch(juhan, `/api/admin/users/${kadriId}`, { admin: true })).json.user.admin).toBe(true);
      expect((await juhan.get('/api/admin/stats')).json.users.admins).toBe(2);
      expect((await patch(juhan, `/api/admin/users/${kadriId}`, { admin: false })).json.user.admin).toBe(false);
      for (const body of [{ admin: false }, { disabled: true }]) {
        const r = await patch(juhan, `/api/admin/users/${juhanId}`, body);
        expect(r.status).toBe(409);
        expect(r.json.error).toBe('self');
      }
      expect((await juhan.del(`/api/admin/users/${juhanId}`)).json.error).toBe('self');
      expect(JSON.parse(sql(`SELECT role, disabled FROM users WHERE id = ${juhanId}`))).toEqual([['admin', 0]]);
    });

    it('resets a password and ends every session of the account', async () => {
      const [a, b] = [client(), client()];
      await login(a, 'Toomas.T', 'toomase-parool');
      await login(b, 'Toomas.T', 'toomase-parool');
      const r = await juhan.post(`/api/admin/users/${toomasId}/password`, {});
      expect(r.json.password).toMatch(/^[a-zA-Z2-9]{14}$/);
      expect((await a.get('/api/me')).json.user).toBeNull();
      expect((await b.get('/api/me')).json.user).toBeNull();
      expect((await login(client(), 'Toomas.T', 'toomase-parool')).status).toBe(401);
      expect((await login(a, 'Toomas.T', r.json.password)).status).toBe(200);
      expect(lastLog()[1]).toBe('user_password');
      expect(lastLog()[3]).not.toContain(r.json.password);

      expect((await juhan.post(`/api/admin/users/${toomasId}/password`, { password: 'uus-parool-77' })).json.password).toBeUndefined();
      expect((await a.get('/api/me')).json.user).toBeNull();
      expect((await login(a, 'Toomas.T', 'uus-parool-77')).status).toBe(200);
      expect((await juhan.post(`/api/admin/users/${toomasId}/logout`)).status).toBe(200);
      expect((await a.get('/api/me')).json.user).toBeNull();
    });

    it('changes its own password without logging itself out', async () => {
      expect((await juhan.post(`/api/admin/users/${juhanId}/password`, { password: 'uus-admini-parool' })).status).toBe(200);
      expect((await juhan.get('/api/admin/stats')).status).toBe(200);
      expect((await login(client(), 'Juhan', 'uus-admini-parool')).status).toBe(200);
    });

    it('lifts the login limit of an account', async () => {
      const attacker = client();
      for (let i = 0; i < 10; i++) await login(attacker, 'Toomas.T', `vale-${i}-parool`);
      expect((await login(attacker, 'Toomas.T', 'uus-parool-77')).status).toBe(429);
      expect((await juhan.get(`/api/admin/users/${toomasId}`)).json.loginAttempts).toBe(10);
      expect((await juhan.post(`/api/admin/users/${toomasId}/unlimit`)).status).toBe(200);
      expect((await login(attacker, 'Toomas.T', 'uus-parool-77')).status).toBe(200);
    });

    it('reads, replaces and deletes cloud saves', async () => {
      const toomas = client();
      await login(toomas, 'Toomas.T', 'uus-parool-77');
      expect((await toomas.put('/api/save/career', { body: { money: 5 } })).status).toBe(200);
      const read = await juhan.get(`/api/admin/users/${toomasId}/saves/career`);
      expect(read.json).toEqual({ money: 5 });
      const version = Number(read.headers.get('x-epd-updated'));
      expect(version).toBeGreaterThan(0);

      const put = await juhan.put(`/api/admin/users/${toomasId}/saves/career`, { raw: '{"money":999}' });
      expect(put.json.updated).toBeGreaterThan(version);
      expect((await toomas.get('/api/save')).json.career).toEqual({ money: 999 });
      expect(lastLog()).toEqual(['Juhan', 'save_put', `user:${toomasId}`, '{"slot":"career","bytes":13}', expect.any(String)]);
      expect((await juhan.put(`/api/admin/users/${toomasId}/saves/career`, { raw: '[1]' })).json.error).toBe('not_object');
      expect((await juhan.put(`/api/admin/users/${toomasId}/saves/career`, { raw: '{"a":' })).json.error).toBe('bad_json');
      expect((await juhan.get(`/api/admin/users/${toomasId}/saves/nope`)).json.error).toBe('bad_slot');
      expect((await juhan.get(`/api/admin/users/${toomasId}/saves/autosave`)).status).toBe(404);

      expect((await juhan.del(`/api/admin/users/${toomasId}/saves/career`)).status).toBe(200);
      expect((await toomas.get('/api/save')).json.career).toBeNull();
      const detail = await juhan.get(`/api/admin/users/${toomasId}`);
      expect(detail.json.saves).toEqual([{ slot: 'career', updated: expect.any(Number), bytes: 4, deleted: true }]);
    });

    it('adds, edits and deletes leaderboard results', async () => {
      const add = await juhan.post('/api/admin/scores', { userId: toomasId, ...SHIFT, regionId: 'ida', score: 91 });
      expect(add.status).toBe(200);
      const id = add.json.score.id;
      expect(add.json.score).toMatchObject({ userId: toomasId, name: 'Toomas.T', regionId: 'ida', score: 91, grade: 'A' });
      const board = async () => (await client().get('/api/scores?region=ida')).json.scores.map((s: Json) => [s.name, s.score]);
      expect(await board()).toContainEqual(['Toomas.T', 91]);

      expect((await patch(juhan, `/api/admin/scores/${id}`, { score: 12, grade: 'D' })).json.score).toMatchObject({ score: 12, grade: 'D' });
      expect(await board()).toContainEqual(['Toomas.T', 12]);
      expect(lastLog()[2]).toBe(`user:${toomasId}`);
      expect(JSON.parse(lastLog()[3])).toEqual({ score: id, was: { score: 91, grade: 'A' }, now: { score: 12, grade: 'D' } });
      expect((await patch(juhan, `/api/admin/scores/${id}`, { score: 101 })).status).toBe(400);
      expect((await juhan.post('/api/admin/scores', { userId: toomasId, regionId: 'ida' })).status).toBe(400);
      expect((await juhan.post('/api/admin/scores', { ...SHIFT, userId: 999999 })).status).toBe(404);

      const list = await juhan.get(`/api/admin/scores?user=${toomasId}`);
      expect(list.json.total).toBe(1);
      expect((await juhan.get('/api/admin/scores?q=toomas&region=ida')).json.scores[0].id).toBe(id);
      expect((await juhan.del(`/api/admin/scores/${id}`)).status).toBe(200);
      expect(await board()).not.toContainEqual(['Toomas.T', 12]);
      expect((await juhan.del(`/api/admin/scores/${id}`)).status).toBe(404);
    });

    it('adds, edits and deletes daily challenge results', async () => {
      const row = { userId: toomasId, day: '2024-01-15', regionId: 'pohja', score: 70, grade: 'B', incidents: 9 };
      const add = await juhan.post('/api/admin/daily', row);
      expect(add.status).toBe(200);
      const id = add.json.daily.id;
      expect((await juhan.post('/api/admin/daily', row)).json.error).toBe('daily_exists');
      expect((await juhan.post('/api/admin/daily', { ...row, day: '2024-02-30' })).status).toBe(400);
      expect((await patch(juhan, `/api/admin/daily/${id}`, { score: 88, sector: 'pohja-kesklinn' })).json.daily).toMatchObject({ score: 88, sector: 'pohja-kesklinn' });
      const day = await juhan.get('/api/admin/daily?day=2024-01-15');
      expect(day.json.daily.map((d: Json) => [d.name, d.score])).toEqual([['Toomas.T', 88]]);
      expect((await juhan.del(`/api/admin/daily/${id}`)).status).toBe(200);
      expect((await juhan.get('/api/admin/daily?day=2024-01-15')).json.total).toBe(0);
    });

    it('looks into, closes and deletes rooms', async () => {
      const host = client();
      await login(host, 'Toomas.T', 'uus-parool-77');
      const room = (await host.post('/api/rooms', { mode: 'race', regionId: 'louna', sector: 'louna-tartu', difficulty: 'normal', hours: 3, slot: 'evening' })).json.room;
      const list = await juhan.get('/api/admin/rooms?state=lobby');
      expect(list.json.rooms.map((r: Json) => r.code)).toContain(room.code);
      const detail = await juhan.get(`/api/admin/rooms/${room.code}`);
      expect(detail.json.room).toMatchObject({ code: room.code, state: 'lobby', host: 'Toomas.T', players: 1 });
      expect(detail.json.players).toEqual([expect.objectContaining({ id: toomasId, name: 'Toomas.T', seat: 0 })]);
      expect((await juhan.post(`/api/admin/rooms/${room.code}/close`)).json.room.state).toBe('closed');
      expect((await host.get(`/api/rooms/${room.code}`)).json.room.state).toBe('closed');
      expect((await juhan.del(`/api/admin/rooms/${room.code}/results/${toomasId}`)).status).toBe(404);
      expect((await juhan.del(`/api/admin/rooms/${room.code}`)).status).toBe(200);
      expect((await juhan.get(`/api/admin/rooms/${room.code}`)).status).toBe(404);
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM room_players p LEFT JOIN rooms r ON r.id = p.room_id WHERE r.id IS NULL`))).toEqual([[0]]);
    });

    it('shows a room’s rounds and closes a room between two rounds', async () => {
      const host = client();
      await login(host, 'Toomas.T', 'uus-parool-77');
      const guest = client();
      await register(guest, 'Mirjam');
      const RESULT = { score: 80, grade: 'A', incidents: 7, arrests: 1 };
      const room = (await host.post('/api/rooms', { mode: 'race', regionId: 'ida', sector: '', difficulty: 'normal', hours: 2, slot: 'night' })).json.room;
      await guest.post('/api/rooms/join', { code: room.code });
      await guest.post(`/api/rooms/${room.code}/ready`, { ready: true });
      await host.post(`/api/rooms/${room.code}/start`);
      await host.post(`/api/rooms/${room.code}/result`, RESULT);
      await guest.post(`/api/rooms/${room.code}/result`, { ...RESULT, score: 90 });
      await guest.post(`/api/rooms/${room.code}/reopen`, {});
      const list = await juhan.get('/api/admin/rooms?state=lobby');
      expect(list.json.rooms.find((r: Json) => r.code === room.code)).toMatchObject({ round: 2, players: 2 });
      const detail = await juhan.get(`/api/admin/rooms/${room.code}`);
      expect(detail.json.room).toMatchObject({ round: 2, state: 'lobby' });
      expect(detail.json.results).toEqual([]);
      expect(detail.json.rounds).toEqual([
        {
          round: 1,
          mode: 'race',
          seed: expect.any(Number),
          results: [
            expect.objectContaining({ name: 'Mirjam', score: 90, rank: 1 }),
            expect.objectContaining({ name: 'Toomas.T', score: 80, rank: 2 }),
          ],
        },
      ]);
      // The second round, closed by an admin once it is over: the room never opens again.
      await guest.post(`/api/rooms/${room.code}/ready`, { ready: true });
      await host.post(`/api/rooms/${room.code}/start`);
      await host.post(`/api/rooms/${room.code}/result`, RESULT);
      await guest.post(`/api/rooms/${room.code}/result`, RESULT);
      expect((await juhan.post(`/api/admin/rooms/${room.code}/close`)).json.room).toMatchObject({ state: 'closed', round: 2 });
      expect((await guest.post(`/api/rooms/${room.code}/reopen`, {})).json.error).toBe('room_closed');
      expect((await juhan.del(`/api/admin/rooms/${room.code}`)).status).toBe(200);
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM room_round_results x LEFT JOIN rooms r ON r.id = x.room_id WHERE r.id IS NULL`))).toEqual([[0]]);
    });

    it('shows the account with its history and the log', async () => {
      const r = await juhan.get(`/api/admin/users/${toomasId}`);
      expect(r.json.user.name).toBe('Toomas.T');
      expect(r.json.log.map((l: Json) => l.action)).toEqual(
        expect.arrayContaining(['user_create', 'user_update', 'user_password', 'save_put', 'score_create', 'score_delete', 'daily_update']),
      );
      const log = await juhan.get('/api/admin/log?action=user_create&limit=5');
      expect(log.json.log[0]).toMatchObject({ admin: 'Juhan', adminId: juhanId, action: 'user_create', detail: { name: 'Toomas', admin: false } });
      expect(log.json.total).toBe(2);
    });

    it('makes a checked database backup, at most one a minute', async () => {
      const r = await juhan.post('/api/admin/backups');
      expect(r.status).toBe(200);
      expect(r.json.backup.name).toMatch(/^epd-\d{8}T\d{6}Z-admin\.sqlite$/);
      const file = join(dataDir, 'varu', r.json.backup.name);
      expect(statSync(file).size).toBe(r.json.backup.bytes);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(readdirSync(join(dataDir, 'varu')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
      expect((await juhan.post('/api/admin/backups')).status).toBe(429);
      expect((await juhan.get('/api/admin/backups')).json.backups[0]).toEqual(r.json.backup);
    });

    it('deletes an account with everything in it', async () => {
      const r = await juhan.del(`/api/admin/users/${toomasId}`);
      expect(r.status).toBe(200);
      expect((await login(client(), 'Toomas.T', 'uus-parool-77')).status).toBe(401);
      expect((await juhan.get(`/api/admin/users/${toomasId}`)).status).toBe(404);
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM saves WHERE user_id = ${toomasId}`))).toEqual([[0]]);
      // Its admin log stays.
      expect(JSON.parse(sql(`SELECT COUNT(*) FROM admin_log WHERE target = 'user:${toomasId}'`))[0][0]).toBeGreaterThan(5);
    });

    it('makes the first admin on the server command line', () => {
      const run = (...args: string[]) =>
        spawnSync('php', [join(SERVER_DIR, 'bin', 'admin.php'), ...args], { encoding: 'utf8', env: { ...process.env, EPD_DATA: dataDir }, input: 'kadri\n' });
      expect(run('nimekiri').stdout).toContain('Juhan');
      const made = run();
      expect(made.status).toBe(0);
      expect(made.stdout).toContain('Kadri on nüüd admin.');
      expect(JSON.parse(sql(`SELECT role FROM users WHERE id = ${kadriId}`))).toEqual([['admin']]);
      expect(run('eemalda', 'Kadri').stdout).toContain('ei ole enam admin');
      const missing = run('lisa', 'Keegi-Teine');
      expect(missing.status).toBe(1);
      expect(missing.stderr).toContain('Kontot "Keegi-Teine" ei ole');
      expect(run('parool', 'Kadri').stdout).toMatch(/uus parool \(näidatakse ainult nüüd\): [a-zA-Z2-9]{14}\n/);
      expect(lastLog()).toEqual(['server', 'user_password', `user:${kadriId}`, '{"name":"Kadri","generated":true}', 'cli']);
    });
  });

  describe('deploy hook', () => {
    const ticket = () => join(dataDir, 'control', 'uuenda.json');
    const hook = (event: string, body: string, signature: string | null = sign(body)) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-GitHub-Event': event };
      if (signature !== null) headers['X-Hub-Signature-256'] = signature;
      // No X-EPD header: GitHub cannot send one, and the hook is exempt from the CSRF guard.
      return fetch(`${base}/api/deploy-hook`, { method: 'POST', headers, body }).then(async (res) => ({
        status: res.status,
        json: (await res.json()) as Json,
      }));
    };
    const clearTicket = () => {
      if (existsSync(ticket())) unlinkSync(ticket());
    };

    it('answers 503 until the secret exists', async () => {
      const body = JSON.stringify({ zen: 'Keep it logically awesome.' });
      const r = await hook('ping', body);
      expect(r.status).toBe(503);
      expect(r.json.error).toBe('not_configured');
      writeFileSync(join(dataDir, 'deploy-secret'), HOOK_SECRET + '\n');
    });

    it('rejects missing and wrong signatures', async () => {
      const body = JSON.stringify(workflowRun());
      expect((await hook('workflow_run', body, null)).status).toBe(401);
      const wrong = await hook('workflow_run', body, sign(body, 'other-secret'));
      expect(wrong.status).toBe(401);
      expect(wrong.json.error).toBe('bad_signature');
      expect((await hook('workflow_run', body, 'sha256=00')).status).toBe(401);
      expect(existsSync(ticket())).toBe(false);
    });

    it('answers a ping', async () => {
      const r = await hook('ping', JSON.stringify({ zen: 'Design for failure.', hook_id: 1 }));
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ pong: true });
    });

    it('queues a successful CI run on main and writes the ticket atomically', async () => {
      const r = await hook('workflow_run', JSON.stringify(workflowRun()));
      expect(r.status).toBe(202);
      expect(r.json).toEqual({ queued: SHA });
      const saved = JSON.parse(readFileSync(ticket(), 'utf8'));
      expect(saved).toEqual({ sha: SHA, at: expect.any(Number), source: 'webhook' });
      expect(Math.abs(saved.at - Date.now())).toBeLessThan(60_000);
      expect(readdirSync(join(dataDir, 'control'))).toEqual(['uuenda.json']);
      // A newer run replaces the ticket.
      const newer = 'b'.repeat(40);
      expect((await hook('workflow_run', JSON.stringify(workflowRun({ sha: newer })))).status).toBe(202);
      expect(JSON.parse(readFileSync(ticket(), 'utf8')).sha).toBe(newer);
    });

    it('ignores everything else', async () => {
      const cases: [Parameters<typeof workflowRun>[0], string][] = [
        [{ conclusion: 'failure' }, 'conclusion'],
        [{ conclusion: 'cancelled' }, 'conclusion'],
        [{ head_branch: 'feature/map' }, 'head_branch'],
        [{ repo: 'someone/Estonian-Police-Dispatch' }, 'head_repository'],
        [{ action: 'requested' }, 'action'],
        [{ event: 'pull_request' }, 'event'],
        [{ name: 'Deploy to GitHub Pages' }, 'name'],
        [{ sha: 'not-a-sha' }, 'head_sha'],
      ];
      for (const [over, reason] of cases) {
        clearTicket();
        const r = await hook('workflow_run', JSON.stringify(workflowRun(over)));
        expect(r.status, reason).toBe(200);
        expect(r.json.ignored, reason).toContain(reason);
        expect(existsSync(ticket()), reason).toBe(false);
      }
      const push = await hook('push', JSON.stringify({ ref: 'refs/heads/main' }));
      expect(push.status).toBe(200);
      expect(push.json.ignored).toContain('event');
      expect(existsSync(ticket())).toBe(false);
    });

    it('rejects broken JSON and bodies over 1 MB', async () => {
      expect((await hook('workflow_run', '{"action": ')).status).toBe(400);
      const huge = JSON.stringify({ ...workflowRun(), padding: 'p'.repeat(1024 * 1024) });
      expect((await hook('workflow_run', huge)).status).toBe(413);
      expect(existsSync(ticket())).toBe(false);
    });
  });

  describe('code hygiene', () => {
    const files = phpFiles(SERVER_DIR);

    it('passes php -l on every PHP file', () => {
      expect(files.length).toBeGreaterThanOrEqual(8);
      for (const file of files) {
        const r = spawnSync('php', ['-l', file], { encoding: 'utf8' });
        expect(r.status, `${file}: ${r.stdout}${r.stderr}`).toBe(0);
      }
    });

    it('uses strict types and no em or en dashes', () => {
      for (const file of files) {
        const text = readFileSync(file, 'utf8');
        expect(text, file).toMatch(/^<\?php\s+declare\(strict_types=1\);/);
        expect(text, file).not.toMatch(DASHES);
      }
    });
  });
});

// ------------------------------------------------------------------ speech synthesis

/**
 * A stand-in for TartuNLP behind the relay: a `php -S` router that logs every call (path and JSON
 * body, one line each) and answers by path prefix: /ok/ and /slow/ (after 600 ms) a small valid WAV,
 * /big/ a 300 kB WAV, /html/ an HTML page with status 200.
 */
const FAKE_TTS = `<?php
declare(strict_types=1);
$path = (string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH);
$body = (string) file_get_contents('php://input');
file_put_contents((string) getenv('FAKE_TTS_LOG'), json_encode(['path' => $path, 'method' => $_SERVER['REQUEST_METHOD'], 'type' => $_SERVER['CONTENT_TYPE'] ?? '', 'body' => $body]) . "\\n", FILE_APPEND | LOCK_EX);
if (str_starts_with($path, '/html/')) {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><title>Bad gateway</title>';
    return true;
}
if (str_starts_with($path, '/slow/')) {
    usleep(600000);
}
$samples = str_repeat("\\0\\0", str_starts_with($path, '/big/') ? 150000 : 800);
header('Content-Type: audio/wav');
echo 'RIFF' . pack('V', 36 + strlen($samples)) . 'WAVEfmt ' . pack('VvvVVvv', 16, 1, 1, 8000, 16000, 2, 16) . 'data' . pack('V', strlen($samples)) . $samples;
return true;
`;

interface TtsReply {
  status: number;
  headers: Headers;
  bytes: Buffer;
  json: Json;
}

/** POST /api/tts like the game does (X-EPD, JSON body); the reply as bytes. */
async function ttsPost(base: string, body: unknown, ip: string, opts: { csrf?: boolean; raw?: string } = {}): Promise<TtsReply> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Forwarded-For': ip };
  if (opts.csrf ?? true) headers['X-EPD'] = '1';
  const res = await fetch(`${base}/api/tts`, { method: 'POST', headers, body: opts.raw ?? JSON.stringify(body) });
  const bytes = Buffer.from(await res.arrayBuffer());
  let json: Json = null;
  if ((res.headers.get('content-type') ?? '').startsWith('application/json')) json = JSON.parse(bytes.toString('utf8'));
  return { status: res.status, headers: res.headers, bytes, json };
}

const clipName = (voice: string, speed: number, text: string) =>
  createHash('sha256').update(`${voice}|${speed.toFixed(2)}|${text}`).digest('hex');

describe.skipIf(!HAS_PHP)('speech synthesis (POST /api/tts)', { timeout: 60_000 }, () => {
  let root = '';
  let fake: PhpServer;
  let ok: PhpServer;
  let slow: PhpServer;
  let html: PhpServer;
  let down: PhpServer;
  let off: PhpServer;
  let big: PhpServer;
  const data = (name: string) => join(root, name);
  const clip = (dir: string, voice: string, speed: number, text: string) => {
    const name = clipName(voice, speed, text);
    return join(dir, 'tts', name.slice(0, 2), `${name}.wav`);
  };
  /** Upstream calls so far, oldest first. */
  const calls = (): { path: string; method: string; type: string; body: string }[] =>
    existsSync(data('fake.log'))
      ? readFileSync(data('fake.log'), 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l))
      : [];
  const callsTo = (prefix: string) => calls().filter((c) => c.path.startsWith(prefix));

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'epd-tts-test-'));
    for (const d of ['ok', 'slow', 'html', 'down', 'off', 'big']) mkdirSync(data(d));
    const fakeDir = data('fake');
    mkdirSync(fakeDir);
    writeFileSync(join(fakeDir, 'router.php'), FAKE_TTS);
    const port = await freePort();
    const fakeProc = spawn('php', ['-q', '-S', `127.0.0.1:${port}`, join(fakeDir, 'router.php')], {
      cwd: fakeDir,
      env: { ...process.env, FAKE_TTS_LOG: data('fake.log') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    fake = { base: `http://127.0.0.1:${port}`, proc: fakeProc, log: [] };
    const closed = await freePort();
    const up = (prefix: string) => `${fake.base}/${prefix}/text-to-speech/v2`;
    const env = (dir: string, upstream: string, extra: Record<string, string> = {}) => ({
      EPD_DATA: data(dir),
      EPD_TRUSTED_PROXY: '127.0.0.1',
      EPD_TTS_UPSTREAM: upstream,
      ...extra,
    });
    [ok, slow, html, down, off, big] = await Promise.all([
      startPhp(env('ok', up('ok'), { EPD_TTS_LIMIT: '5' })),
      // Four workers, so identical requests really run at the same time.
      startPhp(env('slow', up('slow'), { PHP_CLI_SERVER_WORKERS: '4' })),
      startPhp(env('html', up('html'))),
      startPhp(env('down', `http://127.0.0.1:${closed}/text-to-speech/v2`)),
      startPhp(env('off', 'off')),
      startPhp(env('big', up('big'), { EPD_TTS_CACHE_MB: '1', EPD_TTS_PRUNE_EVERY: '1' })),
    ]);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        await fetch(`${fake.base}/ping/`);
        break;
      } catch {
        await sleep(50);
      }
    }
    rmSync(data('fake.log'), { force: true });
  }, 60_000);

  afterAll(async () => {
    await Promise.all([fake, ok, slow, html, down, off, big].map((s) => stopPhp(s)));
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('validates text, voice and speed, and needs X-EPD', async () => {
    const ip = nextIp();
    const bad = async (body: unknown, code: string, field: string) => {
      const r = await ttsPost(ok.base, body, ip);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.json, JSON.stringify(body)).toMatchObject({ error: code, field });
    };
    await bad({ voice: 'mari' }, 'invalid_text', 'text');
    await bad({ text: '', voice: 'mari' }, 'invalid_text', 'text');
    await bad({ text: ' \n\t\u0000 ', voice: 'mari' }, 'invalid_text', 'text');
    await bad({ text: 42, voice: 'mari' }, 'invalid_text', 'text');
    await bad({ text: 'ä'.repeat(401), voice: 'mari' }, 'invalid_text', 'text');
    await bad({ text: 'Tere.' }, 'invalid_voice', 'voice');
    await bad({ text: 'Tere.', voice: 'robot' }, 'invalid_voice', 'voice');
    await bad({ text: 'Tere.', voice: 'mari', speed: 0.5 }, 'invalid_speed', 'speed');
    await bad({ text: 'Tere.', voice: 'mari', speed: 1.4 }, 'invalid_speed', 'speed');
    await bad({ text: 'Tere.', voice: 'mari', speed: '1' }, 'invalid_speed', 'speed');
    expect((await ttsPost(ok.base, { text: 'Tere.', voice: 'mari' }, ip, { csrf: false })).status).toBe(403);
    expect((await ttsPost(ok.base, null, ip, { raw: '{"text": ' })).json.error).toBe('bad_json');
    const get = await new Client(ok.base, ip).get('/api/tts');
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
    expect(calls()).toHaveLength(0);
    // 400 characters is still fine.
    expect((await ttsPost(ok.base, { text: 'ä'.repeat(400), voice: 'mari' }, ip)).status).toBe(200);
  });

  it('synthesises a line once and serves it from data/tts afterwards', async () => {
    const before = callsTo('/ok/').length;
    const ip = nextIp();
    const line = { text: 'Põhja kakskümmend üks, kohal.', voice: 'mari', speed: 1.08 };
    const first = await ttsPost(ok.base, line, ip);
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('audio/wav');
    expect(first.headers.get('cache-control')).toBe('private, max-age=604800');
    expect(first.headers.get('x-epd-tts')).toBe('miss');
    expect(first.bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(first.bytes.subarray(8, 12).toString('latin1')).toBe('WAVE');
    const sent = callsTo('/ok/').slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ method: 'POST', type: 'application/json', path: '/ok/text-to-speech/v2' });
    expect(JSON.parse(sent[0].body)).toEqual({ text: line.text, speaker: 'mari', speed: 1.08 });
    // Cached under the persistent data folder, keyed by voice, speed and text.
    const file = clip(data('ok'), 'mari', 1.08, line.text);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file).equals(first.bytes)).toBe(true);
    expect(readdirSync(join(data('ok'), 'tts', clipName('mari', 1.08, line.text).slice(0, 2)))).toEqual([
      `${clipName('mari', 1.08, line.text)}.wav`,
    ]);
    // The same line again (also with extra whitespace and a control character): no upstream call.
    for (const text of [line.text, `  Põhja kakskümmend üks,\n kohal.\u0007 `]) {
      const again = await ttsPost(ok.base, { ...line, text }, nextIp());
      expect(again.status).toBe(200);
      expect(again.headers.get('x-epd-tts')).toBe('hit');
      expect(again.bytes.equals(first.bytes)).toBe(true);
    }
    expect(callsTo('/ok/').length - before).toBe(1);
  });

  it('keeps another voice or speed of the same text as its own clip', async () => {
    const ip = nextIp();
    const text = 'Lõuna kaksteist, vaba.';
    const before = callsTo('/ok/').length;
    for (const [voice, speed] of [
      ['tambet', 1],
      ['vesta', 1],
      ['tambet', 1.1],
    ] as const) {
      const r = await ttsPost(ok.base, { text, voice, speed }, ip);
      expect(r.headers.get('x-epd-tts'), `${voice} ${speed}`).toBe('miss');
      expect(existsSync(clip(data('ok'), voice, speed, text))).toBe(true);
    }
    expect(callsTo('/ok/').slice(before).map((c) => JSON.parse(c.body).speaker)).toEqual(['tambet', 'vesta', 'tambet']);
    // No speed means 1: the same clip as speed 1.
    expect((await ttsPost(ok.base, { text, voice: 'tambet' }, ip)).headers.get('x-epd-tts')).toBe('hit');
    // "kylli" is accepted for külli and sent upstream as "külli".
    const k = await ttsPost(ok.base, { text, voice: 'kylli' }, ip);
    expect(k.status).toBe(200);
    expect(JSON.parse(callsTo('/ok/').at(-1)!.body).speaker).toBe('külli');
    expect((await ttsPost(ok.base, { text, voice: 'Külli' }, ip)).headers.get('x-epd-tts')).toBe('hit');
  });

  it('limits uncached synthesis per IP (429), cached clips stay free', async () => {
    const ip = nextIp();
    const cached = { text: 'Ida kolmteist, sündmuskohal.', voice: 'kalev' };
    expect((await ttsPost(ok.base, cached, nextIp())).status).toBe(200);
    for (let i = 1; i <= 5; i++) {
      expect((await ttsPost(ok.base, { text: `Rida number ${i}.`, voice: 'meelis' }, ip)).status, `line ${i}`).toBe(200);
    }
    const before = calls().length;
    const limited = await ttsPost(ok.base, { text: 'Rida number 6.', voice: 'meelis' }, ip);
    expect(limited.status).toBe(429);
    expect(limited.json).toEqual({ error: 'rate_limited', message: expect.any(String) });
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(calls().length).toBe(before);
    const hit = await ttsPost(ok.base, cached, ip);
    expect(hit.status).toBe(200);
    expect(hit.headers.get('x-epd-tts')).toBe('hit');
    // Another player is not affected.
    expect((await ttsPost(ok.base, { text: 'Rida number 6.', voice: 'meelis' }, nextIp())).status).toBe(200);
  });

  it('asks the upstream once when the same line comes in several times at once', async () => {
    const line = { text: 'Põhja K1, prioriteet üks.', voice: 'indrek' };
    const replies = await Promise.all([1, 2, 3, 4].map(() => ttsPost(slow.base, line, nextIp())));
    expect(replies.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(replies.map((r) => r.headers.get('x-epd-tts')).sort()).toEqual(['hit', 'hit', 'hit', 'miss']);
    for (const r of replies) expect(r.bytes.equals(replies[0].bytes)).toBe(true);
    expect(callsTo('/slow/')).toHaveLength(1);
    // No lock file per clip is left behind.
    const shard = join(data('slow'), 'tts', clipName('indrek', 1, line.text).slice(0, 2));
    expect(readdirSync(shard).filter((f) => !f.endsWith('.wav'))).toEqual([]);
  });

  it('answers 503 at once when the upstream is unreachable, and remembers it for a minute', async () => {
    const started = Date.now();
    const r = await ttsPost(down.base, { text: 'Tere.', voice: 'mari' }, nextIp());
    expect(r.status).toBe(503);
    expect(r.json).toEqual({ error: 'tts_unavailable', message: expect.any(String) });
    expect(r.headers.get('retry-after')).toBe('60');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(existsSync(join(data('down'), 'tts', '.down'))).toBe(true);
    expect((await ttsPost(down.base, { text: 'Teine rida.', voice: 'mari' }, nextIp())).status).toBe(503);
    expect(readdirSync(join(data('down'), 'tts')).filter((f) => /^[0-9a-f]{2}$/.test(f)).flatMap((d) => readdirSync(join(data('down'), 'tts', d)))).toEqual([]);
  });

  it('answers 503 when the upstream sends something other than audio, without asking again for a minute', async () => {
    const r = await ttsPost(html.base, { text: 'Tere.', voice: 'mari' }, nextIp());
    expect(r.status).toBe(503);
    expect(r.json.error).toBe('tts_unavailable');
    expect(callsTo('/html/')).toHaveLength(1);
    const again = await ttsPost(html.base, { text: 'Hoopis teine rida.', voice: 'vesta' }, nextIp());
    expect(again.status).toBe(503);
    expect(callsTo('/html/')).toHaveLength(1);
  });

  it('can be switched off (EPD_TTS_UPSTREAM=off)', async () => {
    const r = await ttsPost(off.base, { text: 'Tere.', voice: 'mari' }, nextIp());
    expect(r.status).toBe(503);
    expect(r.json.error).toBe('tts_unavailable');
    // Validation still comes first.
    expect((await ttsPost(off.base, { text: 'Tere.', voice: 'x' }, nextIp())).status).toBe(400);
  });

  it('prunes the oldest clips when the cache grows over its limit', async () => {
    const ip = nextIp();
    const texts = ['Esimene.', 'Teine.', 'Kolmas.', 'Neljas.'];
    for (const text of texts) expect((await ttsPost(big.base, { text, voice: 'peeter' }, ip)).status).toBe(200);
    const files = texts.map((text) => clip(data('big'), 'peeter', 1, text));
    // 4 x 300 kB is over the 1 MB limit; make the age order explicit (oldest first).
    const now = Date.now() / 1000;
    files.forEach((f, i) => utimesSync(f, now - 400 + i * 100, now - 400 + i * 100));
    expect((await ttsPost(big.base, { text: 'Viies.', voice: 'peeter' }, ip)).status).toBe(200);
    expect(files.map((f) => existsSync(f))).toEqual([false, false, true, true]);
    expect(existsSync(clip(data('big'), 'peeter', 1, 'Viies.'))).toBe(true);
  });
});

// ------------------------------------------------------------------ data from released versions

/**
 * Databases made by the API of versions that ran on the server (tests/fixtures/db/generate.mjs). After
 * an update the current API must keep every account, password, save, score and session in them.
 */
const FIXTURE_DIR = join(ROOT, 'tests', 'fixtures', 'db');
const DB_FIXTURES = existsSync(FIXTURE_DIR)
  ? readdirSync(FIXTURE_DIR)
      .filter((f) => /^[0-9a-f]{7}\.json$/.test(f))
      .map((f) => f.slice(0, 7))
      .sort()
  : [];
const DB_PHP = join(SERVER_DIR, 'lib', 'db.php');

interface FixtureUser {
  id: number;
  name: string;
  password: string;
  me: { user: { id: number; name: string; created: number } };
  save: { updated: Record<string, number>; slots: Record<string, string | null> };
  session: { id: string; file: string };
}

interface DbFixture {
  commit: string;
  schemaVersion: number;
  migrationSha256: Record<string, string>;
  cookie: { name: string; attributes: string[] };
  users: FixtureUser[];
  scores: Record<string, Json[]>;
}

interface DbDump {
  objects: string[];
  columns: Record<string, Json[]>;
  rows: Record<string, Json[]>;
}

/** `php -r` with arguments; returns what it printed. */
function phpRun(code: string, ...args: string[]): string {
  const r = spawnSync('php', ['-r', code, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout;
}

/** Everything in a database: its objects, and the columns and every row of every table, in a stable order. */
function dumpDb(file: string): DbDump {
  const code = `
    $d = new PDO('sqlite:' . $argv[1], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $out = ['objects' => [], 'columns' => [], 'rows' => []];
    foreach ($d->query("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name") as $o) {
      $out['objects'][] = $o['type'] . ' ' . $o['name'];
    }
    $tables = $d->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    foreach ($tables->fetchAll(PDO::FETCH_COLUMN) as $t) {
      $out['columns'][$t] = $d->query('PRAGMA table_info(' . $d->quote($t) . ')')->fetchAll(PDO::FETCH_ASSOC);
      $out['rows'][$t] = $d->query('SELECT * FROM "' . $t . '" ORDER BY rowid')->fetchAll(PDO::FETCH_ASSOC);
    }
    echo json_encode($out, JSON_THROW_ON_ERROR);`;
  return JSON.parse(phpRun(code, file));
}

/** SHA-256 of every migration step of the current code, by version. */
function migrationHashes(): Record<string, string> {
  const code = `require $argv[1]; $o = []; foreach (epd_migrations() as $v => $s) { $o[$v] = hash('sha256', json_encode($s)); } echo json_encode($o);`;
  return JSON.parse(phpRun(code, DB_PHP));
}

/** Migrate a database with the current steps plus one extra step (JSON list of statements). */
const MIGRATE_WITH_EXTRA = `
  require $argv[1];
  $db = new PDO('sqlite:' . $argv[2], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
  $db->exec('PRAGMA journal_mode = WAL');
  $db->exec('PRAGMA foreign_keys = ON');
  $steps = epd_migrations();
  $steps[max(array_keys($steps)) + 1] = json_decode($argv[3], true);
  try { epd_migrate($db, $steps); echo 'migrated'; } catch (Throwable $e) { echo 'failed: ' . $e->getMessage(); }`;

/** JSON with sorted keys (same as tests/fixtures/db/generate.mjs), so key order never counts. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]]),
        )
      : v,
  );
}
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Cookie attributes that must stay the same between versions (the expiry moves with time). */
const cookieAttributes = (line: string) =>
  line
    .split(';')
    .slice(1)
    .map((a) => a.trim().toLowerCase())
    .filter((a) => !a.startsWith('expires=') && !a.startsWith('max-age='))
    .sort();

/** The columns an older table had, so rows compare equal after later columns were added. */
function oldColumns(dump: DbDump, table: string, rows: Json[]): Json[] {
  const known: string[] = dump.columns[table].map((c: Json) => c.name);
  return rows.map((r: Json) => Object.fromEntries(known.map((k) => [k, r[k]])));
}

describe('released databases', () => {
  it('include the version that runs on the server now (92ed7f5)', () => {
    expect(DB_FIXTURES).toContain('92ed7f5');
  });
});

describe.skipIf(!HAS_PHP)('database of a released version after the update', { timeout: 60_000 }, () => {
  for (const sha of DB_FIXTURES) {
    describe(sha, () => {
      const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, `${sha}.json`), 'utf8')) as DbFixture;
      let dir = '';
      let server: PhpServer;
      let before: DbDump;
      const dbFile = () => join(dir, 'epd.sqlite');
      const as = (u: FixtureUser) => {
        const c = new Client(server.base, nextIp());
        c.cookies.set(fixture.cookie.name, u.session.id);
        return c;
      };

      beforeAll(async () => {
        dir = mkdtempSync(join(tmpdir(), `epd-upgrade-${sha}-`));
        copyFileSync(join(FIXTURE_DIR, `${sha}.sqlite`), dbFile());
        // That version's session files, as if the players were active a minute ago (30 day idle limit).
        mkdirSync(join(dir, 'sessions'), { mode: 0o700 });
        const seen = Math.floor(Date.now() / 1000) - 60;
        for (const u of fixture.users) {
          const file = u.session.file.replace(/seen\|i:\d+;/, `seen|i:${seen};`);
          writeFileSync(join(dir, 'sessions', `sess_${u.session.id}`), file);
        }
        before = dumpDb(dbFile());
        // Production password hashing: logins verify the stored hashes exactly as on the server.
        server = await startPhp({ EPD_DATA: dir, EPD_TRUSTED_PROXY: '127.0.0.1', EPD_FAST_HASH: '' });
      }, 60_000);

      afterAll(async () => {
        await stopPhp(server);
        if (dir) rmSync(dir, { recursive: true, force: true });
      });

      it('reaches the latest schema and keeps every table, column and row', () => {
        const after = dumpDb(dbFile());
        const latest = Math.max(...Object.keys(migrationHashes()).map(Number));
        expect(latest).toBeGreaterThanOrEqual(fixture.schemaVersion);
        expect(Math.max(...after.rows.schema_version.map((r: Json) => r.version))).toBe(latest);
        for (const object of before.objects) expect(after.objects).toContain(object);
        for (const [table, columns] of Object.entries(before.columns)) {
          for (const column of columns)
            expect(after.columns[table], `${table}.${column.name}`).toContainEqual(column);
        }
        for (const [table, rows] of Object.entries(before.rows)) {
          const now = oldColumns(before, table, after.rows[table]);
          if (table === 'schema_version') expect(now.slice(0, rows.length)).toEqual(rows);
          else expect(now, table).toEqual(rows);
        }
        expect(before.rows.users).toHaveLength(fixture.users.length);
      });

      it('keeps every player logged in with the session that version gave them', async () => {
        for (const u of fixture.users) {
          const c = as(u);
          expect((await c.get('/api/me')).json, u.name).toEqual(u.me);
          expect(c.cookies.get(fixture.cookie.name), u.name).toBe(u.session.id);
        }
      });

      it('lets every player log in with their password and sets the same session cookie', async () => {
        for (const u of fixture.users) {
          const c = new Client(server.base, nextIp());
          const r = await c.post('/api/login', { name: u.name, password: u.password });
          expect(r.status, u.name).toBe(200);
          expect(r.json.user).toEqual(u.me.user);
          const line = r.setCookies.find((l) => l.startsWith(`${fixture.cookie.name}=`));
          expect(line, u.name).toBeDefined();
          expect(cookieAttributes(line as string)).toEqual(fixture.cookie.attributes);
          // New sessions go to the same place, data/sessions, which survives container recreation.
          const id = c.cookies.get(fixture.cookie.name);
          expect(existsSync(join(dir, 'sessions', `sess_${id}`)), u.name).toBe(true);
        }
        const wrong = await new Client(server.base, nextIp()).post('/api/login', {
          name: fixture.users[0].name,
          password: `${fixture.users[0].password}x`,
        });
        expect(wrong.status).toBe(401);
      });

      it('returns every save exactly as that version did', async () => {
        for (const u of fixture.users) {
          const r = await as(u).get('/api/save');
          expect(r.status, u.name).toBe(200);
          expect(r.json.updated, u.name).toEqual(u.save.updated);
          for (const [slot, hash] of Object.entries(u.save.slots)) {
            const got = r.json[slot] === null ? null : sha256(canonical(r.json[slot]));
            expect(got, `${u.name} ${slot}`).toBe(hash);
          }
        }
      });

      it('keeps the leaderboard', async () => {
        for (const [region, rows] of Object.entries(fixture.scores)) {
          const query = `/api/scores?limit=50&region=${region === 'all' ? '' : region}`;
          expect((await new Client(server.base, nextIp()).get(query)).json.scores, region).toEqual(rows);
        }
      });

      it('has not changed a migration step that version ran', () => {
        const now = migrationHashes();
        for (const [version, hash] of Object.entries(fixture.migrationSha256)) {
          expect(now[version], `step ${version}: never edit a released step, append a new one`).toBe(hash);
        }
      });

      it('leaves the database exactly as it was when a migration step fails', () => {
        const copy = join(dir, 'failed.sqlite');
        copyFileSync(join(FIXTURE_DIR, `${sha}.sqlite`), copy);
        const start = dumpDb(copy);
        const step = [
          'CREATE TABLE half_done (a INTEGER)',
          'ALTER TABLE users ADD COLUMN nickname TEXT',
          'INSERT INTO half_done VALUES (1)',
          'INSERT INTO no_such_table VALUES (1)',
        ];
        expect(phpRun(MIGRATE_WITH_EXTRA, DB_PHP, copy, JSON.stringify(step))).toMatch(
          /^failed: .*no_such_table/,
        );
        expect(dumpDb(copy)).toEqual(start);
      });

      it('keeps every row through an additive step', () => {
        const copy = join(dir, 'added.sqlite');
        copyFileSync(join(FIXTURE_DIR, `${sha}.sqlite`), copy);
        const start = dumpDb(copy);
        const step = [
          'CREATE TABLE extra (a INTEGER)',
          "ALTER TABLE users ADD COLUMN nickname TEXT DEFAULT ''",
        ];
        expect(phpRun(MIGRATE_WITH_EXTRA, DB_PHP, copy, JSON.stringify(step))).toBe('migrated');
        const end = dumpDb(copy);
        for (const [table, rows] of Object.entries(start.rows)) {
          const now = oldColumns(start, table, end.rows[table]);
          expect(table === 'schema_version' ? now.slice(0, rows.length) : now, table).toEqual(rows);
        }
      });
    });
  }
});

describe.skipIf(!HAS_PHP)('schema migrations', () => {
  it('only add tables, indexes, columns and rows, one statement each', () => {
    const steps = JSON.parse(
      phpRun('require $argv[1]; echo json_encode(epd_migrations());', DB_PHP),
    ) as Record<string, string[]>;
    const additive = /^(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE \S+ ADD( COLUMN)?|INSERT INTO)\s/i;
    for (const [version, statements] of Object.entries(steps)) {
      expect(statements.length, `step ${version}`).toBeGreaterThan(0);
      for (const sql of statements) {
        const s = sql.replace(/\s+/g, ' ').trim();
        expect(s, `step ${version}`).toMatch(additive);
        expect(s, `step ${version}: one statement per entry`).not.toMatch(/;\s*\S/);
        // The previous version (automatic rollback) must still be able to insert rows.
        if (/^ALTER TABLE/i.test(s) && /\bNOT NULL\b/i.test(s))
          expect(s, `step ${version}`).toMatch(/\bDEFAULT\b/i);
      }
    }
  });
});

describe('deploy keeps player data in place', () => {
  const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
  /** Shell lines that are not comments. */
  const code = (path: string) =>
    read(path)
      .split('\n')
      .filter((l) => !/^\s*#/.test(l));
  const WRITES = /(^|[\s;&|(])(rm|mv|rsync|cp|install|truncate|ln|chmod|chown)\s/;

  it('mounts data/ read-write into the container and points the API at it', () => {
    const compose = read('deploy/mainserver/compose.yml');
    expect(compose).toMatch(/^\s*- \.\/data:\/data\s*$/m);
    expect(compose).toMatch(/^\s*EPD_DATA: \/data\s*$/m);
    expect(compose).toMatch(/^\s*- \.\/tiles:\/srv\/tiles:ro\s*$/m);
    // Speech clips are cached in EPD_DATA/tts, inside the same mount; the upstream is the relay.
    expect(compose).toMatch(/^\s*EPD_TTS_UPSTREAM: http:\/\/10\.99\.0\.1\/text-to-speech\/v2\s*$/m);
    expect(read('server/lib/tts.php')).toContain("epd_data_dir() . '/tts'");
  });

  it('pastes exactly deploy/relee/lisa-tts.sh from docs/DEPLOY.md', () => {
    const doc = read('docs/DEPLOY.md');
    const start = "cat > ~/lisa-tts.sh <<'TTS_LISAMINE_LOPP'\n";
    const from = doc.indexOf(start);
    expect(from).toBeGreaterThan(0);
    const body = doc.slice(from + start.length, doc.indexOf('TTS_LISAMINE_LOPP\nsudo bash ~/lisa-tts.sh', from));
    expect(body).toBe(read('deploy/relee/lisa-tts.sh'));
  });

  it('keeps sessions in data/sessions under the same cookie name', () => {
    const auth = read('server/lib/auth.php');
    expect(auth).toContain("const EPD_SESSION_NAME = 'EPDSESS';");
    expect(auth).toContain("epd_data_dir() . '/sessions'");
  });

  it('snapshots the database before every switch and never writes to the data otherwise', () => {
    const script = read('deploy/mainserver/politsei-uuenda.sh');
    const main = script.slice(
      script.indexOf('# ---------------------------------------------------------------- põhivoog'),
    );
    const backup = main.indexOf('varunda_andmebaas "${paigas');
    expect(backup).toBeGreaterThan(0);
    expect(backup).toBeLessThan(main.indexOf('vaheta "$tipp"'));
    for (const line of code('deploy/mainserver/politsei-uuenda.sh')) {
      if (WRITES.test(line)) expect(line).not.toMatch(/epd\.sqlite|ANDMEBAAS|sessions|deploy-secret|tiles/);
    }
  });

  it('builds the map data after a successful switch, read-only on the map, never failing the update', () => {
    const script = read('deploy/mainserver/politsei-uuenda.sh');
    const main = script.slice(
      script.indexOf('# ---------------------------------------------------------------- põhivoog'),
    );
    const health = main.indexOf('tervis "$tipp" || ebaonnestus');
    const build = main.indexOf('kaardiandmed "$EHITUS/src/scripts"');
    expect(health).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(health);
    // Called as a condition: set -e cannot end the script there, and nothing is rolled back.
    expect(main.slice(build - 'if ! '.length, build)).toBe('if ! ');
    const fn = script.slice(script.indexOf('kaardiandmed() {'), script.indexOf('ebaonnestus() {'));
    expect(fn).toContain('--network none');
    expect(fn).toContain('-v "$kaart:/kaart/estonia.pmtiles:ro"');
    expect(fn).toContain('-v politsei-node-modules:/app/node_modules:ro');
    expect(fn).not.toMatch(/ebaonnestus|taasta|margi_vigaseks/);
    // The installer runs the same step right after the map extract (its lock is already held).
    const installer = read('deploy/mainserver/paigalda.sh');
    expect(installer.indexOf('POLITSEI_LUKK_KAES=1 bash "$STAGE/politsei-uuenda.sh" --kaardiandmed')).toBeGreaterThan(
      installer.indexOf('kaart || hoiata'),
    );
  });

  it('re-running the installer snapshots the database and leaves it and the sessions alone', () => {
    const script = read('deploy/mainserver/paigalda.sh');
    expect(script).toMatch(/politsei-uuenda\.sh" --varunda/);
    for (const line of code('deploy/mainserver/paigalda.sh')) {
      if (WRITES.test(line)) expect(line).not.toMatch(/epd\.sqlite|sessions/);
    }
  });
});

describe.skipIf(!HAS_PHP)('game server rooms (mp.php, docs/MULTIPLAYER.md section 9)', { timeout: 60_000 }, () => {
  let root = '';
  let up: PhpServer;
  let down: PhpServer;
  let health: ReturnType<typeof createHttpServer>;
  let healthHits = 0;
  /** Kick notices the stand-in game server received (POST /mp/kick bodies). */
  const kicks: unknown[] = [];
  const OPTS = { mode: 'role', regionId: 'pohja', sector: '', difficulty: 'normal', hours: 2, slot: 'evening' };

  const register = (c: Client, name: string) => c.post('/api/register', { name, password: 'salajane-123' });
  /** Two players in a started room of `mode` on `server`; returns the clients and the room. */
  async function started(server: PhpServer, mode: string, names: [string, string]) {
    const a = new Client(server.base, nextIp());
    const b = new Client(server.base, nextIp());
    expect((await register(a, names[0])).status).toBe(200);
    expect((await register(b, names[1])).status).toBe(200);
    const code = (await a.post('/api/rooms', { ...OPTS, mode })).json.room.code as string;
    expect((await b.post('/api/rooms/join', { code })).status).toBe(200);
    if (mode === 'role') expect((await b.post(`/api/rooms/${code}/role`, { role: 'calls' })).status).toBe(200);
    await b.post(`/api/rooms/${code}/ready`, { ready: true });
    const start = await a.post(`/api/rooms/${code}/start`);
    expect(start.status, JSON.stringify(start.json)).toBe(200);
    return { a, b, code, room: start.json.room };
  }

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'epd-mp-test-'));
    mkdirSync(join(root, 'up'));
    mkdirSync(join(root, 'down'));
    const port = await freePort();
    // A stand-in for the game server's health check: it sees the secret once PHP has written it.
    health = createHttpServer((req, res) => {
      if (req.method === 'POST' && req.url === '/mp/kick') {
        let body = '';
        req.on('data', (c: Buffer) => (body += c.toString()));
        req.on('end', () => {
          kicks.push(JSON.parse(body).kick);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true,"found":true}');
        });
        return;
      }
      healthHits++;
      const secret = existsSync(join(root, 'up', 'mp', 'secret'));
      res.writeHead(req.url === '/mp/health' ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: req.url === '/mp/health', rooms: 0, secret }));
    });
    await new Promise<void>((done) => health.listen(port, '127.0.0.1', () => done()));
    const closed = await freePort();
    [up, down] = await Promise.all([
      startPhp({ EPD_DATA: join(root, 'up'), EPD_TRUSTED_PROXY: '127.0.0.1', EPD_FAST_HASH: '1', EPD_MP: '1', EPD_MP_URL: `http://127.0.0.1:${port}` }),
      startPhp({ EPD_DATA: join(root, 'down'), EPD_TRUSTED_PROXY: '127.0.0.1', EPD_FAST_HASH: '1', EPD_MP: '1', EPD_MP_URL: `http://127.0.0.1:${closed}` }),
    ]);
  }, 60_000);

  afterAll(async () => {
    await Promise.all([stopPhp(up), stopPhp(down)]);
    await new Promise((done) => health?.close(done));
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('starts a co-op room on the game server and hands its members signed tickets', async () => {
    const { a, b, code, room } = await started(up, 'role', ['Mari', 'Tõnu']);
    expect(room.engine).toBe('server');
    expect(healthHits).toBeGreaterThan(0);
    const secret = readFileSync(join(root, 'up', 'mp', 'secret'), 'utf8').trim();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(statSync(join(root, 'up', 'mp', 'secret')).mode & 0o077).toBe(0);
    const ta = await a.post(`/api/rooms/${code}/ticket`);
    const tb = await b.post(`/api/rooms/${code}/ticket`);
    expect(ta.status, JSON.stringify(ta.json)).toBe(200);
    expect(ta.json.url).toBe('/mp/ws');
    const ticketA = verifyTicket(ta.json.ticket, secret);
    const ticketB = verifyTicket(tb.json.ticket, secret);
    expect(ticketA).toMatchObject({ code, seat: 0, name: 'Mari' });
    expect(ticketB).toMatchObject({ code, seat: 1, name: 'Tõnu' });
    // Both describe the same shift: the game server builds it from whichever comes first.
    expect(ticketA!.room).toEqual(ticketB!.room);
    expect(ticketA!.room).toMatchObject({
      code,
      mode: 'role',
      seed: room.seed,
      day: room.day,
      started: room.started,
      options: { regionId: 'pohja', sector: '', difficulty: 'normal', hours: 2, slot: 'evening', crisis: 'random' },
      setup: [0, [[0, 'dispatch', 'Mari'], [1, 'calls', 'Tõnu']]],
    });
    expect(ticketA!.exp - Date.now()).toBeGreaterThan(50_000);
    expect(ticketA!.exp - Date.now()).toBeLessThanOrEqual(60_000);
    // A changed byte or another secret breaks it.
    const t = ta.json.ticket as string;
    expect(verifyTicket(`${t.slice(0, 5)}${t[5] === 'A' ? 'B' : 'A'}${t.slice(6)}`, secret)).toBeNull();
    expect(verifyTicket(ta.json.ticket, 'f'.repeat(64))).toBeNull();
    // Strangers, and a player who left, get none.
    const stranger = new Client(up.base, nextIp());
    await register(stranger, 'Võõras');
    expect((await stranger.post(`/api/rooms/${code}/ticket`)).status).toBe(404);
    expect((await new Client(up.base, nextIp()).post(`/api/rooms/${code}/ticket`)).status).toBe(401);
    expect((await b.post(`/api/rooms/${code}/leave`)).status).toBe(200);
    expect((await b.post(`/api/rooms/${code}/ticket`)).json.error).toBe('left_room');
  });

  it('keeps race rooms and rooms started while the game server is down on the old path', async () => {
    const race = await started(up, 'race', ['Kadri', 'Peeter']);
    expect(race.room.engine).toBe('');
    expect((await race.a.post(`/api/rooms/${race.code}/ticket`)).json.error).toBe('not_server_room');
    const lockstep = await started(down, 'role', ['Liis', 'Andres']);
    expect(lockstep.room.engine).toBe('');
    expect((await lockstep.a.post(`/api/rooms/${lockstep.code}/ticket`)).json.error).toBe('not_server_room');
    // The lockstep room still has its log.
    const log = await lockstep.a.get(`/api/rooms/${lockstep.code}/log?after=0`);
    expect(log.json.cmds[0]).toMatchObject({ k: 'setup', a: [0, [[0, 'dispatch', 'Liis'], [1, 'calls', 'Andres']]] });
  });

  /** The result the game server signs at the end of a room's shift (server/mp/room.ts signedResult). */
  const signedResult = (secret: string, room: Json, code: string, extra: Record<string, unknown> = {}) =>
    signTicket(
      { v: 1, kind: 'result', code, seed: room.seed, started: room.started, score: 64, grade: 'C', incidents: 9, arrests: 2, xp: [[0, 310], [1, 280]], ...extra },
      secret,
    );

  it('counts a server room’s result only as the game server signed it (2.34.0)', async () => {
    const { a, b, code, room } = await started(up, 'role', ['Hele', 'Kalev']);
    const secret = readFileSync(join(root, 'up', 'mp', 'secret'), 'utf8').trim();
    const CLAIM = { score: 100, grade: 'S', incidents: 40, arrests: 9, xp: 5000, seed: room.seed };
    // Without the signature, with a forged one, or with one of another shift: refused.
    expect((await a.post(`/api/rooms/${code}/result`, CLAIM)).json.error).toBe('unsigned');
    expect((await a.post(`/api/rooms/${code}/result`, { ...CLAIM, signed: signedResult('f'.repeat(64), room, code) })).json.error).toBe('unsigned');
    for (const extra of [{ seed: room.seed + 1 }, { started: room.started + 1 }, { code: 'ZZZZZZ' }, { kind: 'kick' }, { xp: [[3, 10]] }])
      expect((await a.post(`/api/rooms/${code}/result`, { ...CLAIM, signed: signedResult(secret, room, code, extra) })).json.error, JSON.stringify(extra)).toBe('unsigned');
    // The signed numbers count, whatever the body says; each seat gets its own XP.
    const ok = await a.post(`/api/rooms/${code}/result`, { ...CLAIM, signed: signedResult(secret, room, code) });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    expect(ok.json.room.results).toEqual([expect.objectContaining({ name: 'Hele', score: 64, grade: 'C', incidents: 9, arrests: 2, xp: 310 })]);
    expect((await b.post(`/api/rooms/${code}/result`, { ...CLAIM, signed: signedResult(secret, room, code) })).json.room.results.find((r: Json) => r.name === 'Kalev')).toMatchObject({ score: 64, xp: 280 });
  });

  it('keeps the joint report the game server signed, not one a client sends (2.36.0)', async () => {
    const { a, b, code, room } = await started(up, 'role', ['Laine', 'Jaak']);
    const secret = readFileSync(join(root, 'up', 'mp', 'secret'), 'utf8').trim();
    const sum = {
      v: 1,
      regionId: 'pohja',
      difficulty: 'normal',
      start: room.started,
      end: room.started + 7_200_000,
      score: 64,
      grade: 'C',
      incidents: 9,
      arrests: 2,
      xp: 290,
      coop: {
        code,
        host: 0,
        mode: 'role',
        seats: [
          { seat: 0, name: 'Laine', role: 'dispatch', present: true, stats: { sent: 4 }, worked: 5, p1: 1 },
          { seat: 1, name: 'Jaak', role: 'calls', present: true, stats: { calls: 6 }, worked: 6, p1: 0 },
        ],
        moments: [],
      },
    };
    const forged = { ...sum, score: 100, grade: 'S' };
    const BODY = { score: 100, grade: 'S', incidents: 40, arrests: 9, xp: 5000, seed: room.seed };
    expect((await a.post(`/api/rooms/${code}/result`, { ...BODY, summary: forged, signed: signedResult(secret, room, code, { sum }) })).status).toBe(200);
    expect((await b.post(`/api/rooms/${code}/result`, { ...BODY, signed: signedResult(secret, room, code, { sum }) })).status).toBe(200);
    const h = (await b.get('/api/rooms/history')).json.rounds;
    expect(h[0]).toMatchObject({ code, round: 1, mode: 'role', summary: sum });
  });

  it('removes a player from a running server room and tells the game server (2.34.0)', async () => {
    const { a, b, code, room } = await started(up, 'role', ['Signe', 'Tarmo']);
    const secret = readFileSync(join(root, 'up', 'mp', 'secret'), 'utf8').trim();
    kicks.length = 0;
    const out = await a.post(`/api/rooms/${code}/kick`, { seat: 1 });
    expect(out.status, JSON.stringify(out.json)).toBe(200);
    // The game server got a signed notice for exactly that seat (it closes the connection and lets the seat leave).
    expect(kicks).toHaveLength(1);
    expect(verifyKick(kicks[0], secret)).toMatchObject({ code, seat: 1 });
    expect(verifyKick(kicks[0], 'f'.repeat(64))).toBeNull();
    // A kick is no ticket, and a ticket no kick.
    expect(verifyTicket(kicks[0], secret)).toBeNull();
    expect(verifyKick((await a.post(`/api/rooms/${code}/ticket`)).json.ticket, secret)).toBeNull();
    // No ticket for the removed player: they cannot connect again.
    const t = await b.post(`/api/rooms/${code}/ticket`);
    expect(t.status).toBe(403);
    expect(t.json.error).toBe('kicked');
    expect(room.engine).toBe('server');
  });

  it('plays the next round of a room on the game server as a new shift', async () => {
    const { a, b, code, room } = await started(up, 'role', ['Merike', 'Jüri']);
    const secret = readFileSync(join(root, 'up', 'mp', 'secret'), 'utf8').trim();
    const RESULT = { score: 70, grade: 'B', incidents: 6, arrests: 1, xp: 200, signed: signedResult(secret, room, code) };
    for (const c of [a, b]) expect((await c.post(`/api/rooms/${code}/result`, { ...RESULT, seed: room.seed })).status).toBe(200);
    // The guest comes back first; the next round is decided at its own start (the game server is asked again).
    const back = await b.post(`/api/rooms/${code}/reopen`, { round: 1 });
    expect(back.json.room).toMatchObject({ state: 'lobby', round: 2, engine: '' });
    expect((await b.post(`/api/rooms/${code}/ticket`)).json.error).toBe('not_server_room');
    await sleep(5);
    await b.post(`/api/rooms/${code}/ready`, { ready: true });
    const next = (await a.post(`/api/rooms/${code}/start`)).json.room;
    expect(next).toMatchObject({ state: 'running', round: 2, engine: 'server' });
    // A new ticket describes the new shift: another seed and start, so the game server builds it afresh.
    const ticket = verifyTicket((await b.post(`/api/rooms/${code}/ticket`)).json.ticket, secret);
    expect(ticket!.room).toMatchObject({ code, seed: next.seed, started: next.started, setup: [0, [[0, 'dispatch', 'Merike'], [1, 'calls', 'Jüri']]] });
    expect(next.seed).not.toBe(room.seed);
    expect(next.started).toBeGreaterThan(room.started);
  });
});
