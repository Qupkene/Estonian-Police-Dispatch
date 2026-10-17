import type { RegionDef, RegionId } from '@/sim/types';
import { REGION_POHJA } from './pohja';
import { REGION_IDA } from './ida';
import { REGION_LOUNA } from './louna';
import { REGION_LAANE } from './laane';

export const REGIONS: Record<RegionId, RegionDef> = {
  pohja: REGION_POHJA,
  ida: REGION_IDA,
  louna: REGION_LOUNA,
  laane: REGION_LAANE,
};

export const REGION_IDS: RegionId[] = ['pohja', 'ida', 'louna', 'laane'];

/** Prefecture responsible for a county name as written in geoBoundaries ("Harju maakond"). */
export function regionForCounty(county: string): RegionId | undefined {
  return REGION_IDS.find((id) => REGIONS[id].counties.includes(county));
}
