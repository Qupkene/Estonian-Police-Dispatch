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

  constructor(status: number, code: string, message: string, serverMessage: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.serverMessage = serverMessage;
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
      throw new ApiError(res.status, str(obj.error) ?? `http_${res.status}`, serverMessage ?? `HTTP ${res.status}`, serverMessage);
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
