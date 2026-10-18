// Connects the game (events, calls, radio) and settings to the synthesiser. Renders nothing.
// Owned by ui-shell.
import { useEffect } from 'react';
import { onGameEvents, useGame } from '@/store/game';
import { useSettings } from '@/store/settings';
import type { GameEvent, RadioMsg, SimState } from '@/sim/types';
import { t } from '@/i18n';
import { isStale, maxWaitingAt, pickAck, pickSpoken, speakableAt, voiceSpeedIndex, type SpeechTag } from './radioSpeech';
import { sfx } from './sfx';
import { cancelSpeech, limitSpeechQueue, speak, stopSpeech } from './speech';

/** Selector for UI elements that make a (very subtle) click sound. */
const CLICK_SEL = '.ui-btn, .ui-iconbtn, .ui-tab, .ui-seg__opt, [data-sfx="click"]';
const HOVER_SEL = '[data-sfx-hover]';

// ── Radio scanning state (module-level: one bridge per app) ─────────────────

let simRef: SimState | null = null;
let radioCursorT = 0;
let radioSeenAtCursor = new Set<string>();
let lastRadioSfx = 0;
const answered = new Set<string>();
const ended = new Set<string>();

function resetForSim(sim: SimState | null) {
  simRef = sim;
  radioCursorT = sim ? sim.now : 0;
  radioSeenAtCursor = new Set(sim ? sim.radio.filter((m) => m.t === sim.now).map((m) => m.id) : []);
  answered.clear();
  ended.clear();
  if (sim)
    for (const c of sim.calls) {
      if (c.answeredAt) answered.add(c.id);
      if (c.endedAt) ended.add(c.id);
    }
}

/** New radio messages since the last scan (newest last). */
function takeNewRadio(sim: SimState): RadioMsg[] {
  const out: RadioMsg[] = [];
  for (let i = sim.radio.length - 1; i >= 0; i--) {
    const m = sim.radio[i];
    if (m.t < radioCursorT) break;
    if (m.t === radioCursorT && radioSeenAtCursor.has(m.id)) continue;
    out.push(m);
  }
  out.reverse();
  for (const m of out) {
    if (m.t > radioCursorT) {
      radioCursorT = m.t;
      radioSeenAtCursor = new Set();
    }
    radioSeenAtCursor.add(m.id);
  }
  return out;
}

function handleEvents(events: GameEvent[]) {
  const g = useGame.getState();
  const sim = g.sim;
  if (!sim || g.screen !== 'game') return;
  if (sim !== simRef) resetForSim(sim);
  const has = (t: GameEvent['type']) => events.some((e) => e.type === t);

  if (has('incident_p1')) sfx.play('p1Alert');
  else if (has('incident_new')) sfx.play('newIncident');
  if (has('incident_escalated')) sfx.play('escalated');
  if (has('call_ring')) sfx.startRing();
  if (has('call_missed')) sfx.stopRing();
  if (has('radio_emergency')) sfx.play('emergency');
  if (has('pursuit_start')) sfx.play('pursuit');
  if (has('achievement')) sfx.play('achievement');
  if (has('shift_end')) sfx.play('resolved');
  if (has('unit_arrived')) sfx.play('radioOut', { gain: 0.4 });

  if (has('radio') || has('radio_emergency')) {
    const all = takeNewRadio(sim);
    const fresh = all.filter((m) => m.from !== 'JK');
    const now = performance.now();
    if (fresh.some((m) => m.kind === 'backup' && !m.answered)) sfx.play('backup');
    else if (fresh.length && !has('radio_emergency') && now - lastRadioSfx > 1500) {
      lastRadioSfx = now;
      sfx.play('radioIn', { gain: fresh.some((m) => m.level !== 'routine') ? 1 : 0.7 });
    }
    const st = useSettings.getState();
    const speed = voiceSpeedIndex(g);
    if (st.radioVoice && speed > 0) {
      // Speak only the most important fresh line that fits the game speed, to keep the voice current
      // (the dispatcher's own lines only when nothing else came in).
      const pick = pickSpoken(sim, fresh.length ? fresh : all, speed);
      if (pick) {
        const speaker = speakerOf(sim, pick.msg);
        const isUnit = !!pick.msg.unitId && pick.msg.from !== 'JK' && pick.msg.from !== 'HK';
        speak(radioLine(pick.msg, st.lang), st.lang, {
          radio: true,
          volume: Math.min(1, st.volume + 0.2),
          speaker,
          tag: pick.tag,
          maxWaiting: maxWaitingAt(speed),
          onCut: isUnit ? () => ackAfterCut(speaker) : undefined,
        });
      }
    }
  }
}

let voiceSpeed = -1;
let lastAck: string | undefined;

/**
 * The unit's line was cut mid-speech because the player already handled it: sometimes a short
 * "Ee, selge." in the same voice, sometimes silence. Spoken only, not added to the radio log.
 */
function ackAfterCut(speaker: { from: string; gender?: 'M' | 'F' }): void {
  const st = useSettings.getState();
  if (!st.radioVoice || useGame.getState().screen !== 'game') return;
  // cancelTts only calls this when nothing else waits.
  const ack = pickAck(st.lang, { speedIndex: voiceSpeed, waiting: 0, last: lastAck });
  if (!ack) return;
  lastAck = ack;
  speak(ack, st.lang, { radio: true, volume: Math.min(1, st.volume + 0.2), speaker });
}

