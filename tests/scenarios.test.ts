/**
 * Template scenarios (one coherent story per incident) and the spawner's repetition memory.
 * The owner's feedback: domestic calls kept telling the same story ("the son or the partner hits
 * someone and hides in the closet"). Each frequent template now has several scenarios that change
 * who is involved, the trigger, the caller and what the patrol finds; the shift remembers what it
 * already told and avoids telling it again.
 */
import { describe, expect, it } from 'vitest';
import { TEMPLATES, TEMPLATE_BY_ID } from '@/data/incidents';
import { situationOf } from '@/sim/calls';
import { bandFits } from '@/sim/callPhrases';
import { createShift, step } from '@/sim/engine';
import { incidentVars } from '@/sim/incidents';
import { tplOf } from '@/sim/internal';
import { Rng } from '@/sim/rng';
import { withScenario } from '@/sim/scenario';
import {
  createIncident,
  pickScenario,
  pickTemplate,
  recentTemplateIds,
  rememberIncident,
  repetitionFactor,
  RECENT_TEMPLATE_FACTOR,
  RECENT_TEMPLATES,
  seenScenarios,
} from '@/sim/spawner';
import { TEMPLATE_PLACEHOLDERS } from '@/sim/text';
import { MIN, tallinnTime } from '@/sim/time';
import type { Incident, IncidentTemplate, OutcomeSpec, RegionId, SimState } from '@/sim/types';

const ALLOWED = new Set<string>(TEMPLATE_PLACEHOLDERS);
const DASHES = new RegExp('[\\u2013\\u2014]');

function shift(seed = 7, regionId: RegionId = 'pohja', startHour = 19, hours = 12): SimState {
  return createShift({ seed, regionId, mode: 'free', difficulty: 'normal', start: tallinnTime(2026, 10, 16, startHour, 0), hours, playerName: 'Test' });
}

/** Every string anywhere inside a value, with a path for error messages. */
function strings(v: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof v === 'string') out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out);
  return out;
}

const eligible = (o: OutcomeSpec, s: number) => (o.minSuccess ?? 0) <= s + 1e-9 && s <= (o.maxSuccess ?? 1) + 1e-9;

const WITH_SCENARIOS = TEMPLATES.filter((t) => t.scenarios?.length);

// ─────────────────────────────────────────────────────────────────────────────
// Mechanism
// ─────────────────────────────────────────────────────────────────────────────

const BASE: IncidentTemplate = {
  id: 'x_story',
  category: 'domestic',
  code: 'LSV',
  title: { et: 'Alus', en: 'Base' },
  priority: 2,
  weight: 1,
  places: ['residential'],
  units: { need: [{ type: 'patrol', count: 1 }] },
  onScene: [20, 30],
  persons: [{ role: 'victim', gender: 'F', age: [30, 40] }, { role: 'suspect', gender: 'M', age: [30, 40], relation: 'partner' }],
  summary: [{ et: '{address}. Alus.', en: '{address}. Base.' }],
  outcomes: [{ id: 'ok', weight: 1, result: 'resolved', text: { et: 'Korras.', en: 'Done.' } }],
  tags: ['dv'],
  scenarios: [
    { id: 'a', title: { et: 'Lugu A', en: 'Story A' }, summary: [{ et: '{address}. Lugu A.', en: '{address}. Story A.' }], tags: ['alpha'], callerRole: 'suspect' },
    { id: 'b', summary: [{ et: '{address}. Lugu B.', en: '{address}. Story B.' }], callerRole: 'victim' },
    { id: 'c', weight: 0.5, summary: [{ et: '{address}. Lugu C.', en: '{address}. Story C.' }] },
  ],
};

