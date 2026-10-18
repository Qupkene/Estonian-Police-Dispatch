// Estonian radio voice from the game's own server. Owned by ui-shell.
//
// POST /api/tts (docs/SERVER.md 4.1) answers with a WAV from TartuNLP Neurokõne; it plays through Web
// Audio with a light radio sound (band-pass 300 to 3400 Hz, a little drive and compression, squelch).
//
// One line at a time: lines wait in a short queue, the oldest waiting line is dropped when it is full
// and a line that waited too long is skipped, so radio traffic stays current. A line can carry a tag
// (which radio message, incident and unit it is about): cancelTts() drops the waiting lines that
// match and cuts the one that plays, so a line the player has already acted on is not read out.
// Only the line that is up next is fetched ahead (dropped lines cost the server nothing). Decoded
// clips stay in a small LRU.
// When a clip cannot be had, the line's fallback plays instead (Web Speech, or nothing); server
// trouble also pauses the server voice for a while (1 min, doubling up to 10 min). Nothing is logged.
import { API_BASE, probeBackend } from '@/net/api';
import type { SpeechTag } from './radioSpeech';
import { sfx } from './sfx';

export interface TtsLine {
  /** Text prepared for the voice (ttsText); empty = do not ask the server, use the fallback. */
  text: string;
  voice: string;
  speed: number;
  /** Radio traffic: squelch and radio filter, dropped when stale. */
  radio: boolean;
  /** Plays the line another way (Web Speech or silence); resolves when it is done. */
  fallback: () => Promise<void>;
  /** Cuts the fallback short (cancelTts on a line that is being read by the browser voice). */
  stopFallback?: () => void;
  /** What the line is about, for cancelTts(). */
  tag?: SpeechTag;
  /** Radio lines that may wait behind the one playing when this one is queued (default QUEUE_MAX). */
  maxWaiting?: number;
  /**
   * Called by cancelTts() when this line was cut while it was actually being heard (not while its
   * clip was still on the way, nor when it was dropped from the queue) and no other line waits.
   */
  onCut?: () => void;
}

/** Lines that may wait behind the one playing. */
export const QUEUE_MAX = 3;
/** A radio line older than this when its turn comes is skipped. */
export const STALE_MS = 15_000;
/** Product name shown in Settings for the Estonian voice. */
export const NEUROKONE_NAME = 'Neurokõne (TartuNLP)';

const LRU_MAX = 32;
const FETCH_TIMEOUT_MS = 15_000;
const GAP_MS = 250;
const BACKOFF_MIN_MS = 60_000;
const BACKOFF_MAX_MS = 10 * 60_000;

interface Item {
  key: string;
  line: TtsLine;
  at: number;
  audio?: Promise<AudioBuffer | null>;
  cancelled?: boolean;
  /** The line is being heard (clip or fallback started). */
  audible?: boolean;
}

const lru = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer | null>>();
let queue: Item[] = [];
let busy = false;
let generation = 0;
let current: { stop: () => void } | null = null;
/** The line being fetched, played or read by the fallback. */
let active: Item | null = null;

let backend: boolean | undefined;
let failures = 0;
let downUntil = 0;
let downTimer: ReturnType<typeof setTimeout> | null = null;
const changeListeners = new Set<() => void>();

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

function notify() {
  for (const l of changeListeners) {
    try {
      l();
    } catch {
      /* a listener's problem is not ours */
    }
  }
}

/** Called when the server voice becomes usable or unusable (Settings shows it). */
export function onTtsChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

function hasWebAudio(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
  return !!(w.AudioContext ?? w.webkitAudioContext);
}

/** Is the API there? probeBackend() caches the answer (offline re-checked after a minute). */
function checkBackend(): Promise<boolean> {
  const p = probeBackend();
  void p.then((v) => {
    if (v !== backend) {
      backend = v;
      notify();
    }
  });
  return p;
}

/** true: the server voice is usable; false: not now; null: not known yet (the backend probe runs). */
export function ttsReady(): boolean | null {
  if (!hasWebAudio() || Date.now() < downUntil) return false;
  void checkBackend();
  return backend ?? null;
}

function setDown(ms: number) {
  downUntil = Date.now() + ms;
  if (downTimer) clearTimeout(downTimer);
  downTimer = setTimeout(() => {
    downTimer = null;
    notify();
  }, ms + 50);
  notify();
}

function serverTrouble() {
  failures++;
  setDown(Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** (failures - 1)));
}

