/**
 * Radio wording (engine-core). Pure functions, also used by the radio voice (src/audio/ttsText.ts).
 *
 * What goes on the air is short: law references stay in the incident timeline, the registry and the
 * report, never on the radio; a unit's closing report is one short sentence ("Põhja 21: pooled
 * rahunesid, vägivalda pole, lõpetame."), while the full outcome summary stays in the timeline.
 */
import type { OutcomeResult, Text } from './types';

/** Law abbreviations that come with a paragraph number ("KarS § 121", "LS § 224 lg 2"). */
const LAW_ABBR =
  'KarS|NPALS|LS|KorS|KrMS|VTMS|VTK|RelvS|AÕS|PolS|PPVS|MKS|TuMS|KMS|AlkS|TubS|JahiS|KeÜS|LKS|VSS';
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const REF = `(?:(?:${LAW_ABBR})\\s*)?§{1,2}\\s*\\d+[${SUP}]*(?:\\(\\d+\\))*(?:\\s*(?:lg|lõige|lõike|subs?\\.?)\\.?\\s*\\d+)?(?:\\s*(?:p|punkt|punkti)\\.?\\s*\\d+)?`;
const CHAIN = `${REF}(?:\\s*(?:,|ja|and|või|or)\\s*${REF})*`;
const IN_BRACKETS = new RegExp(`\\s*\\([^()]*(?:§|(?<![\\p{L}])(?:${LAW_ABBR})(?![\\p{L}]))[^()]*\\)`, 'gu');
const INLINE = new RegExp(
  `(?:\\s+(?:under|per|pursuant to|according to))?\\s*${CHAIN}(?:\\s+(?:järgi|alusel|kohaselt))?(?:\\s*\\((?:katse|attempt|attempted)\\))?(?![\\p{L}\\p{N}])`,
  'gu',
);

const HAS_LAW = new RegExp(`§|(?<![\\p{L}])(?:${LAW_ABBR})(?![\\p{L}])`, 'u');
const LAW_WORD = new RegExp(`\\s*(?<![\\p{L}])(?:${LAW_ABBR})(?:-\\p{L}+)?(?![\\p{L}])`, 'gu');

/**
 * Remove law references: "(KarS § 157³)", "KarS § 121 järgi", "under KarS § 121", "§ 44 alusel".
 * The sentence around them stays ("Alustati kriminaalmenetlust KarS § 121 järgi." becomes
 * "Alustati kriminaalmenetlust.").
 */
export function stripLawRefs(s: string): string {
  if (!HAS_LAW.test(s)) return s;
  return s
    .replace(IN_BRACKETS, '')
    .replace(INLINE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,:;!?])/g, '$1')
    .replace(/,\s*([.;!?]|$)/g, '$1')
    .replace(/:\s*([.;!?])/g, '$1')
    .trim();
}

/** For the voice: also law names standing alone ("NPALS väärtegu" is said "väärtegu"). */
export function stripLawWords(s: string): string {
  return stripLawRefs(s)
    .replace(LAW_WORD, '')
    .replace(/\s+([.,:;!?])/g, '$1')
    .trim();
}

/** Law references removed from both languages. */
export function stripLawRefsText(t: Text): Text {
  return { et: stripLawRefs(t.et), en: stripLawRefs(t.en) };
}

// ── Closing report ───────────────────────────────────────────────────────────

/** Words in a radio closure after the callsign (4 to 10 with the closing word). */
export const CLOSURE_MAX_WORDS = 8;
const CLOSURE_MIN_WORDS = 3;
/** Characters in the clipped report (long compound words make a short line long to say). */
const CLOSURE_MAX_CHARS = 72;

