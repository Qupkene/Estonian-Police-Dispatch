// EPD sound effects — everything is synthesised with the Web Audio API (no audio files).
// Owned by ui-shell. Public API (SfxName, sfx.*) is used by other modules — keep it stable.
//
// Signal chain:  voices → sfxBus ─┐
//                ring  → ringBus ─┼→ master (volume) → compressor → destination
//                ambience → ambBus┘
export type SfxName =
  | 'boot'
  | 'login'
  | 'click'
  | 'hover'
  | 'newIncident'
  | 'p1Alert'
  | 'escalated'
  | 'radioIn'
  | 'radioOut'
  | 'emergency'
  | 'backup'
  | 'resolved'
  | 'error'
  | 'typing'
  | 'phonePickup'
  | 'phoneHangup'
  | 'achievement'
  | 'cash'
  | 'dispatch'
  | 'pursuit';

export const SFX_NAMES: SfxName[] = [
  'boot', 'login', 'click', 'hover', 'newIncident', 'p1Alert', 'escalated', 'radioIn', 'radioOut', 'emergency', 'backup',
  'resolved', 'error', 'typing', 'phonePickup', 'phoneHangup', 'achievement', 'cash', 'dispatch', 'pursuit',
];

/** Ring cadence (seconds). CEPT/European style single long ring; the off-time is shortened for gameplay. */
export const RING_CADENCE = { on: 1.0, off: 2.0 } as const;

/** Burst start times/durations for `count` rings (pure — used by the scheduler and tests). */
export function ringSchedule(count: number, cadence: { on: number; off: number } = RING_CADENCE, t0 = 0): { start: number; dur: number }[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({ start: t0 + i * (cadence.on + cadence.off), dur: cadence.on }));
}

/** Perceptual volume curve: slider 0..1 → linear gain. */
export function volumeToGain(v: number): number {
  const c = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  return c ** 1.6;
}

/** Minimum gap between two plays of the same sound (ms). */
const MIN_GAP: Partial<Record<SfxName, number>> = { typing: 25, hover: 60, click: 40, radioIn: 140, radioOut: 140, newIncident: 250, p1Alert: 900, emergency: 1500, backup: 1200, pursuit: 2000 };

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  sfxBus: GainNode;
  ringBus: GainNode;
  ambBus: GainNode;
  noise: AudioBuffer;
}

let eng: Engine | null = null;
let volume = 0.7;
let enabled = true;
let ambienceWanted = false;
const lastPlayed = new Map<SfxName, number>();

// ── Engine bootstrap ─────────────────────────────────────────────────────────

function createEngine(): Engine | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  let ctx: AudioContext;
  try {
    ctx = new Ctor({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = volumeToGain(volume);
  master.connect(comp);
  const sfxBus = ctx.createGain();
  sfxBus.gain.value = enabled ? 1 : 0;
  sfxBus.connect(master);
  const ringBus = ctx.createGain();
  ringBus.gain.value = enabled ? 1 : 0;
  ringBus.connect(master);
  const ambBus = ctx.createGain();
  ambBus.gain.value = 0;
  ambBus.connect(master);
  // 2 s of white noise, reused by every noise voice.
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return { ctx, master, sfxBus, ringBus, ambBus, noise };
}

// ── Voice helpers ────────────────────────────────────────────────────────────

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** Exponential glide target reached at the end of the note. */
  to?: number;
  at: number;
  dur: number;
  gain: number;
  attack?: number;
  /** 'exp' = percussive decay over the whole note; 'hold' = sustain then short release. */
  shape?: 'exp' | 'hold';
  detune?: number;
  dest?: AudioNode;
  filter?: { type: BiquadFilterType; freq: number; q?: number };
}

function tone(e: Engine, o: ToneOpts): OscillatorNode {
  const { ctx } = e;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, o.at);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, o.at + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain();
  const a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, o.at);
  g.gain.linearRampToValueAtTime(o.gain, o.at + a);
  if (o.shape === 'hold') {
    g.gain.setValueAtTime(o.gain, Math.max(o.at + a, o.at + o.dur - 0.03));
    g.gain.linearRampToValueAtTime(0.0001, o.at + o.dur);
  } else {
    g.gain.exponentialRampToValueAtTime(0.0001, o.at + o.dur);
  }
  let node: AudioNode = osc;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter.type;
    f.frequency.value = o.filter.freq;
    f.Q.value = o.filter.q ?? 0.7;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(o.dest ?? e.sfxBus);
  osc.start(o.at);
  osc.stop(o.at + o.dur + 0.05);
  return osc;
}

