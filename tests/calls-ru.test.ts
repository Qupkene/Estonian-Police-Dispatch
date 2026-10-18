/**
 * Russian-speaking 112 callers tell the same story as Estonian ones (owner: "make the Russian answers
 * story-based too"). Every template and scenario with a call script has the Russian original of each
 * scripted answer (call.answersRu, index for index with call.answers) and of its caller quotes
 * (callerLinesRu); generated answers say addresses, streets, vehicles and clothes in Russian, and a
 * suspect who calls about himself answers about himself. With the interpreter on, the transcript shows
 * the Estonian line the Russian one translates.
 */
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@/data/incidents';
import { ANSWERS, OPENINGS, callAnswer, callAsk, callInterpreter, maybeCreateCall, ruAddress, ruClothing, ruStreet, situationOf } from '@/sim/calls';
import { genderize, type Gn } from '@/sim/callPhrases';
import { createShift } from '@/sim/engine';
import { createIncident } from '@/sim/spawner';
import { withScenario } from '@/sim/scenario';
import { TEMPLATE_PLACEHOLDERS } from '@/sim/text';
import { tallinnTime } from '@/sim/time';
import type { ActiveCall, CallQuestionId, Incident, IncidentScenario, IncidentTemplate, PersonSpec, SimState } from '@/sim/types';

const ALL_Q: CallQuestionId[] = ['what', 'where', 'injured', 'weapons', 'suspect', 'vehicle', 'direction', 'count', 'when', 'name', 'safe', 'children', 'intoxicated'];
const SUBJECT_ROLES = ['suspect', 'missing', 'driver', 'victim', 'deceased'];
const DASHES = new RegExp('[\\u2013\\u2014]');
const MARKERS = /\{\w+\}|[[\]<>]|\{[^}]*\|/;
const ALLOWED = new Set<string>(TEMPLATE_PLACEHOLDERS);

function shift(seed = 31, regionId: SimState['regionId'] = 'ida'): SimState {
  const s = createShift({ seed, regionId, mode: 'free', difficulty: 'realistic', start: tallinnTime(2026, 10, 16, 15, 0), hours: 8, playerName: 'Test' });
  s.calls = [];
  return s;
}

interface Story {
  id: string;
  tpl: IncidentTemplate;
  sc?: IncidentScenario;
  told: IncidentTemplate;
}

/** Every template and scenario whose story has Russian lines (a call script or caller quotes). */
const STORIES: Story[] = TEMPLATES.flatMap((tpl) =>
  [undefined, ...(tpl.scenarios ?? [])].map((sc) => ({ id: sc ? `${tpl.id}#${sc.id}` : tpl.id, tpl, sc, told: withScenario(tpl, sc?.id) })),
)
  // A template with scenarios always tells one of them, never its own base story.
  .filter((st) => st.sc || !st.tpl.scenarios?.length)
  .filter((st) => st.told.call || st.told.callerLinesRu);

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A template line as a pattern: genders resolved, every placeholder matches any filled value. */
function pattern(line: string, g: { caller: Gn; subject: Gn }): RegExp {
  return new RegExp(`^${genderize(line, g.caller, g.subject).split(/\{\w+\}/).map(esc).join('.+?')}$`, 'iu');
}

const REPEAT = /^Я же уже сказала?: /i;
const REPEAT_ET = /^Ma juba ütlesin: /i;

/** The two genders calls.ts uses: the caller's ({m|f}) and the person talked about ([m|f|n]). */
function gendersOf(s: SimState, inc: Incident, told: IncidentTemplate): { caller: Gn; subject: Gn } {
  const caller = inc.caller?.personId ? s.persons[inc.caller.personId] : undefined;
  if (['lost_self', 'fallen_self'].includes(situationOf(inc, told, s))) return { caller: caller?.gender, subject: caller?.gender };
  for (const role of SUBJECT_ROLES) {
    const ref = inc.persons.find((r) => r.role === role);
    if (ref && s.persons[ref.personId]) return { caller: caller?.gender, subject: s.persons[ref.personId].gender };
  }
  return { caller: caller?.gender, subject: undefined };
}

/** The template spec of an incident person (incident persons follow the template's order). */
function specOf(inc: Incident, told: IncidentTemplate, personId: string): PersonSpec | undefined {
  const i = inc.persons.findIndex((r) => r.personId === personId);
  if (i >= 0 && i < told.persons.length) return told.persons[i];
  return undefined;
}
const free = (sp: PersonSpec | undefined) => !sp || !sp.gender || sp.gender === 'any';

