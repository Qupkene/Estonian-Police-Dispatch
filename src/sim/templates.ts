// The incident catalogue (src/data/incidents, about 2 MB of templates) is not part of the start: it loads before the
// first shift (loadTemplates; the menus fetch it in idle time, src/app/App.tsx) and registers itself here as its module
// runs. The simulation reads it through src/sim/internal.ts; the game server and the tests import it outright.
import type { IncidentTemplate } from './types';

let list: IncidentTemplate[] | null = null;
let byId: Record<string, IncidentTemplate> = {};

/** Called by src/data/incidents/index.ts as it loads. */
export function registerTemplates(all: IncidentTemplate[], map: Record<string, IncidentTemplate>): void {
  list = all;
  byId = map;
}

export function templatesLoaded(): boolean {
  return list !== null;
}

let loading: Promise<void> | null = null;

/** The catalogue, loaded once; a failed load is tried again on the next call. */
export function loadTemplates(): Promise<void> {
  if (list) return Promise.resolve();
  return (loading ??= import('@/data/incidents').then(
    () => undefined,
    (err: unknown) => {
      loading = null;
      throw err;
    },
  ));
}

function need(): void {
  if (!list)
    throw new Error('The incident catalogue is not loaded yet (src/sim/templates.ts loadTemplates).');
}

/** Every template by id (the spawned ones and the crises' tasks). */
export function templateMap(): Record<string, IncidentTemplate> {
  need();
  return byId;
}

/** The templates the spawner draws from. */
export function templateList(): IncidentTemplate[] {
  need();
  return list!;
}