interface NoiseOpts {
  at: number;
  dur: number;
  gain: number;
  type?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  attack?: number;
  shape?: 'exp' | 'hold';
  dest?: AudioNode;
}

function noise(e: Engine, o: NoiseOpts): AudioBufferSourceNode {
  const { ctx } = e;
  const src = ctx.createBufferSource();
  src.buffer = e.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 1800, o.at);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, o.at + o.dur);
  f.Q.value = o.q ?? 0.8;
  const g = ctx.createGain();
  const a = o.attack ?? 0.003;
  g.gain.setValueAtTime(0.0001, o.at);
  g.gain.linearRampToValueAtTime(o.gain, o.at + a);
  if (o.shape === 'hold') {
    g.gain.setValueAtTime(o.gain, Math.max(o.at + a, o.at + o.dur - 0.02));
    g.gain.linearRampToValueAtTime(0.0001, o.at + o.dur);
  } else {
    g.gain.exponentialRampToValueAtTime(0.0001, o.at + o.dur);
  }
  src.connect(f).connect(g).connect(o.dest ?? e.sfxBus);
  src.start(o.at, Math.random() * 1.5);
  src.stop(o.at + o.dur + 0.05);
  return src;
}

/** A soft bell: fundamental + gentle partials. */
function bell(e: Engine, freq: number, at: number, dur: number, gain: number, dest?: AudioNode) {
  tone(e, { freq, at, dur, gain, attack: 0.004, dest });
  tone(e, { freq: freq * 2, at, dur: dur * 0.6, gain: gain * 0.28, attack: 0.003, dest });
  tone(e, { freq: freq * 3.01, at, dur: dur * 0.35, gain: gain * 0.1, attack: 0.002, dest });
}

/** Roger / PTT beep. */
function beep(e: Engine, freq: number, at: number, dur: number, gain: number) {
  tone(e, { type: 'square', freq, at, dur, gain, attack: 0.003, shape: 'hold', filter: { type: 'lowpass', freq: 2600 } });
}

/** Radio squelch burst. */
function squelch(e: Engine, at: number, dur: number, gain: number, dest?: AudioNode) {
  noise(e, { at, dur, gain, type: 'bandpass', freq: 1700, q: 0.6, attack: 0.002, dest });
  noise(e, { at, dur: Math.min(0.02, dur), gain: gain * 0.8, type: 'highpass', freq: 3500, attack: 0.001, dest });
}

// ── Sound designs ────────────────────────────────────────────────────────────

type Design = (e: Engine, t: number, g: number) => void;

