// The signed-in account in the shell's top bar: profile picture, name, cloud save state and when it last succeeded,
// sign out (confirmed, optionally removing the account's data from this browser), and in its menu the profile
// picture (ProfilePicker, 2.35.0) and account deletion.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAccount } from '@/net/account';
import { useGame } from '@/store/game';
import { useLang, useT } from '@/i18n';
import { hhmm } from '@/sim/time';
import { Button, Modal, PlayerAvatar, TextField } from '@/ui/components';
import { accountErrorText, cloudKey } from './accountText';
import { ProfilePicker } from './ProfilePicker';
import { VkLayer } from './VkLayer';

const fmtDate = (ms: number) => {
  const d = new Date(ms > 1e11 ? ms : ms * 1000); // tolerate unix seconds
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

// When the cloud save last succeeded (this tab, this session): the account store keeps only the state.
let savedAt: number | null = null;
useAccount.subscribe((s, prev) => {
  if (!s.user) savedAt = null;
  else if (s.cloud === 'saved' && prev.cloud !== 'saved') savedAt = Date.now();
});

export function AccountChip() {
  const t = useT();
  const user = useAccount((s) => s.user);
  const cloud = useAccount((s) => s.cloud);
  const lost = useAccount((s) => s.sessionLost);
  const gameUser = useGame((s) => s.user);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [picture, setPicture] = useState(false);
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
    // Signed in: ask first (and whether to remove the account's data from this browser). A session that
    // already ended has nothing more to upload or ask about.
    if (user) {
      setConfirmLogout(true);
      return;
    }
    void useAccount.getState().logout();
    useGame.getState().logout();
  };

  const name = user?.name ?? gameUser?.name ?? '?';
  const state = user ? cloud : 'off';
  const status = (
    <>
      <span className={`vk-acct__dot is-${state}`} aria-hidden="true" />
      <span data-testid="cloud-state">{t(cloudKey(state))}</span>
      {state === 'saved' && savedAt !== null && <span className="vk-mono">{hhmm(savedAt)}</span>}
    </>
  );

  return (
    <div className="vk-acct sh-acct" ref={rootRef}>
      <button
        type="button"
        className="vk-acct__who sh-acct__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('account.chip.menu')}
        onClick={() => setOpen((o) => !o)}
      >
        {user && <PlayerAvatar avatar={user.avatar} name={user.name} size={26} className="vk-acct__pic" />}
        <span className="vk-acct__name sh-acct__name">{name}</span>
        <span className="vk-acct__state">{status}</span>
      </button>
      <button type="button" className="vk-btn vk-btn--ghost vk-acct__out" onClick={signOut}>
        {t('account.logout')}
      </button>

      {open && (
        <div className="vk-acct__menu" role="menu" aria-label={t('account.chip.menu')}>
          <div className="vk-acct__menuHead">
            <strong>{name}</strong>
            {user && user.created ? (
              <span>{t('account.chip.since', { date: fmtDate(user.created) })}</span>
            ) : null}
            <span className="vk-acct__state">{status}</span>
            {lost && <span className="vk-acct__lost">{t('account.lost')}</span>}
          </div>
          {user && (
            <button
              type="button"
              role="menuitem"
              className="vk-acct__item"
              onClick={() => {
                setOpen(false);
                setPicture(true);
              }}
              data-testid="chip-picture"
            >
              {t('account.chip.picture')}
            </button>
          )}
          {user?.admin && (
            <a role="menuitem" className="vk-acct__item" href="/admin/">
              {t('account.chip.admin')}
            </a>
          )}
          <button type="button" role="menuitem" className="vk-acct__item" onClick={signOut}>
            {lost ? t('account.chip.relogin') : t('account.logout')}
          </button>
          {user && (
            <button
              type="button"
              role="menuitem"
              className="vk-acct__item is-danger"
              onClick={() => {
                setOpen(false);
                setConfirmDelete(true);
              }}
            >
              {t('account.delete')}
            </button>
          )}
        </div>
      )}
      {/* On document.body: a modal inside the top bar would be clipped by it. */}
      {confirmDelete && (
        <VkLayer>
          <DeleteAccount open name={name} onClose={() => setConfirmDelete(false)} />
        </VkLayer>
      )}
      {picture && (
        <VkLayer>
          <ProfilePicker onClose={() => setPicture(false)} />
        </VkLayer>
      )}
      {confirmLogout && (
        <VkLayer>
          <LogoutDialog
            name={name}
            onClose={() => setConfirmLogout(false)}
            onDone={() => useGame.getState().logout()}
          />
        </VkLayer>
      )}
    </div>
  );
}

/**
 * Sign-out confirmation. The account's data in this browser is only a cache of the cloud copy, so removing it
 * (on by default, for shared computers) loses nothing: changes the server does not have yet stay until the next
 * sign-in uploads them.
 */
export function LogoutDialog({
  name,
  onClose,
  onDone,
}: {
  name: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const t = useT();
  const cloud = useAccount((s) => s.cloud);
  const [forget, setForget] = useState(true);

  const confirm = () => {
    onClose();
    void useAccount.getState().logout({ forget });
    onDone?.();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('account.logout.title')}
      icon="logout"
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('account.logout.cancel')}
          </Button>
          <Button variant="primary" icon="logout" onClick={confirm}>
            {t('account.logout')}
          </Button>
        </>
      }
    >
      <div className="vk-dialog">
        <p>{t('account.logout.text', { name })}</p>
        {cloud === 'error' && (
          <p className="vk-msg is-bad" role="status">
            {t('account.logout.unsynced')}
          </p>
        )}
        <label className="vk-check">
          <input type="checkbox" checked={forget} onChange={(e) => setForget(e.target.checked)} />
          <span className="vk-check__text">
            <span className="vk-check__label">{t('account.logout.forget')}</span>
            <span className="vk-check__hint">{t('account.logout.forgetHint')}</span>
          </span>
        </label>
      </div>
    </Modal>
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
          <Button
            variant="danger"
            icon="close"
            loading={busy}
            disabled={!password}
            onClick={() => void submit()}
          >
            {t('account.delete.confirm')}
          </Button>
        </>
      }
    >
      <form className="vk-dialog" onSubmit={submit} ref={formRef}>
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
