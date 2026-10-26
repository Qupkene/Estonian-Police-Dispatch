import type { IncidentTemplate } from '@/sim/types';
import { TEMPLATES_VIOLENCE } from './violence';
import { TEMPLATES_DOMESTIC } from './domestic';
import { TEMPLATES_PUBLIC_ORDER } from './public_order';
import { TEMPLATES_DRUGS } from './drugs';
import { TEMPLATES_PROPERTY } from './property';
import { TEMPLATES_FRAUD } from './fraud';
import { TEMPLATES_ALARM } from './alarm';
import { TEMPLATES_ENVIRONMENT } from './environment';
import { TEMPLATES_BORDER } from './border';
import { TEMPLATES_EASTER } from './easter';
import { TEMPLATES_TRAFFIC } from './traffic';
import { TEMPLATES_MISSING } from './missing';
import { TEMPLATES_ASSIST } from './assist';
import { TEMPLATES_MAJOR } from './major';
import { TEMPLATES_ESCALATING } from './escalating';
import { TEMPLATES_STORIES } from './stories';
import { TEMPLATES_REGIONAL } from './regional';
import { TEMPLATES_CELEBRITY } from './celebrity';
import { CRISIS_TEMPLATES } from '../crises';

export const TEMPLATES: IncidentTemplate[] = [
  ...TEMPLATES_VIOLENCE,
  ...TEMPLATES_DOMESTIC,
  ...TEMPLATES_PUBLIC_ORDER,
  ...TEMPLATES_DRUGS,
  ...TEMPLATES_PROPERTY,
  ...TEMPLATES_FRAUD,
  ...TEMPLATES_ALARM,
  ...TEMPLATES_ENVIRONMENT,
  ...TEMPLATES_BORDER,
  ...TEMPLATES_EASTER,
  ...TEMPLATES_TRAFFIC,
  ...TEMPLATES_MISSING,
  ...TEMPLATES_ASSIST,
  ...TEMPLATES_MAJOR,
  ...TEMPLATES_ESCALATING,
  ...TEMPLATES_STORIES,
  ...TEMPLATES_REGIONAL,
  ...TEMPLATES_CELEBRITY,
];

/**
 * Every template by id: the ones that spawn, and the crises' task templates (src/data/crises, weight 0), which only a
 * crisis opens (src/sim/crisis.ts) and which never take part in the spawner's draw (it reads TEMPLATES).
 */
export const TEMPLATE_BY_ID: Record<string, IncidentTemplate> = Object.fromEntries(
  [...TEMPLATES, ...CRISIS_TEMPLATES].map((t) => [t.id, t]),
);