const DESIGNS: Record<SfxName, Design> = {
  // Rising swell + console chord when the CAD "boots".
  boot: (e, t, g) => {
    tone(e, { freq: 55, to: 110, at: t, dur: 1.4, gain: 0.16 * g, attack: 0.6, shape: 'hold' });
    noise(e, { at: t, dur: 1.2, gain: 0.04 * g, type: 'lowpass', freq: 200, to: 2600, attack: 0.9, shape: 'hold' });
    for (const [i, f] of [440, 659.3, 880].entries()) tone(e, { type: 'triangle', freq: f, at: t + 1.05 + i * 0.05, dur: 1.2, gain: 0.07 * g, attack: 0.01 });
    beep(e, 1760, t + 1.05, 0.05, 0.04 * g);
  },
  // Soft two-note confirmation (e-ID accepted).
  login: (e, t, g) => {
    bell(e, 659.3, t, 0.9, 0.1 * g);
    bell(e, 987.8, t + 0.01, 0.9, 0.07 * g);
    bell(e, 1318.5, t + 0.13, 1.0, 0.08 * g);
  },
  click: (e, t, g) => {
    tone(e, { freq: 2300, to: 1700, at: t, dur: 0.018, gain: 0.03 * g, attack: 0.001 });
  },
  hover: (e, t, g) => {
    tone(e, { freq: 3400, at: t, dur: 0.01, gain: 0.01 * g, attack: 0.001 });
  },
  // Two-tone CAD chime ("ding–dong").
  newIncident: (e, t, g) => {
    bell(e, 880, t, 0.55, 0.16 * g);
    bell(e, 659.3, t + 0.17, 0.75, 0.16 * g);
  },
  // Urgent triple pulse, twice.
  p1Alert: (e, t, g) => {
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < 3; i++) {
        const at = t + k * 0.52 + i * 0.13;
        tone(e, { type: 'square', freq: k ? 1250 : 1100, at, dur: 0.085, gain: 0.13 * g, attack: 0.003, shape: 'hold', filter: { type: 'lowpass', freq: 3000 } });
        tone(e, { freq: (k ? 1250 : 1100) * 2, at, dur: 0.085, gain: 0.03 * g, attack: 0.003, shape: 'hold' });
      }
    }
  },
  // Rising sweep + confirmation beep: "situation got worse".
  escalated: (e, t, g) => {
    tone(e, { type: 'sawtooth', freq: 420, to: 900, at: t, dur: 0.36, gain: 0.1 * g, attack: 0.02, shape: 'hold', filter: { type: 'lowpass', freq: 2200 } });
    tone(e, { type: 'sawtooth', freq: 520, to: 1100, at: t + 0.38, dur: 0.3, gain: 0.1 * g, attack: 0.02, shape: 'hold', filter: { type: 'lowpass', freq: 2400 } });
    bell(e, 1174.7, t + 0.7, 0.4, 0.09 * g);
  },
  // Squelch opens + short high PTT beep (incoming transmission).
  radioIn: (e, t, g) => {
    squelch(e, t, 0.09, 0.2 * g);
    beep(e, 1500, t + 0.07, 0.045, 0.045 * g);
  },
  // Roger beep (low-high) + squelch tail (end of transmission / our reply).
  radioOut: (e, t, g) => {
    beep(e, 1200, t, 0.04, 0.045 * g);
    beep(e, 1600, t + 0.045, 0.04, 0.045 * g);
    squelch(e, t + 0.09, 0.16, 0.17 * g);
  },
  // Officer-down / emergency button: alternating hi–lo alarm with a pulsing undertone.
  emergency: (e, t, g) => {
    for (let i = 0; i < 10; i++) {
      const f = i % 2 ? 690 : 1020;
      tone(e, { type: 'square', freq: f, at: t + i * 0.15, dur: 0.145, gain: 0.12 * g, attack: 0.004, shape: 'hold', filter: { type: 'lowpass', freq: 3200 } });
    }
    tone(e, { type: 'sawtooth', freq: 110, at: t, dur: 1.5, gain: 0.05 * g, attack: 0.02, shape: 'hold', filter: { type: 'lowpass', freq: 500 } });
    squelch(e, t + 1.5, 0.15, 0.12 * g);
  },
  // "Toetust vajab" — homage to the 2025 supportNeededSound: three urgent rising sweeps + double beep.
  backup: (e, t, g) => {
    for (let i = 0; i < 3; i++) {
      tone(e, { type: 'sawtooth', freq: 480, to: 1040, at: t + i * 0.27, dur: 0.22, gain: 0.11 * g, attack: 0.01, shape: 'hold', filter: { type: 'bandpass', freq: 1300, q: 0.6 } });
    }
    beep(e, 1660, t + 0.86, 0.07, 0.07 * g);
    beep(e, 1660, t + 0.98, 0.07, 0.07 * g);
  },
  // Pleasant ascending arpeggio.
  resolved: (e, t, g) => {
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(e, { type: 'triangle', freq: f, at: t + i * 0.075, dur: 0.6, gain: 0.08 * g, attack: 0.005 }));
  },
  error: (e, t, g) => {
    for (let i = 0; i < 2; i++) tone(e, { type: 'square', freq: 196, at: t + i * 0.17, dur: 0.11, gain: 0.11 * g, attack: 0.004, shape: 'hold', filter: { type: 'lowpass', freq: 1200 } });
  },
  // A soft keyboard click (call it per keystroke).
  typing: (e, t, g) => {
    const f = 2600 + Math.random() * 1800;
    noise(e, { at: t, dur: 0.014, gain: 0.05 * g, type: 'bandpass', freq: f, q: 1.2, attack: 0.0008 });
    tone(e, { freq: 180 + Math.random() * 60, at: t, dur: 0.02, gain: 0.025 * g, attack: 0.001 });
  },
  // Handset lifted: two mechanical clicks + line noise.
  phonePickup: (e, t, g) => {
    noise(e, { at: t, dur: 0.025, gain: 0.18 * g, type: 'lowpass', freq: 2200, attack: 0.001 });
    tone(e, { freq: 140, to: 90, at: t, dur: 0.06, gain: 0.12 * g, attack: 0.001 });
    noise(e, { at: t + 0.07, dur: 0.02, gain: 0.12 * g, type: 'bandpass', freq: 3000, attack: 0.001 });
    noise(e, { at: t + 0.1, dur: 0.35, gain: 0.015 * g, type: 'bandpass', freq: 1000, q: 0.5, attack: 0.05 });
  },
  // Handset down: click + short European busy tone (425 Hz).
  phoneHangup: (e, t, g) => {
    noise(e, { at: t, dur: 0.03, gain: 0.16 * g, type: 'lowpass', freq: 1800, attack: 0.001 });
    tone(e, { freq: 120, to: 70, at: t, dur: 0.07, gain: 0.12 * g, attack: 0.001 });
    for (let i = 0; i < 3; i++) tone(e, { freq: 425, at: t + 0.16 + i * 0.24, dur: 0.12, gain: 0.05 * g, attack: 0.005, shape: 'hold' });
  },
  achievement: (e, t, g) => {
    [784, 987.8, 1174.7, 1568].forEach((f, i) => tone(e, { type: 'triangle', freq: f, at: t + i * 0.07, dur: 0.7, gain: 0.08 * g, attack: 0.004 }));
    const sh = e.ctx.createOscillator();
    const lfo = e.ctx.createOscillator();
    const lg = e.ctx.createGain();
    const sg = e.ctx.createGain();
    sh.frequency.value = 2637;
    lfo.frequency.value = 9;
    lg.gain.value = 18;
    lfo.connect(lg).connect(sh.frequency);
    sg.gain.setValueAtTime(0.0001, t + 0.28);
    sg.gain.linearRampToValueAtTime(0.03 * g, t + 0.32);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    sh.connect(sg).connect(e.sfxBus);
    sh.start(t + 0.28);
    lfo.start(t + 0.28);
    sh.stop(t + 1.35);
    lfo.stop(t + 1.35);
  },
  // "Ka-ching": drawer click + two metallic bell hits.
  cash: (e, t, g) => {
    noise(e, { at: t, dur: 0.035, gain: 0.12 * g, type: 'highpass', freq: 2500, attack: 0.001 });
    for (const [i, base] of [1568, 2093].entries()) {
      const at = t + 0.05 + i * 0.09;
      tone(e, { freq: base, at, dur: 0.5, gain: 0.07 * g, attack: 0.002 });
      tone(e, { freq: base * 1.5, at, dur: 0.35, gain: 0.04 * g, attack: 0.002 });
      tone(e, { freq: base * 2.76, at, dur: 0.2, gain: 0.02 * g, attack: 0.002 });
    }
  },
  // Assignment sent to the unit: two quick ascending blips + tiny squelch.
  dispatch: (e, t, g) => {
    tone(e, { freq: 880, at: t, dur: 0.055, gain: 0.09 * g, attack: 0.003, shape: 'hold' });
    tone(e, { freq: 1318.5, at: t + 0.07, dur: 0.08, gain: 0.09 * g, attack: 0.003, shape: 'hold' });
    squelch(e, t + 0.16, 0.06, 0.07 * g);
  },
  // Siren snippet: one wail rise then fast yelp, filtered as if heard through a window.
  pursuit: (e, t, g) => {
    const { ctx } = e;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const f = osc.frequency;
    f.setValueAtTime(620, t);
    f.linearRampToValueAtTime(1320, t + 0.55);
    f.linearRampToValueAtTime(700, t + 0.85);
    let x = t + 0.85;
    for (let i = 0; i < 6; i++) {
      f.linearRampToValueAtTime(1350, x + 0.1);
      f.linearRampToValueAtTime(700, x + 0.2);
      x += 0.2;
    }
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(0.085 * g, t + 0.15);
    gn.gain.setValueAtTime(0.085 * g, x - 0.25);
    gn.gain.linearRampToValueAtTime(0.0001, x);
    osc.connect(bp).connect(lp).connect(gn).connect(e.sfxBus);
    osc.start(t);
    osc.stop(x + 0.05);
  },
};

