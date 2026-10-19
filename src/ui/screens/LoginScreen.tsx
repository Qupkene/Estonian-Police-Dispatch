// Estonian e-identity login simulation (ID-kaart / Mobiil-ID / Smart-ID) + the classic 2024 login.
// The e-ID flows are simulations: any input is accepted after a short delay (guest logins).
// The "Klassika" tab is the real account login when the server answers (src/net/account.ts);
// both fields empty is still the 2024 easter egg. Owned by ui-shell.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useGame, type LoginUser } from '@/store/game';
import { useAccount, type AccountUser } from '@/net/account';
import { nameProblem, PASSWORD_MIN } from '@/net/sync';
import { useLang, useT } from '@/i18n';
import { sfx } from '@/audio/sfx';
import { Button, Icon, IconButton, Spinner, Tabs, TextField } from '@/ui/components';
import { useToast } from './shell/ShellPage';
import { DutyMap, NO_DUTY } from './shell/DutyMap';
import { ShellFooter, ShellTopBar, STACKED, useMedia } from './shell/ShellFrame';
import { VkLayer } from './shell/VkLayer';
import { accountErrorText } from './shell/accountText';
import { LogoutDialog } from './shell/AccountChip';
import {
  formatCountdown,
  generateIdentity,
  isLegacyLogin,
  isValidPin1,
  verificationCode,
  VERSION,
  type GeneratedIdentity,
} from './shell/helpers';
import './shell/vk.css';
import './shell/login.css';

type Method = 'idcard' | 'mobiilid' | 'smartid' | 'legacy';

