/**
 * Public figures in the registry (src/data/celebrities.ts, src/sim/celebrities.ts): the owner's 300 names are
 * searchable by their register name, the name people know and their isikukood, each comes with a car, the record is
 * always clean, and nobody enters the shift until a logged search finds them (so saves stay small and co-op
 * clients, which search with `log: false`, never change the state on their own).
 */
import { describe, expect, it } from 'vitest';
import { CELEBRITIES } from '@/data/celebrities';
import { parseIdcode } from '@/gen/isikukood';
import { TEMPLATES } from '@/data/incidents';
import { TEMPLATES_CELEBRITY } from '@/data/incidents/celebrity';
import { hourCurve } from '@/sim/calendar';
import { CELEB_PREFIX, CELEBRITY_ROLES, celebrityCatalogue } from '@/sim/celebrities';
import { directorSpawn } from '@/sim/commands';
import { createShift } from '@/sim/engine';
import { personFlags, personReply, searchPersons, searchVehicles, vehicleFlags } from '@/sim/registry';
import { templateWeight } from '@/sim/spawner';
import { tallinnTime } from '@/sim/time';
import type { SimState } from '@/sim/types';
import { DASHES, incidentSuite } from './fixtures/incidentSuite';

function shift(seed = 7): SimState {
  return createShift({
    seed,
    regionId: 'pohja',
    mode: 'director',
    difficulty: 'normal',
    start: tallinnTime(2026, 10, 24, 12, 0),
    hours: 4,
    playerName: 'Test',
  });
}

describe('public figures: the list', () => {
  it('has the 300 people, each once, with clean data', () => {
    expect(CELEBRITIES.length).toBe(300);
    expect(new Set(CELEBRITIES.map((c) => c.nr)).size).toBe(300);
    for (const c of CELEBRITIES) {
      expect(c.name.trim(), `#${c.nr}`).toBe(c.name);
      expect(c.born, c.name).toMatch(/^(19|20)\d\d-\d\d-\d\d$/);
      expect(['M', 'F']).toContain(c.gender);
      expect(c.occupation.et && c.occupation.en && c.knownAs.et && c.knownAs.en, c.name).toBeTruthy();
      expect(c.legal === undefined || (c.legal !== c.name && /\S+\s+\S+/.test(c.legal)), c.name).toBe(true);
      if (c.heightCm !== undefined) expect(c.heightCm, c.name).toBeGreaterThan(140);
      expect(DASHES.test(JSON.stringify(c)), c.name).toBe(false);
    }
  });
});

describe('public figures: the catalogue', () => {
  const s = shift();
  const cat = celebrityCatalogue(s.now, s.regionId);

  it('gives everyone a valid made-up isikukood on their birth date and a clean record', () => {
    expect(cat.persons.length).toBe(300);
    for (const p of cat.persons) {
      const info = parseIdcode(p.idcode);
      expect(info.valid, `${p.firstName} ${p.lastName} ${p.idcode}`).toBe(true);
      expect(info.birthDate).toBe(p.birthDate);
      expect(info.gender).toBe(p.gender);
      // Hospitals used serials 001-700 before 2013, so these are nobody's real codes.
      expect(Number(p.idcode.slice(7, 10)), p.idcode).toBeGreaterThanOrEqual(701);
      expect(p.records).toEqual([]);
      expect(p.flags).toEqual({});
      expect(p.license.status).toBe('valid');
      expect(p.address).toBe('Eesti');
      expect(personFlags(p, s.now)).toEqual([]);
      expect(p.notes).toHaveLength(1);
      expect(personReply(s, p)).toBe('clean');
    }
    expect(new Set(cat.persons.map((p) => p.idcode)).size).toBe(300);
  });

  it('gives everyone one car of their own with insurance and a valid inspection', () => {
    expect(cat.vehicles.size).toBe(300);
    for (const p of cat.persons) {
      expect(p.vehicles.length).toBe(1);
      const v = cat.vehicles.get(p.vehicles[0])!;
      expect(v.ownerId).toBe(p.id);
      expect(v.ownerCompany).toBeUndefined();
      expect(v.kind).toBe('car');
      expect(vehicleFlags(v, s.now, p), `${v.plate} ${v.make}`).toEqual([]);
    }
  });

  it('is the same on every client', () => {
    const again = celebrityCatalogue(s.now + 3 * 3600_000, s.regionId);
    expect(again).toBe(cat);
    const t = s.now - 86_400_000 * 400;
    const dump = () => {
      const c = celebrityCatalogue(t, 'ida');
      return JSON.stringify([c.persons, [...c.vehicles.values()]]);
    };
    const first = dump();
    celebrityCatalogue(s.now, 'louna'); // another key replaces the cache
    expect(dump()).toBe(first);
  });
});

