/**
 * Generated text: newspaper / press stories, radio phrases, template wording and the helpers that
 * put Estonian and English place names, plates, directions and numbers into sentences.
 */
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@/data/incidents';
import { AGENCY_NAMES, RADIO } from '@/data/radioPhrases';
import { REGIONS } from '@/data/regions';
import { pickLocation } from '@/gen/address';
import { createShift } from '@/sim/engine';
import { directionText, safeCar } from '@/sim/incidents';
import { onStreet, roadOfAddress } from '@/sim/pursuit';
import { phrase } from '@/sim/radio';
import { fmtDate, personFlags } from '@/sim/registry';
import { aAge, buildReport, inessive, placeEn, pressPlace, pressStory, sentencesOf, summaryCore } from '@/sim/report';
import { Rng } from '@/sim/rng';
import { fill, fillText, genitiveName } from '@/sim/text';
import { tallinnTime } from '@/sim/time';
import type { Incident, Person, Text } from '@/sim/types';
import { addIncident, makeIncident, makePerson, makeState, makeVehicle, T0 } from './fixtures-systems/state';

const bd = { response: 20, resources: 15, decisions: 15, outcome: 15, safety: 10, classification: 5, total: 80 };
const outcome = (over: Partial<NonNullable<Incident['outcome']>> = {}): NonNullable<Incident['outcome']> => ({
  id: 'x',
  result: 'report',
  text: { et: 'x', en: 'x' },
  success: 0.8,
  arrests: 0,
  injuries: 0,
  officerInjured: false,
  score: 80,
  breakdown: bd,
  ...over,
});

/** A person whose age on T0 (17.10.2026) is `age`. */
const personAged = (id: string, age: number, gender: Person['gender'] = 'M') => makePerson(id, { gender, birthDate: `${2026 - age - 1}-12-01` });

/** Every bilingual Text reachable from a value. */
function texts(v: unknown, acc: Text[] = []): Text[] {
  if (Array.isArray(v)) v.forEach((x) => texts(x, acc));
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.et === 'string' && typeof o.en === 'string') acc.push(o as unknown as Text);
    else Object.values(o).forEach((x) => texts(x, acc));
  }
  return acc;
}

const RURAL = { address: 'Kloogaranna-Türisalu tee, 2. km, Harju maakond', coord: [24.4, 59.32] as [number, number], city: 'Kloogaranna', district: 'Harju maakond', placeKind: 'ruralroad' as const, zone: 'mainland' };
const HIGHWAY = { address: 'Saue-Keila maantee, 14. km', coord: [24.5, 59.3] as [number, number], city: 'Keila', placeKind: 'highway' as const, zone: 'mainland' };