export function LoginScreen() {
  const t = useT();
  const login = useGame((s) => s.login);
  const backend = useAccount((s) => s.backend);
  const accountUser = useAccount((s) => s.user);
  const sessionLost = useAccount((s) => s.sessionLost);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [seed, setSeed] = useState(() => (Date.now() ^ 0x2024) >>> 0);
  const [id, setId] = useState<GeneratedIdentity>(() => generateIdentity(seed));
  const [name, setName] = useState(() => `${id.firstName} ${id.lastName}`);
  // The menu's "Create account" button opens the Klassika tab straight away.
  const [method, setMethod] = useState<Method>(() => (useAccount.getState().intent ? 'legacy' : 'idcard'));
  const [success, setSuccess] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const toast = useToast(3000);
  const stacked = useMedia(STACKED);

  const shuffle = () => {
    const s = (seed * 1664525 + 1013904223) >>> 0;
    const n = generateIdentity(s);
    setSeed(s);
    setId(n);
    setName(`${n.firstName} ${n.lastName}`);
  };

  const finalName = () => name.trim() || `${id.firstName} ${id.lastName}`;

  useEffect(() => {
    void useAccount.getState().init();
  }, []);

  /**
   * Every login except the account one is a guest login: an open account session ends (the guest's own data
   * comes back, src/store/space.ts), and one that /api/me is still about to report (slow connection) is never
   * started.
   */
  const leaveAccount = () => {
    useAccount.getState().decline();
  };

  const complete = (m: LoginUser['method'], idcode?: string) => {
    leaveAccount();
    const user: LoginUser = { name: finalName(), method: m, idcode };
    setSuccess(user.name);
    sfx.unlock();
    sfx.play('login');
    setTimeout(() => login(user), 850);
  };

  const accountLogin = (u: AccountUser) => {
    setSuccess(u.name);
    sfx.unlock();
    sfx.play('login');
    setTimeout(() => login({ name: u.name, method: 'account' }), 850);
  };

  const legacyLogin = () => {
    leaveAccount();
    try {
      localStorage.setItem('epd:legacyLogin', '1');
    } catch {
      /* storage blocked */
    }
    sfx.unlock();
    sfx.play('login');
    toast.show(t('shell.login.legacy.welcome'), 'gold');
    setLeaving(true); // 2024: the login box faded out for one second
    setTimeout(() => login({ name: finalName(), method: 'legacy' }), 1100);
  };

  const guest = () => {
    leaveAccount();
    sfx.unlock();
    login({ name: name.trim() || t('shell.login.guestName'), method: 'guest' });
  };

  return (
    <div
      className={`vk vk-ui vk-login sh-login${stacked ? ' is-stacked' : ''}${leaving ? ' is-leaving' : ''}`}
    >
      {toast.node}
      <ShellTopBar account={false} />
      <main className="vk-login__main">
        <div className={stacked ? 'vk-login__strip' : 'vk-login__map'}>
          <DutyMap variant={stacked ? 'strip' : 'full'} input={NO_DUTY} />
        </div>
        <section className="vk-panel vk-login__panel" aria-labelledby="sh-login-title">
          <div className="vk-panel__head">
            <h1 className="vk-h" id="sh-login-title">
              {t('shell.login.title')}
            </h1>
            <span className="vk-meta">EPD-CAD {VERSION}</span>
          </div>
          {success ? (
            <div className="vk-login__success" role="status">
              <p className="vk-login__successTitle">
                <span className="vk-login__ok" aria-hidden="true" />
                {t('shell.login.success')}
              </p>
              <p>{t('shell.login.welcome', { name: success })}</p>
            </div>
          ) : (
            <>
              <div className="vk-login__top">
                {accountUser && (
                  <div className="vk-login__resume" role="status">
                    <p>
                      <strong>{t('account.resume.title', { name: accountUser.name })}</strong>
                      <span>{t('account.resume.text')}</span>
                    </p>
                    <div className="vk-login__resumeActions">
                      <Button variant="primary" onClick={() => accountLogin(accountUser)}>
                        {t('account.resume.continue')}
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmLogout(true)}>
                        {t('account.logout')}
                      </Button>
                    </div>
                  </div>
                )}
                {sessionLost && !accountUser && (
                  <p className="vk-msg is-warn" role="status">
                    {t('account.lost')}
                  </p>
                )}
                <TextField
                  label={t('shell.login.name')}
                  value={name}
                  onChange={setName}
                  maxLength={40}
                  autoComplete="off"
                  hint={t('shell.login.nameHint')}
                  trailing={
                    <IconButton
                      icon="refresh"
                      size="sm"
                      label={t('shell.login.shuffle')}
                      onClick={shuffle}
                      className="vk-login__shuffle"
                    />
                  }
                />
              </div>
              <Tabs<Method>
                className="vk-login__tabs"
                value={method}
                onChange={setMethod}
                tabs={[
                  { id: 'idcard', label: t('shell.login.tab.idcard') },
                  { id: 'mobiilid', label: t('shell.login.tab.mobiilid') },
                  { id: 'smartid', label: t('shell.login.tab.smartid') },
                  { id: 'legacy', label: t('shell.login.tab.legacy') },
                ]}
              />
              <div className="vk-login__flow" role="tabpanel">
                {method === 'idcard' && (
                  <IdCardFlow
                    key={id.idcode}
                    identity={id}
                    name={finalName()}
                    onDone={(code) => complete('idcard', code)}
                  />
                )}
                {method === 'mobiilid' && (
                  <MobileFlow
                    key={`m${id.idcode}`}
                    kind="mobiilid"
                    identity={id}
                    onDone={(code) => complete('mobiilid', code)}
                  />
                )}
                {method === 'smartid' && (
                  <MobileFlow
                    key={`s${id.idcode}`}
                    kind="smartid"
                    identity={id}
                    onDone={(code) => complete('smartid', code)}
                  />
                )}
                {method === 'legacy' && <LegacyForm onLegacy={legacyLogin} onAccount={accountLogin} />}
              </div>
              <div className="vk-login__alt">
                <span>{t('shell.login.or')}</span>
                <button type="button" className="vk-btn vk-btn--ghost" onClick={guest} data-sfx="click">
                  {t('shell.login.guest')}
                </button>
              </div>
              <p className="vk-login__sim">
                {/* The account form does send data: its note says what the server keeps. */}
                {t(
                  backend === 'online' && method === 'legacy'
                    ? 'account.login.simNote'
                    : 'shell.login.simNote',
                )}
              </p>
              {backend === 'online' && method !== 'legacy' && !accountUser && (
                <p className="vk-login__acct">
                  <button type="button" className="vk-linkbtn" onClick={() => setMethod('legacy')}>
                    {t('account.login.hint')}
                  </button>
                </p>
              )}
            </>
          )}
          <dl className="vk-login__sys">
            <div>
              <dt>{t('shell.login.sys.server')}</dt>
              <dd>
                <span className={`vk-login__dot is-${backend}`} aria-hidden="true" />
                {t(`shell.login.sys.${backend}`)}
              </dd>
            </div>
          </dl>
        </section>
      </main>
      <ShellFooter />
      {confirmLogout && accountUser && (
        <VkLayer>
          <LogoutDialog name={accountUser.name} onClose={() => setConfirmLogout(false)} />
        </VkLayer>
      )}
    </div>
  );
}

