#!/usr/bin/env node
/**
 * Makes a database fixture with the server code of a DEPLOYED version, so tests/server.test.ts can
 * check that the current API keeps every account, save, score and session that version stored.
 *
 *   git worktree add /tmp/claude-0/wt-deployed 92ed7f5ec45b805cb2bd3d7ccbea6f8eea3220e1
 *   ln -s "$PWD/node_modules" /tmp/claude-0/wt-deployed/node_modules   (or npm ci there)
 *   node tests/fixtures/db/generate.mjs /tmp/claude-0/wt-deployed
 *
 * Writes tests/fixtures/db/<short sha>.sqlite (the database exactly as that version's API left it)
 * and <short sha>.json (passwords, what that API answered, session files). Needs php 8.1+ with
 * pdo_sqlite, and runs that version's own game code (vitest) for realistic career, settings and
 * autosave payloads. Passwords are hashed with production settings (no EPD_FAST_HASH).
 *
 * Make one for every version that reaches the server; never regenerate a released one.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('.', import.meta.url));
const wt = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !existsSync(join(wt, 'server', 'dev-router.php'))) {
  console.error('Kasutus: node tests/fixtures/db/generate.mjs <paigaldatud versiooni worktree>');
  process.exit(2);
}
const commit = spawnSync('git', ['-C', wt, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`no git commit in ${wt}`);
const short = commit.slice(0, 7);

/** Players of the fixture: different slots, regions, settings and a deleted autosave. */
const PLAYERS = [
  {
    name: 'Õnne.Mari_1',
    password: 'Mänguparool-1',
    badge: 'P-1042',
    regionId: 'pohja',
    difficulty: 'normal',
    seed: 1101,
    settings: { lang: 'et', volume: 0.4, theme: 'dark', mapStyle: 'dark', hints: false },
    slots: ['career', 'settings', 'autosave'],
    extra: {
      regionId: 'pohja',
      mode: 'free',
      difficulty: 'veteran',
      score: 88,
      grade: 'A',
      incidents: 41,
      arrests: 6,
    },
  },
  {
    name: 'Kalev',
    password: 'kalevipoeg 2024',
    badge: 'L-0077',
    regionId: 'louna',
    difficulty: 'cadet',
    seed: 2202,
    settings: {
      lang: 'en',
      volume: 0.35,
      theme: 'light',
      uiScale: 1.1,
      mapStyle: 'maaamet',
      colorblind: true,
    },
    // The autosave is uploaded and then deleted (shift ended): that version removes the row.
    slots: ['career', 'settings', 'autosave', '-autosave'],
    extra: {
      regionId: 'laane',
      mode: 'career',
      difficulty: 'normal',
      score: 72,
      grade: 'B',
      incidents: 25,
      arrests: 2,
    },
  },
  {
    name: 'tiit-99',
    password: 'Tiit ja Teele!',
    badge: 'I-3310',
    regionId: 'ida',
    difficulty: 'realistic',
    seed: 3303,
    settings: { lang: 'et', reducedMotion: true, sfx: false },
    // Career only, written twice (the second write replaces the first).
    slots: ['career', 'career'],
    // Same score as Kalev's in the same region, a little later: ties go to whoever was first.
    extra: {
      regionId: 'laane',
      mode: 'free',
      difficulty: 'normal',
      score: 72,
      grade: 'B',
      incidents: 19,
      arrests: 1,
    },
  },
];

// ------------------------------------------------------------------ payloads from that version's game code