function serverOk() {
  if (!failures && !downUntil) return;
  failures = 0;
  downUntil = 0;
  if (downTimer) clearTimeout(downTimer);
  downTimer = null;
  notify();
}

async function fetchWav(line: TtsLine): Promise<ArrayBuffer | null> {
  if (typeof fetch !== 'function') return null;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/wav', 'X-EPD': '1' },
      body: JSON.stringify({ text: line.text, voice: line.voice, speed: line.speed }),
      credentials: 'same-origin',
      signal: ctrl?.signal,
    });
    if (res.ok && (res.headers.get('content-type') ?? '').startsWith('audio/')) {
      const data = await res.arrayBuffer();
      serverOk();
      return data;
    }
    let code = '';
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body?.error === 'string') code = body.error;
    } catch {
      /* not JSON */
    }
    if (res.status === 429) setDown(BACKOFF_MIN_MS);
    else if (code !== 'tts_busy' && res.status !== 400) serverTrouble();
    return null;
  } catch {
    serverTrouble();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function load(line: TtsLine): Promise<AudioBuffer | null> {
  if (!line.text || !hasWebAudio() || Date.now() < downUntil) return null;
  if (!(await checkBackend())) return null;
  const out = sfx.speechOut();
  if (!out) return null;
  const data = await fetchWav(line);
  if (!data) return null;
  try {
    return await out.ctx.decodeAudioData(data);
  } catch {
    return null;
  }
}

function remember(key: string, buf: AudioBuffer) {
  lru.delete(key);
  lru.set(key, buf);
  while (lru.size > LRU_MAX) lru.delete(lru.keys().next().value as string);
}

/** The decoded clip for a line: from the LRU, an identical request in flight, or the server. */
function clip(item: Item): Promise<AudioBuffer | null> {
  const hit = lru.get(item.key);
  if (hit) {
    remember(item.key, hit);
    return Promise.resolve(hit);
  }
  const pending = inflight.get(item.key);
  if (pending) return pending;
  const p = load(item.line)
    .catch(() => null)
    .then((buf) => {
      inflight.delete(item.key);
      if (buf) remember(item.key, buf);
      return buf;
    });
  inflight.set(item.key, p);
  return p;
}

const audioOf = (item: Item) => (item.audio ??= item.line.text ? clip(item) : Promise.resolve(null));
const stale = (item: Item) => item.line.radio && now() - item.at > STALE_MS;

// ── Radio sound ──────────────────────────────────────────────────────────────

const chains = new WeakMap<BaseAudioContext, AudioNode>();
const noises = new WeakMap<BaseAudioContext, AudioBuffer>();

function saturation(k: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) curve[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / norm;
  return curve;
}

/** Handset band (300 to 3400 Hz), a little presence, soft drive and compression. One per context. */
function radioChain(ctx: AudioContext, dest: AudioNode): AudioNode {
  const have = chains.get(ctx);
  if (have) return have;
  const input = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 300;
  hp.Q.value = 0.8;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3400;
  lp.Q.value = 0.8;
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 1900;
  presence.Q.value = 0.9;
  presence.gain.value = 4;
  const drive = ctx.createWaveShaper();
  drive.curve = saturation(1.8);
  drive.oversample = '2x';
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.knee.value = 8;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.16;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.4;
  input.connect(hp).connect(lp).connect(presence).connect(drive).connect(comp).connect(makeup).connect(dest);
  chains.set(ctx, input);
  return input;
}

/** Faint band-passed hiss under a clip. Returns a stop function. */
function hiss(ctx: AudioContext, dest: AudioNode, at: number, dur: number): () => void {
  let buf = noises.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noises.set(ctx, buf);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2600;
  band.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at - 0.05);
  g.gain.linearRampToValueAtTime(0.012, at);
  g.gain.setValueAtTime(0.012, at + dur);
  g.gain.linearRampToValueAtTime(0.0001, at + dur + 0.06);
  src.connect(band).connect(g).connect(dest);
  src.start(Math.max(ctx.currentTime, at - 0.05));
  src.stop(at + dur + 0.1);
  return () => {
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
  };
}