describe('summaryCore / sentencesOf', () => {
  const inc = (location: Incident['location']) => makeIncident('s', { location });
  it('keeps "N. km" addresses whole and returns the first content sentence', () => {
    const i = inc({ ...HIGHWAY, address: 'Tallinna-Narva maantee (E20), 11. km' });
    expect(summaryCore('Tallinna-Narva maantee (E20), 11. km. Teataja nägi, kuidas sõiduauto sõidab looklevalt. Teataja on liinil.', i)).toBe(
      'Teataja nägi, kuidas sõiduauto sõidab looklevalt',
    );
    const r = inc(RURAL);
    expect(summaryCore(`${RURAL.address}. Joobes juhi kahtlus: hall Toyota Avensis, numbrimärk 123 ABC, looklev sõit. Teataja sõidab järel.`, r)).toBe(
      'Joobes juhi kahtlus: hall Toyota Avensis, numbrimärk 123 ABC, looklev sõit',
    );
    expect(summaryCore(`${RURAL.address}. Suspected drunk driver: grey Toyota Avensis, plate 123 ABC.`, r)).toBe('Suspected drunk driver: grey Toyota Avensis, plate 123 ABC');
  });
  it('drops "{place}, {address}." prefixes (place name or place-kind label)', () => {
    const named = inc({ address: 'Õismäe tee 107', coord: [24.65, 59.41], city: 'Tallinn', district: 'Haabersti', placeName: 'Toidukauplus (Õismäe)', placeKind: 'shop', zone: 'mainland' });
    expect(summaryCore('Toidukauplus (Õismäe), Õismäe tee 107. Kassapidajat ähvardati noaga.', named)).toBe('Kassapidajat ähvardati noaga');
    const label = inc({ address: 'Narva mnt 112', coord: [26.75, 58.39], city: 'Tartu', placeKind: 'shop', zone: 'mainland' });
    expect(summaryCore('Kauplus, Narva mnt 112. Kassapidajat ähvardati.', label)).toBe('Kassapidajat ähvardati');
    expect(summaryCore('Shop, Narva mnt 112. The cashier was threatened.', label)).toBe('The cashier was threatened');
  });
  it('does not split after initials, and capitalises the core', () => {
    const i = inc({ address: 'A. H. Tammsaare tee 104a', coord: [24.7, 59.42], city: 'Tallinn', district: 'Mustamäe', placeKind: 'shop', zone: 'mainland' });
    expect(summaryCore('A. H. Tammsaare tee 104a. Kaupluses sõimab klient kassapidajat.', i)).toBe('Kaupluses sõimab klient kassapidajat');
    expect(summaryCore('A. H. Tammsaare tee 104a. mees jooksis F. R. Kreutzwaldi tänava poole. Relvad teadmata.', i)).toBe('Mees jooksis F. R. Kreutzwaldi tänava poole');
    expect(sentencesOf('Kiirus 50-110 km/h. Teataja on liinil.')).toEqual(['Kiirus 50-110 km/h.', 'Teataja on liinil.']);
    expect(sentencesOf('Mees lahkus Tallinna-Narva mnt (E20), 18. km suunas. Relvad teadmata.')).toHaveLength(2);
  });
});

