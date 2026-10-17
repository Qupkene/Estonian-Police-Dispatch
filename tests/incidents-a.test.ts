import { describe, expect, it } from 'vitest';
import type { IncidentCategory, IncidentTemplate, PlaceKind } from '@/sim/types';
import { TEMPLATE_PLACEHOLDERS } from '@/sim/text';
import { TEMPLATES_VIOLENCE } from '@/data/incidents/violence';
import { TEMPLATES_DOMESTIC } from '@/data/incidents/domestic';
import { TEMPLATES_PUBLIC_ORDER } from '@/data/incidents/public_order';
import { TEMPLATES_DRUGS } from '@/data/incidents/drugs';
import assignment from '../docs/legacy/assignment.json';
import legacyCalls from '../docs/legacy/legacy-calls.json';

const FILES: [IncidentCategory, IncidentTemplate[]][] = [
  ['violence', TEMPLATES_VIOLENCE],
  ['domestic', TEMPLATES_DOMESTIC],
  ['public_order', TEMPLATES_PUBLIC_ORDER],
  ['drugs', TEMPLATES_DRUGS],
];
const ALL: IncidentTemplate[] = FILES.flatMap(([, list]) => list);

const PLACE_KINDS: PlaceKind[] = [
  'residential',
  'house',
  'street',
  'bar',
  'nightclub',
  'mall',
  'shop',
  'bank',
  'school',
  'kindergarten',
  'university',
  'hospital',
  'park',
  'beach',
  'forest',
  'lake',
  'highway',
  'ruralroad',
  'trainstation',
  'busstation',
  'port',
  'airport',
  'stadium',
  'concert',
  'office',
  'industrial',
  'construction',
  'parking',
  'hotel',
  'church',
  'cemetery',
  'gasstation',
  'government',
  'embassy',
  'prison',
  'border',
  'farm',
  'summerhouse',
  'village',
  'oldtown',
  'museum',
];
const ALLOWED = new Set<string>(TEMPLATE_PLACEHOLDERS);
const LEGACY_TYPE: Record<string, string> = {
  KIIRREAGEERIJA: 'rapid',
  KRIMINAALPOLITSEI: 'criminal',
  PATRULL: 'patrol',
  KORRAKAITSE: 'patrol',
};

/** Every string anywhere inside a value, with a path for error messages. */
function strings(v: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof v === 'string') out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out);
  return out;
}

const eligible = (o: IncidentTemplate['outcomes'][number], s: number) =>
  (o.minSuccess ?? 0) <= s + 1e-9 && s <= (o.maxSuccess ?? 1) + 1e-9;