describe('scenario mechanism', () => {
  it('withScenario overrides the given fields, adds tags and caches the result', () => {
    const a = withScenario(BASE, 'a');
    expect(a.title.et).toBe('Lugu A');
    expect(a.summary[0].et).toBe('{address}. Lugu A.');
    expect(a.tags).toEqual(['dv', 'alpha']);
    expect(a.outcomes).toBe(BASE.outcomes);
    expect(a.id).toBe(BASE.id);
    expect(withScenario(BASE, 'a')).toBe(a);
    const b = withScenario(BASE, 'b');
    expect(b.title).toBe(BASE.title);
    expect(b.tags).toEqual(['dv']);
    // Old saves (no scenario) and unknown ids read the template itself.
    expect(withScenario(BASE, undefined)).toBe(BASE);
    expect(withScenario(BASE, 'gone')).toBe(BASE);
    expect(withScenario(undefined, 'a')).toBeUndefined();
  });

  it('createIncident picks one scenario, stores its id and tells its story', () => {
    const s = shift();
    const inc = createIncident(s, BASE);
    expect(['a', 'b', 'c']).toContain(inc.scenarioId);
    const told = withScenario(BASE, inc.scenarioId);
    expect(inc.title).toEqual(told.title);
    expect(inc.summary.et).toBe(told.summary[0].et.replace('{address}', inc.location.address));
    expect(inc.tags).toEqual(told.tags);
    expect(() => JSON.parse(JSON.stringify(inc))).not.toThrow();
  });

  it('callerRole makes that person the caller', () => {
    const s = shift();
    for (let i = 0; i < 12; i++) {
      const inc = createIncident(s, BASE);
      const role = inc.scenarioId === 'a' ? 'suspect' : inc.scenarioId === 'b' ? 'victim' : undefined;
      if (!role) continue;
      const ref = inc.persons.find((p) => p.role === role)!;
      expect(inc.caller?.personId, inc.scenarioId).toBe(ref.personId);
    }
  });

  it('a registered template resolves through tplOf, so calls, beats and outcomes read the same story', () => {
    const tpl = TEMPLATE_BY_ID.domestic_violence;
    const s = shift(3);
    const inc = createIncident(s, tpl);
    expect(inc.scenarioId).toBeDefined();
    const resolved = tplOf(inc)!;
    expect(resolved).toBe(withScenario(tpl, inc.scenarioId));
    expect(inc.title).toEqual(resolved.title);
    expect(inc.beats.length).toBe((resolved.beats ?? []).length);
    expect(resolved.summary.some((x) => inc.summary.et === x.et.replace('{address}', inc.location.address) || x.et.includes('{'))).toBe(true);
  });

  it('a scenario already told this shift is strongly down-weighted', () => {
    // Fifty fresh shifts, three incidents each: almost every shift tells three different stories.
    let distinct = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const s = shift(seed);
      const told = new Set([0, 1, 2].map(() => createIncident(s, BASE).scenarioId));
      if (told.size === 3) distinct++;
      if (seed === 1) expect([...seenScenarios(s)].every((k) => k.startsWith('x_story/'))).toBe(true);
    }
    expect(distinct).toBeGreaterThanOrEqual(42);
    // All told: the pick falls back to the plain weights.
    const s = shift();
    for (const sc of BASE.scenarios!) rememberIncident(s, BASE, sc.id);
    const r = new Rng(5);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 300; i++) {
      const sc = pickScenario(s, r, BASE)!;
      counts[sc.id] = (counts[sc.id] ?? 0) + 1;
    }
    expect(counts.a).toBeGreaterThan(counts.c);
  });

  it('remembers the latest templates and categories in JSON-safe flags', () => {
    const s = shift();
    for (let i = 0; i < RECENT_TEMPLATES + 3; i++) rememberIncident(s, { ...BASE, id: `t${i}`, category: i % 2 ? 'traffic' : 'property' });
    const recent = recentTemplateIds(s);
    expect(recent.length).toBe(RECENT_TEMPLATES);
    expect(recent.at(-1)).toBe(`t${RECENT_TEMPLATES + 2}`);
    expect(typeof s.flags['recent:tpl']).toBe('string');
    expect(typeof s.flags['recent:cat']).toBe('string');
    expect(JSON.parse(JSON.stringify(s.flags))).toEqual(s.flags);
  });

  it('down-weights a recent template and a third incident of the same category in a row', () => {
    const s = shift();
    const tA: IncidentTemplate = { ...BASE, id: 'x_a', category: 'traffic', scenarios: undefined };
    const tB: IncidentTemplate = { ...BASE, id: 'x_b', category: 'property', scenarios: undefined };
    expect(repetitionFactor(s, tA)).toBe(1);
    rememberIncident(s, tA);
    expect(repetitionFactor(s, tA)).toBeCloseTo(RECENT_TEMPLATE_FACTOR, 6);
    expect(repetitionFactor(s, tB)).toBe(1);
    rememberIncident(s, { ...tA, id: 'x_a2' });
    // Two traffic incidents in a row: a third is less likely, other categories are not touched.
    expect(repetitionFactor(s, { ...tA, id: 'x_a3' })).toBeLessThan(1);
    expect(repetitionFactor(s, tB)).toBe(1);
  });

  it('pickTemplate stays deterministic and rarely repeats a recent template', () => {
    const pool: IncidentTemplate[] = Array.from({ length: 12 }, (_, i) => ({ ...BASE, id: `x_t${i}`, category: i % 2 ? 'traffic' : 'property', scenarios: undefined }));
    const run = () => {
      const s = shift();
      const r = new Rng(42);
      const picks: string[] = [];
      for (let i = 0; i < 120; i++) {
        const tpl = pickTemplate(s, r, pool, s.now)!;
        rememberIncident(s, tpl);
        picks.push(tpl.id);
      }
      return picks;
    };
    const picks = run();
    expect(run()).toEqual(picks);
    // Twelve equally likely templates: without memory about half the picks would repeat one of the last eight.
    const repeats = picks.filter((p, i) => picks.slice(Math.max(0, i - RECENT_TEMPLATES), i).includes(p)).length;
    expect(repeats).toBeLessThan(15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Content: every scenario is a complete, consistent incident
// ─────────────────────────────────────────────────────────────────────────────

describe('scenario content', () => {
  it('the frequent domestic templates have at least five stories each', () => {
    const domestic = TEMPLATES.filter((t) => t.category === 'domestic' && t.weight >= 0.2);
    expect(domestic.length).toBeGreaterThanOrEqual(10);
    for (const t of domestic) expect(t.scenarios?.length ?? 0, t.id).toBeGreaterThanOrEqual(5);
  });

  it('has scenarios on templates outside the domestic file too', () => {
    const cats = new Set(WITH_SCENARIOS.map((t) => t.category));
    for (const c of ['domestic', 'public_order', 'traffic', 'property', 'violence'] as const) expect(cats.has(c), c).toBe(true);
    expect(WITH_SCENARIOS.length).toBeGreaterThanOrEqual(25);
  });

  for (const t of WITH_SCENARIOS) {
    describe(t.id, () => {
      it('scenario ids are unique and stories do not share card texts', () => {
        const ids = t.scenarios!.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).toMatch(/^[a-z_]+$/);
        const seen = new Map<string, string>();
        for (const sc of t.scenarios!) {
          for (const x of withScenario(t, sc.id).summary) {
            expect(seen.get(x.et), `${t.id}/${sc.id} repeats a summary of ${seen.get(x.et)}`).toBeUndefined();
            seen.set(x.et, sc.id);
          }
        }
      });

      for (const sc of t.scenarios!) {
        it(`${sc.id}: complete and consistent`, () => {
          const r = withScenario(t, sc.id);
          const where = `${t.id}/${sc.id}`;
          expect(r.title.et.trim(), where).not.toBe('');
          expect(r.title.en.trim(), where).not.toBe('');
          expect([1, 2, 3, 4]).toContain(r.priority);
          // The caller's wording (phrasebook band) still fits the story's priority.
          const inc = { id: 'x', templateId: t.id, category: t.category, title: r.title, tags: r.tags ?? [], truePriority: r.priority, persons: [] } as unknown as Incident;
          expect(bandFits(situationOf(inc, r), r.priority), `${where}: priority ${r.priority} vs situation ${situationOf(inc, r)}`).toBe(true);
          // Card, caller and details: bilingual, summaries start with the place.
          expect(r.summary.length, where).toBeGreaterThanOrEqual(2);
          for (const x of [...r.summary, ...(r.callerLines ?? []), ...(r.details ?? [])]) {
            expect(x.et.trim().length, where).toBeGreaterThan(0);
            expect(x.en.trim().length, where).toBeGreaterThan(0);
          }
          for (const x of r.summary) expect(x.et.startsWith('{address}') || x.et.startsWith('{place}'), `${where}: ${x.et}`).toBe(true);
          expect((r.callerLines ?? []).length, where).toBeGreaterThanOrEqual(2);
          expect((r.details ?? []).length, where).toBeGreaterThanOrEqual(1);
          // Outcomes cover the whole success range, with a bad ending low and a good one high.
          expect(r.outcomes.length, where).toBeGreaterThanOrEqual(3);
          expect(new Set(r.outcomes.map((o) => o.id)).size).toBe(r.outcomes.length);
          for (let x = 0; x <= 1.0001; x += 0.05) expect(r.outcomes.some((o) => eligible(o, x)), `${where}: no outcome at ${x.toFixed(2)}`).toBe(true);
          const bad = ['escaped', 'tragedy', 'unfounded', 'false_alarm', 'hospital', 'report', 'referred', 'warning'];
          expect(r.outcomes.some((o) => eligible(o, 0.05) && bad.includes(o.result)), where).toBe(true);
          expect(r.outcomes.some((o) => eligible(o, 0.95) && !['escaped', 'tragedy'].includes(o.result)), where).toBe(true);
          // Beats: 1-4, query subjects exist, forced outcomes exist, no law paragraphs on the radio.
          const roles = new Set(r.persons.map((p) => p.role));
          const outcomeIds = new Set(r.outcomes.map((o) => o.id));
          expect((r.beats ?? []).length, where).toBeGreaterThanOrEqual(1);
          expect((r.beats ?? []).length, where).toBeLessThanOrEqual(4);
          for (const b of r.beats ?? []) {
            for (const x of b.radio) expect(`${x.et} ${x.en}`, where).not.toMatch(/§/);
            if (b.kind === 'query' && b.queryType === 'person') expect(roles.has(b.subject as never), `${where}: query ${b.subject}`).toBe(true);
            if (b.kind === 'query' && b.queryType === 'vehicle') expect((r.vehicles ?? []).length, `${where}: vehicle query`).toBeGreaterThan(0);
            if (b.kind === 'pursuit') expect((r.vehicles ?? []).length, where).toBeGreaterThan(0);
            if (b.kind === 'choice') {
              expect(b.options.map((o) => o.id)).toContain(b.defaultOption);
              for (const o of b.options) {
                expect(`${o.reply.et} ${o.reply.en}`, where).not.toMatch(/§/);
                if (o.effects.outcome) expect(outcomeIds.has(o.effects.outcome), `${where}: outcome ${o.effects.outcome}`).toBe(true);
              }
            }
            if (b.kind === 'backup') {
              expect(b.timeoutMin).toBeGreaterThanOrEqual(3);
              expect(b.timeoutMin).toBeLessThanOrEqual(8);
            }
          }
          if (r.callerRole) expect(roles.has(r.callerRole), `${where}: callerRole ${r.callerRole}`).toBe(true);
          if (r.escalation) expect(r.escalation.toPriority).toBeLessThan(r.priority);
          // Placeholders: only known ones; vehicle ones need a vehicle; {idcode}/{name} only in queries.
          for (const [path, x] of strings(r, where)) {
            for (const m of x.matchAll(/\{(\w*)\}/g)) expect(ALLOWED.has(m[1]), `${path}: {${m[1]}}`).toBe(true);
            if (/\{(plate|car)\}/.test(x)) expect((r.vehicles ?? []).length, `${path} uses a vehicle placeholder`).toBeGreaterThan(0);
            expect(DASHES.test(x), `${path}: en/em dash`).toBe(false);
          }
          const outside = strings({ ...r, beats: (r.beats ?? []).filter((b) => b.kind !== 'query') }, where);
          for (const [path, x] of outside) expect(/\{(idcode|name)\}/.test(x), `${path}: {idcode}/{name} outside a query`).toBe(false);
          // Call script.
          if (r.call) {
            expect(r.call.opening.length, where).toBeGreaterThan(0);
            for (const ru of r.call.openingRu ?? []) expect(ru).toMatch(/[А-Яа-яЁё]/);
            for (const a of r.call.answers?.name ?? []) expect(a.et, where).not.toMatch(/^(Ta|Tema)\b/);
          }
        });
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Headless batch: 12 h shifts in every prefecture
// ─────────────────────────────────────────────────────────────────────────────

/** Title + card summary with this incident's filled-in values put back as placeholders. */
function storyKey(s: SimState, inc: Incident): string {
  const vars = incidentVars(s, inc);
  let t = inc.summary.et;
  const subs = Object.entries(vars)
    .map(([k, v]) => [k, typeof v === 'string' ? v : v?.et] as const)
    .filter((e): e is readonly [string, string] => !!e[1] && e[1].length > 2)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [k, v] of subs) t = t.split(v).join(`{${k}}`);
  return `${inc.title.et} | ${t}`;
}

describe('headless batch', () => {
  it('spreads the templates and never repeats a domestic story within a 12 h shift', () => {
    const counts = new Map<string, number>();
    let total = 0;
    let recentRepeats = 0;
    const dupes: string[] = [];
    for (const regionId of ['pohja', 'ida', 'louna', 'laane'] as RegionId[]) {
      for (const [seed, startHour] of [1, 2, 3, 4, 5, 6, 7, 8].map((k) => [k * 11, k % 2 ? 19 : 7] as const)) {
        const s = createShift({ seed, regionId, mode: 'free', difficulty: 'normal', start: tallinnTime(2026, 10, 12 + (seed % 7), startHour, 0), hours: 12, playerName: 'Test' });
        let guard = 0;
        while (!s.ended && guard++ < 13 * 60) {
          step(s, MIN);
          // Nobody answers the phone: Häirekeskus creates the cards itself.
        }
        const incs = s.incidentOrder.map((id) => s.incidents[id]);
        const seen = new Set<string>();
        incs.forEach((inc, i) => {
          total++;
          counts.set(inc.templateId, (counts.get(inc.templateId) ?? 0) + 1);
          if (incs.slice(Math.max(0, i - RECENT_TEMPLATES), i).some((x) => x.templateId === inc.templateId)) recentRepeats++;
          if (inc.category !== 'domestic') return;
          const key = storyKey(s, inc);
          if (seen.has(key)) dupes.push(`${regionId}/${seed}: ${key}`);
          seen.add(key);
        });
      }
    }
    const top = Math.max(...counts.values()) / total;
    if (process.env.EPD_BALANCE_LOG) {
      const list = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      console.log(`[scenarios] incidents=${total} top=${(top * 100).toFixed(1)}% recentRepeats=${recentRepeats}`, list);
    }
    expect(total).toBeGreaterThan(1000);
    // Measured with 64 shifts (tmp harness, 2026-10-18): before the repetition memory the most
    // frequent template (drunk driver suspicion) took 3.1 % of the calls (4.1 % before the escalating
    // templates were added), 10 % of the calls repeated a template from the last eight and the same
    // category came three times in a row 69 times. Now: 2.5 %, 0.6 % and 15 times.
    expect(top).toBeLessThan(0.03);
    expect(recentRepeats / total).toBeLessThan(0.03);
    expect(dupes).toEqual([]);
  }, 240_000);
});
