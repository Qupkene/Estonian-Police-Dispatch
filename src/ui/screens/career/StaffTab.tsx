import { useMemo, useState } from 'react';
import { useCareer } from '@/store/career';
import { useLang, useT, useTx } from '@/i18n';
import * as rules from '@/sim/career';
import { Avatar, Badge, Button, Empty, Icon, Meter, Modal, Segmented } from '@/ui/components';
import type { CareerProfile, StaffMember, UnitType } from '@/sim/types';
import * as economy from '@/data/economy';
import { capitalize, fmtMoney, fmtNum, levelTone, pct, safe, sortRows, staffAge, statusTone, UNIT_ICON, type SortDir } from './helpers';

/** Severance in months of salary (data/economy SEVERANCE_MONTHS; 0 if not defined). */
const SEVERANCE = (economy as unknown as { SEVERANCE_MONTHS?: number }).SEVERANCE_MONTHS ?? 0;
import { useToast } from './Toasts';
import { SortHeader, SpecialtyFilter, Stat } from './bits';

type SortKey = 'name' | 'specialty' | 'skill' | 'salary' | 'morale' | 'status' | 'shifts' | 'xp';

export function StaffTab({ profile, goRecruit }: { profile: CareerProfile; goRecruit: () => void }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const notify = useToast();
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'skill', dir: 'desc' });
  const [filter, setFilter] = useState<UnitType | 'all'>('all');
  const [firing, setFiring] = useState<StaffMember | null>(null);
  const [rosterShift, setRosterShift] = useState<'day' | 'night'>('day');
  const staff = profile.staff ?? [];

  const rows = useMemo(() => {
    const list = filter === 'all' ? staff : staff.filter((m) => m.specialty === filter);
    const key = (m: StaffMember): number | string => {
      switch (sort.key) {
        case 'name':
          return `${m.lastName} ${m.firstName}`;
        case 'specialty':
          return m.specialty;
        case 'skill':
          return m.skill;
        case 'salary':
          return m.salary;
        case 'morale':
          return m.morale;
        case 'status':
          return m.status;
        case 'shifts':
          return m.shifts;
        case 'xp':
          return m.xp;
      }
    };
    return sortRows(list, key, sort.dir);
  }, [staff, filter, sort]);

  const roster = useMemo(() => safe(() => rules.rosterFromCareer(profile, rosterShift), null), [profile, rosterShift]);
  const payroll = staff.reduce((s, m) => s + (m.salary || 0), 0);
  const avgSkill = staff.length ? staff.reduce((s, m) => s + m.skill, 0) / staff.length : 0;
  const avgMorale = staff.length ? staff.reduce((s, m) => s + m.morale, 0) / staff.length : 0;
  const counts = staff.reduce<Partial<Record<UnitType, number>>>((acc, m) => ((acc[m.specialty] = (acc[m.specialty] ?? 0) + 1), acc), {});

  const onSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 'asc' ? 'desc' : 'asc') : key === 'name' || key === 'specialty' ? 'asc' : 'desc' }));

  const confirmFire = () => {
    if (!firing) return;
    const who = `${firing.firstName} ${firing.lastName}`;
    try {
      const before = useCareer.getState().profile;
      useCareer.getState().update((p) => rules.fire(p, firing.id));
      const after = useCareer.getState().profile;
      const paid = (after?.money ?? 0) - (before?.money ?? 0);
      if ((after?.staff.length ?? 0) < (before?.staff.length ?? 0)) notify('info', t('career.staff.fired', { name: who }), paid ? t('career.staff.firedSub', { amount: fmtMoney(paid, lang, { sign: true }) }) : undefined);
      else notify('warn', t('career.staff.fireFailed'));
    } catch (err) {
      console.warn('[EPD career] fire failed', err);
      notify('danger', t('career.staff.fireFailed'), t('career.rules.pending'));
    }
    setFiring(null);
  };

  const statusLabel = (m: StaffMember) => {
    const base = t(`career.status.${m.status}`);
    return m.status !== 'active' && m.statusUntil ? t('career.status.until', { status: base, day: m.statusUntil }) : base;
  };

  return (
    <div className="cr-tab">
      <div className="cr-stats">
        <Stat icon="users" label={t('career.staff.headcount')} value={fmtNum(staff.length, lang)} />
        <Stat icon="check" label={t('career.staff.active')} value={fmtNum(staff.filter((m) => m.status === 'active').length, lang)} />
        <Stat icon="ambulance" label={t('career.staff.injured')} value={fmtNum(staff.filter((m) => m.status === 'injured').length, lang)} tone="danger" />
        <Stat icon="gauge" label={t('career.staff.avgSkill')} value={staff.length ? String(pct(avgSkill)) : '-'} />
        <Stat icon="star" label={t('career.staff.avgMorale')} value={staff.length ? `${pct(avgMorale)} %` : '-'} />
        <Stat icon="money" label={t('career.staff.payroll')} value={fmtMoney(payroll, lang)} sub={t('career.perMonth')} />
      </div>

      {staff.length === 0 ? (
        <Empty
          icon="users"
          title={t('career.staff.empty')}
          action={
            <Button variant="primary" icon="plus" onClick={goRecruit}>
              {t('career.staff.toRecruit')}
            </Button>
          }
        >
          {t('career.staff.emptyHint')}
        </Empty>
      ) : (
        <>
          <SpecialtyFilter value={filter} onChange={setFilter} counts={counts} />
          <div className="cr-tablewrap">
            <table className="cr-table cr-table--staff">
              <thead>
                <tr>
                  <SortHeader label={t('career.staff.col.name')} k="name" sort={sort} onSort={onSort} />
                  <th>{t('career.staff.col.badge')}</th>
                  <SortHeader label={t('career.staff.col.specialty')} k="specialty" sort={sort} onSort={onSort} />
                  <SortHeader label={t('career.staff.col.skill')} k="skill" sort={sort} onSort={onSort} />
                  <SortHeader label={t('career.staff.col.salary')} k="salary" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label={t('career.staff.col.morale')} k="morale" sort={sort} onSort={onSort} />
                  <SortHeader label={t('career.staff.col.status')} k="status" sort={sort} onSort={onSort} />
                  <SortHeader label={t('career.staff.col.shifts')} k="shifts" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="XP" k="xp" sort={sort} onSort={onSort} align="right" />
                  <th aria-label={t('career.actions')} />
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className={m.status !== 'active' ? 'is-away' : ''}>
                    <td>
                      <div className="cr-person">
                        <Avatar seed={m.avatarSeed} size={36} gender={m.gender} age={staffAge(m)} uniform />
                        <div>
                          <strong>
                            {m.firstName} {m.lastName}
                          </strong>
                          <span className="dim">{[capitalize(tx(m.title)), tx(m.rank)].filter(Boolean).join(' · ')}</span>
                        </div>
                      </div>
                    </td>
                    <td className="mono">#{m.badge}</td>
                    <td>
                      <span className="cr-spec">
                        <Icon name={UNIT_ICON[m.specialty] ?? 'user'} size={13} />
                        {t(`career.spec.${m.specialty}`)}
                      </span>
                    </td>
                    <td>
                      <div className="cr-meterc">
                        <Meter value={m.skill} tone={levelTone(m.skill)} label={t('career.staff.col.skill')} />
                        <span className="mono">{pct(m.skill)}</span>
                      </div>
                    </td>
                    <td className="mono cr-num">{fmtMoney(m.salary, lang)}</td>
                    <td>
                      <div className="cr-meterc">
                        <Meter value={m.morale} tone={levelTone(m.morale)} label={t('career.staff.col.morale')} />
                        <span className="mono">{pct(m.morale)}</span>
                      </div>
                    </td>
                    <td>
                      <Badge tone={statusTone(m.status)}>{statusLabel(m)}</Badge>
                    </td>
                    <td className="mono cr-num">{fmtNum(m.shifts || 0, lang)}</td>
                    <td className="mono cr-num">{fmtNum(m.xp || 0, lang)}</td>
                    <td className="cr-num">
                      <Button size="sm" variant="ghost" icon="logout" className="cr-firebtn" onClick={() => setFiring(m)}>
                        {t('career.staff.fire')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <section className="cr-sub">
        <header className="cr-sub__head">
          <h3>
            <Icon name="radio" size={14} /> {t('career.roster.title')}
          </h3>
          <Segmented
            size="sm"
            label={t('career.roster.title')}
            value={rosterShift}
            onChange={setRosterShift}
            options={(['day', 'night'] as const).map((k) => ({ value: k, icon: k === 'day' ? 'sun' : 'moon', label: t(`career.roster.${k}`) }))}
          />
        </header>
        {roster === null ? (
          <p className="cr-placeholder">{t('career.rules.pending')}</p>
        ) : roster.length === 0 ? (
          <p className="cr-placeholder">{t('career.roster.empty')}</p>
        ) : (
          <div className="cr-roster">
            {roster.map((u) => (
              <div key={u.callsign} className="cr-crew">
                <div className="cr-crew__head">
                  <span className="cr-crew__call mono">{u.callsign}</span>
                  <span className="cr-spec">
                    <Icon name={UNIT_ICON[u.type] ?? 'car'} size={12} />
                    {t(`career.spec.${u.type}`)}
                  </span>
                  {u.onCall && <Badge tone="warn">{t('career.roster.onCall')}</Badge>}
                </div>
                <div className="cr-crew__veh dim">
                  <Icon name="car" size={12} /> {u.vehicle || '-'}
                </div>
                <div className="cr-crew__members">
                  {u.crew.map((o) => (
                    <span key={o.id} className="cr-crew__member" title={`${o.firstName} ${o.lastName}`}>
                      <Avatar seed={o.avatarSeed} size={22} gender={o.gender} age={30} uniform />
                      {o.firstName[0]}. {o.lastName}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="cr-sub__hint dim">{t('career.roster.hint')}</p>
      </section>

      <Modal
        open={!!firing}
        onClose={() => setFiring(null)}
        title={t('career.staff.fireTitle')}
        tone="danger"
        icon="logout"
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFiring(null)}>
              {t('career.cancel')}
            </Button>
            <Button variant="danger" icon="logout" onClick={confirmFire}>
              {t('career.staff.fireConfirm')}
            </Button>
          </>
        }
      >
        {firing && (
          <div className="cr-confirm">
            <Avatar seed={firing.avatarSeed} size={56} gender={firing.gender} age={staffAge(firing)} uniform />
            <div>
              <p>
                {t('career.staff.fireText', { name: `${firing.firstName} ${firing.lastName}`, badge: firing.badge })}
              </p>
              <p className="dim">{t('career.staff.fireNote', { salary: fmtMoney(firing.salary, lang), severance: fmtMoney(Math.round(firing.salary * SEVERANCE), lang) })}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
