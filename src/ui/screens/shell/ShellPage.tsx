// Common frame for the shell screens: backdrop, header with Back, content area and disclaimer footer.
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Emblem, Icon, Segmented, type IconName } from '@/ui/components';
import { useT } from '@/i18n';
import { useSettings } from '@/store/settings';
import type { Lang } from '@/sim/types';
import { Backdrop } from './Backdrop';
import { goBack } from './nav';
import './shell.css';

export function ShellPage({
  title,
  subtitle,
  icon,
  back = true,
  onBack,
  actions,
  children,
  className,
  variant = 'grid',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: IconName;
  back?: boolean;
  onBack?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: 'grid' | 'radar';
}) {
  const t = useT();
  const doBack = onBack ?? (() => goBack());
  useEscape(back ? doBack : undefined);
  return (
    <div className={`sh-screen${className ? ' ' + className : ''}`}>
      <Backdrop variant={variant} />
      <header className="sh-head">
        <div className="sh-head__left">
          {back && (
            <Button variant="ghost" icon="chevron-left" onClick={doBack} kbd="Esc">
              {t('shell.back')}
            </Button>
          )}
        </div>
        <div className="sh-head__brand">
          <Emblem size={34} />
          <div className="sh-head__titles">
            <h1 className="sh-head__title">
              {icon && <Icon name={icon} size={18} />}
              {title}
            </h1>
            {subtitle && <div className="sh-head__sub">{subtitle}</div>}
          </div>
        </div>
        <div className="sh-head__actions">{actions}</div>
      </header>
      <main className="sh-main">{children}</main>
      <Disclaimer />
    </div>
  );
}

export function Disclaimer({ className }: { className?: string }) {
  const t = useT();
  return (
    <footer className={`sh-disclaimer${className ? ' ' + className : ''}`}>
      <Icon name="info" size={13} />
      <span>{t('core.disclaimer')}</span>
    </footer>
  );
}

export function LangToggle() {
  const lang = useSettings((s) => s.lang);
  const set = useSettings((s) => s.set);
  const t = useT();
  return (
    <Segmented<Lang>
      size="sm"
      label={t('shell.set.lang')}
      value={lang}
      onChange={(v) => set({ lang: v })}
      options={[
        { value: 'et', label: 'ET', title: 'Eesti keel' },
        { value: 'en', label: 'EN', title: 'English' },
      ]}
    />
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

/** Tiny transient toast. */
export function useToast(ms = 2600) {
  const [toast, setToast] = useState<{
    text: string;
    tone: 'ok' | 'gold' | 'danger' | 'info';
    icon: IconName;
    n: number;
  } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(id);
  }, [toast, ms]);
  const show = (text: string, tone: 'ok' | 'gold' | 'danger' | 'info' = 'info', icon: IconName = 'info') =>
    setToast({ text, tone, icon, n: Date.now() });
  const node = toast ? (
    <div key={toast.n} className={`sh-toast sh-toast--${toast.tone}`} role="status" aria-live="polite">
      <Icon name={toast.icon} size={16} />
      <span>{toast.text}</span>
    </div>
  ) : null;
  return { show, node };
}
