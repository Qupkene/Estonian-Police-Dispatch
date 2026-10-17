// "Statistika": the tab that was empty in 2024. Live shift dashboard. Owned by ui-tools.
import type { IncidentCategory, Priority, SimState } from '@/sim/types';
import { HOUR, MIN, hhmm, wall } from '@/sim/time';
import { useGame } from '@/store/game';
import { useLang, useT } from '@/i18n';
import { Empty, Icon, Meter, PriorityChip } from '@/ui/components';
import { allocateSlots, dec } from './lib/chart';
import { DEFAULT_SLA, PRIORITIES, visibleIncidents } from './lib/helpers';
import { sampleSim, samplesFor, STATUS_GROUPS, shiftKey } from './lib/samples';
import { useSim } from './lib/engine';
import { BarList, Bullets, Donut, Legend, LineChart, StackedArea, StackedBars, type BulletRow } from './stats/Charts';
import './tools.css';

// Sample unit status + trust every 10 game-minutes, even while the tab is closed.
const unsubSampler = useGame.subscribe((g, prev) => {
  if (g.sim && g.tick !== prev.tick) sampleSim(g.sim);
});
if (import.meta.hot) import.meta.hot.dispose(() => unsubSampler());

const PRIO_COLOR: Record<Priority, string> = { 1: 'var(--p1)', 2: 'var(--p2)', 3: 'var(--p3)', 4: 'var(--p4)' };
const STATUS_COLOR: Record<(typeof STATUS_GROUPS)[number], string> = {
  available: 'var(--st-available)',
  enroute: 'var(--st-enroute)',
  onscene: 'var(--st-onscene)',
  transport: 'var(--st-transport)',
  busy: 'var(--st-busy)',
  break: 'var(--st-break)',
  other: 'var(--st-offduty)',
};
const CAT_SLOTS = 5;
const slotMemory = new Map<string, Record<string, number>>();

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function StatsPanel() {
  const t = useT();
  const lang = useLang();
  const sim = useSim();
  if (!sim) {
    return (
      <div className="tl-stats">
        <Empty icon="stats" title={t('tools.stats.title')}>
          {t('tools.noSim')}
        </Empty>
      </div>
    );
  }
  return <Dashboard sim={sim} lang={lang} />;
}

