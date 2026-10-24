// Andmebaas → isiku kaart.
import type { Incident, Person, RadioMsg, SimState } from '@/sim/types';
import { lawById } from '@/data/laws';
import { parseIdcode } from '@/gen/isikukood';
import { Avatar, Badge, Icon, PriorityChip } from '@/ui/components';
import { useLang, useT, useTx } from '@/i18n';
import { useGame } from '@/store/game';
import { hhmm } from '@/sim/time';
import {
  ageAt,
  citizenshipLabel,
  incidentsForPerson,
  isExpired,
  isLegend,
  isoToEt,
  lawIdLabel,
  SPEAKER_LANG,
  vehicleByPlate,
} from '../lib/helpers';
import { describe, pFlags, vFlags } from '../lib/engine';
import { CountryFlag, FlagBanner, FlagDots, KV, Plate, Section } from '../parts';
import { PendingStrip } from './PendingStrip';
import { hasPhoto } from '@/gen/face';

export function PersonCard({
  person: p,
  sim: s,
  pendingMsgs,
  onOpenVehicle,
}: {
  person: Person;
  sim: SimState;
  pendingMsgs: RadioMsg[];
  onOpenVehicle: (plate: string) => void;
}) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const flags = pFlags(p, s.now);
  const legend = isLegend(p);
  const info = parseIdcode(p.idcode);
  const age = ageAt(p.birthDate, s.now);
  const cit = citizenshipLabel(p.citizenship, lang);
  const incidents = incidentsForPerson(s, p.id);
  const a = p.appearance;
  const lic = p.license;
  const licTone = lic.status === 'valid' ? 'ok' : lic.status === 'none' ? 'neutral' : 'danger';

  return (
    <article className={`tl-card tl-person${legend ? ' is-legend' : ''}${p.flags.wanted ? ' is-wanted' : ''}`}>
      {legend && <div className="tl-ribbon">{t('tools.p.legend')}</div>}
      <PendingStrip msgs={pendingMsgs} />

      <header className="tl-person__head">
        <div className="tl-person__photo">
          <Avatar
            seed={p.avatarSeed}
            photo={hasPhoto(p)}
            size={104}
            gender={p.gender}
            age={age}
            hair={a.hair}
            hairColor={a.hairColor}
            beard={a.beard}
            glasses={a.glasses}
          />
          {p.flags.wanted && <span className="tl-person__stamp">{t('tools.p.wanted')}</span>}
        </div>
        <div className="tl-person__id">
          <h3 className="tl-person__name">
            {p.firstName} <span className="tl-person__last">{p.lastName.toUpperCase()}</span>
          </h3>
          <div className="tl-idcode">
            <Icon name="id" size={14} />
            <span className="mono">{p.idcode}</span>
            {!info.valid && <Badge tone="danger">{t('tools.p.idInvalid')}</Badge>}
          </div>
          <div className="tl-person__meta">
            {t('tools.p.born')} {isoToEt(info.birthDate ?? p.birthDate)} · {t('tools.p.ageYears', { n: age })} ·{' '}
            {(info.gender ?? p.gender) === 'M' ? t('tools.p.male') : t('tools.p.female')}
          </div>
          <div className="tl-person__cit">
            <CountryFlag code={p.citizenship} />
            <span title={cit.flag}>{cit.name}</span>
            <span className="dim">·</span>
            <span>{tx(SPEAKER_LANG[p.lang])}</span>
          </div>
        </div>
      </header>

      <FlagBanner flags={flags} />

      {(p.flags.wanted || p.flags.restrainingOrder || p.flags.missing || p.flags.probation || p.flags.sis || p.flags.deceased) && (
        <div className="tl-alerts">
          {p.flags.wanted && (
            <div className="tl-alert tl-alert--danger">
              <strong>{t('tools.p.wanted')}</strong>: {tx(p.flags.wanted.reason)}
              <div className="tl-alert__sub">
                {t('tools.p.since', { date: isoToEt(p.flags.wanted.since) })} · {t('tools.p.authority')}: {p.flags.wanted.authority}
              </div>
            </div>
          )}
          {p.flags.sis && (
            <div className="tl-alert tl-alert--danger">
              <strong>{t('tools.p.sis')}</strong>: {tx(p.flags.sis)}
            </div>
          )}
          {p.flags.restrainingOrder && (
            <div className={`tl-alert tl-alert--${isExpired(p.flags.restrainingOrder.until, s.now) ? 'muted' : 'warn'}`}>
              <strong>{t('tools.p.restraining')}</strong>
              <div className="tl-alert__sub">
                {t('tools.p.protects', { name: p.flags.restrainingOrder.protectedName, date: isoToEt(p.flags.restrainingOrder.until) })}
              </div>
            </div>
          )}
          {p.flags.missing && (
            <div className="tl-alert tl-alert--warn">
              <strong>{t('tools.p.missing', { date: isoToEt(p.flags.missing.since) })}</strong>: {tx(p.flags.missing.text)}
            </div>
          )}
          {p.flags.probation && (
            <div className="tl-alert tl-alert--warn">{t('tools.p.probation', { date: isoToEt(p.flags.probation.until) })}</div>
          )}
          {p.flags.deceased && <div className="tl-alert tl-alert--muted">{t('tools.p.deceased')}</div>}
        </div>
      )}

      <Section title={t('tools.p.address')} icon="home">
        <KV
          rows={[
            [t('tools.p.address'), `${p.address}${p.city && !p.address.includes(p.city) ? `, ${p.city}` : ''}`],
            [t('tools.p.phone'), <span className="mono">{p.phone}</span>],
            [t('tools.p.occupation'), tx(p.occupation)],
          ]}
        />
      </Section>

      <Section title={t('tools.p.appearance')} icon="eye">
        <p className="tl-desc">{tx(describe(p, s.now))}</p>
        <div className="tl-chips">
          <span className="tl-chip">
            {t('tools.p.height')} <b>{a.heightCm} cm</b>
          </span>
          <span className="tl-chip">
            {t('tools.p.build')} <b>{t(`tools.app.build.${a.build}`)}</b>
          </span>
          <span className="tl-chip">
            {t('tools.p.hair')}{' '}
            <b>
              {a.hair === 'bald' || a.hair === 'shaved' ? t(`tools.app.hair.${a.hair}`) : `${t(`tools.app.hair.${a.hair}`)}, ${t(`tools.app.color.${a.hairColor}`)}`}
            </b>
          </span>
          <span className="tl-chip">
            {t('tools.p.eyes')} <b>{t(`tools.app.eyes.${a.eyes}`)}</b>
          </span>
          {a.beard && (
            <span className="tl-chip">
              {t('tools.p.beard')} <b>{t(`tools.app.beard.${a.beard}`)}</b>
            </span>
          )}
          {a.glasses && (
            <span className="tl-chip">
              <b>{t('tools.p.glasses')}</b>
            </span>
          )}
          {a.tattoo && (
            <span className="tl-chip">
              {t('tools.p.tattoo')} <b>{a.tattoo}</b>
            </span>
          )}
        </div>
        {a.clothing && tx(a.clothing) && !tx(describe(p, s.now)).includes(tx(a.clothing)) && (
          <div className="tl-desc tl-desc--sub">
            {t('tools.p.clothing')}: {tx(a.clothing)}
          </div>
        )}
      </Section>

      <Section title={t('tools.p.license')} icon="car" aside={<Badge tone={licTone}>{t(`tools.lic.${lic.status}`)}</Badge>}>
        {lic.status !== 'none' ? (
          <KV
            rows={[
              [t('tools.p.categories'), lic.categories.length ? <span className="mono">{lic.categories.join(', ')}</span> : '-'],
              [
                t('tools.p.validUntil'),
                <span className={isExpired(lic.validUntil, s.now) ? 'tl-bad' : undefined}>
                  {isoToEt(lic.validUntil)}
                  {lic.probationary ? ` · ${t('tools.p.probationary')}` : ''}
                </span>,
              ],
            ]}
          />
        ) : (
          <p className="tl-muted-line">{t('tools.lic.none')}</p>
        )}
      </Section>

      {p.weaponPermit && (
        <Section
          title={t('tools.p.weapon')}
          icon="shield"
          aside={
            <Badge tone={isExpired(p.weaponPermit.validUntil, s.now) ? 'danger' : 'info'}>
              {isExpired(p.weaponPermit.validUntil, s.now) ? t('tools.v.invalid') : t('tools.v.valid')}
            </Badge>
          }
        >
          <KV
            rows={[
              [t('tools.v.kind'), tx(p.weaponPermit.kind)],
              [t('tools.p.validUntil'), isoToEt(p.weaponPermit.validUntil)],
              [t('tools.p.weapons'), p.weaponPermit.weapons.join(', ') || '-'],
            ]}
          />
        </Section>
      )}

      <Section title={t('tools.p.records')} icon="book" aside={p.records.length ? <Badge tone="warn">{p.records.length}</Badge> : undefined}>
        {p.records.length === 0 ? (
          <p className="tl-muted-line">{t('tools.p.noRecords')}</p>
        ) : (
          <table className="tl-table">
            <thead>
              <tr>
                <th>{t('tools.p.date')}</th>
                <th>{t('tools.p.act')}</th>
                <th>{t('tools.p.offence')}</th>
              </tr>
            </thead>
            <tbody>
              {[...p.records]
                .sort((x, y) => y.date.localeCompare(x.date))
                .map((r, i) => {
                  const law = lawById(r.lawId);
                  return (
                    <tr key={i}>
                      <td className="mono">{isoToEt(r.date)}</td>
                      <td className="mono tl-act">{law ? `${law.act} ${law.para}` : lawIdLabel(r.lawId)}</td>
                      <td>
                        <div className="tl-rec__title">
                          {law ? tx(law.title) : r.lawId}{' '}
                          <Badge tone={r.kind === 'crime' ? 'danger' : 'neutral'}>{t(`tools.p.${r.kind}`)}</Badge>
                        </div>
                        <div className="tl-rec__pun">{tx(r.punishment)}</div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={t('tools.p.vehicles')} icon="car">
        {p.vehicles.length === 0 ? (
          <p className="tl-muted-line">{t('tools.p.noVehicles')}</p>
        ) : (
          <ul className="tl-rows" role="list">
            {p.vehicles.map((pl) => {
              const v = vehicleByPlate(s, pl);
              return (
                <li key={pl}>
                  <button type="button" className="tl-row" onClick={() => onOpenVehicle(pl)}>
                    <Plate plate={pl} size="sm" />
                    <span className="tl-row__main">
                      {v ? `${v.make} ${v.model}` : '-'}
                      {v && <span className="tl-row__sub">{`${v.year} · ${tx(v.color)}`}</span>}
                    </span>
                    {v && <FlagDots flags={vFlags(v, s)} />}
                    <Icon name="chevron-right" size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {p.notes.length > 0 && (
        <Section title={t('tools.p.notes')} icon="list">
          <ul className="tl-notes">
            {p.notes.map((n, i) => (
              <li key={i}>{tx(n)}</li>
            ))}
          </ul>
        </Section>
      )}

      <RelatedIncidents incidents={incidents} personId={p.id} />
    </article>
  );
}

export function RelatedIncidents({ incidents, personId }: { incidents: Incident[]; personId?: string }) {
  const t = useT();
  const tx = useTx();
  return (
    <Section title={t('tools.p.incidents')} icon="pin">
      {incidents.length === 0 ? (
        <p className="tl-muted-line">{t('tools.p.noIncidents')}</p>
      ) : (
        <ul className="tl-rows" role="list">
          {incidents.map((inc) => {
            const role = personId ? inc.persons.find((r) => r.personId === personId)?.role : undefined;
            return (
              <li key={inc.id}>
                <button
                  type="button"
                  className="tl-row"
                  onClick={() => {
                    const g = useGame.getState();
                    g.select({ incidentId: inc.id }, 'incident');
                    g.focusMap(inc.location.coord, 15);
                  }}
                >
                  <PriorityChip p={inc.priority} compact />
                  <span className="tl-row__code mono">{inc.code}</span>
                  <span className="tl-row__main">
                    {tx(inc.title)}
                    <span className="tl-row__sub">
                      {inc.number} · {hhmm(inc.createdAt)} · {inc.location.address}
                      {role ? ` · ${t(`tools.p.role.${role}`)}` : ''}
                    </span>
                  </span>
                  <Badge tone={inc.state === 'closed' ? 'neutral' : 'accent'}>{t(`tools.inc.${inc.state}`)}</Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
