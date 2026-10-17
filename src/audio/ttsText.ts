// Estonian radio text for the neural voice (TartuNLP Neurokõne, POST /api/tts). Owned by ui-shell.
// Pure functions, no DOM: tests/speech-tts.test.ts.
//
// The radio writes many things in short form. This expands them the way a dispatcher says them on air:
// personal codes, plates and the emergency number digit by digit, street and unit abbreviations in full,
// law references as words, event numbers by their running number. TartuNLP reads ordinary numbers
// itself ("Põhja 21" is "Põhja kakskümmend üks"), so those stay as digits.

const DIGITS = ['null', 'üks', 'kaks', 'kolm', 'neli', 'viis', 'kuus', 'seitse', 'kaheksa', 'üheksa'];

/** Estonian letter names, as letters are spelled on the radio ("VPR" is "vee pee err"). */
const LETTER_NAMES: Record<string, string> = {
  A: 'aa', B: 'bee', C: 'tsee', D: 'dee', E: 'ee', F: 'eff', G: 'gee', H: 'haa', I: 'ii', J: 'jott',
  K: 'kaa', L: 'ell', M: 'emm', N: 'enn', O: 'oo', P: 'pee', Q: 'kuu', R: 'err', S: 'ess', Š: 'šaa',
  Z: 'zett', Ž: 'žee', T: 'tee', U: 'uu', V: 'vee', W: 'kaksisvee', Õ: 'õõ', Ä: 'ää', Ö: 'öö', Ü: 'üü',
  X: 'iks', Y: 'igrek',
};

/** Law abbreviations in the genitive, as they stand before "paragrahv". */
const LAWS: Record<string, string> = {
  KarS: 'karistusseadustiku',
  NPALS: 'narkootiliste ja psühhotroopsete ainete seaduse',
  LS: 'liiklusseaduse',
  KorS: 'korrakaitseseaduse',
  KrMS: 'kriminaalmenetluse seadustiku',
  VTMS: 'väärteomenetluse seadustiku',
};

/** All-caps words that are spoken as words (callsign parts and the like), not spelled. */
const CAPS_WORDS = new Set(['IDA', 'ABI', 'KOER', 'PIIR', 'ESTER', 'TETRA', 'NATO']);

const PRIORITY_WORDS = ['', 'üks', 'kaks', 'kolm', 'neli'];

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** "386" → "kolm kaheksa kuus". */
export function spellDigits(digits: string): string {
  return [...digits].map((d) => DIGITS[Number(d)] ?? d).join(' ');
}

/** "VPR" → "vee pee err". */
export function spellLetters(letters: string): string {
  return [...letters.toUpperCase()].map((c) => LETTER_NAMES[c] ?? c).join(' ');
}

/** A long digit run read in short groups: a personal code as 1 + 6 + 4, others in threes. */
function spellNumberRun(run: string): string {
  const groups = run.length === 11 ? [run.slice(0, 1), run.slice(1, 7), run.slice(7)] : (run.match(/.{1,3}/g) ?? [run]);
  if (groups.length > 1 && groups[groups.length - 1].length === 1) groups[groups.length - 2] += groups.pop();
  return groups.map(spellDigits).join(', ');
}

const fromSuperscript = (s: string) => [...s].map((c) => String(SUPERSCRIPT.indexOf(c))).join('');

/** Whole-word pattern that also respects õ, ä, ö, ü (JavaScript's \b does not). */
const word = (w: string, flags = 'gu') => new RegExp(`(?<![\\p{L}\\p{N}])${w}(?![\\p{L}\\p{N}])`, flags);

function lawPhrase(law: string, num: string, sup: string, lg: string | undefined, pt: string | undefined, jargi: boolean): string {
  const g = jargi ? ['paragrahvi', 'lõike', 'punkti'] : ['paragrahv', 'lõige', 'punkt'];
  let out = `${LAWS[law]} ${g[0]} ${num}`;
  if (sup) out += ` indeks ${fromSuperscript(sup)}`;
  if (lg) out += ` ${g[1]} ${lg}`;
  if (pt) out += ` ${g[2]} ${pt}`;
  return jargi ? `${out} järgi` : out;
}

const STREET_TYPES = 'tn|tänav|mnt|maantee|pst|puiestee|tee|allee|põik|väljak|plats|rada|turg|park|kallas';

