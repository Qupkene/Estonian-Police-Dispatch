// Suurõnnetus in the CAD (docs/CRISIS.md, 2.37.0): the bar over the map, the briefing when it breaks out, the staff
// panel (the right panel's "Staap" tab), and the note on a crisis task's queue card and incident. Styles in game.css.
import { useEffect, useRef, useState } from 'react';
import { shiftKeyOf, useGame } from '@/store/game';
import { deskOfTarget, useCoop } from '@/store/coop';
import { useT, useTx } from '@/i18n';
import { crisisById } from '@/data/crises';
import {
  crisisTaskOf,
  fill,
  HELP_AFTER_MIN,
  taskSpec,
  type CrisisDecision,
  type CrisisScenario,
  type CrisisState,
  type CrisisTaskState,
} from '@/sim/crisis';
import { sectorById } from '@/sim/sectors';
import { hhmm, MIN } from '@/sim/time';
import type { Incident, SimState } from '@/sim/types';
import { Button, Icon, Modal } from '@/ui/components';
import { crisisArt } from './crisis/art';
import { crisisDecide, crisisLead, selectIncident } from './actions';
import { countdown } from './format';
import { Section, useSim } from './bits';

/** The crisis once it broke out (never the one still scheduled: nobody may know it is coming). */
export function crisisOn(sim: SimState | null | undefined): CrisisState | undefined {
  const c = sim?.crisis;
  return c && c.phase !== 'due' && crisisById(c.id) ? c : undefined;
}

type TaskStatus = 'later' | 'waiting' | 'escalated' | 'enroute' | 'onscene' | 'done' | 'helped';

function taskStatus(sim: SimState, task: CrisisTaskState): { status: TaskStatus; inc?: Incident } {
  const inc = task.incidentId ? sim.incidents[task.incidentId] : undefined;
  if (!inc) return { status: 'later' };
  if (inc.state === 'closed') return { status: task.helped ? 'helped' : 'done', inc };
  if (inc.firstDispatchAt === undefined) return { status: task.escalated ? 'escalated' : 'waiting', inc };
  return { status: inc.firstArrivalAt === undefined ? 'enroute' : 'onscene', inc };
}

/** The decision the staff asks now (asked, not taken), if any. */
function openDecision(c: CrisisState, sc: CrisisScenario): CrisisDecision | undefined {
  return sc.decisions.find((d) => c.asked[d.id] !== undefined && c.decisions[d.id] === undefined);
}

/** May this player decide: the commander (single player always). */
function useCommands(c: CrisisState | undefined): boolean {
  const seat = useCoop((s) => s.seat);
  const coop = useGame((s) => !!s.sim?.coop);
  if (!c) return false;
  return coop ? c.lead === seat : true;
}

// ── The bar over the map ─────────────────────────────────────────────────────

export function CrisisBar() {
  const t = useT();
  const tx = useTx();
  const sim = useSim();
  const c = crisisOn(sim);
  if (!sim || !c || c.phase !== 'on') return null;
  const sc = crisisById(c.id)!;
  const done = c.tasks.filter((x) => taskStatus(sim, x).status === 'done' || x.helped).length;
  const waiting = c.tasks.filter((x) => {
    const st = taskStatus(sim, x).status;
    return st === 'waiting' || st === 'escalated';
  }).length;
  const asks = !!openDecision(c, sc);
  return (
    <button
      type="button"
      className={`gm-crisisbar gm-crisisbar--l${c.level}${asks ? ' has-decision' : ''}`}
      onClick={() => useGame.getState().setRightTab('crisis')}
      title={t('game.crisis.barTitle')}
      data-testid="crisis-bar"
    >
      <Icon name="alert" size={14} />
      <strong className="gm-crisisbar__kicker">{t('game.crisis.kicker')}</strong>
      <span className="gm-crisisbar__title">{tx(sc.title)}</span>
      <span className="gm-crisisbar__level">{t(`game.crisis.level.${c.level}`)}</span>
      <span className="gm-crisisbar__tasks mono">
        {t('game.crisis.barTasks', { done, all: c.tasks.length })}
        {waiting > 0 && <em> · {t('game.crisis.barWaiting', { n: waiting })}</em>}
      </span>
      {asks && <span className="gm-crisisbar__ask">{t('game.crisis.barDecision')}</span>}
    </button>
  );
}