describe('pressStory', () => {
  it('a rural road: the location is its own sentence, no doubled county, no garbled "km"', () => {
    const s = makeState();
    const i = addIncident(
      s,
      makeIncident('r', {
        category: 'traffic',
        title: { et: 'Purjus autojuht', en: 'Drunk driver' },
        state: 'closed',
        closedBy: 'units',
        firstArrivalAt: T0 + 13 * 60_000,
        location: RURAL,
        summary: {
          et: `${RURAL.address}. Joobes juhi kahtlus: hall Toyota Avensis, numbrimärk 123 ABC, looklev sõit. Teataja sõidab järel.`,
          en: `${RURAL.address}. Suspected drunk driver: grey Toyota Avensis, plate 123 ABC, weaving. The caller is following.`,
        },
        outcome: outcome(),
      }),
    );
    const p = pressStory(s, i);
    expect(p.body.et).toContain('kell 22.00 kutsuti politsei Kloogarannas aadressile Kloogaranna-Türisalu tee, 2. km, Harju maakond. Joobes juhi kahtlus: hall Toyota Avensis');
    expect(p.body.et).not.toMatch(/km km|maakonnas aadressil|teatati Häirekeskusele, et/);
    expect(p.body.en).toContain('police were called to Kloogaranna-Türisalu tee, 2. km, Harju County, Kloogaranna. Suspected drunk driver: grey Toyota Avensis, plate 123 ABC, weaving.');
    expect(p.body.en).not.toMatch(/: km|Harju maakond/);
    expect(p.title).toEqual({ et: 'Purjus autojuht Harju maakonnas', en: 'Drunk driver in Harju County' });
    // A drink-driving story ends with the drink-driving reminder.
    expect(p.body.et).toMatch(/joobes juhtimine on kuritegu/);
  });
  it('a highway, an alarm and an injured officer get their own opening', () => {
    const s = makeState();
    const hw = makeIncident('h', { location: HIGHWAY, summary: { et: `${HIGHWAY.address}. Sõiduauto sõitis kaks korda äärekivile.`, en: `${HIGHWAY.address}. A car hit the kerb twice.` } });
    expect(pressStory(s, hw).body.en).toContain('police were called to Saue-Keila maantee, 14. km, near Keila. A car hit the kerb twice.');
    expect(pressStory(s, hw).body.et).toContain('kutsuti politsei Keilas aadressile Saue-Keila maantee, 14. km. Sõiduauto sõitis kaks korda äärekivile.');
    const alarm = makeIncident('a', { source: 'alarm', location: { ...makeIncident('x').location, city: 'Maardu', district: undefined, address: 'Keemikute tn 41' }, summary: { et: 'Keemikute tn 41. Paanikanupu häire.', en: 'Keemikute tn 41. Panic button alarm.' } });
    expect(pressStory(s, alarm).body.et).toContain('käivitus valvehäire Maardus aadressil Keemikute tn 41. Paanikanupu häire.');
    expect(pressStory(s, alarm).body.en).toContain('an alarm went off at Keemikute tn 41, Maardu. Panic button alarm.');
    const field = makeIncident('f', { source: 'field', summary: { et: 'Põhja 33 teatab: ametnik vigastatud, Punane tn 16-45. Vajab kohe abi.', en: 'x' } });
    expect(pressStory(s, field).body.et).toContain('sai politseiametnik Tallinnas Lasnamäel aadressil Punane tn 16-45 teenistusülesandeid täites vigastada.');
  });
  it('never says the suspect got away after somebody was detained', () => {
    const s = makeState();
    s.persons = { sus: personAged('sus', 32) };
    const base = { state: 'closed' as const, closedBy: 'units' as const, firstArrivalAt: T0 + 5 * 60_000, persons: [{ personId: 'sus', role: 'suspect' as const }] };
    const caught = makeIncident('c', { ...base, outcome: outcome({ result: 'escaped', arrests: 1 }) });
    const body = pressStory(s, caught).body;
    expect(body.et).toContain('Politsei pidas kahtlustatavana kinni 32-aastase mehe.');
    expect(body.et).not.toMatch(/lahkus enne politsei saabumist/);
    expect(body.en).not.toMatch(/left before police arrived/);
    const later = makeIncident('l', { ...base, pursuit: { ended: 'escaped' } as Incident['pursuit'], outcome: outcome({ result: 'escaped', arrests: 1 }) });
    expect(pressStory(s, later).body.et).toContain('pääses esialgu põgenema, kuid tabati hiljem.');
    const gone = makeIncident('g', { ...base, persons: [], pursuit: { ended: 'escaped' } as Incident['pursuit'], outcome: outcome({ result: 'escaped' }) });
    expect(pressStory(s, gone).body.et).toContain('Peatumismärguannet eiranud juht pääses põgenema. Politsei selgitab põgenenud juhi isikut.');
  });
  it('children and teenagers are not "mees"/"naine", and English articles follow the number', () => {
    const s = makeState();
    const story = (p: Person) => {
      s.persons = { [p.id]: p };
      return pressStory(s, makeIncident(p.id, { state: 'closed', closedBy: 'units', persons: [{ personId: p.id, role: 'suspect' }], outcome: outcome({ arrests: 1 }) })).body;
    };
    expect(story(personAged('t16', 16)).et).toContain('kinni 16-aastase noormehe.');
    expect(story(personAged('t16', 16)).en).toContain('detained a 16-year-old boy');
    expect(story(personAged('g12', 12, 'F')).et).toContain('kinni 12-aastase tüdruku.');
    expect(story(personAged('g12', 12, 'F')).en).toContain('detained a 12-year-old girl');
    expect(story(personAged('b11', 11)).et).toContain('kinni 11-aastase poisi.');
    expect(story(personAged('m18', 18)).en).toContain('detained an 18-year-old man');
    expect(story(personAged('w81', 81, 'F')).en).toContain('detained an 81-year-old woman');
    expect([8, 11, 18, 80, 89, 25, 1, 110].map(aAge)).toEqual(['an', 'an', 'an', 'an', 'an', 'a', 'a', 'a']);
  });
  it('one minute is singular, and the traffic reminder only follows drink-driving', () => {
    const s = makeState();
    const bike = makeIncident('b', {
      category: 'traffic',
      title: { et: 'Jalakäija vigastamine', en: 'Pedestrian injured' },
      state: 'closed',
      closedBy: 'units',
      firstArrivalAt: T0 + 60_000,
      summary: { et: 'Punane tn 16-45. Kergliiklusteel kokkupõrge, jalakäija lamab maas.', en: 'Punane tn 16-45. Collision on the cycle path.' },
      outcome: outcome(),
    });
    const b = pressStory(s, bike).body;
    expect(b.en).toContain('A patrol arrived within 1 minute.');
    expect(b.et).not.toMatch(/joobes juhtimine/);
    // The appeal for witnesses only while nobody has been caught.
    const theft = (arrests: number) => pressStory(s, makeIncident(`p${arrests}`, { category: 'property', state: 'closed', closedBy: 'units', outcome: outcome({ arrests }) })).body.et;
    expect(theft(0)).toMatch(/Politsei palub kõigil, kellel on sündmuse kohta infot/);
    expect(theft(1)).not.toMatch(/Politsei palub kõigil/);
  });
});

