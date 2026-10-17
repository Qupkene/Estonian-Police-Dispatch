/**
 * Road worker: loads roads-v1.bin and buildings-v1.bin once and answers route and snap requests off
 * the main thread (A* over a whole region can take tens of milliseconds). Protocol: src/map/roads.ts.
 */
import { computeRoute, loadRoadData, snapPoint, type LoadResult } from './roadGraph';
import type { WorkerReply, WorkerRequest } from './roads';

const ctx = self as unknown as {
  postMessage(msg: WorkerReply, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null;
};

let loading: Promise<LoadResult> | null = null;

async function handle(m: WorkerRequest): Promise<void> {
  if (m.type === 'init') {
    loading ??= loadRoadData(m.base, (url, init) => fetch(url, init));
    const r = await loading;
    ctx.postMessage({ type: 'ready', roads: r.roads, buildings: r.buildings });
    return;
  }
  const r = loading ? await loading : null;
  const data = r?.data ?? null;
  if (m.type === 'route') {
    if (!data) {
      ctx.postMessage({ type: 'route', id: m.id, answer: { from: m.from, to: m.to, path: null } });
      return;
    }
    const answer = computeRoute(data, m.from, m.fromSnap, m.to, m.toSnap);
    const transfer: Transferable[] = answer.path
      ? [answer.path.lon.buffer, answer.path.lat.buffer, answer.path.cum.buffer]
      : [];
    ctx.postMessage({ type: 'route', id: m.id, answer }, transfer);
    return;
  }
  if (m.type === 'snap') {
    let p = null;
    try {
      p = data ? snapPoint(data, m.p, m.kind) : null;
    } catch {
      p = null;
    }
    ctx.postMessage({ type: 'snap', id: m.id, p });
  }
}

ctx.onmessage = (ev) => {
  handle(ev.data).catch(() => {
    const m = ev.data;
    if (m.type === 'route')
      ctx.postMessage({ type: 'route', id: m.id, answer: { from: m.from, to: m.to, path: null } });
    else if (m.type === 'snap') ctx.postMessage({ type: 'snap', id: m.id, p: null });
    else ctx.postMessage({ type: 'ready', roads: 'network', buildings: 'network' });
  });
};
