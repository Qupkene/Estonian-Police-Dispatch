// 112 transfer from Häirekeskus — docked overlay card (mount inside the map area, which must be position: relative).
// Owned by ui-tools. Reads everything from the stores.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ActiveCall, Agency, CallerMood, CallQuestionId, Incident, Priority, SimState } from '@/sim/types';
import { answerCall, askCall, endCall, toggleInterpreter } from '@/sim/commands';
import { useSettings } from '@/store/settings';
import { useT, useTx } from '@/i18n';
import { Badge, Button, Icon, IconButton, Meter, PriorityChip, Toggle, type IconName } from '@/ui/components';
import { AGENCIES, FACTS, MOOD_LEVEL, mmss, PRIORITIES, QUESTION_ORDER, SPEAKER_LANG, typedChars } from './lib/helpers';
import { run, useSim } from './lib/engine';
import './tools.css';

const RING_LIMIT_MS = 45_000;

const MOOD_ICON: Record<CallerMood, IconName> = {
  panic: 'alert',
  calm: 'check',
  drunk: 'warning',
  angry: 'fire',
  child: 'user',
  elderly: 'user',
  whisper: 'mute',
  confused: 'info',
  prank: 'eye',
};
const MOOD_TONE: Record<CallerMood, 'danger' | 'warn' | 'info' | 'neutral' | 'accent'> = {
  panic: 'danger',
  angry: 'danger',
  drunk: 'warn',
  prank: 'warn',
  confused: 'warn',
  whisper: 'accent',
  child: 'info',
  elderly: 'info',
  calm: 'neutral',
};

export function CallTaker() {
  const sim = useSim();
  if (!sim) return null;
  const active = sim.calls.filter((c) => !c.endedAt);
  const call = active[0];
  if (!call) return null;
  return <CallCard key={call.id} sim={sim} call={call} waiting={active.length - 1} />;
}