/** A full Russian call for one story; genders forced only where the story leaves them open. */
function russianCall(s: SimState, st: Story, o: { caller?: 'M' | 'F'; subject?: 'M' | 'F' } = {}): { inc: Incident; call: ActiveCall } {
  const inc = createIncident(s, st.sc ? { ...st.tpl, scenarios: [st.sc] } : st.tpl);
  inc.source = 'hk';
  s.calls = [];
  const call = maybeCreateCall(s, inc, { ...st.told, interactiveChance: 1 })!;
  call.prank = undefined;
  call.mood = 'calm'; // no fillers or unhelpful first answers: the lines are the story's own
  call.lang = 'ru';
  const callerId = inc.caller?.personId;
  if (o.caller && callerId && free(specOf(inc, st.told, callerId))) s.persons[callerId].gender = o.caller;
  if (o.subject) {
    for (const r of inc.persons) {
      if (SUBJECT_ROLES.includes(r.role) && r.personId !== callerId && free(specOf(inc, st.told, r.personId))) s.persons[r.personId].gender = o.subject;
    }
  }
  callAnswer(s, call.id);
  callInterpreter(s, call.id);
  for (const q of ALL_Q) callAsk(s, call.id, q);
  return { inc, call };
}

/** Caller lines with the question each one answers (undefined = the opening). */
function answered(call: ActiveCall): { q?: CallQuestionId; ru: string; et: string; en: string }[] {
  const out: { q?: CallQuestionId; ru: string; et: string; en: string }[] = [];
  let q: CallQuestionId | undefined;
  for (const l of call.lines) {
    if (l.who === 'dispatcher') q = ALL_Q.find((x) => DISPATCHER_ET[x] === l.text.et);
    if (l.who === 'caller') out.push({ q, ru: l.ru ?? '', et: l.text.et, en: l.text.en });
  }
  return out;
}
const DISPATCHER_ET: Record<CallQuestionId, string> = {
  what: 'Rääkige palun täpsemalt, mis juhtus?',
  where: 'Mis on täpne aadress?',
  injured: 'Kas keegi on vigastatud?',
  weapons: 'Kas kellelgi on relv?',
  suspect: 'Kirjeldage palun isikut.',
  vehicle: 'Kas tal on sõiduk? Number?',
  direction: 'Mis suunas ta läks?',
  count: 'Kui palju inimesi seal on?',
  when: 'Millal see juhtus?',
  name: 'Teie nimi, palun?',
  safe: 'Kas olete ise ohutus kohas?',
  children: 'Kas lapsi on seal?',
  intoxicated: 'Kas ta on joobes?',
};

/** The Russian line and its Estonian rendering are the same scripted pair (index i of both lists). */
function pairOf(ru: string, et: string, ruLines: string[], etLines: string[], g: { caller: Gn; subject: Gn }): number {
  return ruLines.findIndex((r, i) => pattern(r, g).test(ru) && !!etLines[i] && pattern(etLines[i], g).test(et));
}

// ── Gender agreement heuristics ──────────────────────────────────────────────

const WORD = /[а-яё]+/giu;
const NOT_VERBS = new Set(['пол', 'стол', 'угол', 'футбол', 'посол', 'козёл', 'орёл', 'дятел', 'котёл', 'пепел', 'ангел', 'дела', 'стола', 'пола', 'угла', 'села', 'тела', 'пила', 'мала', 'зла', 'стрела', 'игла', 'мгла', 'скала', 'бокал', 'вокзал', 'канал', 'зал', 'сигнал', 'журнал', 'финал']);
const MASC_ADJ = new Set(['сам', 'ранен', 'уверен', 'должен', 'цел', 'виноват', 'трезвый', 'пьяный']);
const FEM_ADJ = new Set(['сама', 'ранена', 'уверена', 'должна', 'цела', 'виновата', 'трезвая', 'пьяная']);

