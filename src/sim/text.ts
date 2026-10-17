import type { Lang, Text } from './types';

/** Placeholders a template string may use. The engine fills them from incident context. */
export const TEMPLATE_PLACEHOLDERS = [
  'address', // "Punane tn 16-45"
  'place', // place name or address
  'city',
  'district',
  'callsign', // unit callsign speaking / addressed
  'suspect', // suspect description, e.g. "mees, u 35a, must jope"
  'suspectName',
  'victim',
  'victimName',
  'caller',
  'idcode', // isikukood of the subject of a query beat
  'name', // full name of the subject of a query beat
  'plate',
  'car', // "hall Toyota Avensis"
  'direction', // "Narva maantee suunas"
  'age',
  'n', // a small number (count of people etc.)
  'time', // hh:mm
  'agency',
] as const;

/** Values may be plain strings (same in both languages) or bilingual Text. */
export type VarValue = string | Text | undefined;
export type Vars = Partial<Record<(typeof TEMPLATE_PLACEHOLDERS)[number], VarValue>> & Record<string, VarValue>;

/** Pick the language from a bilingual text. */
export function tx(t: Text | string | undefined, lang: Lang): string {
  if (t === undefined) return '';
  if (typeof t === 'string') return t;
  return t[lang] || t.et;
}

/**
 * English article before a filled-in number: "a {age}-year-old" with 8, 11, 18 or 80-89 must read
 * "an 8-year-old" (the article follows how the number is spoken: eight, eleven, eighteen, eighty).
 */
export function fixEnArticles(s: string): string {
  return s.replace(/\b([Aa]) (?=(?:8\d*|11|18)(?![\d.,]))/g, '$1n ');
}

/** Replace {placeholders} for one language; unknown placeholders are left visible for debugging. */
export function fill(s: string, vars: Vars, lang: Lang = 'et'): string {
  const out = s.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = vars[k];
    return v === undefined ? m : tx(v, lang);
  });
  return lang === 'en' && out !== s ? fixEnArticles(out) : out;
}

export function fillText(t: Text, vars: Vars): Text {
  return { et: fill(t.et, vars, 'et'), en: fill(t.en, vars, 'en') };
}

/** Shorthand constructor. */
export const T = (et: string, en: string): Text => ({ et, en });

/**
 * Genitive of a place or street name, for postpositions ("suunas", "piirkonnas", "juures"):
 * "Tallinn" → "Tallinna", "Tõnismägi" → "Tõnismäe", "Kangelaste prospekt" → "Kangelaste prospekti".
 * Most names (and the abbreviations "tn", "mnt", "pst") already read as genitives and stay as they are.
 */
export function genitiveName(name: string): string {
  // A leading adjective declines too: "Pikk tn" → "Pika tn", "Lai tn" → "Laia tn", "Punane tn" → "Punase tn".
  const n = name.trim().replace(/^Pikk /, 'Pika ').replace(/^Lai /, 'Laia ').replace(/^Punane /, 'Punase ');
  const rules: [RegExp, string][] = [
    [/linn$/, 'linna'],
    [/mägi$/, 'mäe'],
    [/prospekt$/, 'prospekti'],
    [/väljak$/, 'väljaku'],
    [/plats$/, 'platsi'],
    [/park$/, 'pargi'],
    [/turg$/, 'turu'],
    [/sild$/, 'silla'],
    [/jõgi$/, 'jõe'],
    [/järv$/, 'järve'],
    [/ küla$/, ' küla'],
    [/ vald$/, ' valla'],
    [/ maakond$/, ' maakonna'],
    [/ alevik$/, ' aleviku'],
  ];
  for (const [re, to] of rules) if (re.test(n)) return n.replace(re, to);
  return n;
}
