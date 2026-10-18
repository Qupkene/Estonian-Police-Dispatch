// Speech synthesis for radio traffic. Owned by ui-shell. Keep the exported signatures.
//
// Estonian: the neural voice from the game's own server (TartuNLP Neurokõne via POST /api/tts,
// src/audio/neurokone.ts), one line at a time with a radio sound. When the server is not there or the
// clip cannot be had, an 'et-EE' (or any 'et*') browser voice reads the line; without one Estonian text
// is NOT spoken (an English voice reading Estonian sounds wrong). English uses the browser voice:
// en-GB → en-US → any en. Radio lines in both languages wait in the same queue, so cancelSpeech()
// can drop or cut a line the player has already acted on.
import { sfx } from './sfx';
import { cancelTts, limitTtsQueue, NEUROKONE_NAME, onTtsChange, say, stopTts, ttsReady, ttsTags } from './neurokone';
import type { SpeechTag } from './radioSpeech';
import { ttsText, ttsVoice, type TtsSpeaker } from './ttsText';

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  radio?: boolean;
  /** Web Speech volume 0..1. The server voice plays through the master volume instead. */
  volume?: number;
  /** Who is talking (radio sender, crew gender): picks the Estonian server voice. */
  speaker?: TtsSpeaker;
  /** What the radio line is about (cancelSpeech drops it when the player has acted on it). */
  tag?: SpeechTag;
  /** Radio lines that may wait behind the one playing when this one is queued. */
  maxWaiting?: number;
  /** Called when the line is cut while being heard and nothing else waits (see neurokone onCut). */
  onCut?: () => void;
  /** Speak before the waiting lines (a short acknowledgement). */
  first?: boolean;
}

export interface VoiceLike {
  lang: string;
  name: string;
  localService?: boolean;
  default?: boolean;
}

const EN_ORDER = ['en-gb', 'en-ie', 'en-us', 'en-au', 'en-ca'];

const norm = (l: string) => l.toLowerCase().replace('_', '-');

/** Best voice for a UI language (pure, exported for tests). */
export function pickVoice<V extends VoiceLike>(list: readonly V[], lang: 'et' | 'en'): V | null {
  if (!list?.length) return null;
  if (lang === 'et') {
    const exact = list.filter((v) => norm(v.lang) === 'et-ee');
    const any = exact.length ? exact : list.filter((v) => norm(v.lang).startsWith('et'));
    if (!any.length) return null;
    return any.find((v) => v.localService) ?? any[0];
  }
  const en = list.filter((v) => norm(v.lang).startsWith('en'));
  if (!en.length) return null;
  const rank = (v: V) => {
    const i = EN_ORDER.indexOf(norm(v.lang));
    return (i < 0 ? EN_ORDER.length : i) * 2 + (v.localService ? 0 : 1);
  };
  return [...en].sort((a, b) => rank(a) - rank(b))[0];
}

