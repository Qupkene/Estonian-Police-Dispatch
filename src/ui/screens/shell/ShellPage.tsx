// Valvekaart page of the out-of-game screens other than the menu and the career page (briefing, report,
// settings, credits, original versions): the top bar, the page head (back with Esc, title, the screen's line and
// main action), the screen's panels and the footer with its keys. Styles in vk.css.
import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '@/i18n';
import { useGame, type Screen } from '@/store/game';
import { backTarget, goBack } from './nav';
import { PageBack, ShellAccount, ShellFooter, ShellTopBar, STACKED, useMedia } from './ShellFrame';
import './vk.css';

/** The back button's words for where it goes. */
const BACK_KEY: Partial<Record<Screen, string>> = {
  menu: 'career.vk.back',
  career: 'shell.menu.career',
  game: 'shell.page.toShift',
};

export function ShellPage({
  title,
  subtitle,
  meta,
  back = true,
  onBack,
  backTo,
  actions,
  keys,
  children,
  className,
}: {
  title: ReactNode;
  /** The line next to the title: what this page is about, in one line of state. */
  subtitle?: ReactNode;
  /** Mono figures at the right of the head (an order number, a date). */
  meta?: ReactNode;
  back?: boolean;
  onBack?: () => void;
  /** Where `onBack` goes, for its label (default: the previous screen). */
  backTo?: Screen;
  /** The screen's main action, at the end of the head. */
  actions?: ReactNode;
  /** More keys for the footer (after Esc). */
  keys?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const t = useT();
  const user = useGame((s) => s.user);
  const stacked = useMedia(STACKED);
  const doBack = onBack ?? (() => goBack());
  useEscape(back ? doBack : undefined);
  const target = backTo ?? (onBack ? undefined : backTarget());
  const backLabel = t((target && BACK_KEY[target]) || 'shell.back');
  return (
    <div className={`vk vk-ui vk-page${stacked ? ' is-stacked' : ''}${className ? ' ' + className : ''}`}>
      <ShellTopBar account={!stacked} />
      <div className="vk-pagehead vk-page__head">
        {back && (
          <>
            <PageBack label={backLabel} onBack={doBack} />
            <span className="vk-pagehead__rule" aria-hidden="true" />
          </>
        )}
        <h1 className="vk-pagehead__title">{title}</h1>
        {subtitle && <p className="vk-pagehead__line sh-head__sub">{subtitle}</p>}
        {meta && <span className="vk-pagehead__meta">{meta}</span>}
        {actions && <div className="vk-page__actions">{actions}</div>}
      </div>
      <main className="vk-page__main">{children}</main>
      {stacked && user && (
        <section className="vk-panel vk-page__account" aria-label={t('account.method')}>
          <ShellAccount />
        </section>
      )}
      <ShellFooter>
        {!stacked && (back || keys) && (
          <ul className="vk-foot__keys" aria-label={t('shell.menu.keys')}>
            {back && (
              <li>
                <kbd className="vk-kbd">Esc</kbd> {backLabel.toLocaleLowerCase()}
              </li>
            )}
            {keys}
          </ul>
        )}
      </ShellFooter>
    </div>
  );
}

/** Calls `fn` on Escape (ignored while typing in a field or when a modal handled it). */
export function useEscape(fn?: () => void) {
  useEffect(() => {
    if (!fn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') &&
        (el as HTMLInputElement).value
      )
        return;
      fn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fn]);
}

/** Calls `fn` on Enter when nothing that takes Enter itself has the focus (a page's main action). */
export function useEnter(fn?: () => void) {
  useEffect(() => {
    if (!fn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el && el !== document.body && !el.classList.contains('vk-page__main')) return;
      // A dialog over the page (a modal, the replay) has the keys.
      if (document.querySelector('.ui-modal, [aria-modal="true"]')) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fn]);
}

/** A short note at the bottom of the screen that goes away by itself. */
export function useToast(ms = 2600) {
  const [toast, setToast] = useState<{
    text: string;
    tone: 'ok' | 'gold' | 'danger' | 'info';
    n: number;
  } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(id);
  }, [toast, ms]);
  const show = (text: string, tone: 'ok' | 'gold' | 'danger' | 'info' = 'info') =>
    setToast({ text, tone, n: Date.now() });
  const node = toast ? (
    <div key={toast.n} className={`vk-toast is-${toast.tone}`} role="status" aria-live="polite">
      <span className="vk-toast__dot" aria-hidden="true" />
      <span>{toast.text}</span>
    </div>
  ) : null;
  return { show, node };
}
