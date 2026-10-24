/**
 * Where incidents happen: a lake place stands for the water itself (its point lies on the lake), so it suits
 * drownings, boats, ice and the border on Peipus, never a crime on land (a cottage burglary showed up in the
 * middle of Ülemiste järv, 2.23.1). A story that needs a particular kind of place names its tags
 * (IncidentTemplate.placeTags, 2.30.0): a ferry queue happens at a ferry port, not at the cargo harbour.
 */
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@/data/incidents';
import { REGIONS } from '@/data/regions';
import { pickLocation, taggedPlaces } from '@/gen/address';
import { helpTemplates } from '@/sim/colleagues';
import { createShift } from '@/sim/engine';
import { Rng } from '@/sim/rng';
import { createIncident, placeAvailability, templateWeight } from '@/sim/spawner';
import { tallinnTime } from '@/sim/time';
import type { IncidentTemplate } from '@/sim/types';

const LAND_ONLY = new Set(['property', 'domestic', 'violence', 'drugs', 'fraud', 'alarm']);

describe('incident places', () => {
  it('keeps land crimes off open water', () => {
    const wet = TEMPLATES.filter((t) => LAND_ONLY.has(t.category) && (t.places ?? []).includes('lake'));
    expect(wet.map((t) => t.id)).toEqual([]);
  });

  it('lights no illegal fire on a lake', () => {
    for (const t of TEMPLATES.filter((x) => /tule|fire/i.test(`${x.title.et} ${x.title.en}`)))
      expect(t.places ?? [], t.id).not.toContain('lake');
  });
});

describe('place tags (IncidentTemplate.placeTags)', () => {
  const T = (et: string, en: string) => ({ et, en });
  const QUEUE: IncidentTemplate = {
    id: 'test_ferry_queue',
    category: 'public_order',
    code: 'ÖR',
    title: T('Praamijärjekord', 'Ferry queue'),
    priority: 3,
    weight: 1,
    places: ['port'],
    placeTags: ['queue'],
    units: { need: [{ type: 'patrol', count: 1 }] },
    onScene: [15, 30],
    persons: [{ role: 'caller' }],
    summary: [T('{address}. Järjekorras tülitsetakse.', '{address}. A row in the queue.')],
    outcomes: [{ id: 'ok', weight: 1, result: 'resolved', text: T('Rahunesid.', 'Calmed down.') }],
  };

  it('puts the story only at a place that carries one of its tags', () => {
    const s = createShift({ seed: 9, regionId: 'laane', mode: 'free', difficulty: 'normal', start: tallinnTime(2026, 7, 10, 12, 0), hours: 4, playerName: 'Test' });
    const allowed = new Set(taggedPlaces(REGIONS.laane, ['port'], ['queue']).map((p) => p.name));
    expect(allowed.size).toBeGreaterThanOrEqual(2);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const inc = createIncident(s, QUEUE);
      expect(allowed.has(inc.location.placeName ?? ''), inc.location.placeName).toBe(true);
      seen.add(inc.location.placeName ?? '');
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('never spawns where no place carries the tag, and stays out of colleagues’ help calls', () => {
    expect(placeAvailability(REGIONS.laane, ['port'], ['queue'])).toBe(1);
    expect(placeAvailability(REGIONS.pohja, ['port'], ['queue'])).toBe(0);
    const s = createShift({ seed: 9, regionId: 'pohja', mode: 'free', difficulty: 'normal', start: tallinnTime(2026, 7, 10, 12, 0), hours: 4, playerName: 'Test' });
    const ctx = { hour: 12, weekday: 2, month: 7, season: 'summer', weekendNight: false, trafficF: 1, wet: false, dayTags: [] as string[] };
    expect(templateWeight(s, QUEUE, ctx)).toBe(0);
    expect(templateWeight(s, { ...QUEUE, placeTags: undefined }, ctx)).toBeGreaterThan(0);
    for (const t of helpTemplates()) expect(t.placeTags ?? [], t.id).toEqual([]);
  });

  it('leaves the pick of every untagged story exactly as it was', () => {
    // Recorded with pickLocation at 2.29.0, before placeTags: an untagged pick must not move (daily challenge, race rooms).
    const got = Object.values(REGIONS).flatMap((region) =>
      [1, 2, 3, 4, 5].map((seed) => pickLocation(new Rng(seed), region, [(['street', 'port', 'lake', 'village', 'mall'] as const)[seed % 5]], []).address),
    );
    expect(got).toEqual([
      'Lõunasadam, Paldiski', 'Marguse küla, Harju maakond', 'Kaunissaare küla, Harju maakond', 'Sõpruse tee 15', 'Punane tn 62',
      'Kesk tn 2', 'Arumäe küla, Ida-Viru maakond', 'Pühajõe küla, Ida-Viru maakond', 'Lõuna põik 2', 'Tallinna mnt 31',
      'Tooni küla, Tartu vald', 'Ranna küla, Tartu maakond', 'Kõpu alevik, Viljandi maakond', 'Jüri 41', 'Ranna pst 16',
      'Sadama tn 13', 'Hageri küla, Rapla maakond', 'Rahtla küla, Saare maakond', 'Pärnu tn 6', 'Promenaadi tn 8',
    ]);
  });

  it('every tag a template asks for exists at one of its place kinds in each of its prefectures', () => {
    for (const t of TEMPLATES.filter((x) => x.placeTags?.length)) {
      for (const r of t.regions ?? (Object.keys(REGIONS) as (keyof typeof REGIONS)[])) {
        expect(taggedPlaces(REGIONS[r], t.places, t.placeTags!).length, `${t.id} in ${r}`).toBeGreaterThan(0);
      }
    }
  });
});
