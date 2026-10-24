/**
 * Regional stories: calls that belong to one prefecture's places and life (the ferry queues of Lääne, the
 * oil-shale towns of Ida, Peipsi's old-believer villages, the Tallinn port and old town). Each file holds one
 * prefecture's templates, all with `regions` set to it. Checked in tests/incidents-regional.test.ts.
 */
import type { IncidentTemplate } from '@/sim/types';
import { TEMPLATES_REGIONAL_POHJA } from './pohja';
import { TEMPLATES_REGIONAL_IDA } from './ida';
import { TEMPLATES_REGIONAL_LOUNA } from './louna';
import { TEMPLATES_REGIONAL_LAANE } from './laane';

export const TEMPLATES_REGIONAL_BY_REGION = {
  pohja: TEMPLATES_REGIONAL_POHJA,
  ida: TEMPLATES_REGIONAL_IDA,
  louna: TEMPLATES_REGIONAL_LOUNA,
  laane: TEMPLATES_REGIONAL_LAANE,
} as const;

export const TEMPLATES_REGIONAL: IncidentTemplate[] = [
  ...TEMPLATES_REGIONAL_POHJA,
  ...TEMPLATES_REGIONAL_IDA,
  ...TEMPLATES_REGIONAL_LOUNA,
  ...TEMPLATES_REGIONAL_LAANE,
];