// ── The briefing when it breaks out ──────────────────────────────────────────

/** Crises whose briefing was shown (shift and outbreak time): once each, also after the CAD screen mounts again. */
const briefed = new Set<string>();

/**
 * Opens when a crisis is on and its briefing was not shown yet: at the outbreak, and on a shift resumed or joined while
 * one runs. In single player the shift waits while the player reads it.
 */
export function CrisisBrief() {
  const t = useT();
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const pausedHere = useRef(false);
  const sim = useGame((s) => s.sim);
  const key = useGame((s) => {
    const c = crisisOn(s.sim);
    return s.sim && c?.phase === 'on' && c.at !== undefined ? `${shiftKeyOf(s.sim)}:${c.at}` : '';
  });
  const c = crisisOn(sim);
  const commands = useCommands(c);
  const coop = !!sim?.coop;

  useEffect(() => {
    if (!key || briefed.has(key)) return;
    briefed.add(key);
    setOpen(true);
    const g = useGame.getState();
    // A co-op shift goes on for the others: the briefing never pauses it.
    if (!g.sim?.coop && g.speedIndex > 0) {
      g.togglePause();
      pausedHere.current = true;
    }
  }, [key]);

  const close = (toStaff: boolean) => {
    setOpen(false);
    const g = useGame.getState();
    if (pausedHere.current) {
      pausedHere.current = false;
      if (g.sim && g.speedIndex === 0) g.togglePause();
    }
    if (toStaff) g.setRightTab('crisis');
  };

  if (!open || !sim || !c) return null;
  const sc = crisisById(c.id)!;
  const art = crisisArt(sc.id);
  const first = sc.tasks.filter((x) => !x.atMin);
  const later = sc.tasks.filter((x) => x.atMin);
  return (
    <Modal
      open
      onClose={() => close(true)}
      title={t('game.crisis.briefTitle')}
      icon="alert"
      tone="danger"
      width={720}
      footer={
        <>
          {coop && c.lead < 0 && (
            <Button icon="shield" onClick={() => crisisLead()}>
              {t('game.crisis.take')}
            </Button>
          )}
          <Button variant="primary" icon="list" onClick={() => close(true)} data-testid="crisis-brief-go">
            {t('game.crisis.toStaff')}
          </Button>
        </>
      }
    >
      <div className="gm-cbrief" data-testid="crisis-brief">
        <CrisisPicture sc={sc} src={art} />
        <h3 className="gm-cbrief__title">{tx(sc.title)}</h3>
        <p className="gm-cbrief__addr">
          <Icon name="pin" size={13} />
          <span>
            {c.address}
            {c.placeName && c.placeName !== c.address ? ` · ${c.placeName}` : ''}
          </span>
          <span className="mono">{c.at !== undefined ? hhmm(c.at) : ''}</span>
        </p>
        <p className="gm-cbrief__text">{tx(fill(sc.briefing, c))}</p>
        <div className="gm-cbrief__tasks">
          <h4>{t('game.crisis.briefNow')}</h4>
          <ul>
            {first.map((x) => (
              <li key={x.id}>
                <strong>{tx(x.name)}</strong>
                <span className="mono">{t('game.crisis.briefDeadline', { n: x.deadlineMin })}</span>
              </li>
            ))}
          </ul>
          {later.length > 0 && (
            <>
              <h4>{t('game.crisis.briefLater')}</h4>
              <ul>
                {later.map((x) => (
                  <li key={x.id}>
                    <strong>{tx(x.name)}</strong>
                    <span className="mono">{t('game.crisis.briefAt', { n: x.atMin ?? 0 })}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <p className="gm-cbrief__how">
          {t(coop ? (commands ? 'game.crisis.howLead' : 'game.crisis.howCoop') : 'game.crisis.how')}
        </p>
      </div>
    </Modal>
  );
}

/** The owner's drawing, or a text card for a scenario not drawn yet. */
function CrisisPicture({ sc, src, small }: { sc: CrisisScenario; src?: string; small?: boolean }) {
  const tx = useTx();
  if (src) return <img className={`gm-cpic${small ? ' gm-cpic--sm' : ''}`} src={src} alt={tx(sc.title)} />;
  return (
    <div className={`gm-cpic gm-cpic--card${small ? ' gm-cpic--sm' : ''}`} role="img" aria-label={tx(sc.title)}>
      <Icon name="alert" size={small ? 22 : 40} />
      <span>{tx(sc.title)}</span>
    </div>
  );
}

// ── The staff panel ("Staap") ────────────────────────────────────────────────

export function CrisisPanel() {
  const t = useT();
  const tx = useTx();
  const sim = useSim();
  const c = crisisOn(sim);
  const commands = useCommands(c);
  if (!sim || !c) return null;
  const sc = crisisById(c.id)!;
  const over = c.phase === 'over';
  const asked = sc.decisions.filter((d) => c.asked[d.id] !== undefined);
  return (
    <div className={`gm-crisis gm-crisis--l${c.level}${over ? ' is-over' : ''}`} data-testid="crisis-panel">
      <header className="gm-crisis__head">
        <CrisisPicture sc={sc} src={crisisArt(sc.id, true)} small />
        <div className="gm-crisis__headText">
          <span className="gm-crisis__kicker mono">
            {t('game.crisis.kicker')} · {c.at !== undefined ? hhmm(c.at) : ''}
          </span>
          <h2>{tx(sc.title)}</h2>
          <p>
            <Icon name="pin" size={12} /> {c.address}
          </p>
        </div>
      </header>

      <LevelMeter level={c.level} over={over} />
      {over ? <CrisisResult c={c} /> : <CommandLine c={c} />}

      {asked.length > 0 && (
        <Section title={t('game.crisis.decisions')} icon="list">
          <div className="gm-cdecs">
            {asked.map((d) => (
              <DecisionCard key={d.id} sim={sim} c={c} d={d} canDecide={commands && !over} />
            ))}
          </div>
        </Section>
      )}

      <Section title={t('game.crisis.tasks')} icon="flag">
        <ul className="gm-ctasks">
          {c.tasks.map((task) => (
            <TaskRow key={task.id} sim={sim} c={c} sc={sc} task={task} />
          ))}
        </ul>
        {!over && (
          <p className="gm-crisis__hint">
            {c.help ? t('game.crisis.helpOn', { n: HELP_AFTER_MIN }) : t('game.crisis.helpOff')}
            {sim.coop?.sec ? ` ${t('game.crisis.anyDesk')}` : ''}
          </p>
        )}
      </Section>
    </div>
  );
}

function LevelMeter({ level, over }: { level: number; over: boolean }) {
  const t = useT();
  return (
    <div className="gm-clevel" role="meter" aria-valuemin={0} aria-valuemax={3} aria-valuenow={level}>
      <span className="gm-clevel__k">{t(over ? 'game.crisis.levelMax' : 'game.crisis.level')}</span>
      <span className="gm-clevel__bars" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i <= level ? `is-on is-l${level}` : undefined} />
        ))}
      </span>
      <strong className={`gm-clevel__v is-l${level}`}>{t(`game.crisis.level.${level}`)}</strong>
    </div>
  );
}

/** Who commands: single player always the player; in co-op a player takes command, the host may take it over. */
function CommandLine({ c }: { c: CrisisState }) {
  const t = useT();
  const sim = useGame((s) => s.sim);
  const seat = useCoop((s) => s.seat);
  const sending = useCoop((s) => s.pending.some((p) => p.k === 'lead'));
  const coop = sim?.coop;
  if (!coop) {
    return (
      <p className="gm-clead">
        <Icon name="shield" size={13} /> {t('game.crisis.leadYou')}
      </p>
    );
  }
  const leader = coop.seats.find((x) => x.seat === c.lead);
  const mine = c.lead === seat;
  const host = coop.host === seat;
  return (
    <div className={`gm-clead${c.lead < 0 ? ' is-empty' : ''}`} data-testid="crisis-lead">
      <Icon name="shield" size={13} />
      <span>
        {mine
          ? t('game.crisis.leadYou')
          : leader
            ? t('game.crisis.leadBy', { name: leader.name })
            : t('game.crisis.leadNobody')}
      </span>
      {!mine && (c.lead < 0 || host) && (
        <Button size="sm" variant={c.lead < 0 ? 'primary' : 'ghost'} disabled={sending} onClick={() => crisisLead()}>
          {t(c.lead < 0 ? 'game.crisis.take' : 'game.crisis.takeOver')}
        </Button>
      )}
    </div>
  );
}

function DecisionCard({
  sim,
  c,
  d,
  canDecide,
}: {
  sim: SimState;
  c: CrisisState;
  d: CrisisDecision;
  canDecide: boolean;
}) {
  const t = useT();
  const tx = useTx();
  const sending = useCoop((s) => s.pending.some((p) => p.k === 'cdec' && p.a[0] === d.id));
  const chosen = d.options.find((o) => o.id === c.decisions[d.id]);
  if (chosen) {
    return (
      <div className="gm-cdec is-done">
        <div className="gm-cdec__q">
          <span>{tx(d.title)}</span>
          <strong>{tx(chosen.label)}</strong>
          {c.defaulted?.[d.id] && <em>{t('game.crisis.byStaff')}</em>}
        </div>
        <p className="gm-cdec__effect">{tx(chosen.effect)}</p>
      </div>
    );
  }
  const until = c.asked[d.id] ?? sim.now;
  const fallback = d.options.find((o) => o.id === d.defaultOption);
  return (
    <div className="gm-cdec is-open" data-testid={`crisis-decision-${d.id}`}>
      <div className="gm-cdec__q">
        <span>{tx(d.title)}</span>
        <strong>{tx(d.question)}</strong>
      </div>
      <div className="gm-cdec__opts">
        {d.options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`gm-cdec__opt${o.id === d.defaultOption ? ' is-default' : ''}`}
            disabled={!canDecide || sending}
            onClick={() => crisisDecide(d.id, o.id)}
            data-testid={`crisis-option-${d.id}-${o.id}`}
          >
            <strong>{tx(o.label)}</strong>
            <span>{tx(o.effect)}</span>
          </button>
        ))}
      </div>
      <p className="gm-cdec__timer mono">
        <Icon name="timer" size={11} />
        {t('game.crisis.defaultIn', {
          t: countdown((until - sim.now) / MIN),
          option: fallback ? tx(fallback.label) : '',
        })}
      </p>
      {!canDecide && <p className="gm-cdec__note">{t('game.crisis.onlyLead')}</p>}
    </div>
  );
}

