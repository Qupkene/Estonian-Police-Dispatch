// Andmebaas → sõiduki kaart.
import type { RadioMsg, SimState, Vehicle } from '@/sim/types';
import { Avatar, Icon } from '@/ui/components';
import { useT, useTx } from '@/i18n';
import { ageAt, incidentsForPlate, isExpired, isoToEt } from '../lib/helpers';
import { pFlags, vFlags } from '../lib/engine';
import { FlagBanner, FlagDots, KV, Plate, Section } from '../parts';
import { PendingStrip } from './PendingStrip';
import { RelatedIncidents } from './PersonCard';

export function VehicleCard({
  vehicle: v,
  sim: s,
  pendingMsgs,
  onOpenPerson,
}: {
  vehicle: Vehicle;
  sim: SimState;
  pendingMsgs: RadioMsg[];
  onOpenPerson: (personId: string) => void;
}) {
  const t = useT();
  const tx = useTx();
  const flags = vFlags(v, s);
  const owner = v.ownerId ? s.persons[v.ownerId] : undefined;
  const insOk = v.insurance.valid && !isExpired(v.insurance.until, s.now);
  const inspOk = v.inspection.valid && !isExpired(v.inspection.until, s.now);
  const incidents = incidentsForPlate(s, v.plate);

  return (
    <article className={`tl-card tl-vehicle${v.flags.stolen ? ' is-wanted' : ''}`}>
      <PendingStrip msgs={pendingMsgs} />
      <header className="tl-vehicle__head">
        <Plate plate={v.plate} size="lg" />
        <div className="tl-vehicle__title">
          <h3>
            {v.make} {v.model}
          </h3>
          <div className="tl-person__meta">
            {v.year} · {tx(v.color)} · {t(`tools.v.kind.${v.kind}`)}
          </div>
        </div>
      </header>

      <FlagBanner flags={flags} />

      {(v.flags.stolen || v.flags.wanted || v.flags.suspended) && (
        <div className="tl-alerts">
          {v.flags.stolen && (
            <div className="tl-alert tl-alert--danger">
              <strong>{t('tools.v.stolen', { date: isoToEt(v.flags.stolen.since) })}</strong>: {tx(v.flags.stolen.text)}
            </div>
          )}
          {v.flags.wanted && <div className="tl-alert tl-alert--danger">{tx(v.flags.wanted)}</div>}
          {v.flags.suspended && <div className="tl-alert tl-alert--warn">{t('tools.v.suspended')}</div>}
        </div>
      )}

      <Section title={t('tools.v.plate')} icon="car">
        <KV
          rows={[
            [t('tools.v.vin'), <span className="mono tl-vin">{v.vin}</span>],
            [t('tools.v.year'), v.year],
            [t('tools.v.color'), tx(v.color)],
            [t('tools.v.kind'), t(`tools.v.kind.${v.kind}`)],
          ]}
        />
      </Section>

      <Section title={t('tools.v.owner')} icon="user">
        {owner ? (
          <button type="button" className="tl-row tl-row--person" onClick={() => onOpenPerson(owner.id)}>
            <Avatar
              seed={owner.avatarSeed}
              size={36}
              gender={owner.gender}
              age={ageAt(owner.birthDate, s.now)}
              hair={owner.appearance.hair}
              hairColor={owner.appearance.hairColor}
              beard={owner.appearance.beard}
              glasses={owner.appearance.glasses}
            />
            <span className="tl-row__main">
              {owner.firstName} {owner.lastName}
              <span className="tl-row__sub mono">{owner.idcode}</span>
            </span>
            <FlagDots flags={pFlags(owner, s.now)} />
            <Icon name="chevron-right" size={14} />
          </button>
        ) : null}
        {v.ownerCompany && <KV rows={[[t('tools.v.company'), v.ownerCompany]]} />}
        {!owner && !v.ownerCompany && <p className="tl-muted-line">{t('tools.v.noOwner')}</p>}
      </Section>

      <Section title={`${t('tools.v.insurance')} · ${t('tools.v.inspection')}`} icon="shield">
        <div className="tl-status-rows">
          <div className={`tl-status-row ${insOk ? 'is-ok' : 'is-bad'}`}>
            <Icon name={insOk ? 'check' : 'x'} size={14} />
            <span className="tl-status-row__k">{t('tools.v.insurance')}</span>
            <span className="tl-status-row__v">
              {insOk ? t('tools.v.valid') : t('tools.v.invalid')} · {t('tools.v.until', { date: isoToEt(v.insurance.until) })}
              {v.insurance.insurer ? ` · ${v.insurance.insurer}` : ''}
            </span>
          </div>
          <div className={`tl-status-row ${inspOk ? 'is-ok' : 'is-bad'}`}>
            <Icon name={inspOk ? 'check' : 'x'} size={14} />
            <span className="tl-status-row__k">{t('tools.v.inspection')}</span>
            <span className="tl-status-row__v">
              {inspOk ? t('tools.v.valid') : t('tools.v.invalid')} · {t('tools.v.until', { date: isoToEt(v.inspection.until) })}
            </span>
          </div>
        </div>
      </Section>

      {v.notes.length > 0 && (
        <Section title={t('tools.v.notes')} icon="list">
          <ul className="tl-notes">
            {v.notes.map((n, i) => (
              <li key={i}>{tx(n)}</li>
            ))}
          </ul>
        </Section>
      )}

      <RelatedIncidents incidents={incidents} />
    </article>
  );
}