const PAYLOAD_TEST = `
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createShift, finalizeShift, step } from '@/sim/engine';
import * as rules from '@/sim/career';
import { useSettings } from '@/store/settings';
import { dataOf } from '@/net/sync';

const MIN = 60_000;
/** 10.10.2026 07:00 Tallinn. */
const START = Date.UTC(2026, 9, 10, 4, 0);

function play(opts: Parameters<typeof createShift>[0], minutes: number) {
  const s = createShift(opts);
  const end = s.now + minutes * MIN;
  while (s.now < end && !s.ended) step(s, 5_000);
  return s;
}

it('writes payloads', () => {
  const plan = JSON.parse(process.env.EPD_FIXTURE_PLAN as string);
  const out = plan.map((p: any) => {
    let profile = rules.newCareer(p.name, p.badge, p.regionId, p.seed);
    const opts = (seed: number, start: number) => {
      let roster;
      try { roster = rules.rosterFromCareer(profile, 'day'); } catch { roster = undefined; }
      return { seed, start, hours: 12, regionId: p.regionId, mode: 'career' as const, difficulty: p.difficulty,
        playerName: p.name, roster, upgrades: profile.upgrades, reputation: profile.reputation };
    };
    const done = play(opts(p.seed, START), 90);
    const report = finalizeShift(done);
    const applied = rules.applyShiftReport(profile, report, { legacyLogin: false });
    profile = applied.profile;
    const running = play(opts(p.seed + 1, START + 86_400_000), 8);
    useSettings.setState(p.settings);
    return {
      career: { profile, inbox: applied.messages },
      settings: dataOf(useSettings.getState()),
      autosave: JSON.parse(JSON.stringify(running)),
      score: { regionId: report.regionId, mode: report.mode, difficulty: report.difficulty,
        score: Math.max(0, Math.min(100, Math.round(report.score))), grade: report.grade,
        incidents: report.stats?.incidents ?? 0, arrests: report.stats?.arrests ?? 0, start: report.start },
    };
  });
  writeFileSync(process.env.EPD_FIXTURE_OUT as string, JSON.stringify(out));
});
`;

function makePayloads() {
  const tmp = mkdtempSync(join(tmpdir(), 'epd-fixture-'));
  const testFile = join(wt, 'tests', 'zz-db-fixture-payloads.test.ts');
  const out = join(tmp, 'payloads.json');
  writeFileSync(testFile, PAYLOAD_TEST);
  try {
    const r = spawnSync('npx', ['vitest', 'run', 'tests/zz-db-fixture-payloads.test.ts'], {
      cwd: wt,
      encoding: 'utf8',
      env: { ...process.env, EPD_FIXTURE_PLAN: JSON.stringify(PLAYERS), EPD_FIXTURE_OUT: out },
    });
    if (r.status !== 0) throw new Error(`payload run failed:\n${r.stdout}\n${r.stderr}`);
    return JSON.parse(readFileSync(out, 'utf8'));
  } finally {
    rmSync(testFile, { force: true });
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ that version's API

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function freePort() {
  return new Promise((done, fail) => {
    const srv = createServer();
    srv.once('error', fail);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => done(port));
    });
  });
}

