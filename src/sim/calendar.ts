// STUB — owned by engine-systems. Keep these signatures.
import type { Text } from './types';

/** Multiplier on call volume for the hour of day 0..23 (peaks around 22–02). */
export function hourCurve(_hour: number): number {
  return 1;
}
/** Multiplier for weekday/weekend (Friday & Saturday evenings higher). */
export function weekdayFactor(_t: number): number {
  return 1;
}
/** Estonian holiday / special-day info for time t. */
export function dayInfo(_t: number): { holiday?: Text; factor: number; tags: string[] } {
  return { factor: 1, tags: [] };
}
