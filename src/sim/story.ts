/**
 * The career told in chapters (docs/STORY.md): a light narrative layer over the career rules. Chapters begin at
 * real career milestones (rank, sectors, whole prefectures), each has a few objectives met by normal play (read
 * from the paid shift's report and from the career's state), an intro and an outro spoken by the recurring cast,
 * and one small question with a modest consequence. Content lives in src/data/story.ts.
 *
 * Pure rules over CareerProfile.story: the exported rules return new objects (storyAfterShift works on the copy
 * applyShiftReport already made). Deterministic: the only draw is the featured neighbouring desk, from the seed.
 * A career without `story` (from before it) shows the chapter its state matches and starts there with its next
 * paid shift, without the rewards of the chapters before.
 */
import { RANKS } from '@/data/economy';
import { REGION_IDS, REGIONS } from '@/data/regions';
import {
  JOURNALISTS,
  MENTORS,
  STORY_CHAPTERS,
  UNION_REP,
  type StoryCastId,
  type StoryChapterDef,
  type StoryChoiceDef,
  type StoryEffect,
  type StoryGate,
  type StoryObjectiveDef,
  type StoryPerson,
} from '@/data/story';
import { careerSectors, coversWholeRegion, isSectorCareer } from './careerSectors';
import { hashString } from './rng';
import { sectorById, sectorsOf } from './sectors';
import type { CareerProfile, LedgerEntry, RegionId, ShiftReport, StoryState, Text } from './types';

const T = (et: string, en: string): Text => ({ et, en });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r2 = (x: number) => Math.round(x * 100) / 100;
const GRADES: ShiftReport['grade'][] = ['S', 'A', 'B', 'C', 'D', 'F'];

function clone<X>(x: X): X {
  return JSON.parse(JSON.stringify(x)) as X;
}

/** A career message spoken by the cast (or about the story): `who` names the speaker in Teated. */
export type StoryMessage = Text & {
  who?: { name: string; role: Text };
  story: { chapter: number; kind: 'intro' | 'outro' | 'goal' | 'ask' | 'reply' };
};

export const STORY_TOTAL = STORY_CHAPTERS.length;

export function chapterDef(n: number): StoryChapterDef | undefined {
  return STORY_CHAPTERS[n - 1];
}

/** The chapter whose question this is. */
function choiceDef(id: string): { chapter: number; def: StoryChoiceDef } | undefined {
  const i = STORY_CHAPTERS.findIndex((c) => c.choice?.id === id);
  return i < 0 ? undefined : { chapter: i + 1, def: STORY_CHAPTERS[i].choice! };
}

// ─────────────────────────────────────────────────────────────────────────────
// Career facts the story reads
// ─────────────────────────────────────────────────────────────────────────────

function rankIndex(xp: number): number {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) index = i;
  return index;
}

/** Sectors covered in the home prefecture (all of them when it is covered whole). */
function homeSectors(p: CareerProfile): number {
  return careerSectors(p, p.regionId).length;
}

function wholeRegions(p: CareerProfile): number {
  return REGION_IDS.filter((r) => p.unlockedRegions.includes(r) && coversWholeRegion(p, r)).length;
}

function aStreak(p: CareerProfile): number {
  const c = (p as CareerProfile & { counters?: { aStreak?: unknown } }).counters;
  return typeof c?.aStreak === 'number' ? c.aStreak : 0;
}

export function gateMet(p: CareerProfile, g: StoryGate): boolean {
  return (
    (g.rank === undefined || rankIndex(p.xp) >= g.rank) &&
    (g.homeSectors === undefined || homeSectors(p) >= g.homeSectors) &&
    (g.wholeRegions === undefined || wholeRegions(p) >= g.wholeRegions)
  );
}