// ── ID-kaart ────────────────────────────────────────────────────────────────

function IdCardFlow({
  identity,
  name,
  onDone,
}: {
  identity: GeneratedIdentity;
  name: string;
  onDone: (idcode: string) => void;
}) {
  const t = useT();
  const [phase, setPhase] = useState<'insert' | 'reading' | 'pin' | 'verifying'>('insert');
  const [pin, setPin] = useState('');
  const pinRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (phase === 'reading') {
      const id = setTimeout(() => setPhase('pin'), 1300);
      return () => clearTimeout(id);
    }
    if (phase === 'pin') pinRef.current?.focus();
    if (phase === 'verifying') {
      const id = setTimeout(() => doneRef.current(identity.idcode), 1000);
      return () => clearTimeout(id);
    }
  }, [phase, identity.idcode]);

  const typeDigit = (d: string) => {
    if (pin.length >= 4) return;
    sfx.play('typing');
    setPin(pin + d);
    pinRef.current?.focus();
  };
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (isValidPin1(pin)) setPhase('verifying');
    else sfx.play('error');
  };

  const steps: { key: string; on: boolean; done: boolean }[] = [
    {
      key: 'card',
      on: phase === 'insert' || phase === 'reading',
      done: phase === 'pin' || phase === 'verifying',
    },
    { key: 'pin', on: phase === 'pin', done: phase === 'verifying' },
    { key: 'cert', on: phase === 'verifying', done: false },
  ];
  return (
    <div className="sh-id vk-id">
      <ol className="vk-steps" aria-label={t('shell.login.id.steps')}>
        {steps.map((st, i) => (
          <li
            key={st.key}
            className={st.done ? 'is-done' : st.on ? 'is-on' : undefined}
            aria-current={st.on ? 'step' : undefined}
          >
            <span className="vk-steps__n">{i + 1}</span>
            {t(`shell.login.id.step.${st.key}`)}
          </li>
        ))}
      </ol>
      {phase === 'insert' && (
        <div className="sh-id__step">
          <p>{t('shell.login.id.insert')}</p>
          <Button variant="primary" size="lg" onClick={() => setPhase('reading')} block>
            {t('shell.login.id.insertBtn')}
          </Button>
        </div>
      )}
      {phase === 'reading' && (
        <div className="sh-id__step sh-id__status">
          <Spinner size={18} /> {t('shell.login.id.reading')}
        </div>
      )}
      {(phase === 'pin' || phase === 'verifying') && (
        <form className="sh-id__step" onSubmit={submit}>
          <dl className="vk-kv vk-id__owner">
            <div>
              <dt>{t('shell.login.id.owner')}</dt>
              <dd>{name.toUpperCase()}</dd>
            </div>
            <div>
              <dt>{t('shell.login.idcode')}</dt>
              <dd className="vk-mono">{identity.idcode}</dd>
            </div>
          </dl>
          <label className="sh-pin" onClick={() => pinRef.current?.focus()}>
            <span className="sh-pin__label">{t('shell.login.id.pin')}</span>
            <span className="sh-pin__boxes">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`sh-pin__box${i < pin.length ? ' is-filled' : ''}${i === pin.length && phase === 'pin' ? ' is-cursor' : ''}`}
                />
              ))}
            </span>
            <input
              ref={pinRef}
              className="sh-pin__input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              disabled={phase !== 'pin'}
              aria-label={t('shell.login.id.pin')}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                if (v.length > pin.length) sfx.play('typing');
                setPin(v);
              }}
            />
          </label>
          <p className="sh-pin__hint">{t('shell.login.id.pinHint')}</p>
          {phase === 'pin' ? (
            <>
              <div className="sh-pad" role="group" aria-label={t('shell.login.id.pad')}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="sh-pad__key"
                    onClick={() => typeDigit(d)}
                    tabIndex={-1}
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  className="sh-pad__key sh-pad__key--fn"
                  onClick={() => setPin(pin.slice(0, -1))}
                  tabIndex={-1}
                  aria-label={t('shell.login.id.erase')}
                >
                  ⌫
                </button>
                <button type="button" className="sh-pad__key" onClick={() => typeDigit('0')} tabIndex={-1}>
                  0
                </button>
                <button
                  type="submit"
                  className="sh-pad__key sh-pad__key--ok"
                  disabled={!isValidPin1(pin)}
                  tabIndex={-1}
                >
                  OK
                </button>
              </div>
              <Button type="submit" variant="primary" size="lg" disabled={!isValidPin1(pin)} block>
                {t('shell.login.confirm')}
              </Button>
            </>
          ) : (
            <div className="sh-id__status">
              <Spinner size={18} /> {t('shell.login.id.verify')}
            </div>
          )}
        </form>
      )}
    </div>
  );
}