describe('incidents A: violence / domestic / public_order / drugs', () => {
  it('has at least 60 templates across the four files', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(60);
  });

  it('template ids are unique and match the file category', () => {
    const seen = new Set<string>();
    for (const [cat, list] of FILES) {
      for (const t of list) {
        expect(seen.has(t.id), `duplicate id ${t.id}`).toBe(false);
        seen.add(t.id);
        expect(t.category, t.id).toBe(cat);
        expect(t.id.startsWith(`${cat}_`), `${t.id} must start with ${cat}_`).toBe(true);
        expect(t.id).toMatch(/^[a-z_]+$/);
      }
    }
  });

  for (const t of ALL) {
    describe(t.id, () => {
      it('has valid basics', () => {
        expect(t.title.et.trim().length).toBeGreaterThan(0);
        expect(t.title.en.trim().length).toBeGreaterThan(0);
        expect(t.code.trim().length).toBeGreaterThan(0);
        expect([1, 2, 3, 4]).toContain(t.priority);
        expect(t.weight).toBeGreaterThan(0);
        expect(t.weight).toBeLessThanOrEqual(3);
        expect(t.places.length).toBeGreaterThan(0);
        for (const p of t.places) expect(PLACE_KINDS, `${t.id} place ${p}`).toContain(p);
        expect(t.units.need.length).toBeGreaterThan(0);
        for (const n of [...t.units.need, ...(t.units.ideal ?? [])]) expect(n.count).toBeGreaterThan(0);
        expect(t.onScene[0]).toBeGreaterThanOrEqual(10);
        expect(t.onScene[0]).toBeLessThanOrEqual(t.onScene[1]);
        expect(t.onScene[1]).toBeLessThanOrEqual(150);
        expect(t.persons.length).toBeGreaterThan(0);
        if (Array.isArray(t.hours)) expect(t.hours.length).toBe(24);
        if (t.months) for (const m of t.months) expect(m >= 1 && m <= 12).toBe(true);
        if (t.escalation) expect(t.escalation.toPriority).toBeLessThan(t.priority);
        if (t.falseAlarmChance !== undefined) expect(t.falseAlarmChance).toBeLessThan(0.6);
      });

      it('has bilingual summary, caller lines and details', () => {
        expect(t.summary.length).toBeGreaterThanOrEqual(2);
        for (const s of [...t.summary, ...(t.callerLines ?? []), ...(t.details ?? [])]) {
          expect(s.et.trim().length, t.id).toBeGreaterThan(0);
          expect(s.en.trim().length, t.id).toBeGreaterThan(0);
        }
        for (const s of t.summary)
          expect(s.et.startsWith('{address}') || s.et.startsWith('{place}'), `${t.id}: ${s.et}`).toBe(true);
        expect((t.callerLines ?? []).length).toBeGreaterThanOrEqual(2);
        expect((t.details ?? []).length).toBeGreaterThanOrEqual(1);
      });

      it('has >= 3 outcomes covering the whole success range', () => {
        expect(t.outcomes.length).toBeGreaterThanOrEqual(3);
        const ids = new Set(t.outcomes.map((o) => o.id));
        expect(ids.size).toBe(t.outcomes.length);
        for (const o of t.outcomes) {
          expect(o.weight).toBeGreaterThan(0);
          expect(o.minSuccess ?? 0).toBeLessThanOrEqual(o.maxSuccess ?? 1);
          expect(o.text.et.length).toBeGreaterThan(0);
          expect(o.text.en.length).toBeGreaterThan(0);
        }
        for (let s = 0; s <= 1.0001; s += 0.05) {
          expect(
            t.outcomes.some((o) => eligible(o, s)),
            `${t.id}: no outcome eligible at success ${s.toFixed(2)}`,
          ).toBe(true);
        }
        // Low success must allow a "bad" ending; high success a good one.
        const bad = [
          'escaped',
          'tragedy',
          'unfounded',
          'false_alarm',
          'hospital',
          'report',
          'referred',
          'warning',
        ];
        expect(t.outcomes.some((o) => eligible(o, 0.05) && bad.includes(o.result))).toBe(true);
        expect(t.outcomes.some((o) => eligible(o, 0.95) && !['escaped', 'tragedy'].includes(o.result))).toBe(
          true,
        );
      });

      it('has consistent beats', () => {
        const roles = new Set(t.persons.map((p) => p.role));
        const outcomeIds = new Set(t.outcomes.map((o) => o.id));
        expect((t.beats ?? []).length).toBeGreaterThanOrEqual(1);
        expect((t.beats ?? []).length).toBeLessThanOrEqual(4);
        for (const b of t.beats ?? []) {
          expect(b.radio.length, `${t.id} ${b.kind} radio`).toBeGreaterThan(0);
          if (typeof b.at === 'number') expect(b.at).toBeGreaterThanOrEqual(0);
          if (b.chance !== undefined) expect(b.chance > 0 && b.chance <= 1).toBe(true);
          if (b.kind === 'query') {
            if (b.queryType === 'vehicle') {
              expect(b.subject).toBe('vehicle');
              expect((t.vehicles ?? []).length, `${t.id}: vehicle query needs vehicles`).toBeGreaterThan(0);
            } else {
              expect(b.subject).not.toBe('vehicle');
              expect(
                roles.has(b.subject as never),
                `${t.id}: query subject ${b.subject} not in persons`,
              ).toBe(true);
            }
          }
          if (b.kind === 'choice') {
            expect(b.options.length).toBeGreaterThanOrEqual(2);
            const ids = b.options.map((o) => o.id);
            expect(new Set(ids).size).toBe(ids.length);
            expect(ids, `${t.id}: defaultOption`).toContain(b.defaultOption);
            for (const o of b.options)
              if (o.effects.outcome) expect(outcomeIds.has(o.effects.outcome)).toBe(true);
          }
          if (b.kind === 'backup') {
            expect(b.timeoutMin).toBeGreaterThanOrEqual(3);
            expect(b.timeoutMin).toBeLessThanOrEqual(8);
          }
          if (b.kind === 'pursuit') expect((t.vehicles ?? []).length).toBeGreaterThan(0);
        }
      });

      it('uses only allowed placeholders', () => {
        for (const [path, s] of strings(t, t.id)) {
          for (const m of s.matchAll(/\{(\w*)\}/g)) {
            expect(ALLOWED.has(m[1]), `${path}: unknown placeholder {${m[1]}} in "${s}"`).toBe(true);
          }
          expect((s.match(/\{/g) ?? []).length, `${path}: unbalanced braces`).toBe(
            (s.match(/\}/g) ?? []).length,
          );
          if (/\{(plate|car)\}/.test(s))
            expect((t.vehicles ?? []).length, `${path} uses vehicle placeholder`).toBeGreaterThan(0);
        }
        // {idcode}/{name} refer to the subject of a query beat, so only query radio may use them.
        const outside = strings({ ...t, beats: (t.beats ?? []).filter((b) => b.kind !== 'query') }, t.id);
        for (const [path, s] of outside)
          expect(/\{(idcode|name)\}/.test(s), `${path}: {idcode}/{name} outside a query beat`).toBe(false);
      });

      it('has a sane call script when present', () => {
        if (!t.call) return;
        expect(t.call.opening.length).toBeGreaterThan(0);
        for (const ru of t.call.openingRu ?? []) expect(ru).toMatch(/[А-Яа-яЁё]/);
      });
    });
  }

  it('gives a good share of templates a registry check and a call script', () => {
    const withQuery = ALL.filter((t) => (t.beats ?? []).some((b) => b.kind === 'query'));
    expect(withQuery.length / ALL.length).toBeGreaterThanOrEqual(0.4);
    expect(ALL.filter((t) => t.call).length).toBeGreaterThanOrEqual(15);
    expect(ALL.filter((t) => t.call?.openingRu?.length).length).toBeGreaterThanOrEqual(4);
  });

  it('covers every legacy title of assignment "A"', () => {
    const titles: string[] = assignment.A;
    expect(titles.length).toBe(40);
    for (const title of titles) {
      const hits = ALL.filter((t) => t.legacy && t.title.et === title);
      expect(hits.length, `legacy title "${title}"`).toBe(1);
    }
    for (const t of ALL.filter((x) => x.legacy))
      expect(titles, `${t.id} is legacy but not in A`).toContain(t.title.et);
  });

  it('maps legacy support chance and bonus officer type', () => {
    const calls = legacyCalls as {
      title: string;
      support_need_chance: number;
      bonus_officers_type: string | null;
    }[];
    for (const title of assignment.A) {
      const call = calls.find((c) => c.title === title);
      expect(call, title).toBeDefined();
      const t = ALL.find((x) => x.legacy && x.title.et === title)!;
      const backups = (t.beats ?? []).filter((b) => b.kind === 'backup');
      if (call!.support_need_chance > 0) {
        expect(
          backups.some((b) => Math.abs((b.chance ?? 1) - call!.support_need_chance / 100) < 1e-9),
          `${t.id}: backup chance ${call!.support_need_chance / 100}`,
        ).toBe(true);
      } else {
        expect(backups.length, `${t.id}: legacy support 0 → no backup beat`).toBe(0);
      }
      if (call!.bonus_officers_type) {
        const type = LEGACY_TYPE[call!.bonus_officers_type];
        expect(
          (t.units.ideal ?? []).some((n) => n.type === type),
          `${t.id}: ideal ${type}`,
        ).toBe(true);
      }
    }
  });
});
