// The admin panel's client for /api/admin/* (server/lib/admin.php, docs/SERVER.md "Admin"). Same origin, the game's
// session cookie; every write carries X-EPD like the game's (CSRF).

export class AdminError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Called when the panel locks itself (403 admin_locked) or the session is gone (401), so the gate shows again. */
let onLost: (() => void) | null = null;
export function onSessionLost(fn: (() => void) | null): void {
  onLost = fn;
}

async function send(method: Method, path: string, body?: unknown, raw?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['X-EPD'] = '1';
  const payload = raw ?? (body === undefined ? undefined : JSON.stringify(body));
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new AdminError(0, 'network', 'Server ei vasta. Kontrolli ühendust.');
  }
  if (res.ok) return res;
  let code = 'http_' + res.status;
  let message = `Viga ${res.status}.`;
  try {
    const j = (await res.json()) as { error?: string; message?: string };
    if (j.error) code = j.error;
    if (j.message) message = j.message;
  } catch {
    /* not JSON */
  }
  if (
    (res.status === 401 || code === 'admin_locked') &&
    !path.startsWith('/admin/me') &&
    !path.startsWith('/login')
  )
    onLost?.();
  throw new AdminError(res.status, code, message);
}

export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  return (await (await send(method, path, body)).json()) as T;
}

/** A cloud save as stored (the raw JSON text) and its version. */
export async function readSave(userId: number, slot: string): Promise<{ text: string; updated: number }> {
  const res = await send('GET', `/admin/users/${userId}/saves/${slot}`);
  return { text: await res.text(), updated: Number(res.headers.get('X-EPD-Updated') ?? 0) };
}

export async function writeSave(userId: number, slot: string, text: string): Promise<{ updated: number }> {
  return (await (await send('PUT', `/admin/users/${userId}/saves/${slot}`, undefined, text)).json()) as {
    updated: number;
  };
}

/** A query string from the set values (empty strings and nulls left out). */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== '' && v !== null && v !== undefined) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ---------------------------------------------------------------- shapes

export interface AdminUser {
  id: number;
  name: string;
  created: number;
  lastLogin: number | null;
  admin: boolean;
  disabled: boolean;
}

export interface UserRow extends AdminUser {
  shifts: number;
  best: number | null;
  daily: number;
  saveBytes: number;
}

export interface Score {
  id: number;
  userId: number;
  name: string | null;
  regionId: string;
  mode: string;
  difficulty: string;
  score: number;
  grade: string;
  incidents: number;
  arrests: number;
  start: number;
  at: number;
}

export interface Daily {
  id: number;
  userId: number;
  name: string | null;
  day: string;
  regionId: string;
  sector: string;
  score: number;
  grade: string;
  incidents: number;
  arrests: number;
  at: number;
}

export interface Room {
  code: string;
  mode: string;
  state: string;
  regionId: string;
  sector: string;
  difficulty: string;
  hours: number;
  engine: string;
  created: number;
  started: number | null;
  updated: number;
  host: string | null;
  players: number | null;
}

export interface LogEntry {
  id: number;
  at: number;
  adminId: number | null;
  admin: string;
  action: string;
  target: string;
  detail: unknown;
  ip: string;
}

export interface Stats {
  now: number;
  users: Record<
    'total' | 'admins' | 'disabled' | 'new1d' | 'new7d' | 'new30d' | 'active1d' | 'active7d',
    number
  >;
  scores: Record<'total' | 'last7d' | 'players', number>;
  daily: Record<'total' | 'today', number>;
  rooms: Record<string, number>;
  saves: Record<'count' | 'bytes', number>;
  db: { bytes: number; schema: number };
  series: { signups: Record<string, number>; scores: Record<string, number> };
  top: { id: number; name: string; best: number; shifts: number }[];
}

export interface UserDetail {
  user: AdminUser;
  loginAttempts: number;
  scores: Score[];
  daily: Daily[];
  saves: { slot: string; updated: number; bytes: number; deleted: boolean }[];
  rooms: {
    code: string;
    mode: string;
    state: string;
    regionId: string;
    created: number;
    seat: number;
    left: boolean;
    score: number | null;
  }[];
  log: LogEntry[];
}

export interface Backup {
  name: string;
  bytes: number;
  at: number;
}

/** The account with exactly this name (any case), via the search. */
export async function findUser(name: string): Promise<UserRow | null> {
  const wanted = name.trim().toLocaleLowerCase('et');
  if (!wanted) return null;
  const r = await api<{ users: UserRow[] }>('GET', `/admin/users${qs({ q: name.trim(), limit: 200 })}`);
  return r.users.find((u) => u.name.toLocaleLowerCase('et') === wanted) ?? null;
}
