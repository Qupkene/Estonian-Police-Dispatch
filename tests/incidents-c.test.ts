import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { IncidentCategory, IncidentTemplate, Text } from '@/sim/types';
import { TEMPLATE_PLACEHOLDERS } from '@/sim/text';
import { TEMPLATES_TRAFFIC } from '@/data/incidents/traffic';
import { TEMPLATES_MISSING } from '@/data/incidents/missing';
import { TEMPLATES_ASSIST } from '@/data/incidents/assist';
import { TEMPLATES_MAJOR } from '@/data/incidents/major';

const FILES: [IncidentCategory, IncidentTemplate[]][] = [
  ['traffic', TEMPLATES_TRAFFIC],
  ['missing', TEMPLATES_MISSING],
  ['assist', TEMPLATES_ASSIST],
  ['major', TEMPLATES_MAJOR],
];
const ALL: IncidentTemplate[] = FILES.flatMap(([, list]) => list);

const assignment = JSON.parse(readFileSync(new URL('../docs/legacy/assignment.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const LEGACY_C = assignment.C as string[];

const ALLOWED = new Set<string>(TEMPLATE_PLACEHOLDERS);
const SUCCESS_GRID = Array.from({ length: 21 }, (_, i) => i / 20);
/** Unit types not present in every prefecture's roster — never a hard requirement (ideal only). */
const NATIONAL_ONLY = new Set<string>(['special', 'heli', 'boat']);
/** Place kinds whose locations always carry a placeName (curated-only kinds in sim/spawner.ts, plus lakes). */
const NAMED_PLACE_KINDS = new Set<string>([
  'airport', 'port', 'border', 'prison', 'embassy', 'stadium', 'concert', 'university', 'hospital', 'museum',
  'oldtown', 'beach', 'trainstation', 'government', 'hotel', 'mall', 'bank', 'nightclub', 'lake',
]);

/** Collect every string anywhere inside a value. */
function strings(v: unknown, acc: string[] = []): string[] {
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, acc));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, acc));
  return acc;
}

function nonEmptyText(t: Text | undefined): boolean {
  return !!t && t.et.trim().length > 0 && t.en.trim().length > 0;
}

function eligible(o: { minSuccess?: number; maxSuccess?: number }, s: number): boolean {
  return (o.minSuccess ?? 0) <= s + 1e-9 && s - 1e-9 <= (o.maxSuccess ?? 1);
}

describe('incidents-C: ids and categories', () => {
  it('has unique ids across traffic/missing/assist/major', () => {
    const ids = ALL.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const [cat, list] of FILES) {
    it(`${cat}: every template has category '${cat}' and id prefix '${cat}_'`, () => {
      expect(list.length).toBeGreaterThan(0);
      for (const t of list) {
        expect(t.category, t.id).toBe(cat);
        expect(t.id.startsWith(`${cat}_`), t.id).toBe(true);
        expect(t.id, t.id).toMatch(/^[a-z]+_[a-z0-9_]+$/);
      }
    });
  }

  it('ships at least 60 templates in total', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(60);
  });
});

