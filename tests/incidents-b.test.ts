import { describe, expect, it } from 'vitest';
import type { Agency, IncidentCategory, IncidentTemplate, PlaceKind, RegionId } from '@/sim/types';
import { TEMPLATE_PLACEHOLDERS } from '@/sim/text';
import { TEMPLATES } from '@/data/incidents';
import { TEMPLATES_PROPERTY } from '@/data/incidents/property';
import { TEMPLATES_FRAUD } from '@/data/incidents/fraud';
import { TEMPLATES_ALARM } from '@/data/incidents/alarm';
import { TEMPLATES_ENVIRONMENT } from '@/data/incidents/environment';
import { TEMPLATES_BORDER } from '@/data/incidents/border';
import { TEMPLATES_EASTER } from '@/data/incidents/easter';
import assignment from '../docs/legacy/assignment.json';
import legacyCalls from '../docs/legacy/legacy-calls.json';

const FILES: [IncidentCategory, IncidentTemplate[]][] = [
  ['property', TEMPLATES_PROPERTY],
  ['fraud', TEMPLATES_FRAUD],
  ['alarm', TEMPLATES_ALARM],
  ['environment', TEMPLATES_ENVIRONMENT],
  ['border', TEMPLATES_BORDER],
  ['easter', TEMPLATES_EASTER],
];
const ALL: IncidentTemplate[] = FILES.flatMap(([, list]) => list);

const PLACE_KINDS: PlaceKind[] = [
  'residential', 'house', 'street', 'bar', 'nightclub', 'mall', 'shop', 'bank', 'school', 'kindergarten', 'university',
  'hospital', 'park', 'beach', 'forest', 'lake', 'highway', 'ruralroad', 'trainstation', 'busstation', 'port', 'airport',
  'stadium', 'concert', 'office', 'industrial', 'construction', 'parking', 'hotel', 'church', 'cemetery', 'gasstation',
  'government', 'embassy', 'prison', 'border', 'farm', 'summerhouse', 'village', 'oldtown', 'museum',
];
const REGIONS: RegionId[] = ['pohja', 'ida', 'louna', 'laane'];
const AGENCIES: Agency[] = ['kiirabi', 'paaste', 'keskkonnaamet', 'kapo', 'kov', 'sotsiaal', 'merepaaste', 'tolliamet', 'transpordiamet', 'veterinaar'];
const ALLOWED = new Set<string>(TEMPLATE_PLACEHOLDERS);
const LEGACY_TYPE: Record<string, string> = { KIIRREAGEERIJA: 'rapid', KRIMINAALPOLITSEI: 'criminal', PATRULL: 'patrol', KORRAKAITSE: 'patrol' };
const BAD_RESULTS = ['escaped', 'tragedy', 'unfounded', 'false_alarm', 'hospital', 'report', 'referred', 'warning'];

/** Every string anywhere inside a value, with a path for error messages. */
function strings(v: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof v === 'string') out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out);
  return out;
}

const eligible = (o: IncidentTemplate['outcomes'][number], s: number) => (o.minSuccess ?? 0) <= s + 1e-9 && s <= (o.maxSuccess ?? 1) + 1e-9;

