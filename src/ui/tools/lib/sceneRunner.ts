// Director "Stseenid" runner: a real-time setTimeout chain that spawns incidents and radio lines (cancellable).
import type { LngLat, SimState, UnitType } from '@/sim/types';
import { TEMPLATES } from '@/data/incidents';
import { acknowledge, directorRadio, directorSpawn, dispatchUnits } from '@/sim/commands';
import { useGame } from '@/store/game';
import { useDirector } from '../directorStore';
import { safe } from './helpers';
import { bestUnits, regionOf, run } from './engine';
import { fillUnits, pickTemplate, resolveWhere, type Scene, type SceneStep } from './scenes';

let timers: ReturnType<typeof setTimeout>[] = [];

export function stopScene(): void {
  timers.forEach(clearTimeout);
  timers = [];
  useDirector.getState().setScene(null);
}

function distKm(a: LngLat, b: LngLat): number {
  const dx = (a[0] - b[0]) * 111.32 * Math.cos((a[1] * Math.PI) / 180);
  const dy = (a[1] - b[1]) * 111.32;
  return Math.hypot(dx, dy);
}

const SCENE_TYPES: UnitType[] = ['patrol', 'rapid', 'traffic', 'k9', 'community'];

function sceneUnits(s: SimState, center: LngLat): Record<string, string> {
  const list = s.unitOrder
    .map((id) => s.units[id])
    .filter((u) => u && u.status !== 'offduty' && !u.onCall && SCENE_TYPES.includes(u.type))
    .sort((a, b) => Number(b.type === 'patrol') - Number(a.type === 'patrol') || distKm(a.pos, center) - distKm(b.pos, center));
  const name = regionOf(s).radioName || 'Patrull';
  const out: Record<string, string> = {};
  for (let i = 0; i < 3; i++) out[`u${i + 1}`] = list[i]?.callsign ?? `${name} ${21 + i}`;
  return out;
}

function jitter(c: LngLat, i: number): LngLat {
  const a = (i * 2.399) % (Math.PI * 2);
  return [c[0] + Math.cos(a) * 0.0006, c[1] + Math.sin(a) * 0.0004];
}

/** Run one scene step against the shift the scene was started in; any other shift (or none) ends the scene. */
function execStep(st: SceneStep, units: Record<string, string>, i: number, simRef: SimState): void {
  const g = useGame.getState();
  const s = g.sim;
  if (!s || s.ended || s !== simRef || s.mode !== 'director') {
    stopScene();
    return;
  }
  const center = regionOf(s).center;
  if (st.kind === 'focus') {
    g.focusMap(resolveWhere(st.where, s.regionId, center), st.zoom);
  } else if (st.kind === 'incident') {
    const tpl = pickTemplate(TEMPLATES, st.pick);
    if (!tpl) return;
    const id = run((sim) => directorSpawn(sim, { templateId: tpl.id, coord: jitter(resolveWhere(st.where, s.regionId, center), i), priority: st.priority, summary: st.summary }));
    if (id && st.dispatch) {
      run((sim) => {
        safe(() => acknowledge(sim, id), undefined);
        const ids = bestUnits(sim, id, st.dispatch ?? 1);
        if (ids.length) dispatchUnits(sim, id, ids);
        // The first dispatched crews become {u1}/{u2} so the radio lines match what happens on the map.
        if (!units._bound) {
          const sent = (sim.incidents[id]?.assigned.length ? sim.incidents[id].assigned : ids).map((uid) => sim.units[uid]?.callsign).filter(Boolean);
          sent.slice(0, 3).forEach((cs, k) => (units[`u${k + 1}`] = cs as string));
          if (sent.length) units._bound = '1';
        }
      });
    }
  } else {
    const from = st.from.replace(/\{(u\d)\}/g, (m, k: string) => units[k] ?? m);
    run((sim) => directorRadio(sim, from, fillUnits(st.text, units), st.level));
  }
}

export function playScene(sc: Scene): void {
  stopScene();
  const s = useGame.getState().sim;
  if (!s || s.mode !== 'director') return;
  const first = sc.steps.find((st) => st.kind !== 'radio') as Exclude<SceneStep, { kind: 'radio' }> | undefined;
  const center = first ? resolveWhere(first.where, s.regionId, regionOf(s).center) : regionOf(s).center;
  const units = sceneUnits(s, center);
  const total = sc.steps.length;
  let done = 0;
  useDirector.getState().setScene({ id: sc.id, step: 0, total });
  sc.steps.forEach((st, i) => {
    timers.push(
      setTimeout(() => {
        execStep(st, units, i, s);
        if (!timers.length) return; // the scene was stopped (shift changed)
        done++;
        useDirector.getState().setScene(done >= total ? null : { id: sc.id, step: done, total });
        if (done >= total) timers = [];
      }, st.at * 1000),
    );
  });
}