describe('incidents-C: template validity', () => {
  for (const t of ALL) {
    describe(t.id, () => {
      it('has basic fields in range', () => {
        expect(nonEmptyText(t.title)).toBe(true);
        expect(t.code.length).toBeGreaterThan(0);
        expect([1, 2, 3, 4]).toContain(t.priority);
        expect(t.weight).toBeGreaterThan(0);
        expect(t.weight).toBeLessThanOrEqual(3);
        expect(t.places.length).toBeGreaterThan(0);
        expect(t.units.need.length).toBeGreaterThan(0);
        for (const n of t.units.need) expect(NATIONAL_ONLY.has(n.type), `${t.id}: hard need ${n.type}`).toBe(false);
        for (const n of [...t.units.need, ...(t.units.ideal ?? [])]) expect(n.count).toBeGreaterThan(0);
        expect(t.onScene[0]).toBeGreaterThan(0);
        expect(t.onScene[0]).toBeLessThanOrEqual(t.onScene[1]);
        if (t.months) for (const m of t.months) expect(m >= 1 && m <= 12).toBe(true);
        if (Array.isArray(t.hours)) expect(t.hours.length).toBe(24);
        for (const c of [t.falseAlarmChance, t.interactiveChance, t.referral?.chance, ...(t.agencies ?? []).map((a) => a.chance)]) {
          if (c !== undefined) expect(c >= 0 && c <= 1).toBe(true);
        }
        if (t.escalation) expect(t.escalation.afterMin).toBeGreaterThan(0);
        // the caller must not give up before the default urban response target (DESIGN §4.5 SLA)
        if (t.expiresMin !== undefined) expect(t.expiresMin, t.id).toBeGreaterThanOrEqual({ 1: 20, 2: 35, 3: 60, 4: 120 }[t.priority]);
      });

      it('has 2–4 summaries in Häirekeskus style and bilingual texts', () => {
        expect(t.summary.length).toBeGreaterThanOrEqual(2);
        expect(t.summary.length).toBeLessThanOrEqual(4);
        for (const s of t.summary) {
          expect(nonEmptyText(s)).toBe(true);
          expect(/^\{(address|place)\}/.test(s.et), s.et).toBe(true);
        }
        expect((t.callerLines ?? []).length).toBeLessThanOrEqual(4);
        for (const c of t.callerLines ?? []) expect(nonEmptyText(c)).toBe(true);
        const details = t.details ?? [];
        expect(details.length).toBeGreaterThanOrEqual(1);
        expect(details.length).toBeLessThanOrEqual(3);
        for (const d of details) expect(nonEmptyText(d)).toBe(true);
        for (const a of t.agencies ?? []) expect(nonEmptyText(a.reason)).toBe(true);
      });

      it('only leads with "{place}, {address}" where every place kind has a curated name', () => {
        // Generated locations (streets, rural spots, non-curated businesses) carry no placeName, so
        // {place} falls back to the address and "{place}, {address}" would print it twice.
        const named = t.places.every((k) => NAMED_PLACE_KINDS.has(k));
        for (const s of t.summary) {
          if (s.et.startsWith('{place}, {address}')) expect(named, `${t.id}: ${t.places.join(',')}`).toBe(true);
        }
      });

      it('uses only allowed placeholders', () => {
        for (const s of strings(t)) {
          for (const m of s.matchAll(/\{(\w+)\}/g)) {
            expect(ALLOWED.has(m[1]!), `${t.id}: {${m[1]}} in "${s}"`).toBe(true);
          }
          // no unbalanced braces
          expect(/\{[^}]*$|^[^{]*\}/.test(s), `${t.id}: unbalanced braces in "${s}"`).toBe(false);
        }
      });

      it('has persons with sane specs and vehicles linked to them', () => {
        const roles = new Set(t.persons.map((p) => p.role));
        for (const p of t.persons) {
          if (p.age) expect(p.age[0] <= p.age[1]).toBe(true);
          for (const c of [p.wanted, p.record, p.restraining, p.weapon, p.noLicense, p.probation, p.intoxicated]) {
            if (c !== undefined) expect(c >= 0 && c <= 1).toBe(true);
          }
        }
        for (const v of t.vehicles ?? []) {
          if (v.driverRole) expect(roles.has(v.driverRole), `${t.id}: driverRole ${v.driverRole}`).toBe(true);
          for (const c of [v.stolen, v.noInsurance, v.noInspection, v.suspended]) if (c !== undefined) expect(c >= 0 && c <= 1).toBe(true);
        }
      });

      it('has 1–4 valid beats', () => {
        const beats = t.beats ?? [];
        expect(beats.length).toBeGreaterThanOrEqual(1);
        expect(beats.length).toBeLessThanOrEqual(4);
        const roles = new Set(t.persons.map((p) => p.role));
        const hasVehicle = (t.vehicles ?? []).length > 0;
        for (const b of beats) {
          expect(b.radio.length).toBeGreaterThan(0);
          for (const r of b.radio) expect(nonEmptyText(r)).toBe(true);
          if (b.chance !== undefined) expect(b.chance > 0 && b.chance <= 1).toBe(true);
          if (typeof b.at === 'number') expect(b.at).toBeGreaterThanOrEqual(0);
          switch (b.kind) {
            case 'query':
              if (b.queryType === 'person') {
                expect(b.subject).not.toBe('vehicle');
                expect(roles.has(b.subject as never), `${t.id}: query subject ${b.subject} not in persons`).toBe(true);
              } else {
                expect(b.subject).toBe('vehicle');
                expect(hasVehicle, `${t.id}: vehicle query without vehicles`).toBe(true);
              }
              break;
            case 'choice': {
              expect(b.options.length).toBeGreaterThanOrEqual(2);
              const ids = b.options.map((o) => o.id);
              expect(new Set(ids).size).toBe(ids.length);
              expect(ids, `${t.id}: default ${b.defaultOption}`).toContain(b.defaultOption);
              expect(b.timeoutMin).toBeGreaterThan(0);
              for (const o of b.options) expect(nonEmptyText(o.label) && nonEmptyText(o.reply)).toBe(true);
              break;
            }
            case 'pursuit':
              expect(hasVehicle, `${t.id}: pursuit without a vehicle`).toBe(true);
              break;
            case 'search':
              expect(b.radiusKm).toBeGreaterThanOrEqual(1);
              expect(b.radiusKm).toBeLessThanOrEqual(8);
              break;
            case 'backup':
              expect(b.timeoutMin).toBeGreaterThan(0);
              expect(NATIONAL_ONLY.has(b.need.type), `${t.id}: backup needs ${b.need.type}`).toBe(false);
              break;
            case 'agency':
              expect(b.timeoutMin).toBeGreaterThan(0);
              break;
            case 'transport':
              expect(b.paperworkMin[0]).toBeLessThanOrEqual(b.paperworkMin[1]);
              break;
            case 'escalate':
              expect([1, 2, 3, 4]).toContain(b.toPriority);
              if (b.need) expect(NATIONAL_ONLY.has(b.need.type), `${t.id}: escalation needs ${b.need.type}`).toBe(false);
              break;
            default:
              break;
          }
        }
      });

      it('has 3–6 outcomes covering the whole success range', () => {
        expect(t.outcomes.length).toBeGreaterThanOrEqual(3);
        expect(t.outcomes.length).toBeLessThanOrEqual(6);
        const ids = t.outcomes.map((o) => o.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const o of t.outcomes) {
          expect(o.weight).toBeGreaterThan(0);
          expect(nonEmptyText(o.text)).toBe(true);
          expect((o.minSuccess ?? 0) <= (o.maxSuccess ?? 1)).toBe(true);
        }
        for (const s of SUCCESS_GRID) {
          expect(t.outcomes.some((o) => eligible(o, s)), `${t.id}: no outcome at success ${s}`).toBe(true);
        }
        // at least one clearly bad and one clearly good ending
        expect(t.outcomes.some((o) => o.maxSuccess !== undefined && o.maxSuccess <= 0.5)).toBe(true);
        expect(t.outcomes.some((o) => o.minSuccess !== undefined && o.minSuccess >= 0.4)).toBe(true);
      });

      it('false alarms and referrals have a matching ending', () => {
        if (t.falseAlarmChance) {
          expect(t.outcomes.some((o) => (o.result === 'false_alarm' || o.result === 'unfounded') && SUCCESS_GRID.some((s) => eligible(o, s)))).toBe(true);
        }
        if (t.referral) expect(t.outcomes.some((o) => o.result === 'referred')).toBe(true);
      });

      if (t.call) {
        it('has a usable call script', () => {
          expect(t.call!.opening.length).toBeGreaterThan(0);
          for (const o of t.call!.opening) expect(nonEmptyText(o)).toBe(true);
          for (const list of Object.values(t.call!.answers ?? {})) for (const a of list ?? []) expect(nonEmptyText(a)).toBe(true);
          for (const ru of t.call!.openingRu ?? []) expect(/[А-Яа-яЁё]/.test(ru)).toBe(true);
        });
      }
    });
  }
});

