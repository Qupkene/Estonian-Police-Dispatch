// Small presentational pieces shared by the CAD screen components.
import { useState, type ReactNode } from 'react';
import { useGame } from '@/store/game';
import { useT, useTx } from '@/i18n';
import { Badge, Button, Icon, type IconName } from '@/ui/components';
import type { Recommendation } from '@/sim/selectors';
import { canCorrectQuery } from '@/sim/commands';
import { MIN } from '@/sim/time';
import { sectorById } from '@/sim/sectors';
import type { Incident, RadioMsg, SimState, SpeakerLang, Text, UnitStatus, UnitType, Weather } from '@/sim/types';
import { STATUS_CODE } from '@/sim/types';
import { checkRecord, replyRadio } from './actions';
import { useCan, useCoopNames, useDeskCan } from '@/store/coop';
import type { CoopRole } from '@/sim/coop';
import { answeredReply, querySubject } from './data';
import { countdown, helpSectorId } from './format';

/** Re-render on every sim tick and return the live (mutable) sim object. */
export function useSim(): SimState | null {
  useGame((s) => s.tick);
  return useGame((s) => s.sim);
}

export const UNIT_ICON: Record<UnitType | 'any', IconName> = {
  patrol: 'car',
  rapid: 'siren',
  k9: 'dog',
  traffic: 'gauge',
  criminal: 'fingerprint',
  special: 'target',
  heli: 'heli',
  border: 'flag',
  aux: 'users',
  community: 'home',
  transport: 'handcuffs',
  boat: 'boat',
  any: 'shield',
};

export const SOURCE_ICON: Record<Incident['source'], IconName> = {
  hk: 'phone',
  call: 'phone',
  field: 'radio',
  alarm: 'alert',
  anpr: 'crosshair',
  director: 'film',
};

export const WEATHER_ICON: Record<Weather['kind'], IconName> = {
  clear: 'sun',
  cloudy: 'cloud',
  rain: 'rain',
  snow: 'snow',
  sleet: 'snow',
  fog: 'fog',
  storm: 'wind',
};

export function UnitTypeIcon({ type, size = 14 }: { type: UnitType | 'any'; size?: number }) {
  return <Icon name={UNIT_ICON[type] ?? 'shield'} size={size} className="gm-utype-ico" />;
}

export function SourceTag({ source }: { source: Incident['source'] }) {
  const t = useT();
  return (
    <span className={`gm-src gm-src--${source}`} title={t(`game.srcLong.${source}`)}>
      <Icon name={SOURCE_ICON[source] ?? 'info'} size={11} />
      {t(`game.src.${source}`)}
    </span>
  );
}

/**
 * "Abipalve · Viljandimaa": a colleague at a neighbouring desk asks for help with a call just across the
 * border (tag help:<sectorId>). Nothing for any other incident.
 */
export function HelpTag({ inc, short }: { inc: Pick<Incident, 'tags'>; /** Just "Abipalve" (a tight row). */ short?: boolean }) {
  const t = useT();
  const tx = useTx();
  const id = helpSectorId(inc);
  if (id === null) return null;
  const sector = id ? sectorById(id) : undefined;
  const c = sector?.colleague;
  const who = c ? `${c.firstName} ${c.lastName}` : '';
  const name = sector ? tx(sector.name) : '';
  return (
    <span className="gm-help" title={who && name ? t('game.help.title', { name: who, sector: name }) : t('game.help.titleShort')}>
      <Icon name="users" size={11} />
      <span className="gm-help__text">{name && !short ? t('game.help.badge', { sector: name }) : t('game.help.badgeShort')}</span>
    </span>
  );
}

export function LangFlag({ lang }: { lang: SpeakerLang }) {
  const t = useT();
  return (
    <span className={`gm-flag gm-flag--${lang}`} title={t(`game.spk.${lang}`)}>
      <i aria-hidden="true" />
      {lang.toUpperCase()}
    </span>
  );
}

/** Estonian-style number plate. */
export function Plate({ plate, onClick, title }: { plate: string; onClick?: () => void; title?: string }) {
  const body = (
    <>
      <span className="gm-plate__eu" aria-hidden="true">
        EST
      </span>
      <span className="gm-plate__num">{plate}</span>
    </>
  );
  return onClick ? (
    <button type="button" className="gm-plate gm-plate--btn" onClick={onClick} title={title}>
      {body}
    </button>
  ) : (
    <span className="gm-plate">{body}</span>
  );
}

export function StatusDot({ status }: { status: UnitStatus }) {
  return <i className={`gm-dot gm-dot--${status}`} aria-hidden="true" />;
}

export function StatusCode({ status }: { status: UnitStatus }) {
  const t = useT();
  return (
    <span className={`gm-scode gm-scode--${status}`} title={t(`game.status.${status}`)}>
      {STATUS_CODE[status]}
    </span>
  );
}

const FIT_TONE: Record<Recommendation['fit'], 'ok' | 'info' | 'warn' | 'neutral' | 'danger'> = {
  ideal: 'ok',
  need: 'info',
  weak: 'warn',
  unavailable: 'neutral',
  unreachable: 'danger',
};

export function FitBadge({ fit }: { fit: Recommendation['fit'] }) {
  const t = useT();
  return (
    <Badge tone={FIT_TONE[fit]} className={`gm-fit gm-fit--${fit}`}>
      {t(`game.fit.${fit}`)}
    </Badge>
  );
}

