/**
 * The checks every hand-written incident file passes (moved here from tests/incidents-escalating.test.ts so
 * that the regional stories get the same ones): each template is valid, its 112 call reads cleanly in
 * Estonian and Russian, it spawns and plays to a valid ending with a headless dispatcher, and its escalation
 * fires when the dispatcher is slow but not when a unit is on scene in time.
 */
import { describe, expect, it } from 'vitest';
import { REGIONS } from '@/data/regions';
import { callAnswer, callAsk, callInterpreter, maybeCreateCall } from '@/sim/calls';
import { acknowledge, closeIncident, directorMoveUnit, directorSpawn, dispatchUnits, replyRadio, requestAgency } from '@/sim/commands';
import { createShift, step } from '@/sim/engine';
import { correctReply } from '@/sim/registry';
import { radioClosure } from '@/sim/radioText';
import { pendingRadio, recommendUnits } from '@/sim/selectors';
import { CALLER_PATIENCE, DEFAULT_EXPIRES_MIN, createIncident } from '@/sim/spawner';
import { TEMPLATE_PLACEHOLDERS, fillText } from '@/sim/text';
import { MIN, tallinnTime } from '@/sim/time';
import type { Agency, CallQuestionId, ChoiceBeat, IncidentTemplate, PlaceKind, RegionId, SimState, Text } from '@/sim/types';

export const PLACE_KINDS = new Set<PlaceKind>([
  'residential', 'house', 'street', 'bar', 'nightclub', 'mall', 'shop', 'bank', 'school', 'kindergarten', 'university',
  'hospital', 'park', 'beach', 'forest', 'lake', 'highway', 'ruralroad', 'trainstation', 'busstation', 'port', 'airport',
  'stadium', 'concert', 'office', 'industrial', 'construction', 'parking', 'hotel', 'church', 'cemetery', 'gasstation',
  'government', 'embassy', 'prison', 'border', 'farm', 'summerhouse', 'village', 'oldtown', 'museum',
]);
const NAMED_PLACE_KINDS = new Set<string>([
  'airport', 'port', 'border', 'prison', 'embassy', 'stadium', 'concert', 'university', 'hospital', 'museum',
  'oldtown', 'beach', 'trainstation', 'government', 'hotel', 'mall', 'bank', 'nightclub', 'lake',
]);
const AGENCIES = new Set<Agency>(['kiirabi', 'paaste', 'keskkonnaamet', 'kapo', 'kov', 'sotsiaal', 'merepaaste', 'tolliamet', 'transpordiamet', 'veterinaar']);
const NATIONAL_ONLY = new Set<string>(['special', 'heli', 'boat']);
const BAD_RESULTS = ['escaped', 'tragedy', 'unfounded', 'false_alarm', 'hospital', 'report', 'referred', 'warning'];
const ALLOWED = new Set<string>(TEMPLATE_PLACEHOLDERS);
const LAW = /§|(?<![\p{L}])(KarS|NPALS|KorS|KrMS|VTMS|VTK|LS|RelvS|JahiS)(?![\p{L}])/u;
export const DASHES = new RegExp('[\\u2013\\u2014]');
const SUCCESS_GRID = Array.from({ length: 21 }, (_, i) => i / 20);

const eligible = (o: { minSuccess?: number; maxSuccess?: number }, s: number) => (o.minSuccess ?? 0) <= s + 1e-9 && s <= (o.maxSuccess ?? 1) + 1e-9;
const nonEmpty = (t: Text | undefined) => !!t && t.et.trim().length > 0 && t.en.trim().length > 0;

/** Every string anywhere inside a value, with a path for error messages. */
function strings(v: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof v === 'string') out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out);
  return out;
}

/** Texts that go on the radio or into the 112 call (no law paragraphs there). */
function spokenTexts(t: IncidentTemplate): Text[] {
  const out: Text[] = [...(t.callerLines ?? [])];
  for (const b of t.beats ?? []) {
    out.push(...b.radio);
    if (b.kind === 'choice') for (const o of b.options) out.push(o.label, o.reply);
  }
  if (t.escalation) out.push(t.escalation.text);
  for (const o of t.outcomes) if (o.radio) out.push(o.radio);
  if (t.call) {
    out.push(...t.call.opening);
    for (const list of Object.values(t.call.answers ?? {})) out.push(...(list ?? []));
  }
  return out;
}

