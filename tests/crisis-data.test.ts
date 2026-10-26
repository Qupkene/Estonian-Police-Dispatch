/**
 * The crises' task templates (src/data/crises, 2.37.0) pass the same checks as every hand-written incident file
 * (tests/fixtures/incidentSuite.ts), with weight 0: only a crisis opens them. EPD_CRISIS=bus checks one scenario.
 */
import { CRISES } from '@/data/crises';
import { incidentSuite } from './fixtures/incidentSuite';

const ONLY = process.env.EPD_CRISIS;
for (const sc of CRISES.filter((c) => !ONLY || c.id === ONLY))
  incidentSuite(
    `crisis ${sc.id}`,
    [...sc.tasks, ...sc.followUps].map((t) => t.template),
    { spawns: false },
  );
