// Sub-sections of the incident panel.
import { useState } from 'react';
import { useGame } from '@/store/game';
import { useLang, useT, useTx } from '@/i18n';
import { Badge, Button, Icon, Kbd, Meter, StatusChip, type IconName } from '@/ui/components';
import { describePerson, describeVehicle, ageOf } from '@/gen/describe';
import { personFlags, vehicleFlags, type RecordFlag } from '@/sim/registry';
import { hhmm, MIN } from '@/sim/time';
import type { Agency, Incident, IncidentTemplate, Person, ScoreBreakdown, SimState, TimelineEntry, Lang } from '@/sim/types';
import { usePending } from '@/store/coop';
import { checkRecord, dispatch, dispatchPicked, pursuitAction, recallUnit, requestAgency, selectUnit } from './actions';
import { assignedUnits, bestFor, isIdentified, selRecs, soft } from './data';
import { allMet, countdown, fmtKm, fmtNum, needCoverage, unitEtaMin } from './format';
import { FitBadge, LangFlag, Plate, Section, StatusDot, UnitTypeIcon, useMsg } from './bits';
import { AGENCIES } from './EventQueue';
import { MenuButton } from './Menu';
import { useGameUi } from './uiStore';

const AGENCY_ICON: Partial<Record<Agency, IconName>> = { kiirabi: 'ambulance', paaste: 'fire', merepaaste: 'boat', keskkonnaamet: 'globe', sotsiaal: 'users' };

function flagsOf(key: string, fn: () => RecordFlag[]): RecordFlag[] {
  return soft<RecordFlag[]>(key, fn, []);
}

export function personDescription(p: Person, now: number, lang: Lang): string {
  const d = soft('describePerson', () => describePerson(p, now), null);
  if (d) return d[lang] || d.et;
  const age = soft('ageOf', () => ageOf(p, now), 0);
  const who = lang === 'et' ? (p.gender === 'M' ? 'mees' : 'naine') : p.gender === 'M' ? 'man' : 'woman';
  const ageTxt = age ? (lang === 'et' ? `, u ${Math.round(age / 5) * 5}a` : `, ~${Math.round(age / 5) * 5}`) : '';
  const clothes = p.appearance?.clothing ? `, ${p.appearance.clothing[lang] || p.appearance.clothing.et}` : '';
  return `${who}${ageTxt}${clothes}`;
}

function FlagList({ flags }: { flags: RecordFlag[] }) {
  const tx = useTx();
  if (!flags.length) return null;
  return (
    <div className="gm-flags">
      {flags.map((f) => (
        <Badge key={f.id} tone={f.severity === 'danger' ? 'danger' : f.severity === 'warn' ? 'warn' : 'info'}>
          {tx(f.text)}
        </Badge>
      ))}
    </div>
  );
}

// ── Caller / persons / vehicles ──────────────────────────────────────────────

export function CallerBlock({ inc }: { inc: Incident }) {
  const t = useT();
  if (!inc.caller) return null;
  const c = inc.caller;
  return (
    <div className="gm-caller">
      <Icon name="phone" size={13} />
      <span className="gm-caller__name">{c.name}</span>
      <span className="gm-caller__phone mono">{c.phone}</span>
      <LangFlag lang={c.lang} />
      <span className="sr-only">{t('game.inc.callerLang', { l: t(`game.spk.${c.lang}`) })}</span>
    </div>
  );
}