/** A region and a date in which the template can happen. */
export function setting(t: IncidentTemplate): { regionId: RegionId; month: number } {
  const regionId = (t.regions?.[0] ?? (t.places.includes('border') ? 'ida' : 'pohja')) as RegionId;
  const month = t.months?.[0] ?? 10;
  return { regionId, month };
}

function shiftFor(t: IncidentTemplate, seed: number, hour = 12): SimState {
  const { regionId, month } = setting(t);
  return createShift({ seed, regionId, mode: 'director', difficulty: 'normal', start: tallinnTime(2026, month, 14, hour, 0), hours: 8, playerName: 'Test' });
}

/** A good dispatcher: sends what is needed and what is ideal, answers checks correctly, takes the best decision. */
function goodDispatcher(s: SimState, incId: string, tick: number, list: IncidentTemplate[]): void {
  const inc = s.incidents[incId];
  if (!inc || inc.state === 'closed') return;
  if (inc.state === 'incoming') acknowledge(s, incId);
  const recs = recommendUnits(s, incId);
  const needCount = inc.need.reduce((a, n) => a + n.count, 0);
  const idealCount = Math.max(needCount, inc.ideal.reduce((a, n) => a + n.count, 0));
  const backupOpen = inc.beats.some((b) => b.status === 'active' && s.radio.some((m) => m.id === b.radioId && m.kind === 'backup'));
  const want = backupOpen ? 1 : inc.assigned.length < needCount ? needCount - inc.assigned.length : tick % 3 === 0 && inc.assigned.length < idealCount ? 1 : 0;
  if (want > 0) {
    const pick = recs.filter((r) => r.fit === 'ideal' || r.fit === 'need').slice(0, want);
    if (pick.length) dispatchUnits(s, incId, pick.map((r) => r.unit.id));
  }
  for (const n of inc.agencyNeeds) if (!n.requested) requestAgency(s, incId, n.agency);
  for (const msg of pendingRadio(s)) {
    if (msg.incidentId !== incId || !msg.replies?.length) continue;
    let reply = msg.replies[0].id;
    if (msg.kind === 'query') {
      const subj = inc.persons.find((p) => msg.text.et.includes(s.persons[p.personId]?.idcode ?? '§§'));
      const veh = inc.vehicles.find((v) => msg.text.et.includes(v.plate));
      if (subj || veh) {
        const truth = correctReply(s, subj ? { personId: subj.personId } : { plate: veh!.plate });
        if (msg.replies.some((r) => r.id === truth)) reply = truth;
      }
    } else if (msg.kind === 'choice') {
      const tpl = list.find((x) => x.id === inc.templateId);
      const beat = inc.beats.find((b) => b.radioId === msg.id);
      const spec = beat ? tpl?.beats?.[beat.index] : undefined;
      if (spec?.kind === 'choice') reply = [...spec.options].sort((a, b) => (b.effects.success ?? 0) - (a.effects.success ?? 0))[0].id;
    }
    replyRadio(s, msg.id, reply);
  }
}

/** Spawn the template where a road unit can get to it (a few small islands are boat or helicopter only). */
function spawnReachable(s: SimState, t: IncidentTemplate): string {
  let id = '';
  for (let k = 0; k < 12; k++) {
    id = directorSpawn(s, { templateId: t.id });
    expect(id, `${t.id} did not spawn`).not.toBe('');
    if (recommendUnits(s, id).some((r) => r.fit === 'ideal' || r.fit === 'need')) return id;
    closeIncident(s, id, 'duplicate');
  }
  return id;
}

function play(t: IncidentTemplate, seed: number, list: IncidentTemplate[]): { s: SimState; incId: string } {
  const s = shiftFor(t, seed);
  const incId = spawnReachable(s, t);
  for (let tick = 0; tick < 10 * 60 && s.incidents[incId].state !== 'closed'; tick++) {
    goodDispatcher(s, incId, tick, list);
    step(s, MIN);
  }
  return { s, incId };
}