/** What is still missing for a chapter's milestone, as short texts for the career page. */
export function gateNeeds(p: CareerProfile, g: StoryGate): Text[] {
  const out: Text[] = [];
  if (g.rank !== undefined && rankIndex(p.xp) < g.rank) {
    const rk = RANKS[g.rank]?.name;
    out.push(T(`Auaste: ${rk?.et.toLowerCase() ?? g.rank}`, `Rank: ${rk?.en ?? g.rank}`));
  }
  if (g.homeSectors !== undefined && homeSectors(p) < g.homeSectors)
    out.push(
      T(
        `${g.homeSectors} sektorit koduprefektuuris (praegu ${homeSectors(p)})`,
        `${g.homeSectors} sectors in the home prefecture (now ${homeSectors(p)})`,
      ),
    );
  if (g.wholeRegions !== undefined && wholeRegions(p) < g.wholeRegions)
    out.push(
      g.wholeRegions === 1
        ? T('Üks prefektuur tervikuna sinu vastutusel', 'One whole prefecture under your responsibility')
        : T(
            `${g.wholeRegions} prefektuuri tervikuna sinu vastutusel`,
            `${g.wholeRegions} whole prefectures under your responsibility`,
          ),
    );
  return out;
}

/**
 * The chapter a career's state matches: the furthest one whose milestone holds, every earlier milestone holding
 * too. A new career gets 1; a career from before the story gets where its rank and area put it.
 */
export function matchingChapter(p: CareerProfile): number {
  let n = 1;
  for (let i = 1; i < STORY_TOTAL; i++) {
    if (!gateMet(p, STORY_CHAPTERS[i].gate)) break;
    n = i + 1;
  }
  return n;
}

/**
 * The neighbouring desk whose AI colleague speaks in the story: a sector next to the home desks that the career
 * does not cover (drawn from the seed), else any other sector of the home prefecture.
 */
export function featuredDesk(p: CareerProfile): string | undefined {
  const all = sectorsOf(p.regionId);
  const mine = new Set(careerSectors(p, p.regionId));
  const free = all.filter((s) => !mine.has(s.id));
  const next = free.filter((s) => s.neighbours.some((n) => mine.has(n)));
  const pool = next.length ? next : free.length ? free : all;
  if (!pool.length) return undefined;
  return pool[hashString(`${p.seed}:story:desk`) % pool.length].id;
}

/** A story not started yet: the chapter the career's state matches, from today. */
export function initialStory(p: CareerProfile): StoryState {
  const chapter = matchingChapter(p);
  const desk = featuredDesk(p);
  return { chapter, from: chapter, since: p.day, shifts: 0, done: [], ...(desk ? { desk } : {}) };
}

