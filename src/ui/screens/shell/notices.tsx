// Teated (notices) on the Valvekaart screens: a notice's text in the shown language, its figures set in mono.
import { t as translate } from '@/i18n';
import type { Lang } from '@/sim/types';
import type { Notice } from './menuModel';

/** A notice's text: a career message as written, or its i18n key with the variables in `lang`. */
export function noticeText(n: Notice, lang: Lang): string {
  if ('et' in n.text) return n.text[lang] || n.text.et;
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(n.text.vars)) vars[k] = typeof v === 'object' ? v[lang] || v.et : v;
  return translate(n.text.key, lang, vars);
}

/** Numbers, money, percentages and distances in a sentence set in mono, as everywhere on these screens. */
export function MonoNumbers({ text }: { text: string }) {
  const parts = text.split(
    /(\d+(?:[\u00a0\u202f ]\d{3})*(?:[.,]\d+)?(?:[\u00a0 ]?(?:€|%|km|min|XP|m\/s))?)/g,
  );
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <span key={i} className="vk-mono vk-num">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}