/**
 * Text for the Estonian neural voice. Drops bracketed notes, quotes and law references in brackets,
 * expands abbreviations and spells what is read digit by digit. Cut at a sentence end near `max`.
 */
export function ttsText(text: string, max = 300): string {
  let s = ` ${text} `
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[«»"„“”]/g, '')
    // Law references: in brackets they are a note for the reader, inline they are read out.
    .replace(/\s*\([^()]*§[^()]*\)/g, '')
    .replace(
      new RegExp(
        `(?<![\\p{L}])(${Object.keys(LAWS).join('|')})\\s*§\\s*(\\d+)([${SUPERSCRIPT}]*)(?:\\s*lg\\s*(\\d+))?(?:\\s*p\\s*(\\d+))?(\\s+järgi)?`,
        'gu',
      ),
      (_m, law: string, num: string, sup: string, lg?: string, pt?: string, jargi?: string) =>
        ` ${lawPhrase(law, num, sup, lg, pt, !!jargi)}`,
    )
    .replace(/§\s*(\d+)/g, 'paragrahv $1')
    // Event numbers "PÕ-261016-0004": the running number is what is said.
    .replace(/(?<![\p{L}\p{N}])[A-ZÕÄÖÜ]{2}-\d{6}-0*(\d+)(?![\p{N}])/gu, '$1')
    // Emergency number, also in "112-kõne".
    .replace(/(?<![\p{N}])112(?:-(?=\p{L}))?(?![\p{N}])/gu, 'üks üks kaks ')
    // Priority codes.
    .replace(/(?<![\p{L}\p{N}])P([1-4])(?![\p{L}\p{N}]|-\d)/gu, (_m, d: string) => `prioriteet ${PRIORITY_WORDS[Number(d)]}`)
    .replace(word('([Pp]rioriteet)\\s+prioriteet'), '$1')
    // Plates "386 VPR" (and the shorter moto, moped and ATV ones).
    .replace(/(?<![\p{L}\p{N}])(\d{2,3}) ([A-Z]{2,3})(?![\p{L}\p{N}])/gu, (_m, d: string, l: string) => `${spellDigits(d)}, ${spellLetters(l)}`)
    // Personal codes, phone numbers and other long digit runs.
    .replace(/(?<![\p{N},.])\d{5,}(?![\p{N}]|[,.]\d)/gu, (run) => spellNumberRun(run))
    // Clock times "19:05".
    .replace(/(?<![\p{N}:])([01]?\d|2[0-3]):([0-5])(\d)(?![\p{N}])/gu, (_m, h: string, m1: string, m2: string) =>
      `${h} ${m1 === '0' ? (m2 === '0' ? 'null null' : `null ${m2}`) : m1 + m2}`,
    )
    // House and flat: "Ploomi tn 8-3", "Keskallee 19-82".
    .replace(
      new RegExp(`((?:${STREET_TYPES})|\\p{Lu}\\p{Ll}*(?:tee|allee|väljak|põik|rada|plats|tänav))\\s+(\\d+[a-zA-Z]?)-(\\d+)(?![\\p{N}])`, 'gu'),
      '$1 $2 korter $3',
    )
    .replace(word('tn'), 'tänav')
    .replace(word('mnt'), 'maantee')
    .replace(word('pst'), 'puiestee')
    // Units after a number.
    .replace(/(\d)\s*km\/h/g, '$1 kilomeetrit tunnis')
    .replace(/(\d)\.\s*km(?![\p{L}])/gu, '$1. kilomeeter')
    .replace(/(\d)\s*mg\/l/g, '$1 milligrammi liitri kohta')
    .replace(/(\d)\s*km(?![\p{L}])(?=\s+(?:kaugusel|kaugusele|kauguselt|pärast|eest))/gu, '$1 kilomeetri')
    .replace(/(\d)\s*km(?![\p{L}])/gu, '$1 kilomeetrit')
    .replace(/(\d)\s*min(?![\p{L}])\.?(?=\s+(?:pärast|jooksul|eest|kaugusel|kaugusele))/gu, '$1 minuti')
    .replace(/(\d)\s*min(?![\p{L}])/gu, '$1 minutit')
    .replace(/(\d)\s*%/g, '$1 protsenti')
    .replace(/(\d)\s*€/g, '$1 eurot')
    .replace(/(\d)\s*‰/g, '$1 promilli')
    .replace(/(?<![\p{L}\p{N}])u\s+(?=\d)/gu, 'umbes ')
    .replace(word('nr\\.?'), 'number')
    // Organisations and incident codes.
    .replace(word('HK'), 'Häirekeskus')
    .replace(word('JK'), 'juhtimiskeskus')
    .replace(/(?<![\p{L}\p{N}])LSV-(?=\p{L})/gu, 'lähisuhtevägivalla ')
    .replace(word('LSV'), 'lähisuhtevägivald')
    .replace(word('KV'), 'kehaline väärkohtlemine')
    .replace(word('PPA'), 'Politsei- ja Piirivalveamet')
    // Unit letters and road numbers: "K1" is "kaa 1", "E263" "ee 263", "CX-5" "tsee iks 5".
    .replace(/(?<![\p{L}\p{N}])([A-ZÕÄÖÜŠŽ])(\d{1,3})(?![\p{L}\p{N}])/gu, (_m, l: string, d: string) => `${spellLetters(l)} ${d}`)
    .replace(/(?<![\p{L}\p{N}])([A-Z]{2,4})-(?=\d)/gu, '$1 ')
    // All caps: callsign words and long words are said as words, short abbreviations are spelled.
    .replace(/(?<![\p{L}\p{N}])[A-ZÕÄÖÜŠŽ]{2,}(?![\p{L}\p{N}])/gu, (w) =>
      w.length >= 5 || CAPS_WORDS.has(w) ? w.charAt(0) + w.slice(1).toLowerCase() : spellLetters(w),
    )
    .replace(/\s+\/\s+/g, ' või ')
    // Brackets become pauses; other symbols go.
    .replace(/\s*\(\s*/g, ', ')
    .replace(/\s*\)\s*/g, ', ')
    .replace(/[^\p{L}\p{N}\s.,:;!?'+\-%]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,:;!?])/g, '$1')
    .replace(/,\s*([.,:;!?])/g, '$1')
    .replace(/^[\s,]+|[\s,]+$/g, '');
  if (s.length > max) {
    const cut = s.slice(0, max);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    s = end > 40 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '.';
  }
  return s;
}

// ── Voices ───────────────────────────────────────────────────────────────────

/** TartuNLP speakers. The dispatcher and Häirekeskus have their own; units share the rest. */
export const TTS_VOICE_JK = 'mari';
export const TTS_VOICE_HK = 'vesta';
export const TTS_VOICES_F = ['liivika', 'külli'] as const;
export const TTS_VOICES_M = ['tambet', 'kalev', 'meelis', 'albert', 'indrek', 'peeter'] as const;

export interface TtsSpeaker {
  /** Radio sender: a unit callsign ("PÕHJA 21"), 'JK', 'HK' or an agency name. */
  from?: string;
  /** Gender of the unit's crew leader, when known. */
  gender?: 'M' | 'F';
}

/** FNV-1a: small, stable string hash (same callsign, same voice, every shift). */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Voice and speed for a radio sender. The dispatcher (JK) is always mari, Häirekeskus and agencies
 * vesta; a unit gets a voice of its crew leader's gender (or one picked from its callsign), stable per
 * callsign, and a slightly different pace. Speeds have two decimals (they are part of the cache key).
 */
export function ttsVoice(speaker?: TtsSpeaker, radio = true): { voice: string; speed: number } {
  const from = (speaker?.from ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  const base = radio ? 1.06 : 1;
  if (!from || from === 'JK') return { voice: TTS_VOICE_JK, speed: base };
  const isUnit = !!speaker?.gender || /\d/.test(from);
  if (from === 'HK' || !isUnit) return { voice: TTS_VOICE_HK, speed: base };
  const h = hash(from);
  const gender = speaker?.gender ?? ((h >>> 8) % 3 === 0 ? 'F' : 'M');
  const pool: readonly string[] = gender === 'F' ? TTS_VOICES_F : TTS_VOICES_M;
  const speed = radio ? Math.round((base - 0.04 + ((h >>> 16) % 5) * 0.03) * 100) / 100 : 1;
  return { voice: pool[h % pool.length], speed };
}
