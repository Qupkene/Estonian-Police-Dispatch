// STUB — owned by engine-systems. Keep these export names.
import type { Achievement, CatalogVehicle, Rank, RegionId, Upgrade } from '@/sim/types';

export const UPGRADES: Upgrade[] = [];
export const VEHICLE_CATALOG: CatalogVehicle[] = [];
export const RANKS: Rank[] = [];
export const ACHIEVEMENTS: Achievement[] = [];
/** Daily base budget per prefecture (€). */
export const DAILY_BUDGET: Record<RegionId, number> = { pohja: 1600, ida: 1200, louna: 1200, laane: 1100 };
export const START_MONEY = 10000;
export const START_REPUTATION = 25;
