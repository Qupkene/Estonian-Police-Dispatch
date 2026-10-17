/**
 * Availability check for the self-hosted street map (one PMTiles file on the game's own server).
 *
 * Before the 'dark' style is used, the archive header is read once (a single 16 KiB range request).
 * That answers three questions at the same time: is the file there (local `npm run dev` and the
 * GitHub Pages preview have none, and an SPA fallback answers with index.html), does the server
 * honour range requests, and is it a vector archive. The parsed header and root directory are then
 * handed to the map's `pmtiles://` protocol, so the map does not fetch them again.
 *
 * Never throws and never hangs: every failure resolves to a reason, a slow server times out.
 * No maplibre import: testable in node with a mocked fetch.
 */
import { PMTiles, TileType } from 'pmtiles';

export type StreetProbe = 'ok' | 'missing' | 'network';

export interface ProbeOptions {
  /** Give up after this long (ms) and report 'network'. */
  timeoutMs?: number;
  /** Ignore a cached result and ask the server again. */
  force?: boolean;
  /** Called with the opened archive when it is usable (to share it with the map protocol). */
  onArchive?: (archive: PMTiles) => void;
}

const DEFAULT_TIMEOUT_MS = 8000;
const results = new Map<string, StreetProbe>();
const pending = new Map<string, Promise<StreetProbe>>();

/** Last finished probe result for a URL, if any (lets a new map start on the street style at once). */
export function knownStreetProbe(url: string): StreetProbe | undefined {
  return results.get(url);
}

/** Forget cached results (tests). */
export function resetStreetProbes(): void {
  results.clear();
  pending.clear();
}

/**
 * Classify a failure. A 4xx answer, a wrong magic number (an HTML fallback page) and a server that
 * ignores range requests all mean the file is not usable there; a 5xx answer (the server or relay
 * is down), a failed fetch and a timeout mean the network.
 */
function classify(e: unknown): StreetProbe {
  const msg = e instanceof Error ? e.message : String(e);
  const code = /Bad response code: (\d+)/.exec(msg);
  if (code) return Number(code[1]) >= 500 ? 'network' : 'missing';
  if (/magic number|spec version|content-length|Byte Serving|Compression/i.test(msg)) return 'missing';
  return 'network';
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Check that the PMTiles archive at `url` can serve vector tiles. Cached per URL while it is 'ok'. */
export function probeStreetTiles(url: string, opts: ProbeOptions = {}): Promise<StreetProbe> {
  if (!opts.force) {
    const running = pending.get(url);
    if (running) return running;
    if (results.get(url) === 'ok') return Promise.resolve('ok');
  }
  const run = (async (): Promise<StreetProbe> => {
    try {
      const archive = new PMTiles(url);
      const header = await withTimeout(archive.getHeader(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      if (header.tileType !== TileType.Mvt) return 'missing';
      try {
        opts.onArchive?.(archive);
      } catch {
        /* the map protocol will open the archive itself */
      }
      return 'ok';
    } catch (e) {
      return classify(e);
    }
  })();
  pending.set(url, run);
  void run.then((r) => {
    if (pending.get(url) === run) pending.delete(url);
    results.set(url, r);
  });
  return run;
}
