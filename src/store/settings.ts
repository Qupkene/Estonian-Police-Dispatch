import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Lang } from '@/sim/types';
import { guardedPersist, normalizeSettings } from './migrate';
import { registerSpaceStore } from './space';

export type MapStyleKey = 'tactical' | 'dark' | 'maaamet' | 'foto';

export interface Settings {
  lang: Lang;
  volume: number; // 0..1 master
  sfx: boolean;
  radioVoice: boolean; // speech synthesis for radio
  ambience: boolean; // control-room background hum
  mapStyle: MapStyleKey;
  reducedMotion: boolean;
  theme: 'dark' | 'light';
  uiScale: number; // 0.85..1.25
  hints: boolean;
  colorblind: boolean;
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
}

/**
 * Version of the epd:settings envelope. 92ed7f5 wrote 1 and drops data of any other version: bump it only
 * with a step in SETTINGS_STEPS and a new golden fixture set (docs/DESIGN.md, "Salvestuste ühilduvus").
 * A new setting needs no bump: stored settings are merged over the defaults.
 */
export const SETTINGS_VERSION = 1;
/** SETTINGS_STEPS[v] turns a version v state into version v + 1. */
const SETTINGS_STEPS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {};

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      lang: 'et',
      volume: 0.7,
      sfx: true,
      radioVoice: false,
      ambience: true,
      mapStyle: 'dark',
      reducedMotion: false,
      theme: 'dark',
      uiScale: 1,
      hints: true,
      colorblind: false,
      set: (patch) => set(patch),
    }),
    guardedPersist<Settings>({
      name: 'epd:settings',
      slot: 'settings',
      version: SETTINGS_VERSION,
      steps: SETTINGS_STEPS,
      normalize: (stored, current, issues) => normalizeSettings(stored, current, issues),
    }),
  ),
);

// epd:settings for the guest, epd:acct:<id>:settings while an account is signed in (src/store/space.ts).
registerSpaceStore('settings', useSettings);
