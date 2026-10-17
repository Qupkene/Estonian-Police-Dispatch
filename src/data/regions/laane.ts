// PLACEHOLDER — owned by regions-* agent. Replace with the full region definition.
import type { RegionDef } from '@/sim/types';

export const REGION_LAANE: RegionDef = {
  id: 'laane',
  name: { et: 'laane', en: 'laane' },
  short: 'LAANE',
  hqCity: '',
  counties: [],
  center: [24.75, 59.43],
  zoom: 9,
  bounds: [
    [21.5, 57.5],
    [28.3, 59.8],
  ],
  description: { et: '', en: '' },
  callVolume: 3,
  zones: [{ id: 'mainland', name: { et: 'Mandriosa', en: 'Mainland' }, ferryMinutes: 0 }],
  stations: [],
  arrestHouseId: '',
  roster: [],
  towns: [],
  streets: [],
  places: [],
  radioName: 'laane',
};
