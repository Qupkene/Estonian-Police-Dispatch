/**
 * Kaamerad (docs/CCTV.md section 7): the kind of scene an incident makes and its cast. Every template of the
 * catalogue gets a kind and a cast without throwing; well-known templates get the kind a person would expect.
 */
import { describe, expect, it } from 'vitest';
import { TEMPLATE_BY_ID, TEMPLATES } from '@/data/incidents';
import { directorSpawn } from '@/sim/commands';
import { createShift } from '@/sim/engine';
import { tallinnTime } from '@/sim/time';
import type { Incident, IncidentTemplate, PlaceKind } from '@/sim/types';
import { castOf, sceneKindOf, type SceneKind } from '@/cctv/cast';

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

function newShift() {
  return createShift({
    seed: 5,
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
    const stop = castFor('traffic_joobes_juhi_kahtlus');
    if (stop.kind === 'stop') {
      expect(stop).toMatchObject({ drunk: true, mayFlee: true, live: true });
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
