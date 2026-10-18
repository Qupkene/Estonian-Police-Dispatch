/**
 * Template scenarios (IncidentTemplate.scenarios): one coherent story per incident. The scenario is
 * picked once at spawn (spawner.ts) and stored as `Incident.scenarioId`; everything that reads the
 * template of an incident goes through `withScenario`, so the card, the 112 caller, the beats and
 * the outcomes all tell the same story.
 */
import type { IncidentScenario, IncidentTemplate } from './types';

const resolved = new WeakMap<IncidentTemplate, Map<string, IncidentTemplate>>();

/** The scenario with this id, if the template has it. */
export function scenarioOf(tpl: IncidentTemplate | undefined, scenarioId: string | undefined): IncidentScenario | undefined {
  if (!tpl?.scenarios?.length || !scenarioId) return undefined;
  return tpl.scenarios.find((sc) => sc.id === scenarioId);
}

/**
 * The template as the scenario tells it: the scenario's fields replace the template's, its tags are
 * added to the template's. Unknown or missing scenario ids (old saves) give the template itself.
 * Results are cached, so the same incident always gets the same object.
 */
export function withScenario(tpl: IncidentTemplate, scenarioId: string | undefined): IncidentTemplate;
export function withScenario(tpl: IncidentTemplate | undefined, scenarioId: string | undefined): IncidentTemplate | undefined;
export function withScenario(tpl: IncidentTemplate | undefined, scenarioId: string | undefined): IncidentTemplate | undefined {
  const sc = scenarioOf(tpl, scenarioId);
  if (!tpl || !sc) return tpl;
  let cache = resolved.get(tpl);
  if (!cache) {
    cache = new Map();
    resolved.set(tpl, cache);
  }
  let out = cache.get(sc.id);
  if (!out) {
    const { id: _id, weight: _weight, tags, ...fields } = sc;
    out = { ...tpl };
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
    if (tags?.length) out.tags = [...new Set([...(tpl.tags ?? []), ...tags])];
    // The story is told: the result is a plain template of its own.
    delete out.scenarios;
    cache.set(sc.id, out);
  }
  return out;
}