describe('newspaper sub line and places', () => {
  it('agrees with 1 and uses the English prefecture names', () => {
    const s = makeState();
    addIncident(s, makeIncident('a', { state: 'closed', closedBy: 'expired', truePriority: 3, priority: 3 }));
    s.stats.incidents = 1;
    s.stats.expired = 1;
    s.stats.arrests = 1;
    const np = buildReport(s).newspaper;
    expect(np.sub.et).toContain('kinni peeti 1 inimene, 1 teade jäi õigeaegselt teenindamata.');
    expect(np.sub.en).toContain('the North Prefecture responded to 1 call-out and detained 1 person; 1 report was not attended in time.');
    expect(np.sub.en).not.toMatch(/Põhja prefecture/);
  });
  it('inessive, English place names and the press location line', () => {
    expect(inessive('Supilinn')).toBe('Supilinnas');
    expect(inessive('Ränilinn')).toBe('Ränilinnas');
    expect(inessive('Rannarajoon')).toBe('Rannarajoonis');
    expect(inessive('Järve')).toBe('Järve linnaosas');
    expect(inessive('Kakumäe')).toBe('Kakumäel');
    expect(placeEn('Harju maakond')).toBe('Harju County');
    expect(placeEn('Viru-Nigula vald')).toBe('Viru-Nigula Parish');
    const village = makeIncident('v', { location: { address: 'Keila-Joa alevik', coord: [24.3, 59.39], city: 'Keila-Joa', placeKind: 'village', zone: 'mainland' } });
    expect(pressPlace(village)).toEqual({ lead: '', address: 'Keila-Joa alevik', en: 'Keila-Joa alevik' });
    const kj = makeIncident('k', { location: { address: 'Ravi tn 15-42', coord: [27.27, 59.4], city: 'Kohtla-Järve', district: 'Järve', placeKind: 'residential', zone: 'mainland' } });
    expect(pressPlace(kj).lead).toBe('Kohtla-Järvel Järve linnaosas');
  });
});

describe('fill: English articles', () => {
  it('"a {age}-year-old" becomes "an" for 8, 11, 18 and 80-89', () => {
    expect(fill('A {age}-year-old girl ran away.', { age: '8' }, 'en')).toBe('An 8-year-old girl ran away.');
    expect(fill('Hit by a {age}-year-old.', { age: '11' }, 'en')).toBe('Hit by an 11-year-old.');
    expect(fill('A {age}-year-old woman fell.', { age: '86' }, 'en')).toBe('An 86-year-old woman fell.');
    expect(fill('A {age}-year-old man.', { age: '25' }, 'en')).toBe('A 25-year-old man.');
    expect(fill('A {age}-year-old man.', { age: '110' }, 'en')).toBe('A 110-year-old man.');
    expect(fillText({ et: '{age}-aastane tüdruk', en: 'A {age}-year-old girl' }, { age: '18' })).toEqual({ et: '18-aastane tüdruk', en: 'An 18-year-old girl' });
  });
});

