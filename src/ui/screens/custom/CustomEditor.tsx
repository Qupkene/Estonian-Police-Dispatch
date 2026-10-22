// The custom game's draft (src/sim/custom.ts): the crews on the left, the prefecture's officers on the right. Used by
// the custom game screen and by the lobby (a room's force). The area is the caller's: this only edits the crews.
import { useMemo, useState } from 'react';
import { useT, useTx } from '@/i18n';
import {
  AUTO_OFFICER_COST,
  budgetOf,
  CREW_SIZE,
  costOf,
  defaultSetup,
  draftPool,
  fitFactor,
  MAX_CREWS,
  responseCount,
  stationsFor,
  TYPE_COST,
  typesFor,
  type CustomCrew,
  type CustomSetup,
  type DraftOfficer,
} from '@/sim/custom';
import type { RegionId, UnitType } from '@/sim/types';
import { Icon, Segmented, Select } from '@/ui/components';
import { UNIT_ICON } from '../career/helpers';
import './custom.css';

type Sort = 'skill' | 'cost' | 'years';

export function CustomEditor({
  regionId,
  sectors,
  value,
  onChange,
  disabled,
}: {
  regionId: RegionId;
  /** The area (empty: the whole prefecture). */
  sectors: string[];
  value: CustomSetup;
  onChange: (v: CustomSetup) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const tx = useTx();
  const pool = draftPool(regionId);
  const types = useMemo(() => typesFor(regionId, sectors), [regionId, sectors]);
  const usual = useMemo(() => defaultSetup(regionId, sectors), [regionId, sectors]);
  const budget = useMemo(() => budgetOf(regionId, sectors), [regionId, sectors]);
  const used = costOf(regionId, value);
  const budgetOn = value.budget !== false;
  const over = budgetOn && used > budget;
  const [sel, setSel] = useState(0);
  const [addType, setAddType] = useState<UnitType>('patrol');
  const [filter, setFilter] = useState<UnitType | ''>('');
  const [sort, setSort] = useState<Sort>('skill');
  const crews = value.crews;
  const cur = crews[Math.min(sel, crews.length - 1)];
  const curIdx = cur ? Math.min(sel, crews.length - 1) : -1;
  const taken = new Map<number, number>();
  crews.forEach(([, , ...p], i) => p.forEach((x) => taken.set(x, i)));

  const set = (next: CustomCrew[]) => onChange({ ...value, crews: next });
  const setCrew = (i: number, c: CustomCrew) => set(crews.map((x, k) => (k === i ? c : x)));
  const add = () => {
    if (disabled || crews.length >= MAX_CREWS) return;
    const st = stationsFor(regionId, sectors, addType)[0];
    if (!st) return;
    set([...crews, [addType, st.id]]);
    setSel(crews.length);
  };
  const remove = (i: number) => {
    set(crews.filter((_, k) => k !== i));
    setSel((x) => Math.max(0, x > i ? x - 1 : x === i ? x - 1 : x));
  };
  // Swapping an automatic crew for drafted officers changes the cost by the difference.
  const costAfterPick = (o: DraftOfficer) => {
    if (!cur) return used;
    const [type, , ...p] = cur;
    return p.length ? used + o.cost : used - CREW_SIZE[type].auto * AUTO_OFFICER_COST + o.cost;
  };
  const pick = (o: DraftOfficer) => {
    if (disabled || !cur || taken.has(o.index)) return;
    const [type, st, ...p] = cur;
    if (p.length >= CREW_SIZE[type].max) return;
    setCrew(curIdx, [type, st, ...p, o.index]);
  };
  const drop = (i: number, idx: number) => {
    const [type, st, ...p] = crews[i];
    setCrew(i, [type, st, ...p.filter((x) => x !== idx)]);
  };

  const list = pool
    .filter((o) => !filter || o.specialty === filter)
    .slice()
    .sort(
      (a, b) =>
        (sort === 'cost' ? b.cost - a.cost : sort === 'years' ? b.years - a.years : b.skill - a.skill) ||
        a.index - b.index,
    );

  const pct = (x: number) => `${Math.round(x * 100)}`;
  const name = (o: DraftOfficer) => `${o.firstName} ${o.lastName}`;

  return (
    <div className="vk-cu" aria-disabled={disabled || undefined}>
      {/* ── Crews ── */}
      <section className="vk-panel vk-cu__crews" aria-labelledby="vk-cu-crews">
        <div className="vk-panel__head">
          <h2 className="vk-h" id="vk-cu-crews">
            {t('custom.crews')}
          </h2>
          <span className="vk-count">{crews.length}</span>
          <div className="vk-cu__presets">
            <button
              type="button"
              className="vk-linkbtn"
              disabled={disabled}
              onClick={() => onChange({ ...usual, budget: value.budget })}
            >
              {t('custom.preset.standard')}
            </button>
            <button type="button" className="vk-linkbtn" disabled={disabled} onClick={() => set([])}>
              {t('custom.preset.clear')}
            </button>
          </div>
        </div>

        <div className="vk-cu__budget">
          <div className="vk-cu__budgetHead">
            <span className="vk-label">{t('custom.budget')}</span>
            <Segmented<'on' | 'off'>
              size="sm"
              label={t('custom.budget')}
              value={budgetOn ? 'on' : 'off'}
              onChange={(v) => !disabled && onChange({ ...value, budget: v === 'on' })}
              options={[
                { value: 'on', label: t('custom.budgetOn'), disabled },
                { value: 'off', label: t('custom.budgetOff'), disabled },
              ]}
            />
            <span className={`vk-mono vk-cu__budgetN${over ? ' is-bad' : ''}`} data-testid="custom-budget">
              {t('custom.budgetUsed', { used, max: budget })}
            </span>
          </div>
          {budgetOn && (
            <div className="vk-cu__bar" role="img" aria-label={t('custom.budgetUsed', { used, max: budget })}>
              <span
                style={{ width: `${Math.min(100, (used / Math.max(1, budget)) * 100)}%` }}
                className={over ? 'is-bad' : undefined}
              />
            </div>
          )}
          <p className="vk-cu__hint">
            {over ? <strong className="vk-cu__bad">{t('custom.overBudget')}</strong> : t('custom.budgetHint')}
          </p>
          <p className="vk-cu__hint">
            {t('custom.usual', {
              n: usual.crews.length,
              r: responseCount(usual),
              mine: crews.length,
              mineR: responseCount(value),
            })}
          </p>
        </div>

        <div className="vk-cu__add">
          <Select<UnitType>
            label={<span className="vk-sr">{t('custom.addType')}</span>}
            value={types.includes(addType) ? addType : types[0]}
            disabled={disabled}
            onChange={setAddType}
            options={types.map((ty) => ({
              value: ty,
              label: t('custom.typeCost', { type: t(`shell.unit.${ty}`), n: TYPE_COST[ty] }),
            }))}
          />
          <button
            type="button"
            className="vk-btn"
            disabled={disabled || crews.length >= MAX_CREWS}
            onClick={() => {
              if (!types.includes(addType) && types[0]) setAddType(types[0]);
              add();
            }}
          >
            <Icon name="plus" size={14} /> {t('custom.add')}
          </button>
        </div>

        {crews.length === 0 ? (
          <p className="vk-panel__body vk-dim">{t('custom.empty')}</p>
        ) : (
          <ol className="vk-cu__list" data-testid="custom-crews">
            {crews.map((c, i) => {
              const [type, st, ...p] = c;
              const stations = stationsFor(regionId, sectors, type);
              const size = CREW_SIZE[type];
              const on = i === curIdx;
              return (
                <li key={i} className={`vk-cu__crew${on ? ' is-on' : ''}`} onClick={() => setSel(i)}>
                  <div className="vk-cu__crewHead">
                    <button
                      type="button"
                      className="vk-cu__select"
                      aria-pressed={on}
                      onClick={() => setSel(i)}
                    >
                      <Icon name={UNIT_ICON[type]} size={15} />
                      <strong>{t(`shell.unit.${type}`)}</strong>
                    </button>
                    {stations.length > 1 ? (
                      <Select<string>
                        label={<span className="vk-sr">{t('custom.station')}</span>}
                        value={st}
                        disabled={disabled}
                        onChange={(id) => setCrew(i, [type, id, ...p])}
                        options={stations.map((x) => ({ value: x.id, label: tx(x.name) }))}
                      />
                    ) : (
                      <span className="vk-cu__station">{stations[0] ? tx(stations[0].name) : st}</span>
                    )}
                    <button
                      type="button"
                      className="vk-cu__x"
                      disabled={disabled}
                      aria-label={t('custom.remove')}
                      title={t('custom.remove')}
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(i);
                      }}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                  <div className="vk-cu__officers">
                    {p.length === 0 ? (
                      <span className="vk-dim">{t('custom.auto', { n: size.auto })}</span>
                    ) : (
                      p.map((idx) => {
                        const o = pool[idx];
                        if (!o) return null;
                        const fit = fitFactor(o.specialty, type);
                        return (
                          <span
                            key={idx}
                            className={`vk-cu__chip${fit < 1 ? ' is-off' : ''}`}
                            title={
                              fit < 1 ? t('custom.offFit', { p: Math.round((1 - fit) * 100) }) : undefined
                            }
                          >
                            {o.firstName[0]}. {o.lastName}
                            <span className="vk-mono">{pct(o.skill * fit)}</span>
                            <button
                              type="button"
                              disabled={disabled}
                              aria-label={t('custom.dropOfficer', { name: name(o) })}
                              onClick={(e) => {
                                e.stopPropagation();
                                drop(i, idx);
                              }}
                            >
                              <Icon name="x" size={11} />
                            </button>
                          </span>
                        );
                      })
                    )}
                    <span className="vk-cu__slots vk-mono">
                      {t('custom.slots', { n: p.length, max: size.max })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* ── The draft pool ── */}
      <section className="vk-panel vk-cu__pool" aria-labelledby="vk-cu-pool">
        <div className="vk-panel__head">
          <h2 className="vk-h" id="vk-cu-pool">
            {t('custom.pool')}
          </h2>
          <span className="vk-count">{pool.length}</span>
        </div>
        <p className="vk-cu__hint">{t('custom.poolHint')}</p>
        <div className="vk-cu__filters">
          <Select<string>
            label={<span className="vk-sr">{t('custom.filter')}</span>}
            value={filter}
            onChange={(v) => setFilter(v as UnitType | '')}
            options={[
              { value: '', label: t('custom.filterAll') },
              ...[...new Set(pool.map((o) => o.specialty))].map((s) => ({
                value: s,
                label: t(`career.spec.${s}`),
              })),
            ]}
          />
          <Segmented<Sort>
            size="sm"
            label={t('custom.sort')}
            value={sort}
            onChange={setSort}
            options={(['skill', 'cost', 'years'] as Sort[]).map((s) => ({
              value: s,
              label: t(`custom.sort.${s}`),
            }))}
          />
        </div>
        <table className="vk-table vk-cu__table">
          <caption className="vk-sr">{t('custom.pool')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('custom.col.name')}</th>
              <th scope="col">{t('custom.col.spec')}</th>
              <th scope="col" className="is-num">
                {t('custom.col.years')}
              </th>
              <th scope="col" className="is-num">
                {t('custom.col.skill')}
              </th>
              <th scope="col" className="is-num">
                {t('custom.col.cost')}
              </th>
              <th scope="col">
                <span className="vk-sr">{t('custom.pick')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => {
              const inCrew = taken.get(o.index);
              const full = !!cur && cur.length - 2 >= CREW_SIZE[cur[0]].max;
              const dear = budgetOn && costAfterPick(o) > budget;
              const why =
                inCrew !== undefined
                  ? t('custom.taken')
                  : !cur
                    ? t('custom.noCrew')
                    : full
                      ? t('custom.full')
                      : dear
                        ? t('custom.tooDear')
                        : '';
              const fit = cur ? fitFactor(o.specialty, cur[0]) : 1;
              return (
                <tr key={o.index} className={inCrew !== undefined ? 'is-taken' : undefined}>
                  <th scope="row">
                    <span className="vk-cu__name">{name(o)}</span>
                    <span className="vk-cu__rank">{tx(o.rank)}</span>
                  </th>
                  <td>
                    {t(`career.specShort.${o.specialty}`)}
                    {cur && fit < 1 && inCrew === undefined && (
                      <span className="vk-cu__off"> −{Math.round((1 - fit) * 100)} %</span>
                    )}
                  </td>
                  <td className="is-num vk-mono">{t('custom.yearsN', { n: o.years })}</td>
                  <td className="is-num">
                    <span className="vk-cu__skill">
                      <span style={{ width: `${pct(o.skill)}%` }} />
                    </span>
                    <span className="vk-mono">{pct(o.skill)}</span>
                  </td>
                  <td className="is-num vk-mono">{o.cost}</td>
                  <td className="vk-cu__act">
                    {why ? (
                      <span className="vk-dim vk-cu__why">{why}</span>
                    ) : (
                      <button type="button" className="vk-btn" disabled={disabled} onClick={() => pick(o)}>
                        {t('custom.pick')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