/** The career's story: the stored one, or what it would start as (nothing is written). */
export function storyOf(p: CareerProfile): StoryState {
  return p.story ?? initialStory(p);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cast and texts
// ─────────────────────────────────────────────────────────────────────────────

const regionGen = (r: RegionId): Text => {
  const n = REGIONS[r]?.name ?? T(r, r);
  return T(n.et.endsWith('prefektuur') ? `${n.et}i` : n.et, n.en);
};

const cityGen = (city: string): string => (city === 'Tallinn' ? 'Tallinna' : city);

/** A member of the cast for this career (the prefect and the colleague come from the game data). */
export function castPerson(p: CareerProfile, who: StoryCastId, st: StoryState = storyOf(p)): StoryPerson {
  switch (who) {
    case 'mentor':
      return MENTORS[p.regionId] ?? MENTORS.pohja;
    case 'journalist':
      return JOURNALISTS[p.regionId] ?? JOURNALISTS.pohja;
    case 'union':
      return UNION_REP;
    case 'prefect': {
      const c = REGIONS[p.regionId]?.commander;
      const rg = regionGen(p.regionId);
      const name = REGIONS[p.regionId]?.name ?? T(p.regionId, p.regionId);
      return {
        name: c?.name ?? T('Prefekt', 'Prefect').et,
        role: T(`${rg.et} prefekt`, `Prefect of the ${name.en}`),
        gender: c?.gender ?? 'M',
      };
    }
    case 'colleague': {
      const sector = st.desk ? sectorById(st.desk) : undefined;
      const c = sector?.colleague;
      return {
        name: c ? `${c.firstName} ${c.lastName}` : 'Kolleeg',
        role: sector
          ? T(`operatiivinfo haldur, ${sector.name.et} laud`, `dispatcher, ${sector.name.en} desk`)
          : T('operatiivinfo haldur', 'dispatcher'),
        gender: c?.gender ?? 'F',
      };
    }
  }
}

/** A story text with its placeholders filled for this career (src/data/story.ts lists them). */
export function fillStory(p: CareerProfile, text: Text, st: StoryState = storyOf(p)): Text {
  const fill = (s: string, lang: 'et' | 'en') => {
    const region = REGIONS[p.regionId];
    const first =
      sectorById(careerSectors(p, p.regionId)[0] ?? '')?.name ?? region?.name ?? T(p.regionId, p.regionId);
    const desk = st.desk ? sectorById(st.desk) : undefined;
    const rank = RANKS[rankIndex(p.xp)]?.name ?? T('', '');
    const vars: Record<string, string> = {
      name: p.name.trim().split(/\s+/)[0] || p.name,
      fullName: p.name.trim() || p.name,
      rank: lang === 'et' ? rank.et.toLowerCase() : rank.en,
      sector: first[lang],
      region: region?.name[lang] ?? p.regionId,
      regionGen: regionGen(p.regionId)[lang],
      city: region?.hqCity ?? '',
      cityGen: lang === 'et' ? cityGen(region?.hqCity ?? '') : (region?.hqCity ?? ''),
      mentor: castPerson(p, 'mentor', st).name,
      prefect: castPerson(p, 'prefect', st).name,
      colleague: castPerson(p, 'colleague', st).name,
      colleagueSector: desk?.name[lang] ?? '',
      journalist: castPerson(p, 'journalist', st).name,
      paper: (JOURNALISTS[p.regionId] ?? JOURNALISTS.pohja).paper,
      union: UNION_REP.name,
    };
    return s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
  };
  return T(fill(text.et, 'et'), fill(text.en, 'en'));
}

function said(
  p: CareerProfile,
  st: StoryState,
  who: StoryCastId | null,
  text: Text,
  kind: StoryMessage['story']['kind'],
): StoryMessage {
  const filled = fillStory(p, text, st);
  const person = who ? castPerson(p, who, st) : null;
  return {
    ...filled,
    ...(person ? { who: { name: person.name, role: person.role } } : {}),
    story: { chapter: st.chapter, kind },
  };
}

/** The intro of the career's current chapter as a message from its speaker (a new career's first notice). */
export function storyIntro(p: CareerProfile): StoryMessage | null {
  const st = storyOf(p);
  const def = chapterDef(st.chapter);
  if (!def || st.complete) return null;
  return said(p, st, def.intro.who, def.intro.text, 'intro');
}

// ─────────────────────────────────────────────────────────────────────────────
// Objectives
// ─────────────────────────────────────────────────────────────────────────────

type Extras = { helpGiven?: unknown } | undefined;

/** True when the objective is met now: with the paid shift `r` for shift objectives, by the state otherwise. */
export function objectiveMet(
  p: CareerProfile,
  o: StoryObjectiveDef,
  st: StoryState,
  r?: ShiftReport,
): boolean {
  const t = o.test;
  const ex = (r as (ShiftReport & { extras?: Extras }) | undefined)?.extras;
  const stats = r?.stats;
  switch (t.kind) {
    case 'shifts':
      return st.shifts >= t.n;
    case 'grade':
      return !!r && GRADES.indexOf(r.grade) >= 0 && GRADES.indexOf(r.grade) <= GRADES.indexOf(t.min);
    case 'noExpired':
      return !!stats && stats.incidents >= t.minIncidents && stats.expired === 0;
    case 'calls':
      return !!stats && stats.callsAnswered >= t.n;
    case 'help':
      return !!r && Math.floor(Number(ex?.helpGiven) || 0) >= t.n;
    case 'p1': {
      const count = stats?.responseTimes?.[1]?.length ?? 0;
      const avg = r?.avgResponse?.[1];
      return count >= t.minCount && typeof avg === 'number' && avg <= t.maxAvg;
    }
    case 'safe':
      return !!stats && stats.incidents >= t.minIncidents && stats.officerInjuries === 0;
    case 'staatus':
      return !!r && p.reputation >= t.min;
    case 'sectors':
      return homeSectors(p) >= t.n;
    case 'away':
      return !!r && r.regionId !== p.regionId;
    case 'streak':
      return !!r && aStreak(p) >= t.n;
    case 'wholeHome':
      return coversWholeRegion(p, p.regionId);
    case 'wholeRegions':
      return wholeRegions(p) >= t.n;
    case 'staff':
      return p.staff.length >= t.n;
  }
}

/** Where a counted objective stands ("2/3", "Staatus 32"), for the career page; undefined for one-off shifts. */
export function objectiveProgress(
  p: CareerProfile,
  o: StoryObjectiveDef,
  st: StoryState,
): string | undefined {
  const t = o.test;
  switch (t.kind) {
    case 'shifts':
      return `${Math.min(st.shifts, t.n)}/${t.n}`;
    case 'staatus':
      return `${Math.round(p.reputation)}/${t.min}`;
    case 'sectors':
      return `${Math.min(homeSectors(p), t.n)}/${t.n}`;
    case 'streak':
      return `${Math.min(aStreak(p), t.n)}/${t.n}`;
    case 'wholeRegions':
      return `${Math.min(wholeRegions(p), t.n)}/${t.n}`;
    case 'staff':
      return `${Math.min(p.staff.length, t.n)}/${t.n}`;
    default:
      return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Effects
// ─────────────────────────────────────────────────────────────────────────────

/** Apply an effect to `p` in place (a copy); returns the ledger line it wrote, if any. */
function applyEffect(p: CareerProfile, e: StoryEffect): LedgerEntry | null {
  if (e.reputation) p.reputation = clamp(Math.round(p.reputation + e.reputation), 0, 100);
  if (e.morale) for (const m of p.staff) m.morale = r2(clamp(m.morale + e.morale, 0.15, 1));
  if (e.offerDelay && isSectorCareer(p) && !p.offer)
    p.sectorsChangedDay = (p.sectorsChangedDay ?? 1) + e.offerDelay;
  if (e.money && e.money.amount !== 0) {
    const entry: LedgerEntry = {
      day: p.day,
      kind: e.money.amount > 0 ? 'budget' : 'other',
      amount: Math.round(e.money.amount),
      text: e.money.text,
    };
    p.money = Math.round(p.money + entry.amount);
    p.ledger.push(entry);
    if (p.ledger.length > 600) p.ledger.splice(0, p.ledger.length - 600);
    return entry;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────────────────────

function begin(p: CareerProfile, st: StoryState, n: number, out: StoryMessage[]): StoryState {
  const next: StoryState = {
    ...st,
    chapter: n,
    since: p.day,
    shifts: 0,
    done: [],
  };
  delete next.complete;
  delete next.choice;
  const def = chapterDef(n);
  if (def) out.push(said(p, next, def.intro.who, def.intro.text, 'intro'));
  return next;
}

/**
 * Move the story on: count the paid shift `r` (when given) and record the objectives met, finish the chapter
 * (outro, reward, the newspaper's piece) and begin the next one when its milestone holds, and ask the chapter's
 * question once it is due. Works on `p` in place (callers pass a copy).
 */
function advance(
  p: CareerProfile,
  r: ShiftReport | undefined,
  pressDay: number,
): { messages: StoryMessage[]; ledger: LedgerEntry[] } {
  const messages: StoryMessage[] = [];
  const ledger: LedgerEntry[] = [];
  let st: StoryState = clone(p.story!);
  let def = chapterDef(st.chapter);
  if (!def) return { messages, ledger }; // a later version's chapter: kept as it is

  if (!st.complete) {
    if (r) st.shifts += 1;
    for (const o of def.objectives) {
      if (st.done.includes(o.id) || !objectiveMet(p, o, st, r)) continue;
      st.done.push(o.id);
      messages.push(
        said(
          p,
          st,
          null,
          T(
            `Peatükk ${st.chapter}, eesmärk täidetud: ${o.text.et}.`,
            `Chapter ${st.chapter}, objective met: ${o.text.en}.`,
          ),
          'goal',
        ),
      );
    }
    const met = def.objectives.filter((o) => st.done.includes(o.id)).length;
    if (met >= def.need && st.shifts >= def.minShifts) {
      st.complete = true;
      if (st.choice) {
        st.answers = { ...(st.answers ?? {}), [st.choice.id]: '-' };
        delete st.choice;
      }
      messages.push(said(p, st, def.outro.who, def.outro.text, 'outro'));
      const entry = applyEffect(p, def.reward);
      if (entry) ledger.push(entry);
      const journalist = castPerson(p, 'journalist', st);
      const paper = (JOURNALISTS[p.regionId] ?? JOURNALISTS.pohja).paper;
      st.press = {
        day: pressDay,
        title: fillStory(p, def.press.title, st),
        body: fillStory(p, def.press.body, st),
        byline: `${journalist.name}, ${paper}`,
      };
    }
  }

  if (st.complete && st.chapter < STORY_TOTAL && gateMet(p, STORY_CHAPTERS[st.chapter].gate)) {
    st = begin(p, st, st.chapter + 1, messages);
    def = chapterDef(st.chapter)!;
  }

  const q = def.choice;
  if (r && q && !st.complete && !st.choice && !st.answers?.[q.id] && st.shifts >= q.after) {
    st.choice = { id: q.id, day: p.day };
    messages.push(said(p, st, q.who, q.text, 'ask'));
  }
  p.story = st;
  return { messages, ledger };
}

/**
 * After a paid shift (applyShiftReport, on its copy of the profile, once the day has moved on). A career without
 * a story starts it here at the chapter its state matches, from the next shift: the intro arrives, nothing of
 * this shift counts and nothing of the earlier chapters is given.
 */
export function storyAfterShift(
  p: CareerProfile,
  r: ShiftReport,
): { messages: StoryMessage[]; ledger: LedgerEntry[] } {
  if (!p.story) {
    const st = initialStory(p);
    p.story = st;
    const intro = storyIntro(p);
    return { messages: intro ? [intro] : [], ledger: [] };
  }
  return advance(p, r, p.day - 1);
}

/**
 * After a change outside a shift (an accepted sector, a hire): objectives the career's state now meets are
 * recorded, and a chapter waiting for its milestone begins. The newspaper's piece, if a chapter is finished
 * here, runs in the next shift's paper. A career whose story has not started is left as it is.
 */
export function storyProgress(p0: CareerProfile): { profile: CareerProfile; messages: StoryMessage[] } {
  if (!p0.story) return { profile: p0, messages: [] };
  const p = clone(p0);
  const { messages } = advance(p, undefined, p.day);
  if (!messages.length && JSON.stringify(p.story) === JSON.stringify(p0.story))
    return { profile: p0, messages };
  return { profile: p, messages };
}

/** Answer the question a character asked. Never takes away more than the budget has. */
export function answerStoryChoice(
  p: CareerProfile,
  optionId: string,
): { profile: CareerProfile; error?: Text; reply?: StoryMessage } {
  const asked = p.story?.choice;
  const found = asked ? choiceDef(asked.id) : undefined;
  if (!asked || !found)
    return { profile: p, error: T('Küsimus on juba vastatud.', 'This question has already been answered.') };
  const opt = found.def.options.find((o) => o.id === optionId);
  if (!opt) return { profile: p, error: T('Sellist vastust ei ole.', 'There is no such answer.') };
  const cost = opt.effect.money && opt.effect.money.amount < 0 ? -opt.effect.money.amount : 0;
  if (cost > 0 && p.money < cost)
    return {
      profile: p,
      error: T(
        `Eelarves pole piisavalt raha (vaja ${cost.toLocaleString('et-EE').replace(/\s/g, ' ')} €).`,
        `Not enough money in the budget (€${cost.toLocaleString('en-GB')} needed).`,
      ),
    };
  const out = clone(p);
  applyEffect(out, opt.effect);
  const st = out.story!;
  st.answers = { ...(st.answers ?? {}), [asked.id]: opt.id };
  delete st.choice;
  const reply = said(out, { ...st, chapter: found.chapter }, found.def.who, opt.reply, 'reply');
  return { profile: out, reply };
}

// ─────────────────────────────────────────────────────────────────────────────
// Views (career page, menu, briefing, report)
// ─────────────────────────────────────────────────────────────────────────────

export interface StoryView {
  /** The chapter on show (the last one when the story is told). */
  chapter: number;
  total: number;
  title: Text;
  summary: Text;
  /** active: objectives open; waiting: finished, the next one waits for its milestone; told: all chapters done. */
  state: 'active' | 'waiting' | 'told';
  /** First chapter of this career's story (earlier ones were before it). */
  from: number;
  since: number;
  /** The story is stored (false: an older career before its next shift). */
  started: boolean;
  intro: { who: StoryPerson; text: Text };
  objectives: { id: string; text: Text; done: boolean; progress?: string }[];
  need: number;
  met: number;
  /** Paid shifts the chapter still lasts once its objectives are met (0: it ends with them). */
  shiftsLeft: number;
  choice?: {
    id: string;
    day: number;
    who: StoryPerson;
    text: Text;
    options: { id: string; label: Text; note: Text; short: boolean }[];
  };
  /** The next chapter and what its milestone still needs (state waiting). */
  next?: { chapter: number; title: Text; needs: Text[] };
}

/** Everything the career page's chapter panel shows. */
export function storyView(p: CareerProfile): StoryView | null {
  const st = storyOf(p);
  const def = chapterDef(st.chapter);
  if (!def) return null;
  const told = !!st.complete && st.chapter >= STORY_TOTAL;
  const waiting = !!st.complete && !told;
  const nextDef = waiting ? chapterDef(st.chapter + 1) : undefined;
  const q = st.choice ? choiceDef(st.choice.id) : undefined;
  return {
    chapter: st.chapter,
    total: STORY_TOTAL,
    title: def.title,
    summary: def.summary,
    state: told ? 'told' : waiting ? 'waiting' : 'active',
    from: st.from,
    since: st.since,
    started: !!p.story,
    intro: { who: castPerson(p, def.intro.who, st), text: fillStory(p, def.intro.text, st) },
    objectives: def.objectives.map((o) => ({
      id: o.id,
      text: o.text,
      done: st.done.includes(o.id),
      progress: st.done.includes(o.id) ? undefined : objectiveProgress(p, o, st),
    })),
    need: def.need,
    met: def.objectives.filter((o) => st.done.includes(o.id)).length,
    shiftsLeft: st.complete ? 0 : Math.max(0, def.minShifts - st.shifts),
    ...(q && st.choice
      ? {
          choice: {
            id: st.choice.id,
            day: st.choice.day,
            who: castPerson(p, q.def.who, st),
            text: fillStory(p, q.def.text, st),
            options: q.def.options.map((o) => ({
              id: o.id,
              label: o.label,
              note: o.note,
              short: !!o.effect.money && o.effect.money.amount < 0 && p.money < -o.effect.money.amount,
            })),
          },
        }
      : {}),
    ...(nextDef
      ? { next: { chapter: st.chapter + 1, title: nextDef.title, needs: gateNeeds(p, nextDef.gate) } }
      : {}),
  };
}

/** One line for the menu's Karjäär panel. */
export function storyLine(p: CareerProfile): {
  chapter: number;
  total: number;
  title: Text;
  met: number;
  need: number;
  state: StoryView['state'];
  /** A character waits for an answer. */
  ask: boolean;
} | null {
  const v = storyView(p);
  return v
    ? {
        chapter: v.chapter,
        total: v.total,
        title: v.title,
        met: v.met,
        need: v.need,
        state: v.state,
        ask: !!v.choice,
      }
    : null;
}

/** The current chapter's line in the briefing's päevakäsk (none while it waits or once the story is told). */
export function storyOrder(p: CareerProfile): Text | null {
  const st = storyOf(p);
  const def = chapterDef(st.chapter);
  if (!def || st.complete) return null;
  return fillStory(p, def.order, st);
}

/** The newspaper's piece for the paid shift of career day `day`, if the story has one. */
export function storyPress(p: CareerProfile, day: number): StoryState['press'] | null {
  const press = p.story?.press;
  return press && press.day === day ? press : null;
}