describe('vehicles, directions and roads', () => {
  it('{car} has no plate, so templates that add {plate} print it once', () => {
    const s = makeState();
    s.vehicles = { '123 ABC': makeVehicle('123 ABC') };
    expect(safeCar(s, '123 ABC')).toEqual({ et: 'hall Toyota Avensis', en: 'grey Toyota Avensis' });
    expect(safeCar(s, '999 ZZZ')).toEqual({ et: 'sõiduk', en: 'vehicle' });
    const line = fillText({ et: 'Joobes juhi kahtlus: {car}, numbrimärk {plate}.', en: 'Suspected drunk driver: {car}, plate {plate}.' }, { car: safeCar(s, '123 ABC'), plate: '123 ABC' });
    expect(line.et.match(/123 ABC/g)).toHaveLength(1);
    expect(line.en.match(/123 ABC/g)).toHaveLength(1);
  });
  it('{direction} is a bare English direction and a genitive in Estonian', () => {
    const s = makeState();
    const seen = new Set<string>();
    for (let k = 0; k < 400; k++) {
      const d = directionText(s, { id: `i${k}`, location: { address: 'x', coord: k % 2 ? [24.75, 59.437] : [24.98, 59.47], city: k % 2 ? 'Tallinn' : 'Maardu', placeKind: 'street', zone: 'mainland' } });
      expect(d.en).not.toMatch(/^heading/);
      expect(d.et).not.toMatch(/\bTallinn suunas|mägi suunas|prospekt suunas/);
      seen.add(d.et);
    }
    expect(seen.has('Tallinna suunas')).toBe(true);
    expect([...seen].some((x) => /^(põhja|kirde|ida|kagu|lõuna|edela|lääne|loode) suunas$/.test(x))).toBe(true);
    expect(genitiveName('Tallinn')).toBe('Tallinna');
    expect(genitiveName('Tõnismägi')).toBe('Tõnismäe');
    expect(genitiveName('Kangelaste prospekt')).toBe('Kangelaste prospekti');
    expect(genitiveName('Keskväljak')).toBe('Keskväljaku');
    expect(genitiveName('Pärnu mnt')).toBe('Pärnu mnt');
    expect(genitiveName('Vihasoo küla')).toBe('Vihasoo küla');
  });
  it('pursuit locations: the road without km post, county or route number', () => {
    expect(roadOfAddress('Simmuli-Nooska tee, 4. km, Võru maakond')).toBe('Simmuli-Nooska tee');
    expect(roadOfAddress('Tallinna-Tartu maantee (E263), 16. km')).toBe('Tallinna-Tartu maantee');
    expect(roadOfAddress('Tartu mnt 57')).toBe('Tartu mnt');
    expect(roadOfAddress('A. H. Tammsaare tee 104a')).toBe('A. H. Tammsaare tee');
    expect(onStreet(roadOfAddress('Simmuli-Nooska tee, 4. km, Võru maakond')).et).toBe('Simmuli-Nooska teel');
    expect(onStreet(roadOfAddress('Tallinna-Tartu maantee (E263), 16. km')).et).toBe('Tallinna-Tartu maanteel');
    expect(onStreet('Tallinna ringtee').et).toBe('Tallinna ringteel');
    expect(onStreet('Tallinn').et).toBe('Tallinna piirkonnas');
    expect(onStreet('Vihasoo küla').et).toBe('Vihasoo küla piirkonnas');
  });
  it('generated routes put both towns in the genitive ("Türi-Tallinna maantee")', () => {
    let seen = 0;
    for (const id of ['pohja', 'laane'] as const) {
      const rng = new Rng(4242);
      for (let k = 0; k < 600; k++) {
        const loc = pickLocation(rng, REGIONS[id], ['highway']);
        expect(loc.address).not.toMatch(/-Tallinn maantee/);
        if (/-Tallinna maantee/.test(loc.address)) seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('radio phrases', () => {
  it('never leaves a placeholder unfilled when a variant without it exists', () => {
    const s = makeState();
    for (let k = 0; k < 300; k++) {
      const a = phrase(s, 'available', { callsign: 'Põhja 21', short: '21' });
      expect(a.et + a.en).not.toMatch(/\{\w+\}/);
      const ack = phrase(s, k % 2 ? 'ack' : 'ackUrgent', { callsign: 'Põhja 21', short: '21' });
      expect(ack.et + ack.en).not.toMatch(/\{\w+\}|\b1 (minutit|minutes)\b/);
    }
  });
  it('keeps nominative names in nominative slots and uses the illative after verbs of motion', () => {
    const all = Object.values(RADIO).flat();
    for (const t of all) {
      expect(t.et, t.et).not.toMatch(/ootasime \{agency\}|\{agency\} (teema|pädevuses|vaja)/);
      expect(t.et, t.et).not.toMatch(/(sõitke|suunduge|palun|kohe|eritunnustega) \{address\}/);
      expect(t.et, t.et).not.toMatch(/\{address\}, \{title\}/);
    }
    expect(all.some((t) => /Vahetus alustas|sündmused läheb/.test(t.et))).toBe(false);
    for (const [k, v] of Object.entries(AGENCY_NAMES)) expect(v.en, k).not.toMatch(/^(ambulance|Rescue Board|local government|veterinarian)$/);
  });
});

describe('template wording', () => {
  const all = texts(TEMPLATES);
  it('has templates to check', () => expect(all.length).toBeGreaterThan(1000));
  it('no doubled plates, no lower-case placeholder sentence starts in summaries', () => {
    for (const t of all) {
      expect(t.et, t.et).not.toMatch(/\{car\} \(\{plate\}\) \(\{plate\}\)|^\{address\}\. \{car\}|\. \{suspect\}\.$/);
      expect(t.et, t.et).not.toMatch(/Müüjaks peetakse \{suspect\}|siin \{place\} turva|sõidusuund \{direction\}/);
      // {car} is a nominative description ("must Ford Focus"): never in an oblique-case slot.
      expect(t.et, t.et).not.toMatch(/(autoga|sõidukiga|kaubikuga|autosse|autos|autot|Sõiduki) \{car\}|sõiduauto \{car\} rooli/);
    }
  });
  it('uses one English term for arestimaja and for Häirekeskus', () => {
    for (const t of all) expect(t.en, t.en).not.toMatch(/detention house|custody suite|detention centre|emergency centre/i);
  });
});

describe('registry and bulletins', () => {
  it('KARISTATUD agrees with the number of records', () => {
    const rec = { date: '2020-01-01', lawId: 'kars-199', kind: 'crime' as const, punishment: { et: 'trahv', en: 'fine' } };
    const one = personFlags(makePerson('a', { records: [rec] }), T0).find((f) => f.id === 'records');
    const two = personFlags(makePerson('b', { records: [rec, rec] }), T0).find((f) => f.id === 'records');
    expect(one?.text.et).toBe('KARISTATUD (1 kord)');
    expect(two?.text.et).toBe('KARISTATUD (2 korda)');
  });
  it('BOLO bulletins print the theft date as 11.10.2026', () => {
    expect(fmtDate('2026-10-11')).toBe('11.10.2026');
    const s = createShift({ seed: 77, regionId: 'pohja', mode: 'free', difficulty: 'normal', start: tallinnTime(2026, 10, 16, 19, 0), hours: 8, playerName: 'Test' });
    const bolo = s.bulletins.filter((b) => b.kind === 'bolo_vehicle');
    expect(bolo.length).toBeGreaterThan(0);
    for (const b of bolo) {
      expect(b.text.et).toMatch(/Varguse aeg \d{2}\.\d{2}\.\d{4}\./);
      expect(b.text.et + b.text.en).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });
});