// ── Mobiil-ID / Smart-ID ────────────────────────────────────────────────────

const CONFIRM_WINDOW_S = 120;

function MobileFlow({
  kind,
  identity,
  onDone,
}: {
  kind: 'mobiilid' | 'smartid';
  identity: GeneratedIdentity;
  onDone: (idcode: string) => void;
}) {
  const t = useT();
  const [phone, setPhone] = useState(identity.phone);
  const [idcode, setIdcode] = useState(identity.idcode);
  const [phase, setPhase] = useState<'form' | 'waiting' | 'confirmed'>('form');
  const [code, setCode] = useState('0000');
  const [left, setLeft] = useState(CONFIRM_WINDOW_S);
  const [pinDots, setPinDots] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (phase !== 'waiting') return;
    const started = Date.now();
    const iv = setInterval(() => setLeft(CONFIRM_WINDOW_S - (Date.now() - started) / 1000), 250);
    // The "phone" types PIN1 by itself and confirms after a short while.
    const dots = [700, 1000, 1300, 1600].map((ms, i) => setTimeout(() => setPinDots(i + 1), ms));
    const auto = setTimeout(() => setPhase('confirmed'), 2600);
    return () => {
      clearInterval(iv);
      clearTimeout(auto);
      dots.forEach(clearTimeout);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'confirmed') return;
    const id = setTimeout(() => doneRef.current(idcode.replace(/\s/g, '') || identity.idcode), 450);
    return () => clearTimeout(id);
  }, [phase, idcode, identity.idcode]);

  const start = (e: FormEvent) => {
    e.preventDefault();
    setCode(verificationCode((Date.now() ^ Number(idcode.replace(/\D/g, '').slice(-6) || 7)) >>> 0));
    setLeft(CONFIRM_WINDOW_S);
    setPinDots(0);
    setPhase('waiting');
  };

  const appName = kind === 'mobiilid' ? 'Mobiil-ID' : 'Smart-ID';

  if (phase === 'form') {
    return (
      <form className="sh-mid" onSubmit={start}>
        {kind === 'mobiilid' && (
          <TextField
            label={t('shell.login.mid.phone')}
            value={phone}
            onChange={setPhone}
            inputMode="tel"
            autoComplete="off"
            mono
          />
        )}
        <TextField
          label={t('shell.login.idcode')}
          value={idcode}
          onChange={setIdcode}
          inputMode="numeric"
          autoComplete="off"
          maxLength={11}
          mono
        />
        {kind === 'smartid' && <p className="sh-mid__note">{t('shell.login.sid.note')}</p>}
        <Button type="submit" variant="primary" size="lg" block>
          {t('shell.login.continue')}
        </Button>
      </form>
    );
  }

  return (
    <div className="sh-mid sh-mid--wait">
      <div className="sh-mid__left">
        <div className="sh-mid__codeLabel">{t('shell.login.code')}</div>
        <div className="sh-mid__code mono" aria-live="polite">
          {code}
        </div>
        <p className="sh-mid__check">
          {t(kind === 'mobiilid' ? 'shell.login.mid.check' : 'shell.login.sid.check')}
        </p>
        <div className="sh-mid__timer">
          <div className="sh-mid__timerBar">
            <i style={{ width: `${Math.max(0, left / CONFIRM_WINDOW_S) * 100}%` }} />
          </div>
          <span className="mono">
            {phase === 'confirmed'
              ? t('shell.login.confirmed')
              : t('shell.login.waiting', { time: formatCountdown(left) })}
          </span>
        </div>
        <Button variant="ghost" onClick={() => setPhase('form')} disabled={phase === 'confirmed'}>
          {t('shell.login.cancel')}
        </Button>
      </div>
      <div className={`sh-phone sh-phone--${kind}`} aria-hidden="true">
        <div className="sh-phone__app">{appName}</div>
        <div className="sh-phone__title">{t('shell.login.phone.request')}</div>
        <div className="sh-phone__code mono">{code}</div>
        <div className="sh-phone__pin">
          <span>PIN1</span>
          <span className="sh-phone__dots">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={i < pinDots ? 'is-on' : ''} />
            ))}
          </span>
        </div>
        <button type="button" className="sh-phone__ok" onClick={() => setPhase('confirmed')} tabIndex={-1}>
          {phase === 'confirmed' ? <Icon name="check" size={16} /> : 'OK'}
        </button>
      </div>
    </div>
  );
}

