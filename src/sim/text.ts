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

/** Replace {placeholders} for one language; unknown placeholders are left visible for debugging. */
export function fill(s: string, vars: Vars, lang: Lang = 'et'): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = vars[k];
    return v === undefined ? m : tx(v, lang);
  });
}

export function fillText(t: Text, vars: Vars): Text {
  return { et: fill(t.et, vars, 'et'), en: fill(t.en, vars, 'en') };
}

/** Shorthand constructor. */
export const T = (et: string, en: string): Text => ({ et, en });