// ── Phone ring (look-ahead scheduler) ───────────────────────────────────────

let ringGain: GainNode | null = null;
let ringTimer: ReturnType<typeof setInterval> | null = null;
let ringNext = 0;

function ringBurst(e: Engine, dest: GainNode, at: number, dur: number) {
  // Electronic desk-phone trill: carrier toggles 1040/1300 Hz every 25 ms.
  const osc = e.ctx.createOscillator();
  osc.type = 'square';
  for (let i = 0; i * 0.025 < dur; i++) osc.frequency.setValueAtTime(i % 2 ? 1300 : 1040, at + i * 0.025);
  const lp = e.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(0.075, at + 0.015);
  g.gain.setValueAtTime(0.075, at + dur - 0.03);
  g.gain.linearRampToValueAtTime(0.0001, at + dur);
  osc.connect(lp).connect(g).connect(dest);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

// ── Ambience: control-room hum + faint distant radio chatter ────────────────

let ambNodes: AudioScheduledSourceNode[] = [];
let chatterTimer: ReturnType<typeof setTimeout> | null = null;

function startAmbience(e: Engine) {
  if (ambNodes.length) return;
  const { ctx } = e;
  const now = ctx.currentTime;
  // 50 Hz mains hum + harmonics (Europe), very low.
  const humLp = ctx.createBiquadFilter();
  humLp.type = 'lowpass';
  humLp.frequency.value = 420;
  humLp.connect(e.ambBus);
  for (const [f, gain] of [
    [50, 0.02],
    [100, 0.014],
    [150, 0.006],
    [200, 0.003],
  ] as const) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(humLp);
    o.start(now);
    ambNodes.push(o);
  }
  // Ventilation / server-room air: low-passed noise with a slow filter drift.
  const air = ctx.createBufferSource();
  air.buffer = e.noise;
  air.loop = true;
  const airLp = ctx.createBiquadFilter();
  airLp.type = 'lowpass';
  airLp.frequency.value = 520;
  const airG = ctx.createGain();
  airG.gain.value = 0.035;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 140;
  lfo.connect(lfoG).connect(airLp.frequency);
  air.connect(airLp).connect(airG).connect(e.ambBus);
  air.start(now);
  lfo.start(now);
  ambNodes.push(air, lfo);
  e.ambBus.gain.cancelScheduledValues(now);
  e.ambBus.gain.setTargetAtTime(1, now, 0.8);
  scheduleChatter(e, 2500 + Math.random() * 4000);
}

