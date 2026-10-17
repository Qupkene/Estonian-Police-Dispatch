// Estonian e-identity login simulation (ID-kaart / Mobiil-ID / Smart-ID) + the classic 2024 login.
// Nothing is real: any input is accepted after a short delay. Owned by ui-shell.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useGame, type LoginUser } from '@/store/game';
import { useT } from '@/i18n';
import { sfx } from '@/audio/sfx';
import { Badge, Button, Emblem, Icon, IconButton, Spinner, Tabs, TextField } from '@/ui/components';
import { Backdrop } from './shell/Backdrop';
import { Disclaimer, LangToggle, useToast } from './shell/ShellPage';
import {
  formatCountdown,
  generateIdentity,
  isLegacyLogin,
  isValidPin1,
  verificationCode,
  VERSION,
  type GeneratedIdentity,
} from './shell/helpers';
import './shell/shell.css';
import './shell/login.css';

type Method = 'idcard' | 'mobiilid' | 'smartid' | 'legacy';

export function LoginScreen() {
  const t = useT();
  const login = useGame((s) => s.login);
  const [seed, setSeed] = useState(() => (Date.now() ^ 0x2024) >>> 0);
  const [id, setId] = useState<GeneratedIdentity>(() => generateIdentity(seed));
  const [name, setName] = useState(() => `${id.firstName} ${id.lastName}`);
  const [method, setMethod] = useState<Method>('idcard');
  const [success, setSuccess] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const toast = useToast(3000);

  const shuffle = () => {
    const s = (seed * 1664525 + 1013904223) >>> 0;
    const n = generateIdentity(s);
    setSeed(s);
    setId(n);
    setName(`${n.firstName} ${n.lastName}`);
  };

  const finalName = () => name.trim() || `${id.firstName} ${id.lastName}`;

  const complete = (m: LoginUser['method'], idcode?: string) => {
    const user: LoginUser = { name: finalName(), method: m, idcode };
    setSuccess(user.name);
    sfx.unlock();
    sfx.play('login');
    setTimeout(() => login(user), 850);
  };

  const legacyLogin = () => {
    try {
      localStorage.setItem('epd:legacyLogin', '1');
    } catch {
      /* storage blocked */
    }
    sfx.unlock();
    sfx.play('login');
    toast.show(t('shell.login.legacy.welcome'), 'gold', 'star');
    setLeaving(true); // 2024: the login box faded out for one second
    setTimeout(() => login({ name: finalName(), method: 'legacy' }), 1100);
  };

  const guest = () => {
    sfx.unlock();
    login({ name: name.trim() || t('shell.login.guestName'), method: 'guest' });
  };

  return (
    <div className={`sh-screen sh-login${leaving ? ' is-leaving' : ''}`}>
      <Backdrop variant="radar" />
      {toast.node}
      <div className="sh-login__top">
        <LangToggle />
      </div>
      <div className="sh-login__wrap">
        <section className="sh-login__brand">
          <Emblem size={96} />
          <div className="sh-login__word">EPD</div>
          <div className="sh-login__name">{t('shell.login.brand.tag')}</div>
          <div className="sh-login__tag">{t('shell.login.brand.sub')}</div>
          <ul className="sh-login__facts">
            <li>
              <Icon name="map" size={16} /> {t('shell.login.fact.map')}
            </li>
            <li>
              <Icon name="radio" size={16} /> {t('shell.login.fact.radio')}
            </li>
            <li>
              <Icon name="fingerprint" size={16} /> {t('shell.login.fact.registry')}
            </li>
          </ul>
          <div className="sh-login__ver mono">v{VERSION}</div>
        </section>

        <section className="sh-login__card sh-card" aria-labelledby="sh-login-title">
          {success ? (
            <div className="sh-login__success" role="status">
              <div className="sh-login__check">
                <Icon name="check" size={40} />
              </div>
              <div className="sh-login__successTitle">{t('shell.login.success')}</div>
              <div className="sh-muted">{t('shell.login.welcome', { name: success })}</div>
            </div>
          ) : (
            <>
              <header className="sh-login__head">
                <h1 id="sh-login-title">{t('shell.login.title')}</h1>
                <Badge tone="ok" icon="lock">
                  {t('shell.login.secure')}
                </Badge>
              </header>
              <TextField
                label={t('shell.login.name')}
                icon="user"
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
                    className="sh-login__shuffle"
                  />
                }
              />
              <Tabs<Method>
                className="sh-login__tabs"
                value={method}
                onChange={setMethod}
                tabs={[
                  { id: 'idcard', label: t('shell.login.tab.idcard'), icon: 'id' },
                  { id: 'mobiilid', label: t('shell.login.tab.mobiilid'), icon: 'phone' },
                  { id: 'smartid', label: t('shell.login.tab.smartid'), icon: 'shield' },
                  { id: 'legacy', label: t('shell.login.tab.legacy'), icon: 'keyboard' },
                ]}
              />
              <div className="sh-login__body" role="tabpanel">
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
                {method === 'legacy' && <LegacyForm onLegacy={legacyLogin} />}
              </div>
              <div className="sh-login__alt">
                <span className="sh-dim">{t('shell.login.or')}</span>
                <Button variant="ghost" icon="user" onClick={guest}>
                  {t('shell.login.guest')}
                </Button>
              </div>
              <p className="sh-login__sim">{t('shell.login.simNote')}</p>
            </>
          )}
        </section>
      </div>
      <Disclaimer className="sh-login__disc" />
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

  return (
    <div className="sh-id">
      <div className={`sh-id__reader is-${phase}`} aria-hidden="true">
        <div className="sh-id__card">
          <div className="sh-id__chip" />
          <div className="sh-id__photo" />
          <div className="sh-id__lines">
            <i />
            <i />
            <i />
          </div>
          <div className="sh-id__flower">
            <Emblem size={22} />
          </div>
        </div>
        <div className="sh-id__slot">
          <span className="sh-id__led" />
          <span className="sh-id__brand mono">USB · CCID</span>
        </div>
      </div>

      {phase === 'insert' && (
        <div className="sh-id__step">
          <p>{t('shell.login.id.insert')}</p>
          <Button variant="primary" size="lg" icon="id" onClick={() => setPhase('reading')} block>
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
          <div className="sh-id__owner">
            <span className="sh-dim">{t('shell.login.id.owner')}</span>
            <strong>{name.toUpperCase()}</strong>
            <span className="mono sh-muted">{identity.idcode}</span>
          </div>
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
              <Button
                type="submit"
                variant="primary"
                size="lg"
                icon="lock"
                disabled={!isValidPin1(pin)}
                block
              >
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
            icon="phone"
            value={phone}
            onChange={setPhone}
            inputMode="tel"
            autoComplete="off"
            mono
          />
        )}
        <TextField
          label={t('shell.login.idcode')}
          icon="id"
          value={idcode}
          onChange={setIdcode}
          inputMode="numeric"
          autoComplete="off"
          maxLength={11}
          mono
        />
        {kind === 'smartid' && <p className="sh-mid__note">{t('shell.login.sid.note')}</p>}
        <Button type="submit" variant="primary" size="lg" iconRight="chevron-right" block>
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
        <Button
          variant="ghost"
          icon="close"
          onClick={() => setPhase('form')}
          disabled={phase === 'confirmed'}
        >
          {t('shell.login.cancel')}
        </Button>
      </div>
      <div className={`sh-phone sh-phone--${kind}`} aria-hidden="true">
        <div className="sh-phone__notch" />
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

// ── Classic 2024 login ──────────────────────────────────────────────────────

function LegacyForm({ onLegacy }: { onLegacy: () => void }) {
  const t = useT();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(0);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (isLegacyLogin(user, pass)) {
      setError(false);
      onLegacy();
    } else {
      setError(true);
      setShake((n) => n + 1);
      sfx.play('error');
    }
  };
  return (
    <form className="sh-legacy" onSubmit={submit}>
      <div className={`sh-legacy__box${shake ? ' is-shake' : ''}`} key={shake}>
        <h2>{t('shell.login.legacy.title')}</h2>
        <input
          className="sh-legacy__input"
          placeholder={t('shell.login.legacy.user')}
          aria-label={t('shell.login.legacy.user')}
          value={user}
          onChange={(e) => setUser(e.target.value)}
          autoComplete="off"
        />
        <input
          className="sh-legacy__input"
          type="password"
          placeholder={t('shell.login.legacy.pass')}
          aria-label={t('shell.login.legacy.pass')}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="sh-legacy__btn">
          {t('shell.login.legacy.submit')}
        </button>
        {error && (
          <p className="sh-legacy__err" role="alert">
            {t('shell.login.legacy.wrong')}
          </p>
        )}
      </div>
      <p className="sh-legacy__note">{t('shell.login.legacy.note')}</p>
    </form>
  );
}