/** Play one clip to its end (or until stopTts). False when it could not be played at all. */
async function play(buf: AudioBuffer, radio: boolean, gen: number): Promise<boolean> {
  const out = sfx.speechOut();
  if (!out) return false;
  const { ctx } = out;
  const running = () => ctx.state === 'running';
  if (!running()) {
    try {
      await Promise.race([ctx.resume(), sleep(500)]);
    } catch {
      /* stays suspended */
    }
    if (!running() || gen !== generation) return false;
  }
  let stopHiss = () => {};
  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(radio ? radioChain(ctx, out.out) : out.out);
    const t0 = ctx.currentTime + (radio ? 0.12 : 0.02);
    if (radio) {
      sfx.play('radioIn', { gain: 0.8 });
      stopHiss = hiss(ctx, out.out, t0, buf.duration);
    }
    src.start(t0);
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (current === handle) current = null;
        resolve();
      };
      const timer = setTimeout(finish, (buf.duration + 0.12) * 1000 + 1500);
      const handle = {
        stop: () => {
          try {
            src.stop();
          } catch {
            /* not started or already stopped */
          }
          stopHiss();
          finish();
        },
      };
      current = handle;
      src.onended = finish;
    });
  } catch {
    stopHiss();
    return false;
  }
  if (radio && gen === generation) sfx.play('radioOut', { gain: 0.8 });
  return true;
}

// ── Queue ────────────────────────────────────────────────────────────────────

async function pump(): Promise<void> {
  if (busy) return;
  busy = true;
  const gen = generation;
  try {
    while (queue.length && gen === generation) {
      const item = queue.shift() as Item;
      if (stale(item)) continue;
      active = item;
      const buf = await audioOf(item);
      if (gen !== generation) return;
      if (stale(item) || item.cancelled) continue;
      if (buf) {
        // The next line is fetched while this one plays.
        if (queue[0]) void audioOf(queue[0]);
        item.audible = true;
        if (await play(buf, item.line.radio, gen)) {
          if (gen !== generation) return;
          active = null;
          await sleep(GAP_MS);
          continue;
        }
        if (gen !== generation) return;
        item.audible = false;
        if (item.cancelled) continue;
      }
      item.audible = true;
      try {
        await item.line.fallback();
      } catch {
        /* fallback is best effort */
      }
      if (gen === generation) active = null;
    }
  } finally {
    if (gen === generation) {
      busy = false;
      active = null;
    }
  }
}

/** Queue a line for the Estonian voice. */
export function say(line: TtsLine): void {
  const item: Item = { key: `${line.voice}|${line.speed.toFixed(2)}|${line.text}`, line, at: now() };
  if (line.radio) {
    const max = Math.max(0, Math.min(QUEUE_MAX, line.maxWaiting ?? QUEUE_MAX));
    // The line itself waits too (until pump takes it), so make room for it.
    while (queue.length && queue.length >= Math.max(1, max)) queue.shift();
  }
  queue.push(item);
  void pump();
}

/**
 * Drop the waiting lines whose tag matches and cut the line that plays (or is being fetched) when it
 * matches. The queue goes on with the next line. Returns how many lines were dropped or cut.
 */
export function cancelTts(match: (tag: SpeechTag) => boolean): number {
  let n = 0;
  queue = queue.filter((it) => {
    const hit = !!it.line.tag && match(it.line.tag);
    if (hit) n++;
    return !hit;
  });
  const a = active;
  if (a && !a.cancelled && a.line.tag && match(a.line.tag)) {
    a.cancelled = true;
    n++;
    const c = current;
    current = null;
    c?.stop();
    try {
      a.line.stopFallback?.();
    } catch {
      /* best effort */
    }
    if (a.audible && !queue.length) {
      try {
        a.line.onCut?.();
      } catch {
        /* best effort */
      }
    }
  }
  return n;
}

/** Keep at most `max` radio lines waiting (the newest stay). */
export function limitTtsQueue(max: number): void {
  while (queue.length > Math.max(0, max)) queue.shift();
}

/** Tags of the line that plays and the waiting ones (in that order). */
export function ttsTags(): SpeechTag[] {
  const out: SpeechTag[] = [];
  if (active && !active.cancelled && active.line.tag) out.push(active.line.tag);
  for (const it of queue) if (it.line.tag) out.push(it.line.tag);
  return out;
}

/** Stop the clip that plays and forget the waiting lines. */
export function stopTts(): void {
  generation++;
  queue = [];
  busy = false;
  const a = active;
  active = null;
  const c = current;
  current = null;
  c?.stop();
  try {
    a?.line.stopFallback?.();
  } catch {
    /* best effort */
  }
}

/** Forget everything (tests). */
export function resetTts(): void {
  stopTts();
  lru.clear();
  inflight.clear();
  backend = undefined;
  failures = 0;
  downUntil = 0;
  if (downTimer) clearTimeout(downTimer);
  downTimer = null;
}
