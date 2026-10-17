import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Lang } from '@/sim/types';

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
    { name: 'epd:settings', version: 1 },
  ),
);