// ── Classic 2024 login = account login ──────────────────────────────────────

type LegacyMode = 'login' | 'register';

function LegacyForm({ onLegacy, onAccount }: { onLegacy: () => void; onAccount: (u: AccountUser) => void }) {
  const t = useT();
  const lang = useLang();
  const backend = useAccount((s) => s.backend);
  const busy = useAccount((s) => s.busy);
  const [mode, setMode] = useState<LegacyMode>(() =>
    useAccount.getState().intent === 'register' ? 'register' : 'login',
  );
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Which input the error is about (focused after the shake, marked aria-invalid). */
  const [errorField, setErrorField] = useState<'user' | 'pass' | 'pass2' | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const pass2Ref = useRef<HTMLInputElement>(null);
  const online = backend === 'online';
  const register = online && mode === 'register';
  const errId = 'sh-legacy-err';

  useEffect(() => {
    useAccount.getState().setIntent(null);
  }, []);

  const fail = (msg: string, field: 'user' | 'pass' | 'pass2' = 'pass') => {
    setError(msg);
    setErrorField(field);
    sfx.play('error');
    // Restart the 2024 shake without remounting the inputs, so focus and the phone keyboard stay.
    const box = boxRef.current;
    if (box) {
      box.classList.remove('is-shake');
      void box.offsetWidth;
      box.classList.add('is-shake');
    }
    ({ user: userRef, pass: passRef, pass2: pass2Ref })[field].current?.focus();
  };

  const switchMode = (m: LegacyMode) => {
    setMode(m);
    setError(null);
    setErrorField(null);
    setPass('');
    setPass2('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    // 2024: both fields empty was the only combination that worked. It still does.
    if (isLegacyLogin(user, pass) && (!register || pass2 === '')) {
      setError(null);
      onLegacy();
      return;
    }
    const acct = useAccount.getState();
    if (acct.backend === 'unknown') await acct.init();
    if (useAccount.getState().backend !== 'online') {
      fail(t('shell.login.legacy.wrong'));
      return;
    }
    const name = user.trim();
    if (register) {
      const np = nameProblem(name);
      if (np) return fail(t(`account.rule.name.${np}`), 'user');
      if (pass.length < PASSWORD_MIN) return fail(t('account.rule.pass.short', { n: PASSWORD_MIN }), 'pass');
      if (pass !== pass2) return fail(t('account.rule.pass.mismatch'), 'pass2');
    } else if (!name || !pass) {
      return fail(t('shell.login.legacy.wrong'), name ? 'pass' : 'user');
    }
    setError(null);
    setErrorField(null);
    const ok = register ? await acct.register(name, pass) : await acct.login(name, pass);
    const u = useAccount.getState().user;
    if (ok && u) onAccount(u);
    else {
      const err = useAccount.getState().error;
      const field = err?.code === 'invalid_name' || err?.code === 'name_taken' ? 'user' : 'pass';
      fail(accountErrorText(err, lang) || t('account.err.unknown'), field);
    }
  };

  const rules = [
    { key: 'account.rule.name', ok: nameProblem(user) === null },
    { key: 'account.rule.pass', ok: pass.length >= PASSWORD_MIN },
    { key: 'account.rule.repeat', ok: pass2.length > 0 && pass === pass2 },
  ];

  return (
    <form className="sh-legacy" onSubmit={submit} noValidate>
      <div
        className="sh-legacy__box"
        ref={boxRef}
        onAnimationEnd={(e) => e.target === e.currentTarget && e.currentTarget.classList.remove('is-shake')}
      >
        <h2>{register ? t('account.register.title') : t('shell.login.legacy.title')}</h2>
        <input
          ref={userRef}
          className="sh-legacy__input"
          name="username"
          placeholder={t('shell.login.legacy.user')}
          aria-label={t('shell.login.legacy.user')}
          aria-invalid={error && errorField === 'user' ? true : undefined}
          aria-describedby={error && errorField === 'user' ? errId : undefined}
          value={user}
          onChange={(e) => setUser(e.target.value)}
          autoComplete={online ? 'username' : 'off'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={64}
        />
        <input
          ref={passRef}
          className="sh-legacy__input"
          type="password"
          name="password"
          placeholder={t('shell.login.legacy.pass')}
          aria-label={t('shell.login.legacy.pass')}
          aria-invalid={error && errorField === 'pass' ? true : undefined}
          aria-describedby={error && errorField === 'pass' ? errId : undefined}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete={online ? (register ? 'new-password' : 'current-password') : 'off'}
        />
        {register && (
          <input
            ref={pass2Ref}
            className="sh-legacy__input"
            type="password"
            name="password-repeat"
            placeholder={t('account.register.repeat')}
            aria-label={t('account.register.repeat')}
            aria-invalid={error && errorField === 'pass2' ? true : undefined}
            aria-describedby={error && errorField === 'pass2' ? errId : undefined}
            value={pass2}
            onChange={(e) => setPass2(e.target.value)}
            autoComplete="new-password"
          />
        )}
        {register && (
          <ul className="sh-legacy__rules" aria-label={t('account.rules')}>
            {rules.map((r) => (
              <li key={r.key} className={r.ok ? 'is-ok' : ''}>
                <Icon name={r.ok ? 'check' : 'info'} size={12} />
                {t(r.key)}
              </li>
            ))}
          </ul>
        )}
        <button type="submit" className="sh-legacy__btn" disabled={busy} aria-busy={busy || undefined}>
          {busy ? (
            <>
              <Spinner size={14} /> {t('account.login.busy')}
            </>
          ) : register ? (
            t('account.register.submit')
          ) : (
            t('shell.login.legacy.submit')
          )}
        </button>
        {error && (
          <p className="sh-legacy__err" id={errId} role="alert">
            {error}
          </p>
        )}
      </div>
      {online && (
        <button
          type="button"
          className="sh-legacy__switch"
          onClick={() => switchMode(register ? 'login' : 'register')}
        >
          {register ? t('account.login.toLogin') : t('account.login.toRegister')}
        </button>
      )}
      <p className="sh-legacy__note">{online ? t('account.login.note') : t('shell.login.legacy.note')}</p>
      {backend === 'offline' && <p className="sh-legacy__offline">{t('account.login.offline')}</p>}
    </form>
  );
}