function stopAmbience(e: Engine) {
  if (chatterTimer) clearTimeout(chatterTimer);
  chatterTimer = null;
  const now = e.ctx.currentTime;
  e.ambBus.gain.cancelScheduledValues(now);
  e.ambBus.gain.setTargetAtTime(0, now, 0.25);
  const nodes = ambNodes;
  ambNodes = [];
  for (const n of nodes) {
    try {
      n.stop(now + 1.5);
    } catch {
      /* already stopped */
    }
  }
}

function scheduleChatter(e: Engine, delayMs: number) {
  if (chatterTimer) clearTimeout(chatterTimer);
  chatterTimer = setTimeout(() => {
    if (!ambienceWanted || !ambNodes.length) return;
    if (e.ctx.state === 'running') chatterBurst(e);
    scheduleChatter(e, 7000 + Math.random() * 16000);
  }, delayMs);
}

/** A muffled, far-away radio voice: formant-filtered buzz gated into "syllables", band-limited like a radio. */
function chatterBurst(e: Engine) {
  const { ctx } = e;
  const t = ctx.currentTime + 0.05;
  const dur = 0.8 + Math.random() * 1.8;
  const out = ctx.createGain();
  out.gain.value = 0.05 + Math.random() * 0.03;
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.4 - 0.7;
  out.connect(pan).connect(e.ambBus);

  const radio = ctx.createBiquadFilter();
  radio.type = 'bandpass';
  radio.frequency.value = 1500;
  radio.Q.value = 0.8;
  const gate = ctx.createGain();
  gate.gain.value = 0;
  radio.connect(gate).connect(out);

  const voice = ctx.createOscillator();
  voice.type = 'sawtooth';
  const base = 95 + Math.random() * 70;
  voice.frequency.setValueAtTime(base, t);
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.value = 3;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.Q.value = 4;
  voice.connect(f1).connect(radio);
  voice.connect(f2).connect(radio);

  // Syllables: random formants, pitch wobble and on/off gating at speech rate.
  let x = t;
  while (x < t + dur) {
    const syl = 0.07 + Math.random() * 0.12;
    const on = Math.random() > 0.18;
    voice.frequency.linearRampToValueAtTime(base * (0.85 + Math.random() * 0.35), x + syl);
    f1.frequency.setValueAtTime(350 + Math.random() * 500, x);
    f2.frequency.setValueAtTime(1100 + Math.random() * 1300, x);
    gate.gain.setTargetAtTime(on ? 1 : 0.05, x, 0.015);
    x += syl;
  }
  gate.gain.setTargetAtTime(0, x, 0.02);
  voice.start(t);
  voice.stop(x + 0.2);
  // Squelch at both ends.
  squelch(e, t - 0.02, 0.06, 0.25, out);
  squelch(e, x, 0.12, 0.22, out);
  noise(e, { at: t, dur: x - t, gain: 0.04, type: 'bandpass', freq: 2200, q: 0.5, attack: 0.02, shape: 'hold', dest: out });
}