/**
 * Keep the radio voice in step with the game (every UI tick and command): silent while paused, only
 * what still matters when the speed goes up, and never a line the player has already acted on.
 */
function syncRadioVoice(sim: SimState | null, speed: number): void {
  const prev = voiceSpeed;
  voiceSpeed = speed;
  if (!sim) return;
  if (speed <= 0) {
    if (prev !== 0) stopSpeech();
    return;
  }
  if (speed > prev && prev > 0) {
    cancelSpeech((tag: SpeechTag) => !speakableAt(tag.prio, speed));
    const max = maxWaitingAt(speed);
    if (max !== undefined) limitSpeechQueue(max);
  }
  cancelSpeech((tag: SpeechTag) => isStale(sim, tag));
}

/**
 * Spoken form of a radio message: the sender is prefixed unless the text already names it, in full
 * ("PÕHJA 51") or by its short form at the start ("51: sihtkohas").
 */
function radioLine(m: RadioMsg, lang: 'et' | 'en'): string {
  const body = m.text[lang] || m.text.et;
  const from = m.from === 'HK' ? t('shell.audio.hk', lang) : m.from;
  const lower = body.toLowerCase();
  if (lower.includes(m.from.toLowerCase())) return body;
  const short = m.from.split(/\s+/).slice(1).join(' ').toLowerCase();
  if (/\d/.test(short) && lower.startsWith(short) && /^$|[\s,:.]/.test(lower.charAt(short.length))) return body;
  return `${from}: ${body}`;
}

/** Who talks: the sender, and for a unit its crew leader's gender (picks the Estonian voice). */
function speakerOf(sim: SimState, m: RadioMsg): { from: string; gender?: 'M' | 'F' } {
  if (m.from === 'JK' || m.from === 'HK' || !m.unitId) return { from: m.from };
  return { from: m.from, gender: sim.units[m.unitId]?.crew?.[0]?.gender };
}

/** Ring while any 112 call waits; pickup/hang-up sounds when calls change state. */
function watchCalls(sim: SimState | null, screen: string) {
  if (!sim || screen !== 'game') {
    if (sfx.isRinging()) sfx.stopRing();
    return;
  }
  if (sim !== simRef) resetForSim(sim);
  const ringing = sim.calls.some((c) => !c.answeredAt && !c.endedAt);
  if (ringing && !sfx.isRinging()) sfx.startRing();
  else if (!ringing && sfx.isRinging()) sfx.stopRing();
  for (const c of sim.calls) {
    if (c.answeredAt && !answered.has(c.id)) {
      answered.add(c.id);
      sfx.play('phonePickup');
    }
    if (c.endedAt && !ended.has(c.id)) {
      ended.add(c.id);
      if (c.answeredAt) sfx.play('phoneHangup');
    }
  }
}

export function AudioBridge() {
  const volume = useSettings((s) => s.volume);
  const sfxOn = useSettings((s) => s.sfx);
  const radioVoice = useSettings((s) => s.radioVoice);
  const ambience = useSettings((s) => s.ambience);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const screen = useGame((s) => s.screen);

  useEffect(() => sfx.setVolume(volume), [volume]);
  useEffect(() => sfx.setEnabled(sfxOn), [sfxOn]);
  useEffect(() => sfx.setAmbience(ambience && screen === 'game'), [ambience, screen]);

  // Global reduced-motion switch for every module (App sets theme/colourblind; this sets motion).
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
  }, [reducedMotion]);

  // Switching the radio voice off silences it at once (also a line that is still playing).
  useEffect(() => {
    if (!radioVoice) stopSpeech();
  }, [radioVoice]);

  // Leaving the shift silences the phone and the radio voice.
  useEffect(() => {
    if (screen !== 'game') {
      sfx.stopRing();
      stopSpeech();
    }
  }, [screen]);

  // Unlock audio on the first gesture anywhere (and again if the browser suspended it).
  useEffect(() => {
    const onGesture = () => {
      if (sfx.isUnlocked()) return;
      sfx.unlock();
      const s = useSettings.getState();
      sfx.setVolume(s.volume);
      sfx.setEnabled(s.sfx);
      sfx.setAmbience(s.ambience && useGame.getState().screen === 'game');
    };
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    return () => {
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
    };
  }, []);

  // Delegated UI click / hover ticks.
  useEffect(() => {
    let lastHover: Element | null = null;
    const onDown = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(CLICK_SEL);
      if (el && !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true')
        sfx.play('click');
    };
    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(HOVER_SEL) ?? null;
      if (el !== lastHover) {
        lastHover = el;
        if (el) sfx.play('hover');
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('mouseover', onOver, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('mouseover', onOver, true);
    };
  }, []);

  // Engine events → sounds.
  useEffect(() => onGameEvents(handleEvents), []);

  // Calls are watched every UI tick (ring until answered or missed); the radio voice drops lines
  // that went stale and follows the game speed.
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        if (s.sim !== prev.sim) resetForSim(s.sim);
        if (s.tick !== prev.tick || s.sim !== prev.sim || s.screen !== prev.screen)
          watchCalls(s.sim, s.screen);
        if (s.screen === 'game' && (s.tick !== prev.tick || s.sim !== prev.sim || s.speedIndex !== prev.speedIndex || s.realtime !== prev.realtime))
          syncRadioVoice(s.sim, voiceSpeedIndex(s));
      }),
    [],
  );

  return null;
}
