/**
 * Integration tests for the PHP API in server/ (contract: docs/SERVER.md). They start PHP's
 * built-in server with a temporary EPD_DATA and talk to it over HTTP like the frontend does.
 * The whole suite is skipped when `php` (8.1+ with pdo_sqlite and mbstring) is not installed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
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
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
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
    [main, untrusted, broken] = await Promise.all([
      // The test runner plays the relay: X-Forwarded-For from 127.0.0.1 is trusted.
      startPhp({ EPD_DATA: dataDir, EPD_TRUSTED_PROXY: '127.0.0.1', EPD_FAST_HASH: '1' }),
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
      const r = await bob.del('/api/me', { password: 'salajane-123' });
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ ok: true });
      expect(bob.session).toBeUndefined();
      expect((await bob.get('/api/me')).json.user).toBeNull();
      expect((await login(client(), 'Bob')).status).toBe(401);
      for (const table of ['users WHERE id', 'saves WHERE user_id', 'scores WHERE user_id']) {
        expect(JSON.parse(sql(`SELECT COUNT(*) FROM ${table} = ${bobId}`)), table).toEqual([[0]]);
      }
      const board = await client().get('/api/scores?region=pohja');
      expect(board.json.scores.map((s: Json) => s.name)).toEqual(['Alice']);
      // The name is free again, and the new account starts empty.
      const again = client();
      expect((await register(again, 'bob')).status).toBe(200);
      expect((await again.get('/api/save')).json.career).toBeNull();
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
    const additive = /^(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE \S+ ADD (COLUMN )?|INSERT INTO)\s/i;
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

  it('re-running the installer snapshots the database and leaves it and the sessions alone', () => {
    const script = read('deploy/mainserver/paigalda.sh');
    expect(script).toMatch(/politsei-uuenda\.sh" --varunda/);
    for (const line of code('deploy/mainserver/paigalda.sh')) {
      if (WRITES.test(line)) expect(line).not.toMatch(/epd\.sqlite|sessions/);
    }
  });
});