function TaskRow({
  sim,
  c,
  sc,
  task,
}: {
  sim: SimState;
  c: CrisisState;
  sc: CrisisScenario;
  task: CrisisTaskState;
}) {
  const t = useT();
  const tx = useTx();
  const spec = taskSpec(sc, task.id);
  const { status, inc } = taskStatus(sim, task);
  const crews = inc ? inc.assigned.map((id) => sim.units[id]?.callsign).filter(Boolean) : [];
  const desk = inc && sim.coop?.sec ? deskOfTarget(sim, { incident: inc }) : '';
  const deskName = desk ? sectorById(desk)?.name : undefined;
  let line: string;
  switch (status) {
    case 'later':
      line = t('game.crisis.st.later', { t: hhmm(task.opensAt) });
      break;
    case 'waiting':
      line = t('game.crisis.st.waiting', { t: countdown((task.deadline - sim.now) / MIN) });
      break;
    case 'escalated':
      line = c.help
        ? t('game.crisis.st.escalatedHelp', { t: countdown((task.deadline + HELP_AFTER_MIN * MIN - sim.now) / MIN) })
        : t('game.crisis.st.escalated');
      break;
    case 'enroute':
      line = t('game.crisis.st.enroute', { crews: crews.join(', ') });
      break;
    case 'onscene':
      line = t('game.crisis.st.onscene', { crews: crews.join(', ') });
      break;
    case 'helped':
      line = t('game.crisis.st.helped');
      break;
    default:
      line =
        inc?.outcome !== undefined
          ? t('game.crisis.st.done', { n: Math.round(inc.outcome.score) })
          : t(`game.closedBy.${inc?.closedBy ?? 'units'}`);
  }
  const body = (
    <>
      <span className={`gm-ctask__dot is-${status}`} aria-hidden="true" />
      <span className="gm-ctask__main">
        <strong>{spec ? tx(spec.name) : task.id}</strong>
        <span className="gm-ctask__line">{line}</span>
      </span>
      {deskName && <span className="gm-ctask__desk">{tx(deskName)}</span>}
      {sc.followUps.some((f) => f.id === task.id) && (
        <span className="gm-ctask__follow" title={t('game.crisis.followTitle')}>
          <Icon name="warning" size={11} />
        </span>
      )}
    </>
  );
  return (
    <li className={`gm-ctask is-${status}`} data-testid={`crisis-task-${task.id}`}>
      {inc ? (
        <button type="button" className="gm-ctask__btn" onClick={() => selectIncident(inc.id, { focus: true })}>
          {body}
        </button>
      ) : (
        <div className="gm-ctask__btn">{body}</div>
      )}
    </li>
  );
}