/** Trim radio text for speech: drop bracketed notes, symbols, and cut long lines at a sentence end. */
export function speechText(text: string, max = 170): string {
  let s = text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[«»"„“”]/g, '')
    .replace(/[^\p{L}\p{N}\s.,:;!?()+\--/%€]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > max) {
    const cut = s.slice(0, max);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    s = end > 40 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
  }
  return s;
}

let voices: SpeechSynthesisVoice[] = [];
const listeners = new Set<() => void>();
let pending = 0;

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

/** Re-read the voice list. Only the browser's 'voiceschanged' event notifies listeners (never during render). */
function refresh(notify = false) {
  const s = synth();
  if (!s) return;
  try {
    voices = s.getVoices();
  } catch {
    voices = [];
  }
  if (notify) listeners.forEach((l) => l());
}

const onChanged = () => refresh(true);

if (typeof window !== 'undefined') {
  const s = synth();
  if (s) {
    refresh();
    if (typeof s.addEventListener === 'function') s.addEventListener('voiceschanged', onChanged);
    else (s as SpeechSynthesis & { onvoiceschanged: (() => void) | null }).onvoiceschanged = onChanged;
  }
}
// The server voice coming or going changes what Settings shows, like a new browser voice does.
onTtsChange(() => listeners.forEach((l) => l()));

/** Subscribe to voice-list changes (voices load asynchronously in most browsers). */
export function onVoicesChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Name of the voice that would be used, or null. */
export function voiceName(lang: 'et' | 'en'): string | null {
  if (lang === 'et' && ttsReady()) return NEUROKONE_NAME;
  if (!voices.length) refresh();
  return pickVoice(voices, lang)?.name ?? null;
}

export function speechAvailable(lang: 'et' | 'en'): boolean {
  if (lang === 'et' && ttsReady()) return true;
  if (!synth()) return false;
  if (!voices.length) refresh();
  return pickVoice(voices, lang) !== null;
}

/** Web Speech. False when nothing is spoken; `onDone` runs when the utterance ends either way. */
function webSpeak(text: string, lang: 'et' | 'en', opts: SpeakOptions | undefined, onDone?: () => void): boolean {
  const s = synth();
  if (!s || !text) return false;
  if (!voices.length) refresh();
  const voice = pickVoice(voices, lang);
  if (!voice) return false;
  // Radio traffic must stay current: drop lines instead of building a backlog.
  if (opts?.radio && pending >= 2) return false;
  const u = new SpeechSynthesisUtterance(speechText(text));
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = opts?.rate ?? (opts?.radio ? 1.12 : 1);
  u.pitch = opts?.pitch ?? (opts?.radio ? 0.92 : 1);
  u.volume = Math.max(0, Math.min(1, opts?.volume ?? 1));
  pending++;
  let finished = false;
  const finish = (ok: boolean) => {
    if (finished) return;
    finished = true;
    pending = Math.max(0, pending - 1);
    if (ok && opts?.radio) sfx.play('radioOut', { gain: 0.8 });
    onDone?.();
  };
  u.onend = () => finish(true);
  u.onerror = () => finish(false);
  if (opts?.radio) {
    u.onstart = () => sfx.play('radioIn', { gain: 0.8 });
  }
  try {
    s.speak(u);
  } catch {
    finish(false);
    return false;
  }
  return true;
}

/**
 * Web Speech as a fallback of the queue: `run` resolves when the line is over (at most 20 s),
 * `stop` cuts it short.
 */
function webSpeakDone(text: string, lang: 'et' | 'en', opts: SpeakOptions | undefined): { run: () => Promise<void>; stop: () => void } {
  let finish: (() => void) | null = null;
  let speaking = false;
  return {
    run: () =>
      new Promise((resolve) => {
        const timer = setTimeout(() => done(), 20_000);
        const done = () => {
          clearTimeout(timer);
          finish = null;
          speaking = false;
          resolve();
        };
        finish = done;
        speaking = webSpeak(text, lang, opts, done);
        if (!speaking) done();
      }),
    stop: () => {
      if (speaking) {
        try {
          synth()?.cancel();
        } catch {
          /* ignore */
        }
        pending = 0;
      }
      finish?.();
    },
  };
}

export function speak(text: string, lang: 'et' | 'en', opts?: SpeakOptions): void {
  if (!text) return;
  const radio = !!opts?.radio;
  if (lang === 'et' || radio) {
    // Every Estonian line, and every radio line, goes through one queue, so the server voice and the
    // browser voice never talk over each other and a stale line can be dropped. English never asks
    // the server; neither does Estonian when the server voice is known to be unusable (empty text).
    const { voice, speed } = ttsVoice(opts?.speaker, radio);
    const web = webSpeakDone(text, lang, opts);
    say({
      text: lang !== 'et' || ttsReady() === false ? '' : ttsText(text),
      voice,
      speed,
      radio,
      fallback: web.run,
      stopFallback: web.stop,
      tag: opts?.tag,
      maxWaiting: opts?.maxWaiting,
      onCut: opts?.onCut,
      first: opts?.first,
    });
    return;
  }
  webSpeak(text, lang, opts);
}

/** Drop waiting radio lines whose tag matches and cut the one that plays if it matches. */
export function cancelSpeech(match: (tag: SpeechTag) => boolean): number {
  return cancelTts(match);
}

/** Tags of the radio line that plays and the waiting ones. */
export function speechTags(): SpeechTag[] {
  return ttsTags();
}

/** Keep at most `max` radio lines waiting. */
export function limitSpeechQueue(max: number): void {
  limitTtsQueue(max);
}

export function stopSpeech(): void {
  stopTts();
  const s = synth();
  pending = 0;
  try {
    s?.cancel();
  } catch {
    /* ignore */
  }
}