/** Report wording to radio wording (Estonian). Applied to the first sentence, in order. */
const ET_REWRITES: [RegExp, string][] = [
  [/^Selgus,?\s+et\s+/u, ''],
  [/^Kontrollil selgus,?\s+et\s+/u, ''],
  [/^Valehäire:\s*/u, 'valehäire, '],
  [/(?:füüsilise\s+)?vägivalla\s+tunnuseid\s+ei\s+(?:tuvastatud|leitud)/gu, 'vägivalda pole'],
  [/Vägivallatunnuseid\s+ei\s+(?:tuvastatud|leitud)/gu, 'vägivalda pole'],
  [/kuriteo\s+tunnuseid\s+ei\s+(?:tuvastatud|leitud)/gu, 'kuritegu pole'],
  [/tunnuseid\s+ei\s+tuvastatud/gu, 'tunnuseid pole'],
  [/[Aa]lustati\s+kriminaalmenetlust/gu, 'kriminaalmenetlus alustatud'],
  [/[Aa]lustati\s+väärteomenetlust/gu, 'väärteomenetlus alustatud'],
  [/[Aa]lustati\s+menetlust/gu, 'menetlus alustatud'],
  [/(^|,\s+)([Kk]riminaalmenetlus|[Vv]äärteomenetlus)(?=,|$)/gu, '$1$2 alustatud'],
  // "Isik peeti kinni" is said "isik kinni peetud", when it ends the clause (not after "ja", and not
  // before "ja toimetati…", which would mix the two forms).
  [/(?<![\p{L}])(?!ja\s|ning\s)(\p{L}+)\s+peeti\s+kinni(?=,|$)/gu, '$1 kinni peetud'],
  [/(?<![\p{L}])(?!ja\s|ning\s)(\p{L}+)\s+anti\s+üle(?=,|$)/gu, '$1 üle antud'],
  [/(?<![\p{L}])(?!ja\s|ning\s)(\p{L}+)\s+võeti\s+ära(?=,|$)/gu, '$1 ära võetud'],
  [
    /(?<![\p{L}])(?!ja\s|ning\s)(\p{L}+)\s+toimetati\s+(haiglasse|kainenema|jaoskonda|arestimajja|koju)(?=,|$)/gu,
    '$1 $2',
  ],
  [/\s+enne\s+patrulli\s+saabumist/gu, ''],
  [/\s+patrulli\s+saabudes/gu, ''],
  [/\s+patrulli\s+saabumise\s+ajaks/gu, ''],
  [/kiirabi(?:ga)?\s+haiglasse/gu, 'haiglasse'],
  [/\s+politsei\s+saatel/gu, ''],
];

/** Report wording to radio wording (English). */
const EN_REWRITES: [RegExp, string][] = [
  [/^It turned out (?:that )?/u, ''],
  [/^The check showed (?:that )?/u, ''],
  [/^False alarm:\s*/u, 'false alarm, '],
  [/(?:,?\s+and\s+)?no signs of (?:physical )?violence were (?:found|established)/giu, ', no violence'],
  [/[Cc]riminal proceedings (?:were )?opened/gu, 'criminal case opened'],
  [/[Mm]isdemeanour proceedings (?:were )?opened/gu, 'misdemeanour case opened'],
  [/\s+before the patrol (?:arrived|got there)/gu, ''],
  [/\s+by the time the patrol arrived/gu, ''],
  [/\s+under police escort/gu, ''],
  [/^The\s+/u, ''],
];

/** Outcomes after which the crew is done on scene: the report ends with "lõpetame". */
const CLOSING: Partial<Record<OutcomeResult, Text>> = {
  resolved: { et: 'lõpetame', en: 'closing' },
  warning: { et: 'lõpetame', en: 'closing' },
  fine: { et: 'lõpetame', en: 'closing' },
  false_alarm: { et: 'lõpetame', en: 'closing' },
  unfounded: { et: 'lõpetame', en: 'closing' },
  referred: { et: 'lõpetame', en: 'closing' },
};

/** Short generic reports when the summary has no usable short first clause. */
const FALLBACK: Record<OutcomeResult, Text> = {
  resolved: { et: 'sündmus lahendatud', en: 'event resolved' },
  arrest: { et: 'kahtlustatav kinni peetud', en: 'suspect detained' },
  report: { et: 'menetlus alustatud, vormistame', en: 'case opened, processing' },
  warning: { et: 'hoiatus tehtud', en: 'warning given' },
  fine: { et: 'protokoll koostatud', en: 'ticket issued' },
  referred: { et: 'suunatud edasi', en: 'referred on' },
  false_alarm: { et: 'valehäire', en: 'false alarm' },
  escaped: { et: 'isik pääses, tabamata', en: 'subject got away' },
  unfounded: { et: 'teade ei leidnud kinnitust', en: 'report not confirmed' },
  hospital: { et: 'isik haiglasse', en: 'person to hospital' },
  tragedy: { et: 'raske lõpp, ohvreid', en: 'bad outcome, casualties' },
};

