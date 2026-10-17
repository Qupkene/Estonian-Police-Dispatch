// Account error and status texts for the shell screens (pure, no React).
import { DICT, t as translate } from '@/i18n';
import type { Lang } from '@/sim/types';
import type { AccountError, CloudState } from '@/net/account';

/**
 * Human text for an account error. The Estonian UI shows the server's own message when it sent one;
 * otherwise (and in English) the text comes from the error code or the HTTP status.
 * `context` 'password' maps 401/403 to "wrong password" (account deletion).
 */
export function accountErrorText(err: AccountError | null, lang: Lang, context: 'auth' | 'password' = 'auth'): string {
  if (!err) return '';
  if (lang === 'et' && err.message) return err.message;
  const t = (key: string) => translate(key, lang);
  const byCode = `account.err.${err.code}`;
  if (DICT[byCode]) return t(byCode);
  if (context === 'password' && (err.status === 401 || err.status === 403)) return t('account.err.password');
  if (err.status === 0) return t('account.err.network');
  if (err.status >= 500) return t('account.err.server');
  const byStatus = `account.err.${err.status}`;
  if (DICT[byStatus]) return t(byStatus);
  return err.message ?? t('account.err.unknown');
}

export function cloudKey(cloud: CloudState): string {
  return `account.cloud.${cloud}`;
}

/** "Mari Tamm" → "MT". */
export function initialsOf(name: string): string {
  return (
    name
      .split(/[\s_.-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => [...w][0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}
