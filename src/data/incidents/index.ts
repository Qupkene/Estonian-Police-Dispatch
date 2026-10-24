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
];

export const TEMPLATE_BY_ID: Record<string, IncidentTemplate> = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