async function startPhp(dataDir) {
  const port = await freePort();
  const proc = spawn('php', ['-S', `127.0.0.1:${port}`, join(wt, 'server', 'dev-router.php')], {
    cwd: wt,
    env: { ...process.env, EPD_DATA: dataDir, EPD_TRUSTED_PROXY: '127.0.0.1', EPD_FAST_HASH: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 300; i++) {
    try {
      await (await fetch(`${base}/api/health`)).arrayBuffer();
      return { base, proc };
    } catch {
      await sleep(50);
    }
  }
  proc.kill();
  throw new Error('php -S did not start');
}

class Client {
  cookies = new Map();
  constructor(base, ip) {
    this.base = base;
    this.ip = ip;
  }
  async req(method, path, body) {
    const headers = { 'X-Forwarded-For': this.ip };
    if (method !== 'GET') headers['X-EPD'] = '1';
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(this.base + path, { method, headers, body });
    const setCookies = res.headers.getSetCookie();
    for (const line of setCookies) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      const value = pair.slice(eq + 1).trim();
      if (value === '' || value === 'deleted') this.cookies.delete(pair.slice(0, eq).trim());
      else this.cookies.set(pair.slice(0, eq).trim(), value);
    }
    const text = await res.text();
    if (res.status !== 200) throw new Error(`${method} ${path}: ${res.status} ${text}`);
    return { text, json: JSON.parse(text), setCookies };
  }
}

/** JSON with sorted keys, so key order never counts as a difference. */
function canonical(value) {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function php(code, ...args) {
  const r = spawnSync('php', ['-r', code, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout;
}

async function main() {
  const payloads = makePayloads();
  const dataDir = mkdtempSync(join(tmpdir(), 'epd-fixture-data-'));
  const server = await startPhp(dataDir);
  const users = [];
  try {
    for (const [i, p] of PLAYERS.entries()) {
      const pay = payloads[i];
      const c = new Client(server.base, `198.51.100.${10 + i}`);
      const reg = await c.req(
        'POST',
        '/api/register',
        JSON.stringify({ name: p.name, password: p.password }),
      );
      for (const slot of p.slots) {
        if (slot.startsWith('-')) await c.req('DELETE', `/api/save/${slot.slice(1)}`);
        else await c.req('PUT', `/api/save/${slot}`, JSON.stringify(pay[slot]));
        await sleep(5);
      }
      if (pay.score.incidents >= 1) await c.req('POST', '/api/score', JSON.stringify(pay.score));
      await sleep(20);
      await c.req(
        'POST',
        '/api/score',
        JSON.stringify({ ...p.extra, start: Date.UTC(2026, 9, 11 + i, 15, 0) }),
      );
      await sleep(20);
      users.push({ p, id: reg.json.user.id, created: reg.json.user.created });
    }
    // Every player logs in once more (a second device): this session must survive the update.
    let cookie;
    for (const u of users) {
      const c = new Client(server.base, `198.51.100.${50 + u.id}`);
      const login = await c.req(
        'POST',
        '/api/login',
        JSON.stringify({ name: u.p.name, password: u.p.password }),
      );
      cookie ??= login.setCookies.find((line) => line.startsWith('EPDSESS='));
      const save = await c.req('GET', '/api/save');
      const slots = {};
      for (const slot of ['career', 'settings', 'autosave']) {
        slots[slot] = save.json[slot] === null ? null : sha256(canonical(save.json[slot]));
      }
      const id = c.cookies.get('EPDSESS');
      u.out = {
        id: u.id,
        name: u.p.name,
        password: u.p.password,
        me: (await c.req('GET', '/api/me')).json,
        save: {
          updated: save.json.updated,
          slots,
          sha256: sha256(canonical(save.json)),
          bytes: save.text.length,
        },
        session: { id, file: readFileSync(join(dataDir, 'sessions', `sess_${id}`), 'utf8') },
      };
    }
    const guest = new Client(server.base, '198.51.100.99');
    const scores = {};
    for (const region of ['', 'pohja', 'ida', 'louna', 'laane']) {
      scores[region || 'all'] = (await guest.req('GET', `/api/scores?limit=50&region=${region}`)).json.scores;
    }
    const attrs = cookie
      .split(';')
      .slice(1)
      .map((a) => a.trim().toLowerCase())
      .filter((a) => !a.startsWith('expires=') && !a.startsWith('max-age='))
      .sort();

    const migrations = JSON.parse(
      php(
        `require $argv[1]; $out = []; foreach (epd_migrations() as $v => $s) { $out[$v] = hash('sha256', json_encode($s)); } echo json_encode($out);`,
        join(wt, 'server', 'lib', 'db.php'),
      ),
    );
    const manifest = {
      about: `Database made by the API of ${short} (tests/fixtures/db/generate.mjs). Test data only.`,
      commit,
      generated: new Date().toISOString(),
      php: php('echo PHP_VERSION;'),
      schemaVersion: Math.max(...Object.keys(migrations).map(Number)),
      migrationSha256: migrations,
      cookie: { name: 'EPDSESS', attributes: attrs },
      users: users.map((u) => u.out),
      scores,
    };
    await stopPhp(server);

    // Fold the WAL into the main file (the last connection to close removes it).
    php(
      `$d = new PDO('sqlite:' . $argv[1]); $d->exec('PRAGMA wal_checkpoint(TRUNCATE)');`,
      join(dataDir, 'epd.sqlite'),
    );
    const left = readdirSync(dataDir).filter((f) => f.startsWith('epd.sqlite-'));
    if (left.length) throw new Error(`WAL files left: ${left.join(', ')}`);
    copyFileSync(join(dataDir, 'epd.sqlite'), join(OUT_DIR, `${short}.sqlite`));
    writeFileSync(join(OUT_DIR, `${short}.json`), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`tests/fixtures/db/${short}.sqlite ja ${short}.json valmis`);
  } finally {
    await stopPhp(server);
    rmSync(dataDir, { recursive: true, force: true });
  }
}

async function stopPhp(server) {
  if (server.proc.exitCode !== null) return;
  const exited = new Promise((done) => server.proc.once('exit', done));
  server.proc.kill('SIGTERM');
  await Promise.race([exited, sleep(2000)]);
}

await main();