function CrisisResult({ c }: { c: CrisisState }) {
  const t = useT();
  const result = c.result ?? 0;
  const tone = result >= 70 ? 'ok' : result >= 45 ? 'warn' : 'danger';
  const mins = c.endedAt !== undefined && c.at !== undefined ? Math.round((c.endedAt - c.at) / MIN) : null;
  return (
    <div className={`gm-cres gm-cres--${tone}`} data-testid="crisis-result">
      <div className="gm-cres__score">
        <span>{t('game.crisis.result')}</span>
        <strong className="mono">{result}</strong>
        <small>/100</small>
      </div>
      <dl className="gm-cres__facts">
        {c.endedAt !== undefined && (
          <div>
            <dt>{t('game.crisis.endedAt')}</dt>
            <dd className="mono">
              {hhmm(c.endedAt)}
              {mins !== null ? ` (${t('game.crisis.took', { n: mins })})` : ''}
            </dd>
          </div>
        )}
        <div>
          <dt>{t('game.crisis.helped')}</dt>
          <dd className="mono">{c.helped}</dd>
        </div>
      </dl>
    </div>
  );
}

// ── On a crisis task's card and incident ─────────────────────────────────────

/** A crisis task's mark on its queue card: the task, and the time left to send a crew before it escalates. */
export function CrisisTag({ sim, inc }: { sim: SimState; inc: Incident }) {
  const t = useT();
  const tx = useTx();
  const ct = crisisTaskOf(inc);
  const c = crisisOn(sim);
  const sc = ct ? crisisById(ct.scenario) : undefined;
  if (!ct || !sc) return null;
  const spec = taskSpec(sc, ct.task);
  const task = c?.tasks.find((x) => x.incidentId === inc.id);
  const waiting = !!task && inc.state !== 'closed' && inc.firstDispatchAt === undefined && !task.escalated;
  return (
    <span className="gm-ctag" title={tx(sc.title)}>
      <Icon name="alert" size={11} />
      <span className="gm-ctag__text">{spec ? tx(spec.name) : t('game.crisis.kicker')}</span>
      {waiting && <span className="gm-ctag__cd mono">{countdown((task.deadline - sim.now) / MIN)}</span>}
    </span>
  );
}

