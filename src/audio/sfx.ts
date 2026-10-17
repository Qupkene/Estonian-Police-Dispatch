// STUB — owned by ui-shell (audio). Keep these signatures.
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

export const sfx = {
  /** Must be called from a user gesture once (creates/resumes the AudioContext). */
  unlock(): void {},
  setVolume(_v: number): void {},
  setEnabled(_on: boolean): void {},
  play(_name: SfxName): void {},
  startRing(): void {},
  stopRing(): void {},
  setAmbience(_on: boolean): void {},
};
