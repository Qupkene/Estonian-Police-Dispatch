// Menu chip of a logged-in account: name, cloud save state, sign out, and account deletion.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAccount } from '@/net/account';
import { useGame } from '@/store/game';
import { useLang, useT } from '@/i18n';
import { Button, Icon, IconButton, Modal, TextField } from '@/ui/components';
import { accountErrorText, cloudKey, initialsOf } from './accountText';

const fmtDate = (ms: number) => {
  const d = new Date(ms > 1e11 ? ms : ms * 1000); // tolerate unix seconds
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

export function AccountChip() {
  const t = useT();
  const user = useAccount((s) => s.user);
  const cloud = useAccount((s) => s.cloud);
  const lost = useAccount((s) => s.sessionLost);
  const gameUser = useGame((s) => s.user);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const signOut = () => {
    setOpen(false);
    void useAccount.getState().logout();
    useGame.getState().logout();
  };

  const name = user?.name ?? gameUser?.name ?? '?';
  const state = user ? cloud : 'off';

  return (
    <div className="sh-acct" ref={rootRef}>
      <button
        type="button"
        className="sh-acct__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${name} · ${t('account.chip.menu')}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="sh-user__avatar" aria-hidden="true">
          {initialsOf(name)}
        </span>
        <span className="sh-acct__text">
          <span className="sh-acct__name">{name}</span>
          <span className={`sh-acct__cloud is-${state}`} data-testid="cloud-state">
            <Icon name={state === 'error' ? 'warning' : 'cloud'} size={11} />
            {t(cloudKey(state))}
          </span>
        </span>
        <Icon name="chevron-down" size={14} className="sh-acct__chev" />
      </button>
      <IconButton icon="logout" size="sm" label={t('account.logout')} onClick={signOut} />

      {open && (
        <div className="sh-acct__menu" role="menu" aria-label={t('account.chip.menu')}>
          <div className="sh-acct__menuHead">
            <strong>{name}</strong>
            {user && user.created ? <span className="sh-dim">{t('account.chip.since', { date: fmtDate(user.created) })}</span> : null}
            <span className={`sh-acct__cloud is-${state}`}>
              <Icon name={state === 'error' ? 'warning' : 'cloud'} size={12} />
              {t(cloudKey(state))}
            </span>
            {lost && <span className="sh-acct__lost">{t('account.lost')}</span>}
          </div>
          <button type="button" role="menuitem" className="sh-acct__item" onClick={signOut}>
            <Icon name={lost ? 'user' : 'logout'} size={16} />
            {lost ? t('account.chip.relogin') : t('account.logout')}
          </button>
          {user && (
            <button
              type="button"
              role="menuitem"
              className="sh-acct__item is-danger"
              onClick={() => {
                setOpen(false);
                setConfirmDelete(true);
              }}
            >
              <Icon name="close" size={16} />
              {t('account.delete')}
            </button>
          )}
        </div>
      )}
      {/* Portal: the chip's backdrop-filter would otherwise become the modal's containing block. */}
      {confirmDelete &&
        createPortal(<DeleteAccount open name={name} onClose={() => setConfirmDelete(false)} />, document.body)}
    </div>
  );
}

function DeleteAccount({ open, name, onClose }: { open: boolean; name: string; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const busy = useAccount((s) => s.busy);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!password || busy) return;
    const ok = await useAccount.getState().deleteAccount(password);
    if (ok) {
      onClose();
      useGame.getState().logout();
    } else {
      setError(accountErrorText(useAccount.getState().error, lang, 'password'));
      // The confirm button was disabled while busy, so focus fell out of the dialog: back to the password.
      formRef.current?.querySelector('input')?.focus();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('account.delete.title')}
      icon="warning"
      tone="danger"
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('account.delete.cancel')}
          </Button>
          <Button variant="danger" icon="close" loading={busy} disabled={!password} onClick={() => void submit()}>
            {t('account.delete.confirm')}
          </Button>
        </>
      }
    >
      <form className="sh-acct__delete" onSubmit={submit} ref={formRef}>
        <p>{t('account.delete.text', { name })}</p>
        <TextField
          label={t('account.delete.password')}
          icon="lock"
          type="password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setError(null);
          }}
          autoComplete="current-password"
          error={error ?? undefined}
        />
      </form>
    </Modal>
  );
}
