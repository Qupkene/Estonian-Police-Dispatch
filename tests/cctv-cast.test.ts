/**
 * Kaamerad (docs/CCTV.md section 7): the kind of scene an incident makes and its cast. Every template of the
 * catalogue gets a kind and a cast without throwing; well-known templates get the kind a person would expect.
 */
import { describe, expect, it } from 'vitest';
import { TEMPLATE_BY_ID, TEMPLATES } from '@/data/incidents';
import { directorSpawn } from '@/sim/commands';
import { createShift } from '@/sim/engine';
import { withScenario } from '@/sim/scenario';
import { tallinnTime } from '@/sim/time';
import type { Incident, IncidentTemplate, PlaceKind } from '@/sim/types';
import { STOP_STORY, castOf, sceneKindOf, stopStoryOf, variantOf, type SceneKind } from '@/cctv/cast';

const KINDS: SceneKind[] = ['brawl', 'threat', 'disorder', 'lying', 'crash', 'stop', 'theft', 'indoor', 'crowd', 'fire', 'empty'];
const DRESS = { season: 'autumn', temp: 8 } as const;

/** What sceneKindOf reads of an incident, made from a template at one of its places. */
function probe(tpl: IncidentTemplate, place: PlaceKind, falseAlarm = false): Parameters<typeof sceneKindOf>[0] {
  return {
    category: tpl.category,
    tags: tpl.tags ?? [],
    templateId: tpl.id,
    location: { placeKind: place } as Incident['location'],
    falseAlarm,
    truePriority: tpl.priority,
    vehicles: (tpl.vehicles ?? []).map((v, i) => ({ plate: `T${i}`, role: v.role })) as Incident['vehicles'],
    persons: tpl.persons.map((p, i) => ({ personId: `p${i}`, role: p.role })) as Incident['persons'],
  };
}

const kindAt = (id: string, place: PlaceKind) => sceneKindOf(probe(TEMPLATE_BY_ID[id], place));

function newShift(seed = 5) {
  return createShift({
    seed,
    regionId: 'pohja',
    mode: 'director',
    difficulty: 'normal',
    start: tallinnTime(2026, 10, 23, 19, 0),
    hours: 6,
    playerName: 'Kaamera',
    weather: 'clear',
  });
}

describe('cctv cast: the kind of scene', () => {
  it('every template of the catalogue gets a kind at each of its places', () => {
    const all = Object.values(TEMPLATE_BY_ID);
    expect(all.length).toBeGreaterThan(300);
    const seen = new Set<SceneKind>();
    for (const tpl of all) {
      for (const place of tpl.places) {
        const kind = sceneKindOf(probe(tpl, place));
        expect(KINDS, `${tpl.id} at ${place}`).toContain(kind);
        seen.add(kind);
        // A false alarm shows nothing, whatever the caller said.
        expect(sceneKindOf(probe(tpl, place, true))).toBe('empty');
      }
    }
    // The catalogue uses every kind of scene.
    expect([...seen].sort()).toEqual([...KINDS].sort());
  });

  it('well-known templates make the scene a person would expect', () => {
    const table: [string, PlaceKind, SceneKind][] = [
      ['violence_bar_fight_outside', 'street', 'brawl'],
      ['violence_street_stabbing', 'street', 'threat'],
      ['violence_knife_threat', 'residential', 'indoor'],
      ['public_order_drunk_harassing', 'street', 'disorder'],
      ['public_order_drunk_lying', 'street', 'lying'],
      ['assist_joobes_isik_soiduteel', 'street', 'lying'],
      ['traffic_lo_vigastatutega', 'street', 'crash'],
      ['traffic_soiduk_kraavis', 'ruralroad', 'crash'],
      ['traffic_joobes_juhi_kahtlus', 'street', 'stop'],
      ['traffic_mittepeatumine', 'street', 'stop'],
      ['property_theft_from_car', 'parking', 'theft'],
      ['property_flat_burglary', 'residential', 'indoor'],
      ['domestic_violence', 'residential', 'indoor'],
      ['public_order_night_noise', 'residential', 'indoor'],
      ['public_order_demonstration', 'government', 'crowd'],
      ['assist_maja_suttimine', 'house', 'fire'],
      ['property_burned_car', 'parking', 'fire'],
      ['missing_kadunud_laps', 'park', 'empty'],
      // Shown as less than it is.
      ['major_tulistamine_koolis', 'school', 'indoor'],
      ['property_armed_shop_robbery', 'shop', 'indoor'],
      ['assist_mees_silla_piirde_taga', 'street', 'empty'],
      ['violence_sexual_harassment', 'street', 'disorder'],
      ['alarm_fire_alarm', 'school', 'indoor'],
      ['traffic_kaks_joobes_toukeratturit', 'street', 'lying'],
    ];
    for (const [id, place, kind] of table) {
      expect(TEMPLATE_BY_ID[id], id).toBeDefined();
      expect(kindAt(id, place), `${id} at ${place}`).toBe(kind);
    }
  });
});

