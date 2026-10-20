import { useGame } from '@/store/game';
import { useT, useTx } from '@/i18n';
import { Badge, Button, Empty, Icon, Kbd, PriorityChip } from '@/ui/components';
import { sectorById } from '@/sim/sectors';
import { hhmm, MIN } from '@/sim/time';
import type { Incident, Priority, SimState } from '@/sim/types';
import { acknowledge, sendBackup, setPriority } from './actions';
import { activeBackup, selPendingRadio, selTemplate } from './data';
import { countdown, helpSectorId } from './format';
import { HelpTag, RadioReplies, RoleNote, Section, SourceTag, useSim } from './bits';
import { useCan } from '@/store/coop';
import { RejectMenu } from './EventQueue';
import {
  AgencyBlock,
  AssignedBlock,
  CallerBlock,
  NeedsBlock,
  OutcomeBlock,
  PersonsBlock,
  PursuitBlock,
  RecommendBlock,
  SearchBlock,
  TimelineBlock,
} from './IncidentParts';

export function IncidentPanel() {
  const sim = useSim();
  const t = useT();
  const id = useGame((s) => s.selection.incidentId);
  if (!sim) return null;
  const inc = id ? sim.incidents[id] : undefined;
  if (!inc) {
    return (
      <div className="gm-pane-empty">
        <Empty icon="list">
          <strong>{t('game.inc.none')}</strong>
          <br />
          <span className="muted">{t('game.inc.noneHint')}</span>
        </Empty>
      </div>
    );
  }
  return <IncidentDetail key={inc.id} sim={sim} inc={inc} />;
}

const PRIOS: Priority[] = [1, 2, 3, 4];