describe('public figures: registry search', () => {
  it('are not in a new shift', () => {
    const s = shift();
    expect(Object.keys(s.persons).some((id) => id.startsWith(CELEB_PREFIX))).toBe(false);
  });

  it('come up by name and enter the shift with their car', () => {
    const s = shift();
    const res = searchPersons(s, 'tanel padar');
    expect(res[0].id).toBe(`${CELEB_PREFIX}101`);
    const p = s.persons[`${CELEB_PREFIX}101`];
    expect(p).toBe(res[0]);
    expect(s.vehicles[p.vehicles[0]].ownerId).toBe(p.id);
    expect(s.queries.at(-1)?.resultIds[0]).toBe(p.id);
    // A second search finds the same person, not a copy.
    expect(searchPersons(s, 'Padar')[0]).toBe(p);
  });

  it('answer to the name people know and to the register name', () => {
    const s = shift();
    const byStage = searchPersons(s, 'Tommy Cash')[0];
    expect(`${byStage.firstName} ${byStage.lastName}`).toBe('Tomas Tammemets');
    expect(searchPersons(s, 'Tammemets')[0].id).toBe(byStage.id);
    expect(searchPersons(s, 'Toomas Hendrik Ilves')[0].lastName).toBe('Ilves');
    expect(searchPersons(s, 'Alika')[0].lastName).toBe('Milova');
  });

  it('come up by isikukood and by their plate', () => {
    const s = shift();
    const cat = celebrityCatalogue(s.now, s.regionId);
    const kaljulaid = cat.persons.find((p) => p.lastName === 'Kaljulaid')!;
    expect(searchPersons(s, kaljulaid.idcode).map((p) => p.id)).toEqual([kaljulaid.id]);
    const tanak = cat.persons.find((p) => p.lastName === 'Tänak')!;
    const found = searchVehicles(s, tanak.vehicles[0]);
    expect(found[0].plate).toBe(tanak.vehicles[0]);
    expect(s.persons[tanak.id]?.vehicles).toEqual(tanak.vehicles);
    expect(s.vehicles[tanak.vehicles[0]]).toBe(found[0]);
  });

  it('only read the state with log: false (co-op clients wait for the room command)', () => {
    const s = shift();
    const before = JSON.stringify(s);
    expect(searchPersons(s, 'Kaja Kallas', { log: false })[0].lastName).toBe('Kallas');
    expect(
      searchVehicles(s, celebrityCatalogue(s.now, s.regionId).persons[0].vehicles[0], { log: false }).length,
    ).toBe(1);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('keep a plate meaning one vehicle when a shift car already has it', () => {
    const s = shift();
    const cat = celebrityCatalogue(s.now, s.regionId);
    const target = cat.persons.find((p) => p.lastName === 'Kontaveit')!;
    const plate = target.vehicles[0];
    const local = Object.values(s.vehicles)[0];
    s.vehicles[plate] = { ...local, plate };
    searchPersons(s, 'Anett Kontaveit');
    expect(s.persons[target.id].vehicles).toEqual([]);
    expect(s.vehicles[plate].ownerId).toBe(local.ownerId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stories with a public figure in them (src/data/incidents/celebrity.ts)
// ─────────────────────────────────────────────────────────────────────────────

incidentSuite('celebrity stories', TEMPLATES_CELEBRITY);

describe('public figures: stories', () => {
  it('cast them only as callers, witnesses and victims, in every story here and nowhere else', () => {
    expect(TEMPLATES_CELEBRITY.length).toBeGreaterThanOrEqual(8);
    for (const t of TEMPLATES) {
      for (const p of t.persons)
        if (p.celebrity) expect(CELEBRITY_ROLES.has(p.role), `${t.id}: ${p.role}`).toBe(true);
    }
    for (const t of TEMPLATES_CELEBRITY) expect(t.persons.filter((p) => p.celebrity).length, t.id).toBe(1);
    expect(
      TEMPLATES.filter((t) => t.persons.some((p) => p.celebrity))
        .map((t) => t.id)
        .sort(),
    ).toEqual(TEMPLATES_CELEBRITY.map((t) => t.id).sort());
  });

  it('put a fitting public figure into the story, named in the texts, with a clean record', () => {
    for (const t of TEMPLATES_CELEBRITY) {
      const s = shift(11);
      const id = directorSpawn(s, { templateId: t.id });
      expect(id, t.id).not.toBe('');
      const inc = s.incidents[id];
      const spec = t.persons.find((p) => p.celebrity)!;
      const refs = inc.persons.filter((x) => x.personId.startsWith(CELEB_PREFIX));
      expect(
        refs.map((x) => x.role),
        t.id,
      ).toEqual([spec.role]);
      const p = s.persons[refs[0].personId];
      const def = CELEBRITIES.find((c) => `${CELEB_PREFIX}${c.nr}` === p.id)!;
      if (Array.isArray(spec.celebrity)) expect(spec.celebrity, `${t.id}: ${def.name}`).toContain(def.field);
      if (spec.gender && spec.gender !== 'any') expect(p.gender).toBe(spec.gender);
      expect(p.records).toEqual([]);
      expect(p.flags).toEqual({});
      expect(
        inc.persons.filter((x) => x.role === 'suspect').every((x) => !x.personId.startsWith(CELEB_PREFIX)),
      ).toBe(true);
      // The card text names them by the name people know.
      const text = JSON.stringify([inc.summary, inc.details, inc.hiddenDetails]);
      expect(text, t.id).not.toContain('{celeb');
      if (JSON.stringify([t.summary, t.details]).includes('{celeb}')) expect(text, t.id).toContain(def.name);
    }
  });

  it('never cast the same person twice in a shift', () => {
    const s = shift(12);
    const t = TEMPLATES_CELEBRITY[0];
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const inc = s.incidents[directorSpawn(s, { templateId: t.id })];
      const ref = inc.persons.find((x) => x.personId.startsWith(CELEB_PREFIX));
      if (!ref) continue;
      expect(seen.has(ref.personId), ref.personId).toBe(false);
      seen.add(ref.personId);
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it('come up now and then, not every shift', () => {
    const ids = new Set(TEMPLATES_CELEBRITY.map((t) => t.id));
    let mine = 0;
    let all = 0;
    for (const regionId of ['pohja', 'ida', 'louna', 'laane'] as const) {
      const s = createShift({
        seed: 3,
        regionId,
        mode: 'director',
        difficulty: 'normal',
        start: tallinnTime(2026, 7, 15, 12, 0),
        hours: 4,
        playerName: 'Test',
      });
      for (let month = 1; month <= 12; month += 3) {
        const season =
          month <= 2 || month === 12 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn';
        for (let hour = 0; hour < 24; hour++) {
          const ctx = {
            hour,
            weekday: 2,
            month,
            season,
            weekendNight: false,
            trafficF: 1,
            wet: false,
            dayTags: [] as string[],
          } as const;
          for (const tpl of TEMPLATES) {
            if (tpl.easterEgg) continue;
            const w =
              templateWeight(s, tpl, { ...ctx, season: ctx.season as 'winter' }) * hourCurve(hour + 0.5);
            all += w;
            if (ids.has(tpl.id)) mine += w;
          }
        }
      }
    }
    const share = mine / all;
    // About one call in sixty: one every shift or two.
    expect(share).toBeGreaterThan(0.005);
    expect(share).toBeLessThan(0.035);
  });
});