describe('cctv cast: the people and the vehicles', () => {
  it('every template of the catalogue gets a cast from a real incident', { timeout: 120_000 }, () => {
    let s = newShift();
    let made = 0;
    for (const tpl of TEMPLATES) {
      // A fresh shift now and then: the registry's people are not used up.
      if (made % 60 === 59) s = newShift();
      const id = directorSpawn(s, { templateId: tpl.id });
      if (!id) continue;
      made++;
      const inc = s.incidents[id];
      const cast = castOf(s, inc, tpl, DRESS);
      expect(KINDS).toContain(cast.kind);
      expect(cast.kind).toBe(sceneKindOf(inc));
      // Stable, distinct ids; nobody missing or dead stands in the street.
      const ids = [...cast.people.map((p) => p.id), ...cast.cars.map((c) => c.id)];
      expect(new Set(ids).size, tpl.id).toBe(ids.length);
      for (const p of cast.people) {
        expect(p.role).not.toBe('missing');
        expect(p.role).not.toBe('deceased');
        expect(p.look.height).toBeGreaterThan(0.5);
        expect(p.look.height).toBeLessThan(2.2);
      }
      const extras = cast.people.filter((p) => p.role === 'extra').length;
      if (cast.kind === 'crowd') expect(extras).toBeGreaterThanOrEqual(12);
      else if (cast.kind === 'fire') expect(extras).toBeGreaterThanOrEqual(3);
      else expect(extras).toBe(0);
      if (cast.kind === 'crash') expect(cast.cars.length, tpl.id).toBe(cast.single || /lahkunud/.test(tpl.id) ? 1 : Math.max(2, inc.vehicles.length));
      expect(cast.priority).toBe(inc.truePriority);
      if (cast.kind === 'stop') {
        // The card's own text says which of the template's stories it tells.
        expect(variantOf(inc, withScenario(tpl, inc.scenarioId)), `${tpl.id}: ${inc.summary.et}`).toBeGreaterThanOrEqual(0);
        const story = stopStoryOf(inc, tpl);
        const ofVehicle = cast.people.filter((p) => p.role !== 'caller' && p.role !== 'witness');
        if (story === 'gone' || story === 'away') {
          expect(cast.gone, tpl.id).toBe(true);
          expect(cast.cars, tpl.id).toEqual([]);
          expect(ofVehicle, tpl.id).toEqual([]);
          expect(cast.mayFlee, tpl.id).toBe(false);
        } else expect(cast.gone, tpl.id).toBe(false);
        if (story === 'away') expect(cast.people, tpl.id).toEqual([]);
        if (story === 'alone') expect(ofVehicle, tpl.id).toEqual([]);
        expect(!!cast.driverIn, tpl.id).toBe(story === 'inside');
      } else expect(cast.gone, tpl.id).toBe(false);
      // The same incident gives the same cast every time.
      expect(castOf(s, inc, tpl, DRESS)).toEqual(cast);
    }
    expect(made).toBeGreaterThan(TEMPLATES.length * 0.9);
  });

  it('reads the choices of a scene from the template', () => {
    const s = newShift();
    const castFor = (templateId: string) => {
      const id = directorSpawn(s, { templateId });
      expect(id, templateId).not.toBe('');
      return castOf(s, s.incidents[id], TEMPLATE_BY_ID[templateId], DRESS);
    };
    const stop = castFor('traffic_joobes_juht_tanklas');
    if (stop.kind === 'stop') {
      expect(stop).toMatchObject({ drunk: true, live: true, gone: false });
      expect(stop.cars.length).toBe(1);
      expect(stop.cars[0].role).toBe('suspect');
    }
    const ditch = castFor('traffic_soiduk_kraavis');
    if (ditch.kind === 'crash') expect(ditch).toMatchObject({ single: true });
    const road = castFor('assist_joobes_isik_soiduteel');
    if (road.kind === 'lying') expect(road).toMatchObject({ inRoad: true, down: true, drunk: true });
    const knife = castFor('violence_street_stabbing');
    if (knife.kind === 'threat') expect(knife.armed).toBe(true);
    const demo = castFor('public_order_demonstration');
    if (demo.kind === 'crowd') expect(demo.chant).toBe(true);
  });
});

