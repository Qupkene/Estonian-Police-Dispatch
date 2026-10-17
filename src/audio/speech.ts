// Speech synthesis for radio traffic (Web Speech API). Owned by ui-shell. Keep the exported signatures.
// Estonian uses an 'et-EE' (or any 'et*') system voice when one exists — otherwise Estonian text is NOT
// spoken (an English voice reading Estonian sounds wrong). English uses en-GB → en-US → any en.
import { sfx } from './sfx';

export interface VoiceLike {
  lang: string;
  name: string;
  localService?: boolean;
  default?: boolean;
}

const EN_ORDER = ['en-gb', 'en-ie', 'en-us', 'en-au', 'en-ca'];

const norm = (l: string) => l.toLowerCase().replace('_', '-');

/** Best voice for a UI language (pure — exported for tests). */
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
    .replace(/[^\p{L}\p{N}\s.,:;!?()+\-–/%€]/gu, ' ')
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

/** Subscribe to voice-list changes (voices load asynchronously in most browsers). */
export function onVoicesChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Name of the voice that would be used, or null. */
export function voiceName(lang: 'et' | 'en'): string | null {
  if (!voices.length) refresh();
  return pickVoice(voices, lang)?.name ?? null;
}

export function speechAvailable(lang: 'et' | 'en'): boolean {
  if (!synth()) return false;
  if (!voices.length) refresh();
  return pickVoice(voices, lang) !== null;
}

export function speak(
  text: string,
  lang: 'et' | 'en',
  opts?: { rate?: number; pitch?: number; radio?: boolean; volume?: number },
): void {
  const s = synth();
  if (!s || !text) return;
  if (!voices.length) refresh();
  const voice = pickVoice(voices, lang);
  if (!voice) return;
  // Radio traffic must stay current: drop lines instead of building a backlog.
  if (opts?.radio && pending >= 2) return;
  const u = new SpeechSynthesisUtterance(speechText(text));
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = opts?.rate ?? (opts?.radio ? 1.12 : 1);
  u.pitch = opts?.pitch ?? (opts?.radio ? 0.92 : 1);
  u.volume = Math.max(0, Math.min(1, opts?.volume ?? 1));
  pending++;
  const done = () => {
    pending = Math.max(0, pending - 1);
    if (opts?.radio) sfx.play('radioOut', { gain: 0.8 });
  };
  u.onend = done;
  u.onerror = () => {
    pending = Math.max(0, pending - 1);
  };
  if (opts?.radio) {
    u.onstart = () => sfx.play('radioIn', { gain: 0.8 });
  }
  try {
    s.speak(u);
  } catch {
    pending = Math.max(0, pending - 1);
  }
}

export function stopSpeech(): void {
  const s = synth();
  pending = 0;
  try {
    s?.cancel();
  } catch {
    /* ignore */
  }
}
