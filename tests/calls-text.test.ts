/**
 * 112 caller wording (src/sim/calls.ts, src/sim/callPhrases.ts, src/sim/radio.ts place names):
 * the caller describes THIS incident in natural Estonian / Russian / English, never reads out card
 * notes, never contradicts the place or the situation, and the opening does not mislead the
 * priority classification.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEMPLATES, TEMPLATE_BY_ID } from '@/data/incidents';
import { R_DRIVER } from '@/data/incidents/_helpers_c';
import { withArticleEn } from '@/gen/describe';
import { DISPATCHER_QUESTIONS, ANSWERS, callAnswer, callAsk, callInterpreter, lcAfter, maybeCreateCall, situationOf, speakableDetail } from '@/sim/calls';
import { OPENINGS, SITUATIONS, SITUATION_BY_TEMPLATE, bandFits, genderize, spokenStreetGenitive, type Situation } from '@/sim/callPhrases';
import { createShift } from '@/sim/engine';
import { incidentVars } from '@/sim/incidents';
import { placeText, spokenPlace, spokenPlaceLabel } from '@/sim/radio';
import { createIncident } from '@/sim/spawner';
import { genitiveName } from '@/sim/text';
import { tallinnTime } from '@/sim/time';
import type { ActiveCall, CallQuestionId, Incident, IncidentLocation, IncidentTemplate, SimState } from '@/sim/types';

const ALL_Q: CallQuestionId[] = ['what', 'where', 'injured', 'weapons', 'suspect', 'vehicle', 'direction', 'count', 'when', 'name', 'safe', 'children', 'intoxicated'];
const VIOLENT = /lööb|peks|tapab|tapa |kakel|kakleb|kaklevad|on kaklus|\bnuga\b|pussit|tulist|laske|\brelv|appi|verd|karjutakse/i;

function shift(seed = 11, regionId: SimState['regionId'] = 'pohja'): SimState {
  const s = createShift({ seed, regionId, mode: 'free', difficulty: 'realistic', start: tallinnTime(2026, 10, 16, 22, 0), hours: 8, playerName: 'Test' });
  s.calls = [];
  return s;
}

/** An interactive call for a real template; `lang` forces the caller's language, `interpreter` translates. */
function callFor(s: SimState, tplId: string, o: { lang?: ActiveCall['lang']; location?: IncidentLocation; callerGender?: 'M' | 'F'; subjectGender?: 'M' | 'F' } = {}): { inc: Incident; call: ActiveCall } {
  const tpl = TEMPLATE_BY_ID[tplId];
  const inc = createIncident(s, tpl, o.location ? { location: o.location } : {});
  inc.source = 'hk';
  s.calls = [];
  const call = maybeCreateCall(s, inc, { ...tpl, interactiveChance: 1 })!;
  call.prank = undefined;
  if (call.mood === 'prank') call.mood = 'calm';
  if (o.lang) call.lang = o.lang;
  const callerId = inc.caller?.personId;
  if (o.callerGender && callerId) s.persons[callerId].gender = o.callerGender;
  if (o.subjectGender) for (const r of inc.persons) if (['suspect', 'missing', 'driver', 'victim'].includes(r.role) && r.personId !== callerId) s.persons[r.personId].gender = o.subjectGender;
  return { inc, call };
}

function callerLines(call: ActiveCall): ActiveCall['lines'] {
  return call.lines.filter((l) => l.who === 'caller');
}

function askAll(s: SimState, call: ActiveCall, qs: CallQuestionId[] = ALL_Q): void {
  callAnswer(s, call.id);
  if (call.lang === 'ru') callInterpreter(s, call.id);
  for (const q of qs) callAsk(s, call.id, q);
}