// ── Public API ───────────────────────────────────────────────────────────────

export const sfx = {
  /** Must be called from a user gesture once (creates/resumes the AudioContext). */
  unlock(): void {
    if (!eng) eng = createEngine();
    if (!eng) return;
    const { ctx } = eng;
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    // Some browsers only unlock after a buffer is started inside the gesture.
    try {
      const b = ctx.createBufferSource();
      b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      b.connect(ctx.destination);
      b.start();
    } catch {
      /* ignore */
    }
    if (ambienceWanted) startAmbience(eng);
  },
  /** True once an AudioContext exists and is running. */
  isUnlocked(): boolean {
    return !!eng && eng.ctx.state === 'running';
  },
  setVolume(v: number): void {
    volume = v;
    if (eng) eng.master.gain.setTargetAtTime(volumeToGain(v), eng.ctx.currentTime, 0.03);
  },
  setEnabled(on: boolean): void {
    enabled = on;
    if (!eng) return;
    const now = eng.ctx.currentTime;
    eng.sfxBus.gain.setTargetAtTime(on ? 1 : 0, now, 0.02);
    eng.ringBus.gain.setTargetAtTime(on ? 1 : 0, now, 0.02);
  },
  play(name: SfxName, opts?: { gain?: number }): void {
    const e = eng;
    if (!e || !enabled || e.ctx.state !== 'running') return;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const last = lastPlayed.get(name) ?? -Infinity;
    if (nowMs - last < (MIN_GAP[name] ?? 50)) return;
    lastPlayed.set(name, nowMs);
    try {
      DESIGNS[name](e, e.ctx.currentTime + 0.01, opts?.gain ?? 1);
    } catch (err) {
      console.warn('[EPD] sfx failed', name, err);
    }
  },
  /** Start the looping phone ring (idempotent). */
  startRing(): void {
    const e = eng;
    if (!e || ringGain) return;
    ringGain = e.ctx.createGain();
    ringGain.gain.value = 1;
    ringGain.connect(e.ringBus);
    ringNext = e.ctx.currentTime + 0.02;
    const pump = () => {
      if (!ringGain || !eng) return;
      while (ringNext < eng.ctx.currentTime + 0.6) {
        ringBurst(eng, ringGain, ringNext, RING_CADENCE.on);
        ringNext += RING_CADENCE.on + RING_CADENCE.off;
      }
    };
    pump();
    ringTimer = setInterval(pump, 200);
  },
  stopRing(): void {
    if (ringTimer) clearInterval(ringTimer);
    ringTimer = null;
    const g = ringGain;
    ringGain = null;
    if (!g || !eng) return;
    const now = eng.ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0, now + 0.04);
    setTimeout(() => g.disconnect(), 200);
  },
  isRinging(): boolean {
    return ringGain !== null;
  },
  setAmbience(on: boolean): void {
    ambienceWanted = on;
    if (!eng || eng.ctx.state === 'closed') return;
    if (on) {
      if (eng.ctx.state === 'running') startAmbience(eng);
    } else stopAmbience(eng);
  },
};