function Dashboard({ sim: s, lang }: { sim: SimState; lang: 'et' | 'en' }) {
  const t = useT();
  const incs = visibleIncidents(s);
  const open = incs.filter((i) => i.state !== 'closed');
  const closed = incs.length - open.length;
  const p1open = open.filter((i) => i.priority === 1).length;

  // response times per priority
  const resp: Record<Priority, number[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of PRIORITIES) {
    const fromStats = s.stats?.responseTimes?.[p];
    resp[p] = fromStats && fromStats.length ? fromStats : incs.filter((i) => i.priority === p && i.firstArrivalAt).map((i) => ((i.firstArrivalAt as number) - i.createdAt) / MIN);
  }
  const allResp = PRIORITIES.flatMap((p) => resp[p]);
  const avgAll = mean(allResp);

  // per hour × priority
  const nH = Math.max(1, Math.ceil((s.endTime - s.startTime) / HOUR));
  const rows = Array.from({ length: nH }, () => [0, 0, 0, 0]);
  for (const i of incs) {
    const h = Math.min(nH - 1, Math.max(0, Math.floor((i.createdAt - s.startTime) / HOUR)));
    rows[h][i.priority - 1]++;
  }
  const hourLabel = (h: number) => String(wall(s.startTime + h * HOUR).hour).padStart(2, '0');

  // categories (top 5 + other, stable colour slots)
  const catCount = new Map<IncidentCategory, number>();
  for (const i of incs) catCount.set(i.category, (catCount.get(i.category) ?? 0) + 1);
  const cats = [...catCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = cats.slice(0, CAT_SLOTS).map(([c]) => c);
  const key = shiftKey(s);
  const slots = allocateSlots(slotMemory.get(key) ?? {}, top, CAT_SLOTS);
  slotMemory.set(key, slots);
  const otherN = cats.slice(CAT_SLOTS).reduce((a, [, n]) => a + n, 0);
  const donutItems = [
    ...top.map((c) => ({ key: c, label: t(`tools.cat.${c}`), value: catCount.get(c) ?? 0, color: `var(--tl-cat-${(slots[c] ?? 0) + 1})` })),
    ...(otherN ? [{ key: 'other', label: t('tools.stats.other'), value: otherN, color: 'var(--tl-cat-other)' }] : []),
  ];

  // bullets
  const bulletRows: BulletRow[] = PRIORITIES.map((p) => {
    const slas = incs.filter((i) => i.priority === p && i.slaMin > 0).map((i) => i.slaMin);
    const target = Math.round(mean(slas) ?? DEFAULT_SLA[p]);
    const avg = mean(resp[p]);
    const med = median(resp[p]);
    const tone: BulletRow['tone'] = avg === null ? 'none' : avg <= target ? 'ok' : avg <= target * 1.5 ? 'warn' : 'danger';
    const statusIcon = tone === 'ok' ? 'check' : tone === 'warn' ? 'warning' : tone === 'danger' ? 'alert' : null;
    const statusText =
      tone === 'ok' ? t('tools.stats.withinSla') : tone === 'warn' ? t('tools.stats.overSla') : tone === 'danger' ? t('tools.stats.farOverSla') : t('tools.stats.noData');
    return {
      key: String(p),
      label: <PriorityChip p={p} />,
      value: avg,
      target,
      tone,
      valueText: avg === null ? '-' : `${dec(avg, 1, lang)} min`,
      status: (
        <span className={`tl-sla tl-sla--${tone}`}>
          {statusIcon && <Icon name={statusIcon} size={11} />}
          {statusText}
        </span>
      ),
      tipTitle: `P${p} · ${t('tools.stats.sla', { n: target })}`,
      tipRows: [
        { color: 'var(--text-1)', label: t('tools.stats.kpi.avgResp'), value: avg === null ? '-' : `${dec(avg, 1, lang)} min` },
        { color: 'var(--text-2)', label: t('tools.stats.median'), value: med === null ? '-' : `${dec(med, 1, lang)} min` },
        { color: 'var(--text-3)', label: t('tools.stats.n', { n: resp[p].length }), value: String(resp[p].length) },
      ],
    };
  });

  // time series
  const samples = samplesFor(s);
  const times = samples.map((x) => x.t);
  const utilRows = samples.map((x) => STATUS_GROUPS.map((g) => x.counts[g]));
  const usedGroups = STATUS_GROUPS.filter((g) => samples.some((x) => x.counts[g] > 0));
  const utilSeries = STATUS_GROUPS.map((g) => ({ key: g, label: t(`tools.stats.status.${g}`), color: STATUS_COLOR[g] }));

  // registry
  const st = s.stats;
  const correct = st?.repliesCorrect ?? 0;
  const wrong = st?.repliesWrong ?? 0;
  const missed = st?.beatsMissed ?? 0;
  const answered = correct + wrong;
  const accuracy = answered ? Math.round((correct / answered) * 100) : null;
  const qTotal = Math.max(st?.queries ?? 0, s.queries.length);

  // areas
  const areaCount = new Map<string, number>();
  for (const i of incs) {
    const k = i.location.district || i.location.city || '-';
    areaCount.set(k, (areaCount.get(k) ?? 0) + 1);
  }
  const areas = [...areaCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));

  const trust = Math.round(s.trust);
  const trustTone = trust >= 60 ? 'ok' : trust >= 35 ? 'warn' : 'danger';

  return (
    <div className="tl-stats">
      <div className="tl-kpis">
        <Kpi label={t('tools.stats.kpi.incidents')} value={String(incs.length)} sub={`${closed} ${t('tools.stats.kpi.closed')}`} />
        <Kpi label={t('tools.stats.kpi.open')} value={String(open.length)} sub={t('tools.stats.kpi.p1', { n: p1open })} alert={p1open > 0} />
        <Kpi label={t('tools.stats.kpi.avgResp')} value={avgAll === null ? '-' : `${dec(avgAll, 1, lang)}`} unit={avgAll === null ? undefined : 'min'} />
        <Kpi label={t('tools.stats.kpi.arrests')} value={String(st?.arrests ?? 0)} />
        <Kpi label={t('tools.stats.kpi.calls')} value={String(st?.callsAnswered ?? 0)} sub={t('tools.stats.kpi.callsSub', { m: st?.callsMissed ?? 0 })} />
        <Kpi label={t('tools.stats.kpi.trust')} value={String(trust)} meter={{ v: trust / 100, tone: trustTone }} />
      </div>

      {incs.length === 0 && (
        <div className="tl-stats__note">
          <Icon name="info" size={14} /> {t('tools.stats.empty')}
        </div>
      )}

      <Card title={t('tools.stats.perHour')} aside={t('tools.stats.total', { n: incs.length })}>
        <StackedBars
          labels={rows.map((_, h) => hourLabel(h))}
          rows={rows}
          series={PRIORITIES.map((p) => ({ key: `p${p}`, label: `P${p}`, color: PRIO_COLOR[p] }))}
          yLabel={t('tools.stats.countAxis')}
          xLabel={t('tools.stats.hourAxis')}
          tipTitle={(h) => `${hourLabel(h)}:00-${hourLabel(h + 1)}:00`}
        />
        <Legend items={PRIORITIES.map((p) => ({ color: PRIO_COLOR[p], label: `P${p}` }))} />
      </Card>

      <Card title={t('tools.stats.byCategory')}>
        {donutItems.length ? (
          <Donut items={donutItems} centerLabel={t('tools.stats.countAxis')} shareFmt={(sh) => `${Math.round(sh * 100)}%`} />
        ) : (
          <p className="tl-muted-line">{t('tools.stats.noData')}</p>
        )}
      </Card>

      <Card title={t('tools.stats.response')} sub={t('tools.stats.responseSub')}>
        <Bullets rows={bulletRows} axis={['0', 'SLA', '2× SLA']} />
      </Card>

      <Card title={t('tools.stats.util')} sub={t('tools.stats.utilSub')}>
        {samples.length < 2 ? (
          <p className="tl-muted-line">{t('tools.stats.collecting')}</p>
        ) : (
          <>
            <StackedArea times={times} rows={utilRows} series={utilSeries} timeLabel={hhmm} yLabel={t('tools.stats.unitsAxis')} />
            <Legend items={usedGroups.map((g) => ({ color: STATUS_COLOR[g], label: t(`tools.stats.status.${g}`), value: String(samples[samples.length - 1].counts[g]) }))} />
          </>
        )}
      </Card>

      <Card title={t('tools.stats.trust')}>
        {samples.length < 2 ? (
          <p className="tl-muted-line">{t('tools.stats.collecting')}</p>
        ) : (
          <LineChart
            times={times}
            values={samples.map((x) => x.trust)}
            domain={[0, 100]}
            color="var(--tl-cat-1)"
            timeLabel={hhmm}
            valueLabel={(v) => String(Math.round(v))}
            seriesLabel={t('tools.stats.kpi.trust')}
          />
        )}
      </Card>

      <Card title={t('tools.stats.registry')} aside={accuracy === null ? undefined : t('tools.stats.accuracy', { p: accuracy })}>
        <div className="tl-reg-stats">
          <div className="tl-reg-stats__tile">
            <span>{t('tools.stats.queries')}</span>
            <b>{qTotal}</b>
          </div>
          <div className="tl-reg-stats__tile">
            <span>{t('tools.stats.correct')}</span>
            <b>{correct}</b>
          </div>
          <div className="tl-reg-stats__tile">
            <span>{t('tools.stats.wrong')}</span>
            <b>{wrong}</b>
          </div>
          <div className="tl-reg-stats__tile">
            <span>{t('tools.stats.missed')}</span>
            <b>{missed}</b>
          </div>
        </div>
        {answered + missed > 0 && (
          <>
            <div className="tl-split" role="img" aria-label={t('tools.stats.registry')}>
              {correct > 0 && <span style={{ flexGrow: correct, background: 'var(--ok)' }} title={`${t('tools.stats.correct')}: ${correct}`} />}
              {wrong > 0 && <span style={{ flexGrow: wrong, background: 'var(--danger)' }} title={`${t('tools.stats.wrong')}: ${wrong}`} />}
              {missed > 0 && <span style={{ flexGrow: missed, background: 'var(--text-3)' }} title={`${t('tools.stats.missed')}: ${missed}`} />}
            </div>
            <Legend
              items={[
                { color: 'var(--ok)', label: t('tools.stats.correct'), value: String(correct) },
                { color: 'var(--danger)', label: t('tools.stats.wrong'), value: String(wrong) },
                { color: 'var(--text-3)', label: t('tools.stats.missed'), value: String(missed) },
              ]}
            />
          </>
        )}
      </Card>

      <Card title={t('tools.stats.areas')}>
        {areas.length ? <BarList items={areas} color="var(--tl-cat-1)" /> : <p className="tl-muted-line">{t('tools.stats.noData')}</p>}
      </Card>
    </div>
  );
}

function Card({ title, sub, aside, children }: { title: string; sub?: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className="tl-scard">
      <header className="tl-scard__head">
        <h4>{title}</h4>
        {aside && <span className="tl-scard__aside">{aside}</span>}
      </header>
      {sub && <p className="tl-scard__sub">{sub}</p>}
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  unit,
  sub,
  alert,
  meter,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  alert?: boolean;
  meter?: { v: number; tone: 'ok' | 'warn' | 'danger' };
}) {
  return (
    <div className={`tl-kpi${alert ? ' is-alert' : ''}`}>
      <span className="tl-kpi__label">{label}</span>
      <span className="tl-kpi__value">
        {value}
        {unit && <small> {unit}</small>}
      </span>
      {sub && <span className="tl-kpi__sub">{sub}</span>}
      {meter && <Meter value={meter.v} tone={meter.tone} size="sm" label={label} />}
    </div>
  );
}