describe('incidents-C: balance and coverage', () => {
  it('covers every legacy "C" title exactly once with an identical title.et', () => {
    expect(LEGACY_C.length).toBe(41);
    for (const title of LEGACY_C) {
      const hits = ALL.filter((t) => t.legacy && t.title.et === title);
      expect(hits.length, `legacy title "${title}"`).toBe(1);
    }
    for (const t of ALL.filter((x) => x.legacy)) expect(LEGACY_C, t.id).toContain(t.title.et);
  });

  it('has a registry query in at least 45 % of traffic templates', () => {
    const withQuery = TEMPLATES_TRAFFIC.filter((t) => (t.beats ?? []).some((b) => b.kind === 'query'));
    expect(withQuery.length / TEMPLATES_TRAFFIC.length).toBeGreaterThanOrEqual(0.45);
  });

  it('has at least 15 scripted 112 calls, some with Russian openings', () => {
    const calls = ALL.filter((t) => t.call);
    expect(calls.length).toBeGreaterThanOrEqual(15);
    expect(calls.filter((t) => (t.call!.openingRu ?? []).length > 0).length).toBeGreaterThanOrEqual(8);
  });

  it('keeps mass-casualty and active-shooter events very rare', () => {
    for (const t of ALL.filter((x) => x.tags?.includes('mass_casualty') || x.tags?.includes('active_shooter'))) {
      expect(t.weight, t.id).toBeLessThanOrEqual(0.004);
    }
    for (const t of TEMPLATES_MAJOR) expect(t.weight, t.id).toBeLessThanOrEqual(0.08);
  });

  it('respects seasonal realism for ice, water and mushroom templates', () => {
    const byId = Object.fromEntries(ALL.map((t) => [t.id, t]));
    expect(byId.traffic_jaatee_rikkuja?.months).toEqual([1, 2, 3]);
    expect(byId.missing_ujuja_kadunud?.months).toEqual([6, 7, 8]);
    expect(byId.missing_seenel_eksinud?.months).toEqual([8, 9, 10]);
    expect(byId.missing_kalurid_jaatykil?.months).toEqual([1, 2, 3]);
  });

  it('flags drunk driving as a common night-time event', () => {
    const dui = ALL.find((t) => t.id === 'traffic_joobes_juhi_kahtlus')!;
    expect(dui.hours).toBe('nightlife');
    expect(dui.weekendBoost ?? 1).toBeGreaterThan(1);
    const driver = dui.persons.find((p) => p.role === 'driver')!;
    expect(driver.intoxicated).toBeGreaterThanOrEqual(0.85);
  });
});

