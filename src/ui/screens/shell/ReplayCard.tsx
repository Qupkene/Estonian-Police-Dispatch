// Kordus (2.39.0, docs/REPLAY.md): the report's way into the shift's replay. A picture of the shift as a long exposure
// (every drive of every crew on the menus' map of Estonia: the blue-light runs bright, the patrols faint, pursuits red,
// the incidents as dots), what it holds, and the button.
import { useMemo } from 'react';
import { REGIONS } from '@/data/regions';
import { useT } from '@/i18n';
import type { ShiftReplay } from '@/sim/replay';
import { replayCounts } from '@/sim/replayFrame';
import type { LngLat } from '@/sim/types';
import { Icon } from '@/ui/components';
import { baseMap, fitView, project } from './dutyMap';
import './replayCard.css';

const W = 440;
const H = 248;

/**
 * Where the shift happened: the incidents and the drives to them (patrols and returns wander, so they do not widen
 * it), the outermost few left out, with a little room around; never closer than a town's size.
 */
function boundsOf(rep: ShiftReplay): [LngLat, LngLat] {
  const pts: LngLat[] = [];
  for (const x of rep.incidents) if (x.shown !== undefined && x.closedBy !== 'duplicate' && x.closedBy !== 'prank') pts.push(x.coord);
  for (const u of rep.units)
    for (const m of u.mv) if (m.p.length > 1 && (m.u === 'incident' || m.u === 'pursuit')) pts.push(m.p[0], m.p[m.p.length - 1]);
  if (pts.length < 2)
    for (const u of rep.units) for (const m of u.mv) if (m.p.length > 1) pts.push(...m.p);
  const ok = pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (ok.length < 2) return REGIONS[rep.regionId]?.bounds ?? [[21.7, 57.45], [28.25, 59.75]];
  const lon = ok.map((p) => p[0]).sort((a, b) => a - b);
  const lat = ok.map((p) => p[1]).sort((a, b) => a - b);
  // The outermost 3 % on each side (a crew sent across the prefecture once) do not decide the picture.
  const cut = ok.length >= 20 ? Math.floor(ok.length * 0.03) : 0;
  const [w, e] = [lon[cut], lon[lon.length - 1 - cut]];
  const [s, n] = [lat[cut], lat[lat.length - 1 - cut]];
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const hw = Math.max(((e - w) / 2) * 1.12, 0.05);
  const hh = Math.max(((n - s) / 2) * 1.12, 0.025);
  return [
    [cx - hw, cy - hh],
    [cx + hw, cy + hh],
  ];
}

const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');

export function ReplayThumb({ rep }: { rep: ShiftReplay }) {
  const t = useT();
  const pic = useMemo(() => {
    const view = fitView(boundsOf(rep), W, H, 16);
    const base = baseMap(view);
    const P = (p: LngLat) => project(view, p);
    const calm: string[] = [];
    const runs: string[] = [];
    const chase: string[] = [];
    const carry: string[] = [];
    for (const u of rep.units)
      for (const m of u.mv) {
        if (m.p.length < 2) continue;
        const d = path(m.p.map(P));
        if (m.u === 'pursuit') chase.push(d);
        else if (m.u === 'transport') carry.push(d);
        else if (m.u === 'incident') runs.push(d);
        else calm.push(d);
      }
    const tracks = rep.incidents.flatMap((x) => (x.pu ?? []).map((q) => path(q.pts.map((p) => P([p[1], p[2]])))));
    const dots = rep.incidents
      .filter((x) => x.shown !== undefined && x.closedBy !== 'duplicate' && x.closedBy !== 'prank')
      .map((x) => ({ id: x.id, p: P(x.coord), prio: x.truePriority }));
    const crisis = rep.crisis ? P(rep.crisis.center) : null;
    return { base, calm: calm.join(''), runs: runs.join(''), chase: chase.join(''), carry: carry.join(''), tracks, dots, crisis };
  }, [rep]);
  const b = pic.base;
  return (
    <svg className="vk-rthumb" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('replay.card.alt')}>
      <rect width={W} height={H} className="vk-rthumb__sea" />
      <path d={b.neighbours} className="vk-rthumb__nb" />
      <path d={b.land} className="vk-rthumb__land" />
      <path d={b.lakes} className="vk-rthumb__sea" />
      <path d={b.roadsLocal} className="vk-rthumb__road is-local" />
      <path d={b.roadsMain} className="vk-rthumb__road" />
      <path d={b.coast} className="vk-rthumb__coast" />
      <g className="vk-rthumb__light">
        <path d={pic.calm} className="vk-rthumb__calm" />
        <path d={pic.carry} className="vk-rthumb__carry" />
        <path d={pic.runs} className="vk-rthumb__glow" />
        <path d={pic.runs} className="vk-rthumb__run" />
        <path d={pic.chase} className="vk-rthumb__chase" />
        {pic.tracks.map((d, i) => (
          <path key={i} d={d} className="vk-rthumb__track" />
        ))}
      </g>
      {pic.dots.map((x) => (
        <circle key={x.id} cx={x.p[0]} cy={x.p[1]} r={x.prio === 1 ? 3 : 2.2} className={`vk-rthumb__inc is-p${x.prio}`} />
      ))}
      {pic.crisis && <circle cx={pic.crisis[0]} cy={pic.crisis[1]} r={9} className="vk-rthumb__crisis" />}
    </svg>
  );
}

export function ReplayCard({ rep, onOpen }: { rep: ShiftReplay; onOpen: () => void }) {
  const t = useT();
  const c = replayCounts(rep);
  const n = (key: string, v: number) => t(v === 1 ? `${key}.one` : key, { n: v });
  const counts = [
    ...(c.calls ? [n('replay.card.calls', c.calls)] : []),
    n('replay.card.sends', c.sends),
    ...(c.pursuits ? [n('replay.card.pursuits', c.pursuits)] : []),
    ...(c.km ? [t('replay.card.km', { n: c.km })] : []),
  ].join(' · ');
  return (
    <section className="vk-panel vk-rcard" aria-labelledby="vk-rcard-title" data-testid="replay-card">
      <button type="button" className="vk-rcard__pic" onClick={onOpen} aria-label={t('replay.card.watch')}>
        <ReplayThumb rep={rep} />
        <span className="vk-rcard__playIcon" aria-hidden="true">
          <Icon name="play" size={22} />
        </span>
      </button>
      <div className="vk-rcard__body">
        <h2 className="vk-h" id="vk-rcard-title">
          {t('replay.card.title')}
        </h2>
        <p className="vk-rcard__text">{t('replay.card.text')}</p>
        <p className="vk-rcard__counts vk-mono">{counts}</p>
        <button type="button" className="vk-btn vk-btn--primary vk-rcard__go" onClick={onOpen} data-testid="replay-open">
          <Icon name="play" size={14} />
          <span>{t('replay.card.watch')}</span>
        </button>
      </div>
    </section>
  );
}
