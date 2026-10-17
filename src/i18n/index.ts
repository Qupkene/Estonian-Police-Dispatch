import type { Lang, Text } from '@/sim/types';
import { useSettings } from '@/store/settings';

/** UI dictionary. Each module adds `src/i18n/parts/<module>.ts` with `export default { 'module.key': { et, en } }`. */
export type Dict = Record<string, Text>;

const parts = import.meta.glob<{ default: Dict }>('./parts/*.ts', { eager: true });
export const DICT: Dict = Object.assign({}, ...Object.values(parts).map((m) => m.default));

/** Translate a key; `{name}` placeholders are filled from vars. Missing keys render as the key itself. */
export function t(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const entry = DICT[key];
  let s = entry ? entry[lang] || entry.et : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));
  return s;
}

export function useLang(): Lang {
  return useSettings((s) => s.lang);
}

export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const lang = useLang();
  return (key, vars) => t(key, lang, vars);
}

/** Pick a bilingual content Text in the current language. */
export function useTx(): (text: Text | string | undefined) => string {
  const lang = useLang();
  return (text) => (text === undefined ? '' : typeof text === 'string' ? text : text[lang] || text.et);
}