describe('incidents-C: runtime smoke with the real engine', () => {
  it('spawns every C template in a live shift with every placeholder filled', async (ctx) => {
    const { REGIONS } = await import('@/data/regions');
    if (!(REGIONS.pohja.roster.length > 0 && REGIONS.laane.roster.length > 0)) {
      ctx.skip();
      return;
    }
    const { createShift, step } = await import('@/sim/engine');
    const { directorSpawn } = await import('@/sim/commands');
    const { tallinnTime, MIN } = await import('@/sim/time');
    for (const regionId of ['pohja', 'laane'] as const) {
      const s = createShift({ seed: 41, regionId, mode: 'director', difficulty: 'normal', start: tallinnTime(2026, 7, 15, 12, 0), hours: 4, playerName: 'Test' });
      for (const t of ALL) {
        const id = directorSpawn(s, { templateId: t.id });
        expect(id, `${regionId}: ${t.id} did not spawn`).not.toBe('');
        const inc = s.incidents[id]!;
        for (const txt of [inc.summary, ...inc.details, ...inc.hiddenDetails]) {
          expect(/\{\w+\}/.test(`${txt.et} ${txt.en}`), `${t.id}: unfilled placeholder in "${txt.et}"`).toBe(false);
        }
      }
      expect(() => {
        for (let i = 0; i < 20; i++) step(s, MIN);
      }).not.toThrow();
    }
  }, 60_000);
});