function CallCard({ sim, call, waiting }: { sim: SimState; call: ActiveCall; waiting: number }) {
  const t = useT();
  const tx = useTx();
  const inc: Incident | undefined = sim.incidents[call.incidentId];
  const phone = inc?.caller?.phone ?? '+372 •••• ••••';
  const rootRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [prio, setPrio] = useState<Priority | null>(null);
  const [agency, setAgency] = useState<Agency>('kiirabi');

  const ringing = !call.answeredAt;

  // Put keyboard focus on "Vasta" so Enter answers — but never steal focus from a text field.
  useEffect(() => {
    if (!ringing) return;
    const ae = document.activeElement as HTMLElement | null;
    const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable);
    if (!typing) rootRef.current?.querySelector<HTMLButtonElement>('.tl-call__answer')?.focus({ preventScroll: true });
  }, [ringing]);

  if (ringing) {
    const elapsed = sim.now - call.ringingSince;
    return (
      <div
        ref={rootRef}
        className="tl-call is-ringing"
        role="alertdialog"
        aria-label={t('tools.call.ringing')}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) run((s) => answerCall(s, call.id));
        }}
      >
        <div className="tl-call__ring">
          <span className="tl-call__phone" aria-hidden="true">
            <Icon name="phone" size={26} />
          </span>
          <div className="tl-call__ringtext">
            <div className="tl-call__eyebrow">{t('tools.call.ringing')}</div>
            <div className="tl-call__title">{t('tools.call.connecting')}</div>
            <div className="tl-call__meta">
              <span className="mono">{phone}</span>
              <span className="dim">·</span>
              <Icon name="globe" size={13} />
              {tx(SPEAKER_LANG[call.lang])}
              {waiting > 0 && <Badge tone="warn">{t('tools.call.more', { n: waiting })}</Badge>}
            </div>
          </div>
          <div className="tl-call__ringtimer">
            <span className="mono">{t('tools.call.ringFor', { t: mmss(elapsed) })}</span>
            <Meter value={elapsed / RING_LIMIT_MS} tone={elapsed > RING_LIMIT_MS * 0.66 ? 'danger' : 'warn'} size="sm" label={t('tools.call.hkTakesOver')} />
          </div>
          <Button className="tl-call__answer" variant="success" size="lg" icon="phone" kbd="Enter" onClick={() => run((s) => answerCall(s, call.id))}>
            {t('tools.call.answer')}
          </Button>
        </div>
      </div>
    );
  }

  const learned = new Set(call.learned);
  const asked = new Set(call.asked);
  const foreign = call.lang !== 'et';
  const knowsWhat = learned.has('what');
  const knowsWhere = learned.has('where');

  return (
    <div ref={rootRef} className={`tl-call${collapsed ? ' is-collapsed' : ''}`} role="dialog" aria-label={t('tools.call.inCall')}>
      <header className="tl-call__head">
        <span className="tl-call__live">
          <span className="tl-call__rec" aria-hidden="true" />
          {t('tools.call.inCall')}
        </span>
        <span className="mono tl-call__num">{phone}</span>
        <Badge tone={MOOD_TONE[call.mood]} icon={MOOD_ICON[call.mood]}>
          {t(`tools.call.mood.${call.mood}`)}
        </Badge>
        <Waveform level={MOOD_LEVEL[call.mood]} />
        <span className="tl-call__timer mono" title={t('tools.call.inCall')}>
          <Icon name="timer" size={13} /> {mmss(sim.now - (call.answeredAt ?? sim.now))}
        </span>
        {foreign && (
          <span className="tl-call__interp" title={t('tools.call.interpreterHint')}>
            <Toggle checked={!!call.interpreter} onChange={() => run((s) => toggleInterpreter(s, call.id))} label={`${t('tools.call.interpreter')} · ${call.lang.toUpperCase()}`} />
          </span>
        )}
        {waiting > 0 && <Badge tone="warn">{t('tools.call.more', { n: waiting })}</Badge>}
        <IconButton
          size="sm"
          icon={collapsed ? 'chevron-left' : 'chevron-down'}
          label={collapsed ? t('tools.call.expand') : t('tools.call.minimize')}
          onClick={() => setCollapsed((c) => !c)}
        />
      </header>

      {!collapsed && (
        <>
          <div className="tl-call__grid">
            <Conversation sim={sim} call={call} />
            <div className="tl-call__side">
              <div className="tl-call__loc">
                <Icon name="pin" size={13} />
                <span className="tl-call__lock">{t('tools.call.location')}:</span>
                <span>{inc ? (knowsWhere ? inc.location.address : `${inc.location.city} · ${t('tools.call.locationHidden')}`) : '—'}</span>
              </div>
              <div className="tl-call__label">{t('tools.call.questions')}</div>
              <div className="tl-call__qs">
                {QUESTION_ORDER.map((q) => (
                  <button key={q} type="button" className={`tl-q${asked.has(q) ? ' is-asked' : ''}`} disabled={asked.has(q)} onClick={() => run((s) => askCall(s, call.id, q))}>
                    {asked.has(q) && <Icon name="check" size={12} />}
                    {t(`tools.call.q.${q}`)}
                  </button>
                ))}
              </div>
              <div className="tl-call__label">{t('tools.call.facts')}</div>
              <ul className="tl-facts" role="list">
                {FACTS.map((f: CallQuestionId) => (
                  <li key={f} className={learned.has(f) ? 'is-known' : undefined}>
                    <Icon name={learned.has(f) ? 'check' : 'minus'} size={12} />
                    {t(`tools.call.fact.${f}`)}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <footer className="tl-call__decide">
            <div className="tl-call__type">
              <span className="tl-call__label">{t('tools.call.eventType')}</span>
              {knowsWhat && inc ? (
                <span className="tl-call__typename">
                  <span className="mono tl-call__code">{inc.code}</span> {tx(inc.title)}
                </span>
              ) : (
                <span className="tl-call__typename is-unknown">{t('tools.call.eventUnknown')}</span>
              )}
            </div>
            <div className="tl-call__prio">
              <span className="tl-call__label">{t('tools.call.priority')}</span>
              <div className="tl-call__prios" role="radiogroup" aria-label={t('tools.call.priority')}>
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={prio === p}
                    className={`tl-prio-btn tl-prio-btn--${p}${prio === p ? ' is-on' : ''}`}
                    onClick={() => setPrio(p)}
                  >
                    <PriorityChip p={p} />
                  </button>
                ))}
              </div>
              <span className="tl-call__guide">{prio ? t(`tools.call.prio.${prio}`) : t('tools.call.pickPriority')}</span>
            </div>
            <div className="tl-call__actions">
              <Button variant="primary" icon="check" disabled={!prio} onClick={() => prio && run((s) => endCall(s, call.id, { action: 'create', priority: prio }))}>
                {t('tools.call.create')}
              </Button>
              <span className="tl-call__refer">
                <select value={agency} onChange={(e) => setAgency(e.target.value as Agency)} aria-label={t('tools.call.agency')}>
                  {AGENCIES.map((a) => (
                    <option key={a} value={a}>
                      {t(`tools.agency.${a}`)}
                    </option>
                  ))}
                </select>
                <Button icon="send" onClick={() => run((s) => endCall(s, call.id, { action: 'refer', agency }))}>
                  {t('tools.call.refer')}
                </Button>
              </span>
              <Button icon="phone" onClick={() => run((s) => endCall(s, call.id, { action: 'advice' }))}>
                {t('tools.call.advice')}
              </Button>
              <Button variant="ghost" icon="phone-off" className="tl-call__prank" onClick={() => run((s) => endCall(s, call.id, { action: 'prank' }))}>
                {t('tools.call.prank')}
              </Button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

// ── conversation ─────────────────────────────────────────────────────────────

/** When each line first became visible (real ms) — survives re-mounts so the typewriter never restarts. */
const firstSeen = new Map<string, number>();

function Conversation({ sim, call }: { sim: SimState; call: ActiveCall }) {
  const t = useT();
  const tx = useTx();
  const reduced = useSettings((s) => s.reducedMotion);
  const ref = useRef<HTMLDivElement>(null);
  const visible = call.lines.filter((l) => l.t <= sim.now);
  const speaking = call.lines.some((l) => l.t > sim.now && l.who === 'caller');
  const [, force] = useState(0);

  // Drive the typewriter with rAF while any visible caller line is still typing.
  const now = performance.now();
  let typing = false;
  visible.forEach((l, i) => {
    const k = `${call.id}:${i}`;
    if (!firstSeen.has(k)) firstSeen.set(k, l.who === 'caller' && !reduced ? now : 0);
  });
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      force((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const stop = setTimeout(() => cancelAnimationFrame(raf), 6000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(stop);
    };
  }, [visible.length]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  return (
    <div className="tl-call__chat" ref={ref} aria-live="polite">
      {visible.map((l, i) => {
        const k = `${call.id}:${i}`;
        const start = firstSeen.get(k) ?? 0;
        const primary = l.ru ?? tx(l.text);
        const shown = start ? typedChars(primary.length, now - start) : primary.length;
        if (shown < primary.length) typing = true;
        const done = shown >= primary.length;
        if (l.who === 'system') {
          return (
            <div key={k} className="tl-bubble tl-bubble--system">
              {tx(l.text)}
            </div>
          );
        }
        const mine = l.who === 'dispatcher';
        // The engine stores the Russian original in `ru`; `text` holds the translation once an interpreter has worked on it.
        const hasTr = !!l.ru && tx(l.text) !== l.ru;
        return (
          <div key={k} className={`tl-bubble ${mine ? 'tl-bubble--me' : 'tl-bubble--caller'}`}>
            <div className="tl-bubble__who">{mine ? t('tools.call.you') : t('tools.call.callerLabel')}</div>
            <div className="tl-bubble__text" lang={l.ru ? 'ru' : undefined}>
              {primary.slice(0, shown)}
              {!done && <span className="tl-caret" aria-hidden="true" />}
            </div>
            {l.ru && done && (
              <div className={`tl-bubble__tr${hasTr ? '' : ' is-missing'}`}>
                <Icon name="globe" size={11} />
                {hasTr ? tx(l.text) : t('tools.call.noTranslation')}
              </div>
            )}
          </div>
        );
      })}
      {(speaking || typing) && (
        <div className="tl-typing" aria-label={t('tools.call.typing')}>
          <span />
          <span />
          <span />
          <em>{t('tools.call.typing')}</em>
        </div>
      )}
    </div>
  );
}

// ── background noise waveform ────────────────────────────────────────────────

const BARS = Array.from({ length: 22 }, (_, i) => ({
  d: 0.45 + ((i * 37) % 11) / 18,
  delay: -((i * 53) % 17) / 17,
  h: 0.35 + ((i * 29) % 13) / 20,
}));

function Waveform({ level }: { level: number }) {
  return (
    <span className="tl-wave" aria-hidden="true" style={{ ['--amp' as string]: String(0.25 + level * 0.75) }}>
      {BARS.map((b, i) => (
        <i key={i} style={{ animationDuration: `${b.d}s`, animationDelay: `${b.delay}s`, ['--h' as string]: String(b.h) }} />
      ))}
    </span>
  );
}