/** The note at the top of a crisis task's incident. */
export function CrisisNote({ sim, inc }: { sim: SimState; inc: Incident }) {
  const t = useT();
  const tx = useTx();
  const ct = crisisTaskOf(inc);
  const sc = ct ? crisisById(ct.scenario) : undefined;
  if (!ct || !sc || inc.state === 'closed') return null;
  const spec = taskSpec(sc, ct.task);
  const task = crisisOn(sim)?.tasks.find((x) => x.incidentId === inc.id);
  const waiting = !!task && inc.firstDispatchAt === undefined;
  return (
    <div className="gm-cnote" role="note">
      <Icon name="alert" size={16} />
      <p>
        <strong>{t('game.crisis.noteTask', { task: spec ? tx(spec.name) : ct.task, title: tx(sc.title) })}</strong>{' '}
        {waiting && task
          ? task.escalated
            ? t('game.crisis.noteEscalated')
            : t('game.crisis.noteDeadline', { t: countdown((task.deadline - sim.now) / MIN) })
          : ''}
        {sim.coop?.sec ? ` ${t('game.crisis.anyDesk')}` : ''}
      </p>
      <Button size="sm" variant="ghost" icon="list" onClick={() => useGame.getState().setRightTab('crisis')}>
        {t('game.crisis.tab')}
      </Button>
    </div>
  );
}