const HIGHWAY: IncidentLocation = { address: 'Tallinna-Narva mnt (E20), 85. km', coord: [25.4, 59.4], city: 'Kuusalu', placeKind: 'highway', zone: 'mainland' };
const PETROL: IncidentLocation = { address: 'Paldiski mnt 229', coord: [24.6, 59.42], city: 'Tallinn', district: 'Haabersti', placeName: 'Tankla (Paldiski mnt)', placeKind: 'gasstation', zone: 'mainland' };
const STATION: IncidentLocation = { address: 'Vaksali tn 21', coord: [28.19, 59.37], city: 'Narva', placeName: 'Narva raudteejaam', placeKind: 'trainstation', zone: 'mainland' };
const MALL: IncidentLocation = { address: 'Kalda tn 1', coord: [27.2, 59.4], city: 'Kohtla-Järve', placeName: 'Järve keskus', placeKind: 'mall', zone: 'mainland' };

// ─────────────────────────────────────────────────────────────────────────────

describe('situation phrasebook vs priority (uiflows-8)', () => {
  it('every template maps to a situation whose wording fits its priority', () => {
    const bad: string[] = [];
    for (const tpl of TEMPLATES) {
      for (const p of new Set([tpl.priority])) {
        const inc = { id: 'x', templateId: tpl.id, category: tpl.category, title: tpl.title, tags: tpl.tags ?? [], truePriority: p, persons: [] } as unknown as Incident;
        const sit = situationOf(inc, tpl);
        if (!bandFits(sit, p)) bad.push(`${tpl.id} P${p} → ${sit}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every mapped template id exists and every situation has two lines', () => {
    for (const id of Object.keys(SITUATION_BY_TEMPLATE)) expect(TEMPLATE_BY_ID[id], id).toBeDefined();
    for (const [k, v] of Object.entries(SITUATIONS)) expect(v.lines.length, k).toBeGreaterThanOrEqual(2);
  });

  it('calm P3/P4 templates never get violent stock lines', () => {
    for (const id of ['domestic_ex_stalking', 'public_order_balcony_litter', 'public_order_public_drinking', 'public_order_aggressive_beggar', 'public_order_parking_dispute', 'violence_threatening', 'public_order_homeless_stairwell']) {
      const tpl = TEMPLATE_BY_ID[id];
      const inc = { id: 'x', templateId: id, category: tpl.category, title: tpl.title, tags: tpl.tags ?? [], truePriority: tpl.priority, persons: [] } as unknown as Incident;
      for (const line of OPENINGS[situationOf(inc, tpl)]) expect(line.et, id).not.toMatch(VIOLENT);
    }
    // A school fight that is already over and online (P3) is told as a past event, not a brawl in progress.
    const school = TEMPLATE_BY_ID.violence_school_fight;
    const inc = { id: 'x', templateId: school.id, category: school.category, title: school.title, tags: school.tags ?? [], truePriority: school.priority, persons: [] } as unknown as Incident;
    expect(situationOf(inc, school)).toBe('fight_after');
  });

  it('a template the curated map does not know falls back to a line that fits its priority', () => {
    const calm = { id: 'q1', templateId: 'new_template', category: 'violence', title: { et: 'Uus', en: 'New' }, tags: [], truePriority: 4, persons: [] } as unknown as Incident;
    const urgent = { ...calm, id: 'q2', category: 'public_order', truePriority: 1 } as Incident;
    expect(bandFits(situationOf(calm), 4)).toBe(true);
    expect(OPENINGS[situationOf(calm)].some((l) => VIOLENT.test(l.et))).toBe(false);
    expect(bandFits(situationOf(urgent), 1)).toBe(true);
  });

  it('a Russian caller in the ex-partner stalking event describes stalking, not a beating', () => {
    const s = shift(21);
    const { call } = callFor(s, 'domestic_ex_stalking', { lang: 'ru' });
    askAll(s, call, ['what']);
    const lines = callerLines(call);
    for (const l of lines) {
      expect(l.text.et).not.toMatch(VIOLENT);
      expect(l.ru).toBeDefined();
    }
    expect(lines.map((l) => l.text.et).join(' ')).toMatch(/jälit|rahule|kardan/);
  });

  it('drunk-driver templates use the drunk-driver lines, never "racing in the yard"', () => {
    for (const id of ['traffic_joobes_juhi_kahtlus', 'traffic_purjus_autojuht', 'traffic_joobes_juht_tanklas', 'traffic_joobes_juht_sadamas', 'traffic_naaber_joobes_rooli']) {
      const tpl = TEMPLATE_BY_ID[id];
      const inc = { id: 'x', templateId: id, category: tpl.category, title: tpl.title, tags: tpl.tags ?? [], truePriority: tpl.priority, persons: [] } as unknown as Incident;
      expect(situationOf(inc, tpl), id).toMatch(/^drunk_driver/);
    }
    const s = shift(5);
    const { call } = callFor(s, 'traffic_joobes_juhi_kahtlus', { lang: 'ru' });
    askAll(s, call, ['what']);
    for (const l of callerLines(call)) expect(l.text.et).not.toMatch(/hoovis|kihutavad autod/);
  });

  it('a Russian caller with several scripted lines answers "what" with another scripted line', () => {
    const tpl = TEMPLATES.find((t) => (t.call?.openingRu?.length ?? 0) > 1 && (t.call?.opening.length ?? 0) > 1);
    if (!tpl) return;
    const s = shift(8);
    const { call } = callFor(s, tpl.id, { lang: 'ru' });
    call.mood = 'calm';
    askAll(s, call, ['what']);
    const [opening, what] = callerLines(call);
    const scripted = tpl.call!.openingRu!.map((r) => r.slice(0, 12));
    expect(scripted.some((x) => what.ru!.includes(x))).toBe(true);
    expect(what.ru).not.toBe(opening.ru);
  });
});

describe('place and direction grammar (language-3, language-13)', () => {
  it('the caller names the place without a genitive slot, without the bracketed qualifier', () => {
    const s = shift(3);
    for (const loc of [PETROL, STATION]) {
      const { call } = callFor(s, 'property_till_snatch', { lang: 'et', location: loc });
      call.mood = 'calm';
      askAll(s, call, ['where']);
      const where = callerLines(call).at(-1)!;
      expect(where.text.et).not.toMatch(/juures|\(/);
      expect(where.text.et).toMatch(/^Aadress on .+, siin on .+\.$/);
    }
  });

  it('generic place nouns are lower-case in speech and translated in English and Russian', () => {
    expect(spokenPlace(PETROL)).toEqual({ ru: 'заправка', et: 'tankla', en: 'the petrol station' });
    expect(spokenPlace(STATION)).toEqual({ ru: '«Narva raudteejaam»', et: 'Narva raudteejaam', en: 'Narva raudteejaam' });
    expect(spokenPlaceLabel(PETROL)).toEqual({ et: 'Tankla', en: 'Petrol station' });
    expect(placeText(PETROL)).toEqual({ et: 'Tankla (Paldiski mnt)', en: 'Petrol station (Paldiski mnt)' });
    expect(placeText({ ...PETROL, placeName: 'Toidukauplus (Õismäe)' })).toEqual({ et: 'Toidukauplus (Õismäe)', en: 'Grocery store (Õismäe)' });
    expect(placeText(STATION)).toBe('Narva raudteejaam');
    expect(spokenPlace({ ...STATION, placeName: 'Riigipiir, Narva jõe kallas (Siivertsi)' })?.et).toBe('riigipiir, Narva jõe kallas');
  });

  it('the English "where" answer uses the translated place', () => {
    const s = shift(4);
    const { call } = callFor(s, 'property_till_snatch', { lang: 'et', location: PETROL });
    call.mood = 'calm';
    askAll(s, call, ['where']);
    expect(callerLines(call).at(-1)!.text.en).toBe("I'm at the petrol station, Paldiski mnt 229.");
  });

  it('streets before "suunas" are genitive, with the street type spoken out', () => {
    expect(spokenStreetGenitive('Pikk tn')).toBe('Pika tänava');
    expect(spokenStreetGenitive('Lai tn')).toBe('Laia tänava');
    expect(spokenStreetGenitive('Punane tn')).toBe('Punase tänava');
    expect(spokenStreetGenitive('Estonia pst')).toBe('Estonia puiestee');
    expect(spokenStreetGenitive('Narva mnt')).toBe('Narva maantee');
    expect(spokenStreetGenitive('Tõnismägi')).toBe('Tõnismäe');
    expect(spokenStreetGenitive('Kangelaste prospekt')).toBe('Kangelaste prospekti');
    expect(spokenStreetGenitive('Raekoja plats')).toBe('Raekoja platsi');
    expect(genitiveName('Pikk tn')).toBe('Pika tn');
    expect(genitiveName('Punane tn')).toBe('Punase tn');
  });

  it('caller placeholders are spoken forms: no card notation, sentence-initial capitals', () => {
    const s = shift(6);
    const { call } = callFor(s, 'missing_laps_kaubanduskeskuses', { lang: 'et', location: { ...MALL, placeName: 'Kaubanduskeskus (Järve)' } });
    call.mood = 'calm';
    askAll(s, call, ['where', 'suspect']);
    for (const l of callerLines(call)) {
      expect(l.text.et).not.toMatch(/\(Järve\)|\d+a\b|\bu \d+ cm/);
      expect(l.text.et.charAt(0)).toBe(l.text.et.charAt(0).toUpperCase());
    }
  });
});

describe('hidden details the caller may voice (language-5)', () => {
  it('card notes are never read out', () => {
    for (const et of [
      'Teataja jätab ohutu vahemaa ja annab asukohta jooksvalt.',
      'Teataja kinnitab, et juht on sõidukis üksi.',
      'Mees: mees, umbes 40-aastane, u 193 cm.',
      'Isik: mees, umbes 55-aastane.',
      'Turvatöötaja: lööja on mees, umbes 30-aastane.',
      'Viibimiskeeld kohaldati eile õhtul KorS § 44 alusel.',
      'Müüjaks peetakse noormees, umbes 19-aastane, u 178 cm, sale.',
      'Aadressil on 12 kuu jooksul olnud mitu LSV-väljakutset.',
      'Naabrite sõnul nähti eelmisel õhtul võõrast kaubikut.',
      'Kõigile ekipaažidele on edastatud sõiduki kirjeldus.',
      'Kassast kadus u 300 €.',
      'Mobiilipositsioon on täpne umbes 2 km raadiuses.',
    ]) {
      expect(speakableDetail({ et, en: et }), et).toBe(false);
    }
    expect(speakableDetail({ et: 'Korteris on ka kaks väikest last.', en: 'There are also two small children in the flat.' })).toBe(true);
  });

  it('the "what" answer adds a speakable detail as its own sentence, never "Ja veel: teataja…"', () => {
    const s = shift(9);
    let seen = 0;
    for (const tpl of TEMPLATES.filter((t) => t.details?.length && t.interactiveChance !== 0 && !(t.tags ?? []).includes('alarm') && !(t.tags ?? []).includes('anpr')).slice(0, 80)) {
      const { call } = callFor(s, tpl.id, { lang: 'et' });
      call.mood = 'calm';
      askAll(s, call, ['what']);
      const what = callerLines(call).at(-1)!.text;
      expect(what.et).not.toMatch(/Ja veel:|teataja|helistaja|§/i);
      expect(what.en).not.toMatch(/And also,|the caller/i);
      if (what.et.includes('Ja veel üks asi. ')) seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('answers that fit the situation (language-6)', () => {
  it('a caller on a highway or in a mall is not "at home"; children are not "at home" in a mall', () => {
    const s = shift(12);
    const highway = callFor(s, 'traffic_joobes_juhi_kahtlus', { lang: 'ru', location: HIGHWAY });
    askAll(s, highway.call, ['safe', 'children']);
    const mall = callFor(s, 'missing_laps_kaubanduskeskuses', { lang: 'ru', location: MALL });
    askAll(s, mall.call, ['safe', 'children']);
    for (const l of [...callerLines(highway.call), ...callerLines(mall.call)].slice(1)) {
      expect(l.text.et).not.toMatch(/kodus/);
      expect(l.text.en).not.toMatch(/at home/);
    }
  });

  it('ANSWERS defaults are place-neutral', () => {
    expect(ANSWERS.safe_yes.et).not.toMatch(/kodus/);
    expect(ANSWERS.children_yes.et).not.toMatch(/kodus/);
  });

  it('a "name" answer in a template is about the caller, not the other person', () => {
    for (const tpl of TEMPLATES) {
      for (const a of tpl.call?.answers?.name ?? []) expect(a.et, tpl.id).not.toMatch(/^(Ta|Tema)\b/);
    }
  });

  it('a held shoplifter has not run off anywhere', () => {
    const s = shift(14);
    const { call } = callFor(s, 'property_shoplifting_detained', { lang: 'ru' });
    askAll(s, call, ['direction']);
    expect(callerLines(call).at(-1)!.text.et).toMatch(/siin/);
  });

  it('a lost caller answers about themselves, not about a third person', () => {
    const s = shift(15);
    const { call } = callFor(s, 'missing_seenel_eksinud', { lang: 'ru' });
    askAll(s, call, ['suspect', 'vehicle', 'direction', 'intoxicated']);
    const text = callerLines(call).map((l) => l.text.et).join(' ');
    expect(text).not.toMatch(/ta oli jala|ta on ikka veel siin|umbes \d+-aastane/);
    expect(text).toMatch(/ootan siin/);
  });
});

describe('casing (language-8)', () => {
  it('keeps English "I", acronyms and names upper-case after a filler', () => {
    expect(lcAfter("I didn't see any weapon.", 'Listen… ')).toBe("I didn't see any weapon.");
    expect(lcAfter('Relva ma ei näinud.', 'Oot-oot… mis te küsisite? ')).toBe('Relva ma ei näinud.');
    expect(lcAfter('Relva ma ei näinud.', 'Kuulge… ')).toBe('relva ma ei näinud.');
    expect(lcAfter('Toyota Corolla, number 123 ABC.', 'Um… ')).toBe('Toyota Corolla, number 123 ABC.');
    expect(lcAfter('ANPR näitas', 'Ee… ')).toBe('ANPR näitas');
  });

  it('no English line ever contains a lower-case " i " after a filler', () => {
    const s = shift(16);
    for (const id of ['violence_bus_stop_beating', 'domestic_child_caller', 'assist_eakas_kukkunud', 'property_street_robbery']) {
      for (const mood of ['panic', 'child', 'confused', 'elderly'] as const) {
        const { call } = callFor(s, id, { lang: 'ru' });
        call.mood = mood;
        askAll(s, call, ['weapons', 'suspect', 'direction', 'weapons']);
        for (const l of callerLines(call)) expect(l.text.en).not.toMatch(/(^|[\s…?.,]) ?i (didn|am|did|saw|have|was|can)\b/);
      }
    }
  });
});

describe('gendered forms (language-11)', () => {
  it('the dispatcher asks about "the person" or "they" in English', () => {
    for (const q of Object.values(DISPATCHER_QUESTIONS)) expect(q.en).not.toMatch(/\b(he|his|him)\b/i);
  });

  it('Russian first-person verbs follow the caller, English pronouns follow the person described', () => {
    const s = shift(17);
    const f = callFor(s, 'violence_bus_stop_beating', { lang: 'ru', callerGender: 'F', subjectGender: 'F' });
    f.call.mood = 'calm';
    askAll(s, f.call, ['weapons', 'vehicle']);
    const m = callFor(s, 'violence_bus_stop_beating', { lang: 'ru', callerGender: 'M', subjectGender: 'M' });
    m.call.mood = 'calm';
    askAll(s, m.call, ['weapons', 'vehicle']);
    const fr = callerLines(f.call).map((l) => l.ru).join(' ');
    const mr = callerLines(m.call).map((l) => l.ru).join(' ');
    const fe = callerLines(f.call).map((l) => l.text.en).join(' ');
    const me = callerLines(m.call).map((l) => l.text.en).join(' ');
    if (/видел/.test(fr + mr)) {
      expect(fr).not.toMatch(/не видел\b/);
      expect(mr).not.toMatch(/видела/);
    }
    expect(fe).not.toMatch(/\bhe (was|ran|drove|has)\b/i);
    expect(me).not.toMatch(/\bshe (was|ran|drove|has)\b/i);
  });

  it('genderize picks caller and subject forms, "they" when the person is unknown', () => {
    expect(genderize('Я {видел|видела}, [он|она] убежал', 'F', 'M')).toBe('Я видела, он убежал');
    expect(genderize('[He ran|She ran|They ran] off', 'M', 'F')).toBe('She ran off');
    expect(genderize('[He ran|She ran|They ran] off', 'M', undefined)).toBe('They ran off');
    expect(genderize('[он|она] здесь', undefined, undefined)).toBe('он здесь');
  });

  it('every English subject alternation offers he, she and they; no marker survives', () => {
    const all = [...Object.values(SITUATIONS).flatMap((v) => v.lines), ...Object.values(ANSWERS), ...Object.values(DISPATCHER_QUESTIONS)];
    for (const p of all) {
      for (const m of p.en.matchAll(/\[([^\]]*)\]/g)) expect(m[1].split('|').length, p.en).toBe(3);
      for (const g of ['M', 'F', undefined] as const) {
        for (const x of [p.ru, p.et, p.en]) expect(genderize(x, g, g), x).not.toMatch(/[[\]]|\{[^}]*\|/);
      }
    }
  });

  it('English descriptions carry their article in sentences', () => {
    expect(withArticleEn('man, about 30 years old')).toBe('a man, about 30 years old');
    expect(withArticleEn('elderly woman, about 75 years old')).toBe('an elderly woman, about 75 years old');
    expect(withArticleEn('a man')).toBe('a man');
    const s = shift(18);
    const inc = createIncident(s, TEMPLATE_BY_ID.violence_bus_stop_beating);
    const v = incidentVars(s, inc);
    const sus = v.suspect as { en: string };
    expect(sus.en).toMatch(/^an? /);
    expect(R_DRIVER.some((t) => /says he is/.test(t.en))).toBe(false);
  });

  it('the caller describes a suspect in spoken form with an English article', () => {
    const s = shift(19);
    const { call } = callFor(s, 'violence_bus_stop_beating', { lang: 'et' });
    call.mood = 'calm';
    s.now = tallinnTime(2026, 10, 17, 14, 0);
    askAll(s, call, ['suspect']);
    const d = callerLines(call).at(-1)!.text;
    if (/umbes/.test(d.et)) {
      expect(d.et).not.toMatch(/\bu \d/);
      expect(d.en).toMatch(/^An? /);
    }
  });
});

describe('text rules', () => {
  it('no em or en dashes in the caller phrasebook, calls or radio place code', () => {
    for (const f of ['src/sim/calls.ts', 'src/sim/callPhrases.ts', 'src/sim/radio.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src.includes('\u2014'), f).toBe(false);
      expect(src.includes('\u2013'), f).toBe(false);
    }
  });

  it('every caller line of a full call is filled and marker-free in all three languages', () => {
    const s = shift(23, 'ida');
    const ids = TEMPLATES.filter((t) => t.interactiveChance !== 0 && !(t.tags ?? []).some((x) => x === 'alarm' || x === 'anpr')).map((t) => t.id);
    for (const id of ids.slice(0, 120)) {
      for (const lang of ['et', 'ru'] as const) {
        const { call } = callFor(s, id, { lang });
        askAll(s, call);
        for (const l of callerLines(call)) {
          for (const x of [l.text.et, l.text.en, l.ru ?? '']) expect(x, `${id} ${lang}`).not.toMatch(/\{\w+\}|[[\]]|\{[^}]*\|/);
        }
      }
    }
  });
});

// Keep TS aware the Situation type is used (documentation of the exported API).
export type { Situation, IncidentTemplate };