describe('incidents B: property / fraud / alarm / environment / border / easter', () => {
  it('has at least 55 templates across the six files', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(55);
  });

  it('template ids are unique (also against every other incident file) and match the file category', () => {
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
    const global = TEMPLATES.map((t) => t.id);
    for (const id of seen) expect(global.filter((g) => g === id).length, `id ${id} clashes in TEMPLATES`).toBe(1);
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
        for (const r of t.regions ?? []) expect(REGIONS, `${t.id} region ${r}`).toContain(r);
        expect(t.units.need.length).toBeGreaterThan(0);
        for (const n of [...t.units.need, ...(t.units.ideal ?? [])]) expect(n.count).toBeGreaterThan(0);
        expect(t.onScene[0]).toBeGreaterThanOrEqual(10);
        expect(t.onScene[0]).toBeLessThanOrEqual(t.onScene[1]);
        expect(t.onScene[1]).toBeLessThanOrEqual(150);
        expect(t.persons.length).toBeGreaterThan(0);
        if (Array.isArray(t.hours)) expect(t.hours.length).toBe(24);
        if (t.months) for (const m of t.months) expect(m >= 1 && m <= 12).toBe(true);
        if (t.escalation) expect(t.escalation.toPriority).toBeLessThan(t.priority);
        if (t.falseAlarmChance !== undefined) expect(t.falseAlarmChance > 0 && t.falseAlarmChance <= 0.8).toBe(true);
        if (t.interactiveChance !== undefined) expect(t.interactiveChance >= 0 && t.interactiveChance <= 1).toBe(true);
        if (t.expiresMin !== undefined) expect(t.expiresMin).toBeGreaterThan(0);
        for (const a of t.agencies ?? []) expect(AGENCIES).toContain(a.agency);
        if (t.referral) {
          expect(AGENCIES).toContain(t.referral.agency);
          expect(t.outcomes.some((o) => o.result === 'referred'), `${t.id}: referral needs a 'referred' outcome`).toBe(true);
        }
        if (t.falseAlarmChance) expect(t.outcomes.some((o) => ['false_alarm', 'unfounded'].includes(o.result))).toBe(true);
        for (const p of t.persons) {
          if (p.age) expect(p.age[0]).toBeLessThanOrEqual(p.age[1]);
          for (const k of ['wanted', 'record', 'restraining', 'weapon', 'noLicense', 'probation', 'intoxicated'] as const) {
            const v = p[k];
            if (v !== undefined) expect(v >= 0 && v <= 1, `${t.id} ${p.role}.${k}`).toBe(true);
          }
        }
      });

      it('has bilingual summary, caller lines and details in Häirekeskus style', () => {
        expect(t.summary.length).toBeGreaterThanOrEqual(2);
        expect(t.summary.length).toBeLessThanOrEqual(4);
        for (const s of [...t.summary, ...(t.callerLines ?? []), ...(t.details ?? [])]) {
          expect(s.et.trim().length, t.id).toBeGreaterThan(0);
          expect(s.en.trim().length, t.id).toBeGreaterThan(0);
        }
        for (const s of t.summary) {
          expect(s.et.startsWith('{address}') || s.et.startsWith('{place}'), `${t.id}: ${s.et}`).toBe(true);
          expect(s.en.startsWith('{address}') || s.en.startsWith('{place}'), `${t.id}: ${s.en}`).toBe(true);
        }
        expect((t.callerLines ?? []).length).toBeGreaterThanOrEqual(2);
        expect((t.callerLines ?? []).length).toBeLessThanOrEqual(4);
        expect((t.details ?? []).length).toBeGreaterThanOrEqual(1);
        expect((t.details ?? []).length).toBeLessThanOrEqual(3);
      });

      it('has 3-6 outcomes covering the whole success range', () => {
        expect(t.outcomes.length).toBeGreaterThanOrEqual(3);
        expect(t.outcomes.length).toBeLessThanOrEqual(6);
        const ids = new Set(t.outcomes.map((o) => o.id));
        expect(ids.size).toBe(t.outcomes.length);
        for (const o of t.outcomes) {
          expect(o.weight).toBeGreaterThan(0);
          expect(o.minSuccess ?? 0).toBeLessThanOrEqual(o.maxSuccess ?? 1);
          expect(o.text.et.length).toBeGreaterThan(0);
          expect(o.text.en.length).toBeGreaterThan(0);
        }
        // The engine only picks 'false_alarm' outcomes when the incident rolled falseAlarm, so the
        // range must be covered without them.
        const real = t.outcomes.filter((o) => o.result !== 'false_alarm');
        for (let s = 0; s <= 1.0001; s += 0.05) {
          expect(real.some((o) => eligible(o, s)), `${t.id}: no outcome eligible at success ${s.toFixed(2)}`).toBe(true);
        }
        expect(real.some((o) => eligible(o, 0.05) && BAD_RESULTS.includes(o.result)), `${t.id}: low-success ending`).toBe(true);
        expect(real.some((o) => eligible(o, 0.95) && !['escaped', 'tragedy'].includes(o.result)), `${t.id}: high-success ending`).toBe(true);
      });

      it('has consistent beats', () => {
        const roles = new Set(t.persons.map((p) => p.role));
        const outcomeIds = new Set(t.outcomes.map((o) => o.id));
        expect((t.beats ?? []).length).toBeGreaterThanOrEqual(1);
        expect((t.beats ?? []).length).toBeLessThanOrEqual(4);
        for (const b of t.beats ?? []) {
          expect(b.radio.length, `${t.id} ${b.kind} radio`).toBeGreaterThan(0);
          for (const r of b.radio) expect(r.et.length > 0 && r.en.length > 0).toBe(true);
          if (typeof b.at === 'number') expect(b.at).toBeGreaterThanOrEqual(0);
          if (b.chance !== undefined) expect(b.chance > 0 && b.chance <= 1).toBe(true);
          if (b.kind === 'query') {
            if (b.queryType === 'vehicle') {
              expect(b.subject).toBe('vehicle');
              expect((t.vehicles ?? []).length, `${t.id}: vehicle query needs vehicles`).toBeGreaterThan(0);
            } else {
              expect(b.subject).not.toBe('vehicle');
              expect(roles.has(b.subject as never), `${t.id}: query subject ${b.subject} not in persons`).toBe(true);
            }
          }
          if (b.kind === 'choice') {
            expect(b.options.length).toBeGreaterThanOrEqual(2);
            const ids = b.options.map((o) => o.id);
            expect(new Set(ids).size).toBe(ids.length);
            expect(ids, `${t.id}: defaultOption`).toContain(b.defaultOption);
            expect(b.timeoutMin).toBeGreaterThan(0);
            for (const o of b.options) if (o.effects.outcome) expect(outcomeIds.has(o.effects.outcome)).toBe(true);
          }
          if (b.kind === 'backup') {
            expect(b.timeoutMin).toBeGreaterThanOrEqual(3);
            expect(b.timeoutMin).toBeLessThanOrEqual(8);
          }
          if (b.kind === 'agency') expect(AGENCIES).toContain(b.agency);
          if (b.kind === 'search') expect(b.radiusKm).toBeGreaterThan(0);
          if (b.kind === 'pursuit') expect((t.vehicles ?? []).length, `${t.id}: pursuit needs a vehicle`).toBeGreaterThan(0);
        }
      });

      it('uses only allowed placeholders, backed by the right persons/vehicles', () => {
        const roles = new Set(t.persons.map((p) => p.role));
        for (const [path, s] of strings(t, t.id)) {
          for (const m of s.matchAll(/\{(\w*)\}/g)) {
            expect(ALLOWED.has(m[1]), `${path}: unknown placeholder {${m[1]}} in "${s}"`).toBe(true);
          }
          expect((s.match(/\{/g) ?? []).length, `${path}: unbalanced braces`).toBe((s.match(/\}/g) ?? []).length);
          if (/\{(plate|car)\}/.test(s)) expect((t.vehicles ?? []).length, `${path} uses a vehicle placeholder`).toBeGreaterThan(0);
          if (/\{(suspect|suspectName)\}/.test(s)) expect(roles.has('suspect'), `${path} uses {suspect}`).toBe(true);
          if (/\{(victim|victimName)\}/.test(s)) expect(roles.has('victim'), `${path} uses {victim}`).toBe(true);
        }
        // {idcode}/{name} refer to the subject of a query beat, so only query radio may use them.
        const outside = strings({ ...t, beats: (t.beats ?? []).filter((b) => b.kind !== 'query') }, t.id);
        for (const [path, s] of outside) expect(/\{(idcode|name)\}/.test(s), `${path}: {idcode}/{name} outside a query beat`).toBe(false);
      });

      it('has a sane call script when present', () => {
        if (!t.call) return;
        expect(t.call.opening.length).toBeGreaterThan(0);
        for (const ru of t.call.openingRu ?? []) expect(ru).toMatch(/[А-Яа-яЁё]/);
      });
    });
  }

  it('flags easter eggs exactly in easter.ts and keeps them rare', () => {
    for (const t of ALL) expect(t.easterEgg === true, `${t.id} easterEgg flag`).toBe(t.category === 'easter');
    for (const t of TEMPLATES_EASTER) expect(t.weight).toBeLessThanOrEqual(0.04);
    expect(TEMPLATES_EASTER.length).toBeGreaterThanOrEqual(12);
    // Once (nearly) all incident files are filled, easter eggs must stay ≤ 1.5 % of the weight.
    if (TEMPLATES.length >= 140) {
      const total = TEMPLATES.reduce((a, t) => a + t.weight, 0);
      const easter = TEMPLATES.filter((t) => t.easterEgg).reduce((a, t) => a + t.weight, 0);
      expect(easter / total).toBeLessThanOrEqual(0.015);
    }
  });

  it('models security alarms as frequently false and not as 112 calls', () => {
    const alarms = TEMPLATES_ALARM.filter((t) => t.tags?.includes('alarm'));
    expect(alarms.length).toBeGreaterThanOrEqual(6);
    for (const t of alarms) {
      expect(t.falseAlarmChance ?? 0, t.id).toBeGreaterThanOrEqual(0.4);
      expect(t.interactiveChance, t.id).toBe(0);
      expect(t.outcomes.some((o) => o.result === 'false_alarm'), t.id).toBe(true);
    }
    expect(TEMPLATES_ALARM.some((t) => t.tags?.includes('anpr') && t.beats?.some((b) => b.kind === 'pursuit'))).toBe(true);
  });

  it('gives a good share of templates a registry check and a call script', () => {
    const withQuery = ALL.filter((t) => (t.beats ?? []).some((b) => b.kind === 'query'));
    expect(withQuery.length / ALL.length).toBeGreaterThanOrEqual(0.45);
    const withVehicleQuery = ALL.filter((t) => (t.beats ?? []).some((b) => b.kind === 'query' && b.queryType === 'vehicle'));
    expect(withVehicleQuery.length).toBeGreaterThanOrEqual(15);
    expect(ALL.filter((t) => t.call).length).toBeGreaterThanOrEqual(15);
    expect(ALL.filter((t) => t.call?.openingRu?.length).length).toBeGreaterThanOrEqual(4);
  });

  it('keeps border content mostly in the eastern / southern prefectures', () => {
    const regional = TEMPLATES_BORDER.filter((t) => t.regions?.length);
    expect(regional.length).toBeGreaterThanOrEqual(5);
    for (const t of regional) expect(t.regions!.some((r) => r === 'ida' || r === 'louna'), t.id).toBe(true);
  });

  it('covers every legacy title of assignment "B"', () => {
    const titles: string[] = assignment.B;
    expect(titles.length).toBe(35);
    for (const title of titles) {
      const hits = ALL.filter((t) => t.legacy && t.title.et === title);
      expect(hits.length, `legacy title "${title}"`).toBe(1);
    }
    for (const t of ALL.filter((x) => x.legacy)) expect(titles, `${t.id} is legacy but not in B`).toContain(t.title.et);
  });

  it('maps legacy support chance and bonus officer type', () => {
    const calls = legacyCalls as { title: string; support_need_chance: number; bonus_officers_type: string | null }[];
    for (const title of assignment.B) {
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
        expect((t.units.ideal ?? []).some((n) => n.type === type), `${t.id}: ideal ${type}`).toBe(true);
      }
    }
  });

  it('does not name real companies in crime texts', () => {
    const banned = /\b(swedbank|swedpank|seb pank|lhv|luminor|bolt(?! cutter)|uber|forus|g4s|rimi|maxima|prisma|selver|circle k|neste|alexela|olerex|omniva|dpd|starship|osta\.ee|okidoki)\b/i;
    for (const t of ALL) for (const [path, s] of strings(t, t.id)) expect(banned.test(s), `${path}: "${s}"`).toBe(false);
  });
});