export function PersonsBlock({ sim, inc, tpl }: { sim: SimState; inc: Incident; tpl: IncidentTemplate | undefined }) {
  const t = useT();
  const lang = useLang();
  const tx = useTx();
  const refs = inc.persons.filter((r) => sim.persons[r.personId]);
  if (!refs.length && !inc.vehicles.length) return null;
  return (
    <Section title={`${t('game.inc.persons')} · ${t('game.inc.vehicles')}`} icon="users">
      <div className="gm-people">
        {refs.map((ref) => {
          const p = sim.persons[ref.personId];
          const known = isIdentified(sim, inc, ref, tpl);
          const flags = ref.checked ? flagsOf('personFlags', () => personFlags(p, sim.now)) : [];
          return (
            <div key={ref.personId + ref.role} className={`gm-person${ref.checked ? ' is-checked' : ''}`}>
              <span className={`gm-role gm-role--${ref.role}`}>{t(`game.role.${ref.role}`)}</span>
              <div className="gm-person__who">
                {known ? (
                  <>
                    <span className="gm-person__name">
                      {p.firstName} {p.lastName}
                    </span>
                    <span className="gm-person__id mono">{p.idcode}</span>
                  </>
                ) : (
                  <>
                    <span className="gm-person__name is-unknown">{t('game.inc.unknownPerson')}</span>
                    <span className="gm-person__desc">{personDescription(p, sim.now, lang)}</span>
                  </>
                )}
                <FlagList flags={flags} />
              </div>
              <Button
                size="sm"
                variant={ref.checked ? 'ghost' : 'secondary'}
                icon={ref.checked ? 'check' : 'search'}
                disabled={!known}
                title={known ? p.idcode : t('game.inc.unidentified')}
                onClick={() => checkRecord({ kind: 'person', q: p.idcode, personId: p.id, incidentId: inc.id })}
              >
                {ref.checked ? t('game.inc.checked') : t('game.inc.check')}
              </Button>
            </div>
          );
        })}
        {inc.vehicles.map((v) => {
          const rec = sim.vehicles[v.plate];
          const desc = rec ? soft('describeVehicle', () => tx(describeVehicle(rec)), `${tx(rec.color)} ${rec.make} ${rec.model}`) : '';
          const flags = v.checked && rec ? flagsOf('vehicleFlags', () => vehicleFlags(rec, sim.now)) : [];
          return (
            <div key={v.plate} className={`gm-person gm-vehicle${v.checked ? ' is-checked' : ''}`}>
              <span className="gm-role gm-role--vehicle">{t(`game.vrole.${v.role}`)}</span>
              <div className="gm-person__who">
                <Plate plate={v.plate} />
                {desc && <span className="gm-person__desc">{desc.replace(`(${v.plate})`, '').trim()}</span>}
                <FlagList flags={flags} />
              </div>
              <Button
                size="sm"
                variant={v.checked ? 'ghost' : 'secondary'}
                icon={v.checked ? 'check' : 'search'}
                onClick={() => checkRecord({ kind: 'vehicle', q: v.plate, plate: v.plate, incidentId: inc.id })}
              >
                {v.checked ? t('game.inc.checked') : t('game.inc.check')}
              </Button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── Needs vs assigned ────────────────────────────────────────────────────────

export function NeedsBlock({ sim, inc }: { sim: SimState; inc: Incident }) {
  const t = useT();
  const types = assignedUnits(sim, inc).map((u) => u.type);
  const need = needCoverage(inc.need, types);
  const ideal = needCoverage(inc.ideal, types);
  const needOk = allMet(need) || need.length === 0;
  const idealOk = allMet(ideal);
  return (
    <div className="gm-needs">
      <div className="gm-needs__row">
        <span className="gm-needs__k">{t('game.inc.needs')}</span>
        <div className="gm-needs__chips">
          {need.map((r, i) => (
            <span key={i} className={`gm-need${r.met ? ' is-met' : ''}`} title={t(`game.utype.${r.type}`)}>
              <UnitTypeIcon type={r.type} size={12} />
              <span>{t(`game.ushort.${r.type}`)}</span>
              <b className="mono">
                {r.have}/{r.count}
              </b>
              {r.met && <Icon name="check" size={11} />}
            </span>
          ))}
        </div>
        <span className={`gm-needs__state${needOk ? ' is-ok' : ''}`}>{needOk ? t('game.inc.needMet') : t('game.inc.needUnmet')}</span>
      </div>
      {ideal.length > 0 && (
        <div className="gm-needs__row">
          <span className="gm-needs__k">{t('game.inc.ideal')}</span>
          <div className="gm-needs__chips">
            {ideal.map((r, i) => (
              <span key={i} className={`gm-need gm-need--ideal${r.met ? ' is-met' : ''}`} title={t(`game.utype.${r.type}`)}>
                <UnitTypeIcon type={r.type} size={12} />
                <span>{t(`game.ushort.${r.type}`)}</span>
                <b className="mono">
                  {r.have}/{r.count}
                </b>
              </span>
            ))}
          </div>
          {idealOk && <span className="gm-needs__state is-ideal">{t('game.inc.idealMet')}</span>}
        </div>
      )}
    </div>
  );
}

// ── Recommended units ────────────────────────────────────────────────────────

export function RecommendBlock({ sim, inc }: { sim: SimState; inc: Incident }) {
  const t = useT();
  const lang = useLang();
  const msg = useMsg();
  const [all, setAll] = useState(false);
  const picks = useGameUi((s) => s.picks[inc.id]) ?? [];
  const togglePick = useGameUi((s) => s.togglePick);
  const error = useGameUi((s) => s.dispatchError[inc.id]);
  const recs = selRecs(sim, inc.id);
  const shown = all ? recs : recs.slice(0, 6);
  // Same rule as the D key: no automatic pick → plain "Saada", disabled until the player picks.
  const top = bestFor(recs);
  // Co-op: a send on its way to the room (2-3 s) is not sent twice.
  const sending = usePending('send', inc.id);

  return (
    <Section
      title={t('game.inc.recommended')}
      icon="target"
      actions={
        recs.length > 6 && (
          <button type="button" className="gm-linkbtn" onClick={() => setAll(!all)}>
            {all ? t('game.inc.showLess') : t('game.inc.showAll', { n: recs.length })}
          </button>
        )
      }
    >
      {recs.length === 0 ? (
        <div className="gm-muted-line">{t('game.inc.noRecs')}</div>
      ) : (
        <div className="gm-recs" role="listbox" aria-multiselectable="true">
          {shown.map((r) => {
            const u = r.unit;
            const picked = picks.includes(u.id);
            const disabled = r.fit === 'unreachable';
            const other = u.incidentId && u.incidentId !== inc.id ? sim.incidents[u.incidentId] : undefined;
            return (
              <div
                key={u.id}
                role="option"
                aria-selected={picked}
                aria-disabled={disabled}
                className={`gm-rec gm-rec--${r.fit}${picked ? ' is-picked' : ''}${top?.unit.id === u.id && !picks.length ? ' is-top' : ''}`}
                onClick={() => !disabled && togglePick(inc.id, u.id)}
                onDoubleClick={() => !disabled && dispatch(inc.id, [u.id])}
                title={r.reason ? msg(r.reason) : undefined}
              >
                <span className={`gm-check${picked ? ' is-on' : ''}`} aria-hidden="true">
                  {picked && <Icon name="check" size={10} />}
                </span>
                <span className="gm-rec__cs mono" title={u.callsign}>
                  <StatusDot status={u.status} />
                  <span>{u.callsign}</span>
                </span>
                <span className="gm-rec__type" title={t(`game.utype.${u.type}`)}>
                  <UnitTypeIcon type={u.type} size={12} />
                  {t(`game.ushort.${u.type}`)}
                </span>
                <span className="gm-rec__km mono">{fmtKm(r.km, lang)}</span>
                <span className="gm-rec__eta mono">{Number.isFinite(r.etaMin) ? `${fmtNum(r.etaMin, r.etaMin < 10 ? 1 : 0, lang)}′` : '-'}</span>
                <FitBadge fit={r.fit} />
                {(other || r.reason) && (
                  <span className="gm-rec__info">
                    {other ? (
                      <span className="gm-rec__divert">{t('game.inc.diverts', { c: `${other.code} P${other.priority}` })}</span>
                    ) : (
                      <span className="gm-rec__reason">{msg(r.reason)}</span>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="gm-recs__actions">
        <Button variant="primary" icon="send" disabled={(!picks.length && !top) || sending} onClick={() => dispatchPicked(inc.id)}>
          {sending ? t('coop.sending') : picks.length ? t('game.inc.sendN', { n: picks.length }) : top ? t('game.inc.sendTop', { c: top.unit.callsign }) : t('game.inc.send')}
          <Kbd>D</Kbd>
        </Button>
        {picks.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => useGameUi.getState().clearPicks(inc.id)}>
            {t('game.cancel')}
          </Button>
        )}
      </div>
      {error && (
        <div className="gm-error" role="alert">
          <Icon name="warning" size={13} />
          {msg(error)}
        </div>
      )}
    </Section>
  );
}

// ── Assigned units ───────────────────────────────────────────────────────────

export function AssignedBlock({ sim, inc, readOnly }: { sim: SimState; inc: Incident; readOnly?: boolean }) {
  const t = useT();
  const units = assignedUnits(sim, inc);
  return (
    <Section title={t('game.inc.assigned')} icon="car">
      {units.length === 0 ? (
        <div className="gm-muted-line">{t('game.inc.noAssigned')}</div>
      ) : (
        <div className="gm-assigned">
          {units.map((u) => {
            const eta = u.status === 'enroute' ? unitEtaMin(u, sim.now) : null;
            return (
              <div key={u.id} className={`gm-asg gm-asg--${u.status}`}>
                <button type="button" className="gm-asg__cs mono" onClick={() => selectUnit(u.id)}>
                  {u.callsign}
                </button>
                <span className="gm-asg__type">
                  <UnitTypeIcon type={u.type} size={12} />
                  {t(`game.ushort.${u.type}`)}
                </span>
                <StatusChip status={u.status} label={t(`game.status.${u.status}`)} />
                <span className="gm-asg__eta mono">{eta !== null ? t('game.eta', { t: countdown(eta) }) : u.status === 'onscene' ? t('game.inc.arrived') : ''}</span>
                {inc.state !== 'closed' && !readOnly && (
                  <Button size="sm" variant="ghost" icon="x" onClick={() => recallUnit(u.id)}>
                    {t('game.inc.recall')}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ── Agencies ─────────────────────────────────────────────────────────────────

export function AgencyBlock({ sim, inc, readOnly }: { sim: SimState; inc: Incident; readOnly?: boolean }) {
  const t = useT();
  const tx = useTx();
  // Read-only (another co-op desk): the list without the buttons.
  const closed = inc.state === 'closed' || !!readOnly;
  const listed = new Set(inc.agencyNeeds.map((a) => a.agency));
  const others = AGENCIES.filter((a) => !listed.has(a));
  if (closed && !inc.agencyNeeds.length) return null;
  return (
    <Section
      title={t('game.inc.agencies')}
      icon="building"
      actions={
        !closed && (
          <MenuButton
            className="gm-linkbtn"
            align="right"
            backLabel={t('game.reject.back')}
            items={others.map((a) => ({ id: a, icon: AGENCY_ICON[a] ?? 'building', label: t(`game.agency.${a}`), onSelect: () => requestAgency(inc.id, a) }))}
          >
            {t('game.inc.otherAgency')}
          </MenuButton>
        )
      }
    >
      {inc.agencyNeeds.length === 0 ? null : (
        <div className="gm-agencies">
          {inc.agencyNeeds.map((a) => {
            const req = a.requested;
            const left = req && !req.arrived ? (req.arriveAt - sim.now) / MIN : null;
            return (
              <div key={a.agency} className={`gm-agency${req ? (req.arrived ? ' is-arrived' : ' is-enroute') : ' is-needed'}`}>
                <Icon name={AGENCY_ICON[a.agency] ?? 'building'} size={15} />
                <div className="gm-agency__body">
                  <strong>{t(`game.agency.${a.agency}`)}</strong>
                  <span>{tx(a.reason)}</span>
                </div>
                {!req ? (
                  !closed && (
                    <Button size="sm" variant="warning" icon="phone" onClick={() => requestAgency(inc.id, a.agency)}>
                      {t('game.inc.notifyHk', { agency: t(`game.agency.${a.agency}`) })}
                    </Button>
                  )
                ) : req.arrived || (left !== null && left <= 0) ? (
                  <Badge tone="ok">
                    <Icon name="check" size={11} /> {t('game.inc.agencyArrived')}
                  </Badge>
                ) : (
                  <span className="gm-agency__eta mono">{t('game.inc.agencyEnroute', { t: left !== null ? countdown(left) : '-' })}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ── Pursuit / search ─────────────────────────────────────────────────────────

export function PursuitBlock({ sim, inc, readOnly }: { sim: SimState; inc: Incident; readOnly?: boolean }) {
  const t = useT();
  const p = inc.pursuit;
  if (!p) return null;
  const live = !p.ended;
  const dur = (sim.now - p.startedAt) / MIN;
  // Career only: spike strips are an upgrade (the engine sets the flag outside career).
  const spikesOwned = sim.flags['upg:spikes'] === true;
  return (
    <div className={`gm-pursuit${live ? ' is-live' : ''}`}>
      <header>
        <Icon name="siren" size={15} />
        <strong>{t('game.pursuit.title')}</strong>
        {live ? (
          <span className="mono">
            {t('game.pursuit.speed', { v: Math.round(p.speedKmh) })} · {t('game.pursuit.duration', { t: countdown(dur) })}
          </span>
        ) : (
          <Badge tone={p.ended === 'caught' ? 'ok' : p.ended === 'crashed' ? 'danger' : 'warn'}>{t(`game.pursuit.${p.ended}`)}</Badge>
        )}
      </header>
      <div className="gm-pursuit__meters">
        <div>
          <span>{t('game.pursuit.pressure')}</span>
          <Meter value={p.pressure} tone="ok" label={t('game.pursuit.pressure')} />
          <b className="mono">{Math.round(p.pressure * 100)}%</b>
        </div>
        <div>
          <span>{t('game.pursuit.risk')}</span>
          <Meter value={Math.min(1, p.risk * 4)} tone="danger" label={t('game.pursuit.risk')} />
          <b className="mono">{Math.round(p.risk * 100)}%</b>
        </div>
      </div>
      {live && !readOnly && (
        <div className="gm-pursuit__actions">
          <Button size="sm" variant="danger" icon="x" onClick={() => pursuitAction(inc.id, 'terminate')}>
            {t('game.pursuit.terminate')}
          </Button>
          <Button size="sm" icon="heli" disabled={p.heli} onClick={() => pursuitAction(inc.id, 'heli')}>
            {p.heli ? t('game.pursuit.heliOn') : t('game.pursuit.heli')}
          </Button>
          <Button
            size="sm"
            icon="minus"
            disabled={p.spikes || !spikesOwned}
            title={!spikesOwned ? t('game.pursuit.spikesLocked') : undefined}
            onClick={() => pursuitAction(inc.id, 'spikes')}
          >
            {p.spikes ? t('game.pursuit.spikesOn') : t('game.pursuit.spikes')}
          </Button>
        </div>
      )}
    </div>
  );
}

export function SearchBlock({ inc }: { inc: Incident }) {
  const t = useT();
  const lang = useLang();
  const s = inc.search;
  if (!s) return null;
  return (
    <div className={`gm-search${s.found ? ' is-found' : ''}`}>
      <header>
        <Icon name="crosshair" size={14} />
        <strong>{t('game.search.title')}</strong>
        <span className="mono">{t('game.search.radius', { r: fmtKm(s.radiusKm, lang) })}</span>
        {s.found && <Badge tone="ok">{t('game.search.found')}</Badge>}
      </header>
      <div className="gm-search__bar">
        <Meter value={s.progress} tone={s.found ? 'ok' : 'accent'} label={t('game.search.title')} />
        <b className="mono">{Math.round(s.progress * 100)}%</b>
      </div>
    </div>
  );
}

// ── Outcome + score ──────────────────────────────────────────────────────────

const SCORE_MAX: Record<Exclude<keyof ScoreBreakdown, 'total'>, number> = {
  response: 30,
  resources: 15,
  decisions: 20,
  outcome: 20,
  safety: 10,
  classification: 5,
};

export function ScoreBars({ b }: { b: ScoreBreakdown }) {
  const t = useT();
  return (
    <div className="gm-score">
      {(Object.keys(SCORE_MAX) as (keyof typeof SCORE_MAX)[]).map((k) => {
        const v = b[k] ?? 0;
        const max = SCORE_MAX[k];
        const f = Math.max(0, Math.min(1, v / max));
        return (
          <div key={k} className="gm-score__row">
            <span>{t(`game.score.${k}`)}</span>
            <div className="gm-score__bar">
              <i className={f >= 0.75 ? 'is-ok' : f >= 0.45 ? 'is-warn' : 'is-bad'} style={{ width: `${f * 100}%` }} />
            </div>
            <b className="mono">
              {Math.round(v)}
              <small>/{max}</small>
            </b>
          </div>
        );
      })}
    </div>
  );
}

export function OutcomeBlock({ inc }: { inc: Incident }) {
  const t = useT();
  const tx = useTx();
  const o = inc.outcome;
  if (!o) {
    return (
      <div className="gm-outcome">
        <header>
          <Icon name="flag" size={14} />
          <strong>{inc.closedBy ? t(`game.closedBy.${inc.closedBy}`) : t('game.inc.closedNoOutcome')}</strong>
        </header>
      </div>
    );
  }
  const score = Math.round(o.score);
  const tone = score >= 75 ? 'ok' : score >= 50 ? 'warn' : 'danger';
  return (
    <div className={`gm-outcome gm-outcome--${tone}`}>
      <header>
        <div className={`gm-outcome__ring gm-tone--${tone}`} style={{ ['--v' as string]: `${score}` }}>
          <span className="mono">{score}</span>
        </div>
        <div className="gm-outcome__title">
          <strong>{t(`game.result.${o.result}`)}</strong>
          {inc.closedBy && <span>{t(`game.closedBy.${inc.closedBy}`)}</span>}
        </div>
      </header>
      <p className="gm-outcome__text">{tx(o.text)}</p>
      <div className="gm-outcome__stats">
        <span>
          {t('game.inc.success')} <b className="mono">{Math.round(o.success * 100)}%</b>
        </span>
        <span>
          {t('game.inc.arrests')} <b className="mono">{o.arrests}</b>
        </span>
        <span>
          {t('game.inc.injuries')} <b className="mono">{o.injuries}</b>
        </span>
        {o.officerInjured && <Badge tone="danger">{t('game.inc.officerInjured')}</Badge>}
      </div>
      <ScoreBars b={o.breakdown} />
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

const TL_ICON: Record<TimelineEntry['kind'], IconName> = {
  system: 'info',
  hk: 'phone',
  dispatch: 'send',
  radio: 'radio',
  status: 'car',
  note: 'book',
  agency: 'ambulance',
  outcome: 'flag',
};

export function TimelineBlock({ inc }: { inc: Incident }) {
  const t = useT();
  const tx = useTx();
  if (!inc.timeline.length) return null;
  return (
    <Section title={t('game.inc.timeline')} icon="clock">
      <ol className="gm-timeline">
        {inc.timeline.map((e, i) => (
          <li key={i} className={`gm-tl gm-tl--${e.kind}`}>
            <span className="gm-tl__t mono">{hhmm(e.t)}</span>
            <Icon name={TL_ICON[e.kind] ?? 'info'} size={12} />
            <span className="gm-tl__text">{tx(e.text)}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Re-export used by the unit panel to send a unit to the selected incident. */
export function useSelectedIncident(sim: SimState | null): Incident | undefined {
  const id = useGame((s) => s.selection.incidentId);
  return sim && id ? sim.incidents[id] : undefined;
}
