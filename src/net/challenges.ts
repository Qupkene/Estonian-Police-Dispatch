// Väljakutse lingiga (2.38.0, docs/CHALLENGE.md): POST /api/challenges after a free shift, GET /api/challenges/<code>
// for a link that was opened, POST .../result after a challenge run, GET /api/challenges for the player's list.
import { REGION_IDS } from '@/data/regions';
import { challengeStats, type ChallengeStats, type ShiftSetup } from '@/sim/challenge';
import type { Difficulty, ShiftReport, Weather } from '@/sim/types';
import { request } from './api';
import { isObj } from './sync';

/** One run on a challenge's board. */
export interface ChallengeRow extends ChallengeStats {
  name: string;
  avatar?: string;
  at: number;
  /** 1 + the players with strictly more points. */
  rank: number;
  /** The caller's own run. */
  me?: boolean;
  /** The sender's run. */
  sender?: boolean;
}

export interface Challenge {
  code: string;
  by: { name: string; avatar?: string };
  setup: ShiftSetup;
  /** The game version it was sent from ('' when unknown). */
  version: string;
  created: number;
  players: number;
  /** Best first (the top 50; the list of the player's challenges keeps 3). */
  results: ChallengeRow[];
  me: ChallengeRow | null;
}

export interface ChallengeReply {
  /** False when the player had played it before: this run was practice. */
  counted: boolean;
  rank: number | null;
  players: number;
  challenge: Challenge | null;
}

const LINK = /^\/v\/([A-Za-z0-9]{6})\/?$/;
const CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const DIFFICULTIES: Difficulty[] = ['cadet', 'normal', 'veteran', 'realistic'];
const WEATHERS: Weather['kind'][] = ['clear', 'cloudy', 'rain', 'snow', 'sleet', 'fog', 'storm'];

/** The challenge code of a link's path (`/v/K7M2QX`), or null. */
export function challengeCodeFromPath(path: string): string | null {
  const m = LINK.exec(path);
  const code = m ? m[1].toUpperCase() : '';
  return CODE.test(code) ? code : null;
}

/** The link to send. */
export function challengeUrl(code: string, origin: string = globalThis.location?.origin ?? 'https://politsei.eu'): string {
  return `${origin}/v/${code}`;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function parseSetup(v: unknown): ShiftSetup | null {
  if (!isObj(v)) return null;
  const regionId = REGION_IDS.find((r) => r === v.regionId);
  const difficulty = DIFFICULTIES.find((d) => d === v.difficulty);
  if (!regionId || !difficulty || typeof v.seed !== 'number' || typeof v.start !== 'number') return null;
  if (typeof v.hours !== 'number' || !(v.hours > 0)) return null;
  const weather = WEATHERS.find((w) => w === v.weather);
  return {
    seed: v.seed >>> 0,
    regionId,
    difficulty,
    start: v.start,
    hours: v.hours,
    ...(weather ? { weather } : {}),
    ...(typeof v.crisis === 'number' && v.crisis > 0 && v.crisis <= 1 ? { crisis: v.crisis } : {}),
  };
}

function parseRow(v: unknown): ChallengeRow | null {
  if (!isObj(v) || typeof v.name !== 'string') return null;
  const grade = (['S', 'A', 'B', 'C', 'D', 'F'] as const).find((g) => g === v.grade) ?? 'F';
  return {
    name: v.name,
    ...(typeof v.avatar === 'string' && v.avatar ? { avatar: v.avatar } : {}),
    score: num(v.score),
    grade,
    closed: num(v.closed),
    arrests: num(v.arrests),
    p1: numOrNull(v.p1),
    crisis: numOrNull(v.crisis),
    at: num(v.at),
    rank: Math.max(1, Math.round(num(v.rank)) || 1),
    ...(v.me === true ? { me: true } : {}),
    ...(v.sender === true ? { sender: true } : {}),
  };
}

export function parseChallenge(v: unknown): Challenge | null {
  if (!isObj(v) || typeof v.code !== 'string' || !CODE.test(v.code)) return null;
  const setup = parseSetup(v.setup);
  if (!setup) return null;
  const by = isObj(v.by) ? v.by : {};
  const results = Array.isArray(v.results) ? v.results.map(parseRow).filter((r): r is ChallengeRow => !!r) : [];
  return {
    code: v.code,
    by: {
      name: typeof by.name === 'string' ? by.name : '',
      ...(typeof by.avatar === 'string' && by.avatar ? { avatar: by.avatar } : {}),
    },
    setup,
    version: typeof v.version === 'string' ? v.version : '',
    created: num(v.created),
    players: Math.max(num(v.players), results.length),
    results,
    me: parseRow(v.me),
  };
}

/** The body's result: what the board shows and compares by. */
export function challengeResultBody(r: ShiftReport): ChallengeStats {
  return challengeStats(r);
}

/** Send the challenge of a finished free shift (the report carries its setup). */
export async function createChallenge(report: ShiftReport, version: string): Promise<Challenge> {
  if (!report.setup) throw new Error('createChallenge: the shift has no setup');
  const res = await request<unknown>('POST', '/challenges', {
    setup: report.setup,
    result: challengeResultBody(report),
    version,
  });
  const ch = parseChallenge(isObj(res) ? res.challenge : null);
  if (!ch) throw new Error('createChallenge: bad answer');
  return ch;
}

export async function fetchChallenge(code: string): Promise<Challenge> {
  const res = await request<unknown>('GET', `/challenges/${encodeURIComponent(code)}`);
  const ch = parseChallenge(isObj(res) ? res.challenge : null);
  if (!ch) throw new Error('fetchChallenge: bad answer');
  return ch;
}

/** The player's challenges, sent and played, newest first. */
export async function fetchMyChallenges(): Promise<Challenge[]> {
  const res = await request<unknown>('GET', '/challenges');
  const list = isObj(res) && Array.isArray(res.challenges) ? res.challenges : [];
  return list.map(parseChallenge).filter((c): c is Challenge => !!c);
}

export function parseChallengeReply(v: unknown): ChallengeReply {
  const o = isObj(v) ? v : {};
  return {
    counted: o.counted !== false,
    rank: typeof o.rank === 'number' && o.rank > 0 ? Math.round(o.rank) : null,
    players: num(o.players),
    challenge: parseChallenge(o.challenge),
  };
}

/** Each report is posted once, however often the report screen renders (StrictMode included). */
const submitted = new WeakMap<ShiftReport, Promise<ChallengeReply>>();

/** POST a challenge run once; resolves with whether it counted, the place and the board. */
export function submitChallengeOnce(report: ShiftReport, code: string): Promise<ChallengeReply> {
  let p = submitted.get(report);
  if (!p) {
    p = request<unknown>('POST', `/challenges/${encodeURIComponent(code)}/result`, {
      result: challengeResultBody(report),
    }).then(parseChallengeReply);
    // A failed attempt may be retried by the player.
    p.catch(() => submitted.delete(report));
    submitted.set(report, p);
  }
  return p;
}
