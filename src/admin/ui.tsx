// Small building blocks of the admin panel: dialogs, notices, paging, loading.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AdminError } from './api';

// ---------------------------------------------------------------- notices

interface Notice {
  id: number;
  kind: 'ok' | 'bad';
  text: string;
}

const NoticeContext = createContext<(kind: Notice['kind'], text: string) => void>(() => {});

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Notice[]>([]);
  const next = useRef(1);
  const push = useCallback((kind: Notice['kind'], text: string) => {
    const id = next.current++;
    setList((l) => [...l.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), kind === 'bad' ? 8000 : 4000);
  }, []);
  return (
    <NoticeContext.Provider value={push}>
      {children}
      <div className="ad-notices" role="status" aria-live="polite">
        {list.map((x) => (
          <div key={x.id} className={`ad-notice ad-notice--${x.kind}`}>
            {x.text}
          </div>
        ))}
      </div>
    </NoticeContext.Provider>
  );
}

export const useNotice = () => useContext(NoticeContext);

/** The text to show for a failed call. */
export const errorText = (e: unknown): string =>
  e instanceof AdminError ? e.message : e instanceof Error ? e.message : 'Tundmatu viga.';

/** Run an action with a notice for its outcome; resolves to whether it worked. */
export function useAction() {
  const notice = useNotice();
  return useCallback(
    async (fn: () => Promise<unknown>, ok?: string): Promise<boolean> => {
      try {
        await fn();
        if (ok) notice('ok', ok);
        return true;
      } catch (e) {
        notice('bad', errorText(e));
        return false;
      }
    },
    [notice],
  );
}

// ---------------------------------------------------------------- loading

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Load with `fn` whenever `key` changes; `reload()` loads again. */
export function useLoad<T>(fn: () => Promise<T>, key: string): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let live = true;
    setLoading(true);
    fnRef.current().then(
      (d) => {
        if (!live) return;
        setData(d);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (!live) return;
        setError(errorText(e));
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [key, tick]);
  return { data, error, loading, reload: useCallback(() => setTick((t) => t + 1), []) };
}

export function LoadState({ loaded, children }: { loaded: Loaded<unknown>; children: ReactNode }) {
  if (loaded.error && !loaded.data)
    return (
      <div className="ad-empty ad-empty--bad">
        {loaded.error}{' '}
        <button type="button" className="ad-link" onClick={loaded.reload}>
          Proovi uuesti
        </button>
      </div>
    );
  if (!loaded.data) return <div className="ad-empty">Laadin…</div>;
  return <>{children}</>;
}

// ---------------------------------------------------------------- dialogs

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`ad-modal${wide ? ' ad-modal--wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="ad-modal__box">
        <header className="ad-modal__head">
          <h2>{title}</h2>
          <button type="button" className="ad-icon" onClick={onClose} aria-label="Sulge">
            ×
          </button>
        </header>
        <div className="ad-modal__body">{children}</div>
      </div>
    </dialog>
  );
}

/**
 * Ask before a destructive step. With `typeToConfirm` the button opens only after that text is typed (an account's
 * name before deleting it).
 */
export function Confirm({
  title,
  text,
  button,
  danger = true,
  typeToConfirm,
  onConfirm,
  onClose,
}: {
  title: string;
  text: ReactNode;
  button: string;
  danger?: boolean;
  typeToConfirm?: string;
  onConfirm: () => Promise<boolean | void>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ready =
    !typeToConfirm || typed.trim().toLocaleLowerCase('et') === typeToConfirm.toLocaleLowerCase('et');
  return (
    <Modal title={title} onClose={onClose}>
      <div className="ad-confirm">
        <div>{text}</div>
        {typeToConfirm && (
          <label className="ad-field">
            <span>
              Kinnituseks kirjuta <b>{typeToConfirm}</b>
            </span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
          </label>
        )}
        <div className="ad-actions">
          <button type="button" className="ad-btn" onClick={onClose}>
            Loobu
          </button>
          <button
            type="button"
            className={`ad-btn ${danger ? 'ad-btn--danger' : 'ad-btn--primary'}`}
            disabled={!ready || busy}
            onClick={async () => {
              setBusy(true);
              const ok = await onConfirm();
              setBusy(false);
              if (ok !== false) onClose();
            }}
          >
            {button}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** A password the server made: shown once, with a copy button. */
export function SecretBox({ name, password }: { name: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ad-secret">
      <p>
        Konto <b>{name}</b> uus parool. Seda näidatakse ainult nüüd: anna see mängijale turvaliselt edasi.
      </p>
      <div className="ad-secret__row">
        <code className="ad-secret__value">{password}</code>
        <button
          type="button"
          className="ad-btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'Kopeeritud' : 'Kopeeri'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tables

export function Pager({
  total,
  limit,
  offset,
  onOffset,
}: {
  total: number;
  limit: number;
  offset: number;
  onOffset: (o: number) => void;
}) {
  if (total <= limit && offset === 0) return <div className="ad-pager">{total} rida</div>;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="ad-pager">
      <button
        type="button"
        className="ad-btn ad-btn--small"
        disabled={offset === 0}
        onClick={() => onOffset(Math.max(0, offset - limit))}
      >
        Eelmine
      </button>
      <span>
        Leht {page} / {pages} ({total} rida)
      </span>
      <button
        type="button"
        className="ad-btn ad-btn--small"
        disabled={offset + limit >= total}
        onClick={() => onOffset(offset + limit)}
      >
        Järgmine
      </button>
    </div>
  );
}

export function Badge({
  kind,
  children,
}: {
  kind: 'acc' | 'bad' | 'ok' | 'amb' | 'dim';
  children: ReactNode;
}) {
  return <span className={`ad-badge ad-badge--${kind}`}>{children}</span>;
}

/** A search box that reports after the typing stops. */
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = window.setTimeout(() => onChange(text), 300);
    return () => window.clearTimeout(t);
  }, [text, value, onChange]);
  return (
    <input
      type="search"
      className="ad-input"
      value={text}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => setText(e.target.value)}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
  all,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
  label: string;
  all?: string;
}) {
  return (
    <select className="ad-input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {all !== undefined && <option value="">{all}</option>}
      {Object.entries(options).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}
