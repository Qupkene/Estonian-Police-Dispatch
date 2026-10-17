// Same-origin client for the EPD PHP API (contract: docs/SERVER.md section 4).
// No UI strings here: errors carry the server's code and Estonian message, the UI translates.

export const API_BASE = '/api';
export const API_TIMEOUT_MS = 8000;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Client side error codes (the server sends its own codes for HTTP errors). */
export type ClientErrorCode = 'network' | 'timeout' | 'bad_response';

export class ApiError extends Error {
  /** HTTP status, 0 when the request never got an answer. */
  readonly status: number;
  /** Server error code (`error` field) or a ClientErrorCode. */
  readonly code: string;
  /** The server's own message (Estonian) when it sent one. */
  readonly serverMessage: string | null;

  /** The parsed error body (e.g. `updated` of a 409 save_conflict), when there was one. */
  readonly body: Record<string, unknown> | null;

  constructor(status: number, code: string, message: string, serverMessage: string | null = null, body: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.serverMessage = serverMessage;
    this.body = body;
  }

  /** Worth trying again later: no connection, timeouts, rate limits and server trouble. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export interface RequestOptions {
  /** Milliseconds before the request is aborted (default 8 s). */
  timeout?: number;
  /** Lets the request outlive the page (beforeunload). Browsers cap such bodies at 64 kB. */
  keepalive?: boolean;
  /** Pre-serialised JSON body (skips JSON.stringify, e.g. for the autosave string). */
  rawBody?: string;
}

/**
 * The account this tab syncs with (set by src/net/account.ts), sent as `X-EPD-User`. The session cookie
 * is shared by every tab of the browser: when another tab logs in as someone else, the server answers
 * 409 `user_mismatch` instead of writing this tab's data into that account.
 */
let boundUser: number | null = null;

export function bindUser(id: number | null): void {
  boundUser = id;
}

export const apiHooks: {
  /** Called when the server says the session cookie now belongs to another account. */
  onUserMismatch?: () => void;
} = {};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/** Turn anything thrown by fetch or by us into an ApiError. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof Error && e.name === 'AbortError') return new ApiError(0, 'timeout', 'Request timed out');
  return new ApiError(0, 'network', e instanceof Error ? e.message : String(e));
}

/**
 * JSON request against the API. Resolves with the parsed body, rejects with ApiError.
 * State changing methods carry `X-EPD: 1` (CSRF guard required by the server).
 */
export async function request<T>(method: HttpMethod, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl?.abort();
  }, opts.timeout ?? API_TIMEOUT_MS);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-EPD'] = '1';
  if (boundUser !== null) headers['X-EPD-User'] = String(boundUser);
  let payload: string | undefined;
  if (opts.rawBody !== undefined) payload = opts.rawBody;
  else if (body !== undefined) payload = JSON.stringify(body);
  if (payload !== undefined) headers['Content-Type'] = 'application/json';

  try {
    let res: Response;
    try {
      res = await fetch(API_BASE + path, {
        method,
        headers,
        body: payload,
        credentials: 'include',
        cache: 'no-store',
        keepalive: opts.keepalive || undefined,
        signal: ctrl?.signal,
      });
    } catch (e) {
      throw timedOut ? new ApiError(0, 'timeout', 'Request timed out') : toApiError(e);
    }

    let text = '';
    try {
      text = await res.text();
    } catch (e) {
      throw timedOut ? new ApiError(0, 'timeout', 'Request timed out') : toApiError(e);
    }
    let data: unknown = undefined;
    let parsed = false;
    if (text) {
      try {
        data = JSON.parse(text);
        parsed = true;
      } catch {
        /* not JSON (an HTML error page, a static host's 404 page...) */
      }
    }

    if (!res.ok) {
      const obj = parsed && isObj(data) ? data : {};
      const serverMessage = str(obj.message);
      const code = str(obj.error) ?? `http_${res.status}`;
      if (res.status === 409 && code === 'user_mismatch') apiHooks.onUserMismatch?.();
      throw new ApiError(res.status, code, serverMessage ?? `HTTP ${res.status}`, serverMessage, isObj(data) ? data : null);
    }
    if (!parsed) throw new ApiError(res.status, 'bad_response', 'The server did not answer with JSON');
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

// ── Backend probe ───────────────────────────────────────────────────────────

/** An offline answer is re-checked after this long (the server may come back). */
const OFFLINE_RECHECK_MS = 60_000;
let probe: { promise: Promise<boolean>; value?: boolean; at: number } | null = null;

/**
 * Is the account API reachable? GET /api/health, cached (online for the page's lifetime, offline for a
 * minute). A network error, a 404, any non-JSON reply (GitHub Pages, plain `vite` without PHP) or a
 * health answer without `ok: true` counts as "no backend".
 */
export function probeBackend(force = false): Promise<boolean> {
  const now = Date.now();
  if (probe && !force) {
    if (probe.value === undefined || probe.value || now - probe.at < OFFLINE_RECHECK_MS) return probe.promise;
  }
  const entry: { promise: Promise<boolean>; value?: boolean; at: number } = { promise: Promise.resolve(false), at: now };
  entry.promise = request<unknown>('GET', '/health', undefined, { timeout: 5000 })
    .then((h) => isObj(h) && h.ok === true && h.accounts !== false)
    .catch(() => false)
    .then((v) => {
      entry.value = v;
      entry.at = Date.now();
      return v;
    });
  probe = entry;
  return entry.promise;
}

/** Forget the cached probe (tests). */
export function resetProbe(): void {
  probe = null;
}