/** Proper nouns that keep their capital after the callsign. */
const KEEP_CAPITAL =
  /^(?:\p{Lu}{2,}|\{|„|"|Eesti|Tallinn|Tartu|Narva|Pärnu|Päästeamet|Keskkonnaamet|Tolliamet|Transpordiamet|Kaitsepolitsei|Rescue|Environmental|Transport|Tax|Internal|Estonian|English|Russian)/u;

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function sentences(s: string): string[] {
  return s
    .split(/(?<=[.!?…])\s+(?=[\p{Lu}„"«{\d])/u)
    .map((x) => x.replace(/[.!?…]+$/u, '').trim())
    .filter(Boolean);
}

/** A clause that only makes sense with the one before it ("…, et unustas maksta", "…, who left"). */
const SUBORDINATE =
  /^(?:et|kes|mis|mida|mille|kus|kuhu|kuna|kuni|kui|nagu|sh|that|who|which|where|when|while|as|so|including)\s/iu;

/** A clause after a "kes…" part that goes on with the main clause ("…, ei leitud"). */
const CONTINUES = /^(?:ei|on|oli|olid|pole|was|were|is|are)\s/iu;

/** A sentence that opens with a time or condition clause ("Hetkel, kui…", "When…"): its first clause says nothing alone. */
const LEAD_IN =
  /^(?:Hetkel|Kui|Kuna|Kuigi|Pärast seda|Samal ajal|When|After|Before|As soon as|At the moment|The moment|While|Although|Once)[\s,]/u;

/** Keep the first clause, then add whole clauses while they fit. Empty when nothing short fits. */
function clip(s: string, max: number, maxChars: number): string {
  // A clause is said in full (with what hangs on it) or by its core (without the "kes…" part:
  // "Ühte kalameest, kes üritas ujuda, ei leitud" has the core "Ühte kalameest ei leitud").
  const clauses: { full: string; core: string; sub: boolean }[] = [];
  for (const c of s.split(/\s*[,;]\s+/u).filter(Boolean)) {
    const last = clauses[clauses.length - 1];
    if (last && SUBORDINATE.test(c)) {
      last.full += `, ${c}`;
      last.sub = true;
    } else if (last?.sub && CONTINUES.test(c)) {
      last.full += `, ${c}`;
      last.core += ` ${c}`;
      last.sub = false;
    } else clauses.push({ full: c, core: c, sub: false });
  }
  const fits = (x: string) => wordCount(x) <= max && x.length <= maxChars;
  const first = clauses[0];
  if (!first) return '';
  let out = first.full;
  if (!fits(out)) {
    // One long clause: say its core, or cut before a joining word between clauses when what is
    // left is a sentence of its own ("ja" also joins nouns, so it is not a cut).
    const m = /^(.+?)\s+(?:kuid|aga|sest|mistõttu|but|because|while)\s+/u.exec(first.core);
    if (fits(first.core) && wordCount(first.core) >= CLOSURE_MIN_WORDS) out = first.core;
    else if (m && fits(m[1]) && wordCount(m[1]) >= CLOSURE_MIN_WORDS) out = m[1];
    else return '';
  }
  for (let i = 1; i < clauses.length; i++) {
    const c = clauses[i];
    const next = fits(`${out}, ${c.full}`) ? c.full : fits(`${out}, ${c.core}`) ? c.core : '';
    if (!next) break;
    out += `, ${next}`;
  }
  return out;
}

/** English needs a few more words and letters for the same report. */
const LIMITS = {
  et: { words: CLOSURE_MAX_WORDS, chars: CLOSURE_MAX_CHARS },
  en: { words: CLOSURE_MAX_WORDS + 2, chars: CLOSURE_MAX_CHARS + 12 },
};

function shorten(text: string, lang: 'et' | 'en', closing: string | undefined, fallback: string): string {
  const rewrites = lang === 'et' ? ET_REWRITES : EN_REWRITES;
  const { words: maxWords, chars: maxChars } = LIMITS[lang];
  const tidy = (x: string) => {
    for (const [re, to] of rewrites) x = x.replace(re, to);
    return x.replace(/\s{2,}/g, ' ').replace(/^[\s,]+|[\s,:]+$/g, '');
  };
  const all = sentences(stripLawRefs(text));
  if (LEAD_IN.test(all[0] ?? '')) all.shift();
  const [first = '', second] = all;
  let s = clip(tidy(first), maxWords, maxChars);
  // Too short to say what happened ("Kriminaalmenetlus alustatud."): the next sentence may fit too.
  if (s && wordCount(s) < CLOSURE_MIN_WORDS && second) {
    const more = clip(tidy(second), maxWords - wordCount(s), maxChars - s.length - 2);
    if (more) s += `, ${KEEP_CAPITAL.test(more) ? more : more.charAt(0).toLowerCase() + more.slice(1)}`;
  }
  if (!s || wordCount(s) < 2) s = fallback;
  if (closing && wordCount(s) < maxWords && !/(lõpeta\w*|closing|closed|vaba|clear)$/iu.test(s))
    s += `, ${closing}`;
  if (!KEEP_CAPITAL.test(s)) s = s.charAt(0).toLowerCase() + s.slice(1);
  return s;
}

/**
 * The radio form of an outcome summary: "{callsign}: " and one short clause (4 to 10 words), law
 * references removed, report wording made radio-like. Works on the unfilled template text, so the
 * placeholders are filled afterwards like the summary's.
 */
export function radioClosure(text: Text, result: OutcomeResult): Text {
  const prefix = /^(\{callsign\}|\{short\})\s*[:,]\s*/u;
  const lead = (s: string) => prefix.exec(s)?.[1] ?? '{callsign}';
  const body = (s: string) => s.replace(prefix, '');
  const c = CLOSING[result];
  return {
    et: `${lead(text.et)}: ${shorten(body(text.et), 'et', c?.et, FALLBACK[result].et)}.`,
    en: `${lead(text.en)}: ${shorten(body(text.en), 'en', c?.en, FALLBACK[result].en)}.`,
  };
}
