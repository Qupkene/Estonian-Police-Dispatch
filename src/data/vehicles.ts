// STUB — owned by registry-data. Keep these export names.
import type { Text, VehicleKind } from '@/sim/types';

export interface CarModel {
  make: string;
  model: string;
  kind: VehicleKind;
  weight: number;
  years: [number, number];
  /** Relative theft attractiveness. */
  theft?: number;
}
export const CAR_MODELS: CarModel[] = [];
export const COLORS: (Text & { weight: number })[] = [];
export const INSURERS: string[] = [];