describe('cctv cast: the picture tells the card\'s story', () => {
  /** Real incidents of a template from several shifts, until `enough` says so (or 40 have been made). */
  function spawns(templateId: string, each: (s: ReturnType<typeof newShift>, inc: Incident, tpl: IncidentTemplate) => void, enough: () => boolean = () => false) {
    const tpl = TEMPLATE_BY_ID[templateId];
    expect(tpl, templateId).toBeDefined();
    let made = 0;
    for (let seed = 11; seed < 31 && !enough(); seed++) {
      const s = newShift(seed);
      for (let k = 0; k < 2; k++) {
        const id = directorSpawn(s, { templateId });
        if (!id) continue;
        made++;
        if (!s.incidents[id].falseAlarm) each(s, s.incidents[id], tpl);
      }
    }
    expect(made, templateId).toBeGreaterThan(0);
  }

  it('every template that can make a stop says what became of its vehicle, variant by variant', () => {
    const isStop = (tpl: IncidentTemplate) => tpl.places.some((place) => sceneKindOf(probe(tpl, place)) === 'stop');
    // Every story the catalogue can tell as a stop: a template as it stands, and as each of its scenarios tells it.
    const stories = new Map<string, IncidentTemplate>();
    for (const tpl of TEMPLATES) {
      if (isStop(tpl)) stories.set(tpl.id, tpl);
      for (const sc of tpl.scenarios ?? []) {
        const told = withScenario(tpl, sc.id);
        if (isStop(told)) stories.set(`${tpl.id}#${sc.id}`, told);
      }
    }
    expect(stories.size).toBeGreaterThan(30);
    const used = new Set<string>();
    for (const [key, tpl] of stories) {
      // Its own line, or its template's: in the table exactly once (the table is keyed by story).
      const line = key in STOP_STORY ? key : tpl.id;
      const story = STOP_STORY[line];
      expect(story, key).toBeDefined();
      used.add(line);
      // One answer for every variant of the card, or one for each.
      if (typeof story !== 'string') expect(story.length, key).toBe(tpl.summary.length);
    }
    // Nothing in the table that the catalogue does not tell as a stop.
    expect(Object.keys(STOP_STORY).sort()).toEqual([...used].sort());
  });

  it('a vehicle the card says has gone is not at the kerb: drive-offs, speeders, drivers who did not stop', { timeout: 120_000 }, () => {
    for (const templateId of ['property_fuel_driveoff', 'traffic_mittepeatumine', 'traffic_kihutaja', 'traffic_mootorratturid_kihutavad', 'traffic_loata_rallivoistlus']) {
      let seen = 0;
      spawns(
        templateId,
        (s, inc, tpl) => {
          const cast = castOf(s, inc, tpl, DRESS);
          if (cast.kind !== 'stop') return;
          seen++;
          expect(cast.gone, `${templateId}: ${inc.summary.et}`).toBe(true);
          expect(cast.cars).toEqual([]);
          expect(cast.people.filter((p) => p.role === 'driver' || p.role === 'suspect')).toEqual([]);
        },
        () => seen >= 4,
      );
      expect(seen, templateId).toBeGreaterThan(0);
    }
  });

  it('a template whose variants differ shows the vehicle only for the variant that says it is here', { timeout: 120_000 }, () => {
    const got = new Map<number, boolean>();
    spawns(
      'alarm_anpr_wanted_owner',
      (s, inc, tpl) => {
        const v = variantOf(inc, withScenario(tpl, inc.scenarioId));
        expect(v, inc.summary.et).toBeGreaterThanOrEqual(0);
        const cast = castOf(s, inc, tpl, DRESS);
        expect(cast.kind).toBe('stop');
        // 'Sõiduk peatus tanklas' (0) against 'liigub ... suunas' (1).
        expect(cast.cars.length, inc.summary.et).toBe(v === 0 ? 1 : 0);
        got.set(v, !!cast.gone);
      },
      () => got.size === 2,
    );
    expect([...got].sort()).toEqual([
      [0, false],
      [1, true],
    ]);
  });

  it('a crash is of one vehicle, with somebody inside it, when its own card says so', { timeout: 120_000 }, () => {
    const got = new Set<number>();
    spawns(
      'traffic_lo_vigastatutega',
      (s, inc, tpl) => {
        const v = variantOf(inc, withScenario(tpl, inc.scenarioId));
        expect(v, inc.summary.et).toBeGreaterThanOrEqual(0);
        const cast = castOf(s, inc, tpl, DRESS);
        expect(cast.kind).toBe('crash');
        // 0: a car on its roof in the ditch, one person inside. 1: two cars head on, one trapped. 2: two cars.
        expect(cast.single, inc.summary.et).toBe(v === 0);
        expect(cast.cars.length, inc.summary.et).toBe(v === 0 ? 1 : 2);
        expect(cast.trapped, inc.summary.et).toBe(v !== 2);
        if (cast.trapped) expect(cast.down).toBe(false);
        got.add(v);
      },
      () => got.size === 3,
    );
    expect([...got].sort()).toEqual([0, 1, 2]);
  });
});