/** Render a value that may be an i18n key ('game.…'), a raw string or a bilingual Text. */
export function useMsg(): (v: Text | string | undefined) => string {
  const t = useT();
  const tx = useTx();
  return (v) => {
    if (v === undefined) return '';
    if (typeof v === 'string') return /^game\.[\w.]+$/.test(v) ? t(v) : v;
    return tx(v);
  };
}

/** Inline reply buttons (+ countdown and registry shortcut) for a radio message awaiting an answer. */
export function RadioReplies({ msg, sim, compact }: { msg: RadioMsg; sim: SimState; compact?: boolean }) {
  const t = useT();
  const tx = useTx();
  // Co-op: the radio desk answers (src/sim/coop.ts); the other desks see the countdown only. Sector co-op: the desk
  // of the message's crew or incident (src/sim/desks.ts). A registry query is anybody's (openToAll).
  const radioDesk = useCan('radio');
  const ownDesk = useDeskCan({ msg });
  const canReply = msg.kind === 'query' || (radioDesk && ownDesk);
  const [fixing, setFixing] = useState(false);
  if (!msg.replies?.length) return null;
  if (msg.answered) {
    const r = answeredReply(msg);
    // Not one of the replies: the engine closed it ('timeout', or 'closed' with its event).
    if (!r) return <div className="gm-replies gm-replies--done">{t('game.radio.expired')}</div>;
    // A registry answer may still be corrected for a while (src/sim/fallout.ts). Offered for every answer, right or
    // wrong, so the button never tells which one it was.
    const fix = msg.kind === 'query' && canCorrectQuery(sim, msg);
    const fsub = fix ? querySubject(sim, msg) : null;
    return (
      <div className={`gm-replies gm-replies--done${compact ? ' gm-replies--compact' : ''}`}>
        <span>{t('game.radio.answered', { r: tx(r.label) })}</span>
        {fix && !fixing && (
          <Button size="sm" variant="ghost" icon="refresh" onClick={() => setFixing(true)} title={t('game.radio.correctHint')}>
            {t('game.radio.correct')}
          </Button>
        )}
        {fix && fixing && (
          <>
            {fsub && (
              <Button size="sm" variant="ghost" icon="search" onClick={() => checkRecord(fsub)} title={fsub.q}>
                {t('game.radio.openRegistry')}
              </Button>
            )}
            {msg.replies
              .filter((x) => x.id !== r.id)
              .map((x) => (
                <Button
                  key={x.id}
                  size="sm"
                  className="gm-reply"
                  onClick={() => {
                    setFixing(false);
                    replyRadio(msg.id, x.id);
                  }}
                >
                  {tx(x.label)}
                </Button>
              ))}
            <Button size="sm" variant="ghost" onClick={() => setFixing(false)}>
              {t('game.radio.correctCancel')}
            </Button>
          </>
        )}
      </div>
    );
  }
  const left = msg.expiresAt !== undefined ? (msg.expiresAt - sim.now) / MIN : null;
  if (left !== null && left <= 0) return <div className="gm-replies gm-replies--done">{t('game.radio.expired')}</div>;
  const sub = msg.kind === 'query' ? querySubject(sim, msg) : null;
  return (
    <div className={`gm-replies${compact ? ' gm-replies--compact' : ''}`}>
      {sub && (
        <Button size="sm" variant="ghost" icon="search" onClick={() => checkRecord(sub)} title={sub.q}>
          {t('game.radio.openRegistry')}
        </Button>
      )}
      {canReply ? (
        msg.replies.map((r) => (
          <Button key={r.id} size="sm" className="gm-reply" onClick={() => replyRadio(msg.id, r.id)}>
            {tx(r.label)}
          </Button>
        ))
      ) : (
        <RoleNote role="radio" inline />
      )}
      {left !== null && (
        <span className={`gm-replies__cd mono${left < 1.5 ? ' is-urgent' : ''}`}>
          <Icon name="timer" size={11} />
          {countdown(left)}
        </span>
      )}
    </div>
  );
}

/** Co-op: whose desk this control belongs to ("Ekipaaže saadab dispetšer Ivo."). Nothing in single player. */
export function RoleNote({ role, inline }: { role: CoopRole; inline?: boolean }) {
  const t = useT();
  const names = useCoopNames(role);
  if (names === null) return null;
  const text = names ? t(`coop.note.${role}`, { name: names }) : t(`coop.note.${role}.nobody`);
  return inline ? (
    <span className="gm-rolenote gm-rolenote--inline">{text}</span>
  ) : (
    <div className="gm-rolenote" role="note">
      <Icon name="users" size={13} />
      <span>{text}</span>
    </div>
  );
}

/** Small section heading used inside panels. */
export function Section({ title, icon, actions, children, className }: { title: ReactNode; icon?: IconName; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`gm-sec${className ? ' ' + className : ''}`}>
      <header className="gm-sec__head">
        {icon && <Icon name={icon} size={13} />}
        <h3>{title}</h3>
        {actions && <div className="gm-sec__actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** Mono "label value" pair used in the top bar and cards. */
export function Kv({ k, v, tone, title }: { k: ReactNode; v: ReactNode; tone?: 'ok' | 'warn' | 'danger' | 'muted'; title?: string }) {
  return (
    <div className={`gm-kv${tone ? ' gm-kv--' + tone : ''}`} title={title}>
      <span className="gm-kv__k">{k}</span>
      <span className="gm-kv__v mono">{v}</span>
    </div>
  );
}