function IncidentDetail({ sim, inc }: { sim: SimState; inc: Incident }) {
  const t = useT();
  const tx = useTx();
  const g = useGame.getState();
  const tpl = selTemplate(sim, inc);
  const closed = inc.state === 'closed';
  const incoming = inc.state === 'incoming';
  const backup = activeBackup(sim, inc);
  const pending = selPendingRadio(sim).filter((m) => m.incidentId === inc.id);
  const expiresIn = !inc.firstArrivalAt && inc.expiresAt && !closed ? (inc.expiresAt - sim.now) / MIN : null;
  const loc = inc.location;
  // Co-op: only the dispatcher's desk acknowledges, sets priorities and sends crews (src/sim/coop.ts).
  const canDispatch = useCan('dispatch');

  return (
    <div className={`gm-inc gm-inc--p${inc.priority}${closed ? ' is-closed' : ''}`}>
      <header className="gm-inc__head">
        <div className="gm-inc__meta">
          <span className="gm-inc__no mono">{inc.number}</span>
          <Badge tone={incoming ? 'danger' : closed ? 'neutral' : inc.state === 'onscene' ? 'warn' : 'accent'} className="gm-inc__state">
            {t(`game.state.${inc.state}`)}
          </Badge>
          <SourceTag source={inc.source} />
          <HelpTag inc={inc} />
          <span className="gm-inc__created mono">{t('game.inc.created', { t: hhmm(inc.createdAt) })}</span>
        </div>
        <div className="gm-inc__titlerow">
          <PriorityChip p={inc.priority} />
          <span className="gm-inc__code mono">{inc.code}</span>
          <h2 className="gm-inc__title">{tx(inc.title)}</h2>
        </div>
        <div className="gm-inc__prio" role="group" aria-label={t('game.inc.priority')}>
          <span className="gm-inc__prio-k">{t('game.inc.priority')}</span>
          {PRIOS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={closed || !canDispatch}
              className={`gm-prio-btn gm-prio-btn--${p}${inc.priority === p ? ' is-active' : ''}`}
              onClick={() => inc.priority !== p && setPriority(inc.id, p)}
              title={t('game.inc.setPriority', { p })}
              aria-pressed={inc.priority === p}
            >
              P{p}
            </button>
          ))}
          {inc.escalated && (
            <span title={t('game.inc.escTitle')}>
              <Badge tone="danger" className="gm-inc__esc">
                <Icon name="warning" size={11} /> {t('game.inc.escShort')}
              </Badge>
            </span>
          )}
        </div>
        <div className="gm-inc__addr">
          <Icon name="pin" size={14} />
          <div>
            <strong>{loc.address}</strong>
            <span>{[loc.placeName && loc.placeName !== loc.address ? loc.placeName : null, loc.district, loc.city].filter(Boolean).join(' · ')}</span>
          </div>
          <Button size="sm" icon="map" onClick={() => g.focusMap(loc.coord, 15)}>
            {t('game.inc.showOnMap')}
          </Button>
        </div>
        {incoming && !canDispatch && <RoleNote role="dispatch" />}
        {incoming && canDispatch && (
          <div className="gm-inc__ack">
            <Button variant="primary" icon="check" title={t('game.queue.acceptTitle')} onClick={() => acknowledge(inc.id)}>
              {t('game.queue.accept')}
              <Kbd>A</Kbd>
            </Button>
            <RejectMenu incidentId={inc.id} />
          </div>
        )}
        {expiresIn !== null && expiresIn > 0 && expiresIn < 60 && (
          <div className={`gm-inc__expires mono${expiresIn < 5 ? ' is-urgent' : ''}`}>
            <Icon name="timer" size={12} />
            {t('game.inc.expires', { t: countdown(expiresIn) })}
          </div>
        )}
      </header>

      <div className="gm-inc__body">
        {closed && <OutcomeBlock inc={inc} />}
        {!closed && <HelpNote inc={inc} />}

        {backup && (
          <div className="gm-backup" role="alert">
            <div className="gm-backup__head">
              <Icon name="siren" size={18} />
              <strong>{t('game.queue.backup')}</strong>
              {backup.remainingMin !== null && <span className="gm-backup__cd mono">{countdown(backup.remainingMin)}</span>}
            </div>
            {backup.msg && <p className="gm-backup__text">„{tx(backup.msg.text)}“</p>}
            <div className="gm-backup__foot">
              <span>{t('game.inc.backupNeed', { n: backup.need.count, type: t(`game.utype.${backup.need.type}`) })}</span>
              {!canDispatch ? null : backup.enroute.length ? (
                <span className="gm-backup__foot-actions">
                  <span className="gm-helpenroute mono">
                    <Icon name="siren" size={11} />
                    {t('game.queue.helpEnroute', {
                      c: backup.enroute[0].unit.callsign,
                      t: backup.enroute[0].etaMin !== null ? countdown(backup.enroute[0].etaMin) : '',
                    })}
                  </span>
                  <Button size="sm" variant="ghost" icon="plus" onClick={() => sendBackup(inc.id)}>
                    {t('game.queue.sendMore')}
                  </Button>
                </span>
              ) : (
                <Button variant="danger" icon="send" onClick={() => sendBackup(inc.id)}>
                  {t('game.queue.sendHelp')}
                </Button>
              )}
            </div>
          </div>
        )}

        {pending.length > 0 && (
          <Section title={t('game.inc.radioPending')} icon="radio" className="gm-sec--pending">
            {pending.map((m) => (
              <div key={m.id} className={`gm-pend gm-pend--${m.level}`}>
                <div className="gm-pend__line">
                  <span className="gm-pend__from mono">{m.from}</span>
                  <span className="gm-pend__text">{tx(m.text)}</span>
                </div>
                <RadioReplies msg={m} sim={sim} />
              </div>
            ))}
          </Section>
        )}

        <PursuitBlock sim={sim} inc={inc} readOnly={!canDispatch} />
        <SearchBlock inc={inc} />

        <Section title={t('game.inc.summary')} icon="book">
          <p className="gm-inc__summary">{tx(inc.summary)}</p>
          {inc.details.length > 0 && (
            <ul className="gm-inc__details">
              {inc.details.map((d, i) => (
                <li key={i}>{tx(d)}</li>
              ))}
            </ul>
          )}
          <CallerBlock inc={inc} />
        </Section>

        {!closed && <NeedsBlock sim={sim} inc={inc} />}
        {!closed && canDispatch && <RecommendBlock sim={sim} inc={inc} />}
        {!closed && !canDispatch && <RoleNote role="dispatch" />}
        {(inc.assigned.length > 0 || !closed) && <AssignedBlock sim={sim} inc={inc} readOnly={!canDispatch} />}
        <AgencyBlock sim={sim} inc={inc} readOnly={!canDispatch} />
        <PersonsBlock sim={sim} inc={inc} tpl={tpl} />
        <TimelineBlock inc={inc} />
      </div>
    </div>
  );
}

/** A colleague's call for help: who asks, and what happens when nobody is sent. */
function HelpNote({ inc }: { inc: Incident }) {
  const t = useT();
  const tx = useTx();
  const id = helpSectorId(inc);
  if (id === null) return null;
  const sector = id ? sectorById(id) : undefined;
  const c = sector?.colleague;
  return (
    <div className="gm-helpnote" role="note">
      <Icon name="users" size={16} />
      <p>
        {c && sector
          ? t('game.help.note', { name: `${c.firstName} ${c.lastName}`, sector: tx(sector.name) })
          : t('game.help.noteShort')}
      </p>
    </div>
  );
}