/** Registers the template validity, 112 call, headless play and escalation checks for `list` under `label`. */
export function incidentSuite(label: string, list: IncidentTemplate[]): void {
  // ───────────────────────────────────────────────────────────────────────────
  // Static validity
  // ───────────────────────────────────────────────────────────────────────────

  describe(`${label}: template validity`, () => {
    for (const t of list) {
      describe(t.id, () => {
        it('has valid basics', () => {
          expect(nonEmpty(t.title)).toBe(true);
          expect(t.code.trim().length).toBeGreaterThan(0);
          expect([1, 2, 3, 4]).toContain(t.priority);
          expect(t.weight).toBeGreaterThan(0);
          expect(t.weight).toBeLessThanOrEqual(3);
          expect(t.places.length).toBeGreaterThan(0);
          for (const p of t.places) expect(PLACE_KINDS.has(p), `${t.id} place ${p}`).toBe(true);
          for (const r of t.regions ?? []) expect(Object.keys(REGIONS), `${t.id} region ${r}`).toContain(r);
          expect(t.units.need.length).toBeGreaterThan(0);
          for (const n of t.units.need) expect(NATIONAL_ONLY.has(n.type), `${t.id}: hard need ${n.type}`).toBe(false);
          for (const n of [...t.units.need, ...(t.units.ideal ?? [])]) expect(n.count).toBeGreaterThan(0);
          expect(t.onScene[0]).toBeGreaterThanOrEqual(10);
          expect(t.onScene[0]).toBeLessThanOrEqual(t.onScene[1]);
          expect(t.onScene[1]).toBeLessThanOrEqual(150);
          expect(t.persons.length).toBeGreaterThan(0);
          if (Array.isArray(t.hours)) expect(t.hours.length).toBe(24);
          if (t.months) for (const m of t.months) expect(m >= 1 && m <= 12).toBe(true);
          if (t.falseAlarmChance !== undefined) expect(t.falseAlarmChance > 0 && t.falseAlarmChance < 0.6).toBe(true);
          if (t.interactiveChance !== undefined) expect(t.interactiveChance >= 0 && t.interactiveChance <= 1).toBe(true);
          if (t.expiresMin !== undefined) expect(t.expiresMin, t.id).toBeGreaterThanOrEqual({ 1: 20, 2: 35, 3: 60, 4: 120 }[t.priority]);
          for (const a of t.agencies ?? []) {
            expect(AGENCIES.has(a.agency)).toBe(true);
            expect(a.chance >= 0 && a.chance <= 1).toBe(true);
            expect(nonEmpty(a.reason)).toBe(true);
          }
          for (const p of t.persons) {
            if (p.age) expect(p.age[0]).toBeLessThanOrEqual(p.age[1]);
            for (const k of ['wanted', 'record', 'restraining', 'weapon', 'noLicense', 'probation', 'intoxicated'] as const) {
              const v = p[k];
              if (v !== undefined) expect(v >= 0 && v <= 1, `${t.id} ${p.role}.${k}`).toBe(true);
            }
          }
          const roles = new Set(t.persons.map((p) => p.role));
          for (const v of t.vehicles ?? []) if (v.driverRole) expect(roles.has(v.driverRole), `${t.id}: driverRole ${v.driverRole}`).toBe(true);
        });

        it('escalates fairly: a worse priority, after a delay a unit can beat, with a bilingual update', () => {
          if (!t.escalation) return;
          const e = t.escalation;
          expect(e.toPriority).toBeLessThan(t.priority);
          expect(e.chance > 0 && e.chance <= 1).toBe(true);
          expect(e.afterMin).toBeGreaterThanOrEqual(10);
          // The caller is still waiting when it happens.
          expect(e.afterMin).toBeLessThan((t.expiresMin ?? DEFAULT_EXPIRES_MIN[t.priority]) * CALLER_PATIENCE);
          expect(nonEmpty(e.text)).toBe(true);
          // A detail shown on acknowledgement warns the dispatcher before it happens.
          expect((t.details ?? []).length).toBeGreaterThanOrEqual(1);
        });

        it('has Häirekeskus-style summaries, caller lines and details', () => {
          expect(t.summary.length).toBeGreaterThanOrEqual(2);
          expect(t.summary.length).toBeLessThanOrEqual(4);
          const named = t.places.every((k) => NAMED_PLACE_KINDS.has(k));
          for (const s of t.summary) {
            expect(nonEmpty(s)).toBe(true);
            expect(/^\{(address|place)\}/.test(s.et) && /^\{(address|place)\}/.test(s.en), s.et).toBe(true);
            if (s.et.startsWith('{place}')) expect(named, `${t.id}: {place} lead needs named place kinds`).toBe(true);
          }
          expect((t.callerLines ?? []).length).toBeGreaterThanOrEqual(2);
          expect((t.callerLines ?? []).length).toBeLessThanOrEqual(4);
          for (const c of t.callerLines ?? []) {
            expect(nonEmpty(c)).toBe(true);
            // Callers speak in the first person: no card wording in their mouths.
            expect(c.et, c.et).not.toMatch(/teataja|helistaja/i);
            expect(c.en, c.en).not.toMatch(/the caller/i);
          }
          expect((t.details ?? []).length).toBeGreaterThanOrEqual(1);
          expect((t.details ?? []).length).toBeLessThanOrEqual(3);
          for (const d of t.details ?? []) expect(nonEmpty(d)).toBe(true);
        });

        it('has 1-4 consistent beats', () => {
          const beats = t.beats ?? [];
          expect(beats.length).toBeGreaterThanOrEqual(1);
          expect(beats.length).toBeLessThanOrEqual(4);
          const roles = new Set(t.persons.map((p) => p.role));
          const outcomeIds = new Set(t.outcomes.map((o) => o.id));
          const hasVehicle = (t.vehicles ?? []).length > 0;
          for (const b of beats) {
            expect(b.radio.length).toBeGreaterThan(0);
            for (const r of b.radio) expect(nonEmpty(r)).toBe(true);
            if (b.chance !== undefined) expect(b.chance > 0 && b.chance <= 1).toBe(true);
            if (typeof b.at === 'number') {
              expect(b.at).toBeGreaterThanOrEqual(0);
              expect(b.at, `${t.id}: beat after the minimum on-scene time`).toBeLessThan(t.onScene[0]);
            }
            switch (b.kind) {
              case 'query':
                if (b.queryType === 'person') expect(roles.has(b.subject as never), `${t.id}: query subject ${b.subject}`).toBe(true);
                else expect(b.subject === 'vehicle' && hasVehicle, `${t.id}: vehicle query`).toBe(true);
                break;
              case 'choice': {
                expect(b.options.length).toBeGreaterThanOrEqual(2);
                const ids = b.options.map((o) => o.id);
                expect(new Set(ids).size).toBe(ids.length);
                expect(ids).toContain(b.defaultOption);
                expect(b.timeoutMin).toBeGreaterThan(0);
                for (const o of b.options) {
                  expect(nonEmpty(o.label) && nonEmpty(o.reply)).toBe(true);
                  if (o.effects.outcome) expect(outcomeIds.has(o.effects.outcome)).toBe(true);
                }
                break;
              }
              case 'backup':
                expect(b.timeoutMin).toBeGreaterThanOrEqual(3);
                expect(b.timeoutMin).toBeLessThanOrEqual(8);
                expect(NATIONAL_ONLY.has(b.need.type)).toBe(false);
                break;
              case 'agency':
                expect(AGENCIES.has(b.agency)).toBe(true);
                expect(b.timeoutMin).toBeGreaterThan(0);
                break;
              case 'pursuit':
                expect(hasVehicle, `${t.id}: pursuit needs a vehicle`).toBe(true);
                break;
              case 'search':
                expect(b.radiusKm).toBeGreaterThanOrEqual(1);
                expect(b.radiusKm).toBeLessThanOrEqual(8);
                break;
              case 'transport':
                expect(b.paperworkMin[0]).toBeLessThanOrEqual(b.paperworkMin[1]);
                break;
              case 'escalate':
                expect(b.toPriority).toBeLessThan(t.priority);
                break;
              default:
                break;
            }
          }
        });

        it('has 3-6 outcomes covering the whole success range, with a fair worst case', () => {
          expect(t.outcomes.length).toBeGreaterThanOrEqual(3);
          expect(t.outcomes.length).toBeLessThanOrEqual(6);
          expect(new Set(t.outcomes.map((o) => o.id)).size).toBe(t.outcomes.length);
          for (const o of t.outcomes) {
            expect(o.weight).toBeGreaterThan(0);
            expect(nonEmpty(o.text)).toBe(true);
            expect(o.minSuccess ?? 0).toBeLessThanOrEqual(o.maxSuccess ?? 1);
            // Tragic endings only fit a badly handled event.
            if (o.result === 'tragedy') expect(o.maxSuccess ?? 1, `${t.id}/${o.id}`).toBeLessThanOrEqual(0.25);
          }
          const real = t.outcomes.filter((o) => o.result !== 'false_alarm');
          for (const s of SUCCESS_GRID) expect(real.some((o) => eligible(o, s)), `${t.id}: no outcome at ${s}`).toBe(true);
          expect(real.some((o) => eligible(o, 0.05) && BAD_RESULTS.includes(o.result)), `${t.id}: low-success ending`).toBe(true);
          expect(real.some((o) => eligible(o, 0.95) && !['escaped', 'tragedy'].includes(o.result)), `${t.id}: high-success ending`).toBe(true);
          expect(t.outcomes.some((o) => o.maxSuccess !== undefined && o.maxSuccess <= 0.5)).toBe(true);
          expect(t.outcomes.some((o) => o.minSuccess !== undefined && o.minSuccess >= 0.4)).toBe(true);
        });

        it('makes the best decision the one with the highest success', () => {
          for (const b of (t.beats ?? []).filter((x): x is ChoiceBeat => x.kind === 'choice')) {
            const best = Math.max(...b.options.map((o) => o.effects.success ?? 0));
            const worst = Math.min(...b.options.map((o) => o.effects.success ?? 0));
            expect(best, `${t.id}: a decision with no better option`).toBeGreaterThan(worst - 1e-9);
            expect(best).toBeGreaterThan(0);
          }
        });

        it('uses only allowed placeholders, backed by the right persons and vehicles', () => {
          const roles = new Set(t.persons.map((p) => p.role));
          for (const [path, s] of strings(t, t.id)) {
            for (const m of s.matchAll(/\{(\w*)\}/g)) expect(ALLOWED.has(m[1]), `${path}: {${m[1]}}`).toBe(true);
            expect((s.match(/\{/g) ?? []).length, `${path}: unbalanced braces`).toBe((s.match(/\}/g) ?? []).length);
            if (/\{(plate|car)\}/.test(s)) expect((t.vehicles ?? []).length, `${path} uses a vehicle placeholder`).toBeGreaterThan(0);
            if (/\{(suspect|suspectName)\}/.test(s)) expect(roles.has('suspect'), `${path} uses {suspect}`).toBe(true);
            if (/\{(victim|victimName)\}/.test(s)) expect(roles.has('victim'), `${path} uses {victim}`).toBe(true);
            expect(DASHES.test(s), `${path}: dash`).toBe(false);
          }
          const outside = strings({ ...t, beats: (t.beats ?? []).filter((b) => b.kind !== 'query') }, t.id);
          for (const [path, s] of outside) expect(/\{(idcode|name)\}/.test(s), `${path}: {idcode}/{name} outside a query beat`).toBe(false);
          // Caller lines are spoken: only what the 112 caller can fill in.
          for (const c of [...(t.callerLines ?? []), ...(t.call?.opening ?? []), ...Object.values(t.call?.answers ?? {}).flat()]) {
            for (const m of `${c!.et} ${c!.en}`.matchAll(/\{(\w+)\}/g)) expect(['idcode', 'name', 'callsign', 'agency']).not.toContain(m[1]);
            expect(`${c!.et} ${c!.en}`, 'no markers in spoken lines').not.toMatch(/[[\]]/);
          }
        });

        it('keeps law paragraphs out of the radio and the 112 call, and closes with a short report', () => {
          for (const s of spokenTexts(t)) {
            expect(s.et, s.et).not.toMatch(LAW);
            expect(s.en, s.en).not.toMatch(LAW);
          }
          for (const o of t.outcomes) {
            const r = o.radio ?? radioClosure(o.text, o.result);
            for (const [lang, max] of [['et', 10], ['en', 12]] as const) {
              const body = r[lang].replace(/^\{(callsign|short)\}:\s*/, '');
              expect(r[lang], `${t.id}/${o.id}`).toMatch(/^\{(callsign|short)\}: \S/);
              expect(r[lang], `${t.id}/${o.id}`).toMatch(/[.!?]$/);
              expect(body.split(/\s+/).length, `${t.id}/${o.id}: ${r[lang]}`).toBeLessThanOrEqual(max);
            }
          }
        });

        if (t.call) {
          it('has a usable call script with Russian lines that match the Estonian ones', () => {
            expect(t.call!.opening.length).toBeGreaterThan(0);
            for (const o of t.call!.opening) expect(nonEmpty(o)).toBe(true);
            for (const list of Object.values(t.call!.answers ?? {})) for (const a of list ?? []) expect(nonEmpty(a)).toBe(true);
            for (const a of t.call!.answers?.name ?? []) expect(a.et).not.toMatch(/^(Ta|Tema)\b/);
            const ru = t.call!.openingRu ?? [];
            for (const line of ru) expect(line).toMatch(/[А-Яа-яЁё]/);
            expect(ru.length).toBeLessThanOrEqual(t.call!.opening.length);
          });
        }

        it('names no real companies', () => {
          const banned = /\b(swedbank|swedpank|seb pank|lhv|luminor|bolt(?! cutter)|uber|forus|g4s|rimi|maxima|prisma|selver|circle k|neste|alexela|olerex|omniva|dpd|starship|osta\.ee|okidoki)\b/i;
          for (const [path, s] of strings(t, t.id)) expect(banned.test(s), `${path}: "${s}"`).toBe(false);
        });
      });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 112 calls
  // ───────────────────────────────────────────────────────────────────────────

  describe(`${label}: 112 calls`, () => {
    const ALL_Q: CallQuestionId[] = ['what', 'where', 'injured', 'weapons', 'suspect', 'vehicle', 'direction', 'count', 'when', 'name', 'safe', 'children', 'intoxicated'];
    for (const t of list) {
      it(`${t.id}: a full call reads cleanly in Estonian and Russian`, () => {
        const { regionId, month } = setting(t);
        const s = createShift({ seed: 23, regionId, mode: 'free', difficulty: 'realistic', start: tallinnTime(2026, month, 16, 12, 0), hours: 8, playerName: 'Test' });
        for (const lang of ['et', 'ru'] as const) {
          s.calls = [];
          const inc = createIncident(s, t);
          inc.source = 'hk';
          const call = maybeCreateCall(s, inc, { ...t, interactiveChance: 1 })!;
          expect(call, t.id).toBeTruthy();
          call.prank = undefined;
          if (call.mood === 'prank') call.mood = 'calm';
          call.lang = lang;
          callAnswer(s, call.id);
          if (lang === 'ru') callInterpreter(s, call.id);
          for (const q of ALL_Q) callAsk(s, call.id, q);
          const lines = call.lines.filter((l) => l.who === 'caller');
          expect(lines.length).toBeGreaterThan(5);
          for (const l of lines) {
            for (const x of [l.text.et, l.text.en, l.ru ?? '']) expect(x, `${t.id} ${lang}: ${x}`).not.toMatch(/\{\w+\}|[[\]]|\{[^}]*\||undefined|§/);
          }
          // The caller's own words: never the card's "teataja" about themselves.
          const what = lines[1]?.text;
          if (what) expect(what.et, `${t.id} ${lang}`).not.toMatch(/Ja veel:|teataja|helistaja/i);
        }
      });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Headless play
  // ───────────────────────────────────────────────────────────────────────────

  describe(`${label}: headless play`, () => {
    for (const t of list) {
      it(`${t.id} spawns and plays to a valid ending`, () => {
        const { s, incId } = play(t, 101, list);
        const inc = s.incidents[incId];
        for (const txt of [inc.summary, ...inc.details, ...inc.hiddenDetails]) expect(`${txt.et} ${txt.en}`, `${t.id}: "${txt.et}"`).not.toMatch(/\{\w+\}/);
        expect(inc.state, `${t.id} still open`).toBe('closed');
        expect(inc.closedBy, t.id).toBe('units');
        const ids = new Set(t.outcomes.map((o) => o.id));
        expect(ids.has(inc.outcome!.id), `${t.id}: outcome ${inc.outcome?.id}`).toBe(true);
        expect(`${inc.outcome!.text.et} ${inc.outcome!.text.en}`).not.toMatch(/\{\w+\}|undefined/);
        // A good dispatcher never gets the tragic ending.
        expect(inc.outcome!.result, `${t.id}: ${inc.outcome!.id}`).not.toBe('tragedy');
        for (const m of s.radio.filter((x) => x.incidentId === incId)) {
          expect(`${m.text.et} ${m.text.en}`, m.text.et).not.toMatch(/\{\w+\}|undefined|§/);
        }
        expect(() => JSON.parse(JSON.stringify(s))).not.toThrow();
      }, 60_000);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Escalation: slow dispatch makes it worse, a unit on scene in time prevents it
  // ───────────────────────────────────────────────────────────────────────────

  describe(`${label}: escalation paths`, () => {
    const withEscalation = list.filter((t) => t.escalation);

    for (const t of withEscalation) {
      it(`${t.id}: escalates when nobody comes in time`, () => {
        const e = t.escalation!;
        const s = shiftFor(t, 202);
        const ids: string[] = [];
        for (let k = 0; k < 20; k++) ids.push(directorSpawn(s, { templateId: t.id }));
        for (const id of ids) acknowledge(s, id);
        for (let m = 0; m <= e.afterMin + 1; m++) step(s, MIN);
        const escalated = ids.map((id) => s.incidents[id]).filter((inc) => inc.escalated);
        expect(escalated.length, `${t.id}: never escalated in 20 tries (chance ${e.chance})`).toBeGreaterThan(0);
        for (const inc of escalated) {
          expect(inc.truePriority).toBe(e.toPriority);
          const text = fillText(e.text, {});
          expect(inc.timeline.some((x) => x.kind === 'hk' && x.text.et.includes(text.et.slice(0, 20))), `${t.id}: no HK update in the timeline`).toBe(true);
        }
        // HK announced it on the radio.
        expect(s.radio.some((m) => m.from === 'HK' && escalated.some((inc) => m.incidentId === inc.id))).toBe(true);
      });

      it(`${t.id}: does not escalate when a unit is on scene in time`, () => {
        const e = t.escalation!;
        const s = shiftFor(t, 303);
        const id = spawnReachable(s, t);
        const inc = s.incidents[id];
        acknowledge(s, id);
        const rec = recommendUnits(s, id).find((r) => r.fit === 'ideal' || r.fit === 'need')!;
        expect(rec, `${t.id}: no unit to send`).toBeDefined();
        // A crew that happens to be round the corner.
        directorMoveUnit(s, rec.unit.id, inc.location.coord, { instant: true });
        expect(dispatchUnits(s, id, [rec.unit.id]).ok).toBe(true);
        for (let m = 0; m < 3 && inc.firstArrivalAt === undefined; m++) step(s, MIN);
        expect(inc.firstArrivalAt, `${t.id}: unit did not arrive`).toBeDefined();
        expect(inc.escalated ?? false).toBe(false);
        for (let m = 0; m <= e.afterMin + 1 && inc.state !== 'closed'; m++) step(s, MIN);
        // The pre-arrival escalation never fires once a unit is there.
        const text = fillText(e.text, {});
        expect(inc.timeline.some((x) => x.kind === 'hk' && x.text.et.includes(text.et.slice(0, 20)))).toBe(false);
      });
    }

    const cases = list.filter((t) => (t.beats ?? []).some((b) => b.kind === 'backup' && b.failEffects.escalate));
    if (cases.length) {
      it('a backup request left unanswered turns the scene worse (and a sent backup prevents it)', () => {
        for (const t of cases) {
          const bi = t.beats!.findIndex((b) => b.kind === 'backup' && b.failEffects.escalate);
          for (const sendBackup of [false, true]) {
            const s = shiftFor(t, 404);
            const id = spawnReachable(s, t);
            const inc = s.incidents[id];
            acknowledge(s, id);
            // Make sure the backup request is part of this story.
            const beat = inc.beats[bi];
            beat.status = 'pending';
            const status = (): string => beat.status;
            const first = recommendUnits(s, id).filter((r) => r.fit === 'ideal' || r.fit === 'need').slice(0, inc.need.reduce((a, n) => a + n.count, 0));
            for (const r of first) directorMoveUnit(s, r.unit.id, inc.location.coord, { instant: true });
            dispatchUnits(s, id, first.map((r) => r.unit.id));
            for (let m = 0; m < 40 && inc.state !== 'closed' && status() !== 'done' && status() !== 'failed'; m++) {
              if (sendBackup && status() === 'active') {
                const extra = recommendUnits(s, id).filter((r) => r.fit === 'ideal' || r.fit === 'need').slice(0, 2);
                if (extra.length) dispatchUnits(s, id, extra.map((r) => r.unit.id));
              }
              step(s, MIN);
            }
            if (sendBackup) {
              expect(status(), `${t.id}: backup sent in time`).toBe('done');
              expect(inc.escalated ?? false, `${t.id}: escalated although backup came`).toBe(false);
            } else {
              expect(status(), `${t.id}: backup request timed out`).toBe('failed');
              expect(inc.escalated, `${t.id}: no escalation after the missed backup`).toBe(true);
              expect(inc.truePriority).toBe(1);
            }
          }
        }
      });
    }
  });
}