/** First-person forms that disagree with the caller's gender ("я видел" from a woman). */
function firstPersonClash(ru: string, gender: 'M' | 'F'): string | undefined {
  for (const sentence of ru.toLowerCase().split(/[.!?…:;,()«»"]+/)) {
    const words = sentence.match(WORD) ?? [];
    words.forEach((w, i) => {
      if (w !== 'я') return;
      // The first past-tense verb or short adjective after "я" is the one that agrees with it.
      for (const x of words.slice(i + 1, i + 5)) {
        if (NOT_VERBS.has(x)) continue;
        const masc = /^[а-яё]{2,}(л|лся)$/.test(x) || MASC_ADJ.has(x);
        const fem = /^[а-яё]{2,}(ла|лась)$/.test(x) || FEM_ADJ.has(x);
        if ((gender === 'F' && masc) || (gender === 'M' && fem)) throw new Error(x);
        if (masc || fem) break;
      }
    });
  }
  return undefined;
}
function clash(ru: string, gender: 'M' | 'F'): string | undefined {
  try {
    return firstPersonClash(ru, gender);
  } catch (e) {
    return (e as Error).message;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Russian story lines in the data', () => {
  it('every call script has a Russian line for each opening and each scripted answer, index for index', () => {
    const bad: string[] = [];
    for (const st of STORIES) {
      const c = st.told.call;
      if (!c) continue;
      if ((c.openingRu?.length ?? 0) !== c.opening.length) bad.push(`${st.id}: openingRu ${c.openingRu?.length ?? 0}/${c.opening.length}`);
      for (const [q, lines] of Object.entries(c.answers ?? {})) {
        const ru = c.answersRu?.[q as CallQuestionId];
        if (ru?.length !== lines.length) bad.push(`${st.id}: answersRu.${q} ${ru?.length ?? 0}/${lines.length}`);
      }
      for (const q of Object.keys(c.answersRu ?? {})) if (!c.answers?.[q as CallQuestionId]) bad.push(`${st.id}: answersRu.${q} without answers.${q}`);
    }
    expect(bad).toEqual([]);
  });

  it('caller quotes in Russian match the Estonian quotes one to one', () => {
    for (const st of STORIES) {
      if (st.told.callerLinesRu) expect(st.told.callerLinesRu.length, st.id).toBe(st.told.callerLines?.length);
    }
    // A scenario with its own Estonian quotes never inherits the template's Russian ones.
    for (const tpl of TEMPLATES) {
      for (const sc of tpl.scenarios ?? []) {
        if (sc.callerLines && !sc.callerLinesRu) expect(withScenario(tpl, sc.id).callerLinesRu, `${tpl.id}#${sc.id}`).toBeUndefined();
      }
    }
  });

  it('Russian lines use the placeholders of their Estonian line, no dashes, no stray markers', () => {
    const bad: string[] = [];
    const keys = (x: string) => [...x.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const check = (id: string, ru: string, et: string | undefined) => {
      if (DASHES.test(ru)) bad.push(`${id}: dash in ${ru}`);
      if (!/[А-Яа-яЁё]/.test(ru) && /[^\s.,!?]/.test(ru.replace(/\{\w+\}/g, ''))) bad.push(`${id}: not Russian: ${ru}`);
      for (const k of ru.matchAll(/\{(\w+)\}/g)) if (!ALLOWED.has(k[1])) bad.push(`${id}: unknown placeholder ${k[0]}`);
      if (et !== undefined && keys(ru) !== keys(et)) bad.push(`${id}: placeholders differ: ${ru} / ${et}`);
      for (const g of ['M', 'F', undefined] as const) if (MARKERS.test(genderize(ru, g, g).replace(/\{\w+\}/g, ''))) bad.push(`${id}: marker left in ${ru}`);
    };
    for (const st of STORIES) {
      const c = st.told.call;
      c?.openingRu?.forEach((r, i) => check(`${st.id} O${i}`, r, c.opening[i]?.et));
      for (const [q, lines] of Object.entries(c?.answersRu ?? {})) lines.forEach((r, i) => check(`${st.id} ${q}.${i}`, r, c?.answers?.[q as CallQuestionId]?.[i]?.et));
      st.told.callerLinesRu?.forEach((r, i) => check(`${st.id} L${i}`, r, st.told.callerLines?.[i]?.et));
    }
    expect(bad).toEqual([]);
  });
});

describe('a full Russian call tells the story (every scripted template and scenario)', () => {
  const s = shift();
  const runs = STORIES.flatMap((st) => [
    { st, o: { caller: 'F' as const, subject: 'M' as const } },
    { st, o: { caller: 'M' as const, subject: 'F' as const } },
  ]);

  it('answers come from the story lines, translated by the interpreter, never from the stock phrasebook', () => {
    const bad: string[] = [];
    const stock = new Set<string>();
    for (const p of Object.values(ANSWERS)) for (const g of ['M', 'F'] as const) stock.add(genderize(p.ru, g, g));
    for (const lines of Object.values(OPENINGS)) for (const p of lines) for (const g of ['M', 'F'] as const) stock.add(genderize(p.ru, g, g));
    for (const { st, o } of runs) {
      const { inc, call } = russianCall(s, st, o);
      const g = gendersOf(s, inc, st.told);
      const c = st.told.call;
      const quotesRu = st.told.callerLinesRu ?? [];
      const quotesEt = (st.told.callerLines ?? []).map((t) => t.et);
      const scriptRu = c?.openingRu ?? [];
      const scriptEt = (c?.opening ?? []).map((t) => t.et);
      for (const a of answered(call)) {
        const tag = `${st.id} ${a.q ?? 'opening'}: ${a.ru} / ${a.et}`;
        for (const x of [a.ru, a.et, a.en]) if (MARKERS.test(x) || DASHES.test(x)) bad.push(`marker/dash: ${tag}`);
        if (!/[А-Яа-яЁё]/.test(a.ru) || /[А-Яа-яЁё]/.test(a.et)) bad.push(`not translated: ${tag}`);
        const scripted = a.q ? c?.answers?.[a.q] : undefined;
        if (scripted) {
          if (pairOf(a.ru, a.et, c!.answersRu![a.q!]!, scripted.map((t) => t.et), g) < 0) bad.push(`not the scripted pair: ${tag}`);
          continue;
        }
        if (a.q === undefined || a.q === 'what') {
          const ru = a.ru.replace(REPEAT, '');
          const et = a.et.replace(REPEAT_ET, '');
          if (pairOf(ru, et, scriptRu, scriptEt, g) < 0 && pairOf(ru, et, quotesRu, quotesEt, g) < 0) bad.push(`not a story line: ${tag}`);
          if (stock.has(a.ru)) bad.push(`stock line: ${tag}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('first-person forms agree with the caller and the person talked about gets [он|она] right', () => {
    const bad: string[] = [];
    const MASC_START = /(^|[.!?…]\s+)(Он|Его|Ему|На нём|У него)(?![а-яё])/u;
    const FEM_START = /(^|[.!?…]\s+)(Она|Её|Ей|На ней|У неё)(?![а-яё])/u;
    for (const { st, o } of runs) {
      const { inc, call } = russianCall(s, st, o);
      const caller = inc.caller?.personId ? s.persons[inc.caller.personId] : undefined;
      const g = gendersOf(s, inc, st.told);
      const subjectRef = inc.persons.find((r) => SUBJECT_ROLES.includes(r.role) && r.personId !== inc.caller?.personId);
      const subjectFree = subjectRef ? free(specOf(inc, st.told, subjectRef.personId)) : false;
      const others = inc.persons.filter((r) => r.personId !== inc.caller?.personId && r.role !== 'witness').map((r) => s.persons[r.personId]?.gender);
      const oneGender = others.length > 0 && others.every((x) => x === g.subject);
      for (const a of answered(call)) {
        if (caller?.gender) {
          const x = clash(a.ru, caller.gender);
          if (x) bad.push(`${st.id} caller ${caller.gender} "${x}": ${a.ru}`);
        }
        // Answers about the person: with everybody else of one gender, a sentence never starts with the other pronoun.
        if (subjectFree && oneGender && a.q && ['suspect', 'weapons', 'intoxicated', 'direction', 'vehicle'].includes(a.q)) {
          if (g.subject === 'F' && MASC_START.test(a.ru)) bad.push(`${st.id} subject F: ${a.ru}`);
          if (g.subject === 'M' && FEM_START.test(a.ru)) bad.push(`${st.id} subject M: ${a.ru}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('generated answers in Russian follow the story', () => {
  /** A domestic story where the suspect himself calls and nothing is scripted. */
  const SELF: IncidentTemplate = {
    id: 'x_self_report',
    category: 'domestic',
    code: 'LSV',
    title: { et: 'Mees annab end üles', en: 'Man turns himself in' },
    priority: 2,
    weight: 1,
    places: ['residential'],
    units: { need: [{ type: 'patrol', count: 1 }] },
    onScene: [20, 30],
    persons: [
      { role: 'victim', gender: 'F', age: [30, 40] },
      { role: 'suspect', gender: 'M', age: [30, 40], relation: 'partner', intoxicated: 1 },
    ],
    callerRole: 'suspect',
    summary: [{ et: '{address}. Mees helistab ja ütleb, et lõi naist.', en: '{address}. A man calls to say he hit his wife.' }],
    outcomes: [{ id: 'ok', weight: 1, result: 'arrest', text: { et: 'Peeti kinni.', en: 'Detained.' } }],
    tags: ['dv', 'drunk', 'weapon_knife'],
  };

  it('a suspect calling about himself is never "close by" and describes himself', () => {
    for (let k = 0; k < 6; k++) {
      const s = shift(40 + k);
      const inc = createIncident(s, SELF);
      inc.source = 'hk';
      const call = maybeCreateCall(s, inc, { ...SELF, interactiveChance: 1 })!;
      call.prank = undefined;
      call.mood = 'calm';
      call.lang = 'ru';
      callAnswer(s, call.id);
      callInterpreter(s, call.id);
      for (const q of ALL_Q) callAsk(s, call.id, q);
      const lines = answered(call);
      const by = (q: CallQuestionId) => lines.filter((l) => l.q === q).map((l) => l.ru).join(' ');
      expect(by('safe')).not.toMatch(/рядом/);
      expect(by('suspect')).toMatch(/^Это я сам/);
      expect(by('direction')).toMatch(/жду здесь/);
      expect(by('weapons')).toMatch(/Нож я уже положил/);
      expect(by('intoxicated')).toMatch(/я выпил/);
      for (const l of lines) expect(clash(l.ru, 'M'), l.ru).toBeUndefined();
    }
  });

  it('addresses, streets and directions are said the way Russian speakers in Estonia say them', () => {
    expect(ruAddress('Pikk tn 12-45')).toBe('улица Pikk, дом 12, квартира 45');
    expect(ruAddress('Kangelaste prospekt 29')).toBe('проспект Kangelaste, дом 29');
    expect(ruAddress('Viru väljak 4')).toBe('площадь Viru, дом 4');
    expect(ruAddress('Laagna tee 50')).toBe('Laagna tee, дом 50');
    expect(ruAddress('Pärnu mnt 15-32')).toBe('Pärnu maantee, дом 15, квартира 32');
    expect(ruAddress('Keskallee 35-9')).toBe('Keskallee, дом 35, квартира 9');
    expect(ruAddress('Võhu küla, Lääne-Viru maakond')).toBe('деревня Võhu, уезд Lääne-Viru');
    expect(ruAddress('Lauri talu, Järsi küla, Lääne-Viru maakond')).toBe('хутор Lauri, деревня Järsi, уезд Lääne-Viru');
    expect(ruAddress('Tallinna-Narva mnt (E20), 85. km')).toBe('трасса Tallinna-Narva (E20), 85-й километр');
    expect(ruStreet('Pikk tn', true)).toBe('улицы Pikk');
    expect(ruStreet('Narva mnt')).toBe('Narva maantee');
  });

  it('generated clothes are described in Russian too ("в чёрной куртке и синих джинсах")', () => {
    expect(ruClothing('seljas must talvejope, jalas sinised teksad, peas hall kootud müts')).toBe('в чёрной зимней куртке, синих джинсах и серой вязаной шапке');
    expect(ruClothing('seljas punane kleit')).toBe('в красном платье');
    expect(ruClothing('seljas valge T-särk ja tumesinine seelik')).toBe('в белой футболке и тёмно-синей юбке');
    expect(ruClothing('seljas must kapuutsiga pusa, jalas mustad dressipüksid, kapuuts peas')).toBe('в чёрной толстовке с капюшоном и чёрных спортивных штанах, капюшон на голове');
    expect(ruClothing('seljas khakivärvi parka')).toBe('в парке цвета хаки');
    expect(ruClothing('seljas midagi imelikku')).toBeUndefined();
    // Every person the generator dresses can be described by a Russian caller.
    let n = 0;
    for (const regionId of ['ida', 'pohja'] as const) {
      const s = shift(7, regionId);
      for (const tpl of TEMPLATES.slice(0, 150)) {
        const inc = createIncident(s, tpl);
        for (const r of inc.persons) {
          const c = s.persons[r.personId]?.appearance?.clothing?.et;
          if (!c) continue;
          n++;
          expect(ruClothing(c), c).toBeDefined();
        }
      }
    }
    expect(n).toBeGreaterThan(200);
  });

  it('a Russian description of the suspect carries the clothes its translation names', () => {
    const s = shift(9);
    const unscripted = STORIES.filter((x) => x.told.call && !x.told.call.answers?.suspect && x.told.category !== 'missing' && x.told.persons.some((p) => p.role === 'suspect'));
    expect(unscripted.length).toBeGreaterThan(10);
    let dressed = 0;
    for (const st of unscripted.slice(0, 40)) {
      const { call } = russianCall(s, st);
      const d = answered(call).find((l) => l.q === 'suspect')!;
      if (!/seljas/.test(d.et)) continue;
      dressed++;
      expect(d.ru, st.id).toMatch(/(мужчина|женщина), лет \d+, .+, в [а-яё]/iu);
    }
    expect(dressed).toBeGreaterThan(5);
  });
});
