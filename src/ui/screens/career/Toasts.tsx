import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/ui/components';

export type ToastTone = 'ok' | 'danger' | 'warn' | 'info' | 'gold';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  leaving?: boolean;
}

type Notify = (tone: ToastTone, title: string, body?: string) => void;

const ToastCtx = createContext<Notify>(() => {});

export function useToast(): Notify {
  return useContext(ToastCtx);
}

const ICON: Record<ToastTone, IconName> = { ok: 'check', danger: 'alert', warn: 'warning', info: 'info', gold: 'trophy' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 220);
  }, []);

  const notify = useCallback<Notify>(
    (tone, title, body) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { id, tone, title, body }]);
      window.setTimeout(() => dismiss(id), tone === 'danger' ? 5200 : 3600);
    },
    [dismiss],
  );

  const value = useMemo(() => notify, [notify]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="cr-toasts" aria-live="polite" role="status">
        {items.map((t) => (
          <div key={t.id} className={`cr-toast cr-toast--${t.tone}${t.leaving ? ' is-leaving' : ''}`} onClick={() => dismiss(t.id)}>
            <span className="cr-toast__icon">
              <Icon name={ICON[t.tone]} size={16} />
            </span>
            <span className="cr-toast__text">
              <strong>{t.title}</strong>
              {t.body && <span>{t.body}</span>}
            </span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
