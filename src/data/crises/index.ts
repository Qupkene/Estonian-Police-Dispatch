/**
 * Suurõnnetused (2.37.0, docs/CRISIS.md): the crisis scenarios. Each file is one scenario with its tasks' incident
 * templates (weight 0: they never spawn by themselves), its follow-ups and its staff decisions.
 */
import type { CrisisScenario } from '@/sim/crisis';
import type { IncidentTemplate } from '@/sim/types';
import { BUS } from './bus';
import { FOREST } from './forest';
import { MALL } from './mall';
import { PLANE } from './plane';

export const CRISES: CrisisScenario[] = [BUS, PLANE, FOREST, MALL];

const BY_ID = new Map(CRISES.map((c) => [c.id, c]));

export function crisisById(id: string): CrisisScenario | undefined {
  return BY_ID.get(id);
}

/** Every task's template (follow-ups too), registered with the other templates by id (src/data/incidents). */
export const CRISIS_TEMPLATES: IncidentTemplate[] = CRISES.flatMap((c) =>
  [...c.tasks, ...c.followUps].map((t) => t.template),
);
