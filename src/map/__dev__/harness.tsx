/* Dev-only visual harness for MapView with a fake, self-animating SimState. Not imported by the app. */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@/ui/styles/global.css';
import { MapView } from '@/map/MapView';
import { REGIONS } from '@/data/regions';
import { TEMPLATES } from '@/data/incidents';
import { cumulative, along, destination } from '@/sim/geo';
import type { Incident, LngLat, SimState, Unit, UnitStatus, UnitType, Weather } from '@/sim/types';
import type { MapStyleKey } from '@/store/settings';

const q = new URLSearchParams(location.search);
const styleKey = (q.get('style') ?? 'tactical') as MapStyleKey;
const hour = Number(q.get('hour') ?? 11);
const weatherKind = (q.get('weather') ?? 'clear') as Weather['kind'];

// Fake stations (the real region data is filled in by another module).
const pohja = REGIONS.pohja;
if (!pohja.stations.length) {
  pohja.stations.push(
    { id: 'hq', name: { et: 'Põhja prefektuur', en: 'North Prefecture' }, short: 'Põhja PREF', kind: 'hq', city: 'Tallinn', address: 'Kolde pst 65', coord: [24.6995, 59.4395] },
    { id: 'lasn', name: { et: 'Lasnamäe politseijaoskond', en: 'Lasnamäe station' }, short: 'Lasnamäe PJ', kind: 'station', city: 'Tallinn', address: 'P. Pinna 4', coord: [24.8275, 59.4325] },
    { id: 'kesk', name: { et: 'Kesklinna politseijaoskond', en: 'Kesklinn station' }, short: 'Kesklinna PJ', kind: 'station', city: 'Tallinn', address: 'Kolde pst 65', coord: [24.757, 59.428] },
    { id: 'keila', name: { et: 'Keila politseijaoskond', en: 'Keila station' }, short: 'Keila PJ', kind: 'station', city: 'Keila', address: 'Keskväljak', coord: [24.4135, 59.3035] },
    { id: 'rapla', name: { et: 'Rapla politseijaoskond', en: 'Rapla station' }, short: 'Rapla PJ', kind: 'station', city: 'Rapla', address: '', coord: [24.79, 58.999] },
  );
}

const T0 = Date.UTC(2026, 9, 17, hour - 3, 0); // 17.10.2026 hh:00 Tallinn (UTC+3 in October)

function mkUnit(id: string, callsign: string, type: UnitType, status: UnitStatus, pos: LngLat, path?: LngLat[], siren = false, durMin = 12): Unit {
  const u: Unit = {
    id,
    callsign,
    type,
    stationId: 'lasn',
    zone: 'mainland',
    vehicle: 'Škoda Superb Combi',
    crew: [],
    status,
    statusSince: T0,
    pos,
    heading: 0,
    fatigue: 0.1,
    breaks: 0,
    handled: 0,
  };
  if (path) u.move = { purpose: 'incident', path, cum: cumulative(path), departAt: T0, arriveAt: T0 + durMin * 60_000, siren };
  return u;
}

const LASN: LngLat = [24.8275, 59.4325];
const i1c: LngLat = [24.872, 59.441];
const i2c: LngLat = [24.745, 59.437];
const units: Unit[] = [
  { ...mkUnit('u1', 'Põhja 21', 'patrol', 'enroute', LASN, [LASN, [24.85, 59.44], i1c], true, 6), incidentId: 'i1' },
  mkUnit('u2', 'Põhja 22', 'patrol', 'enroute', [24.757, 59.428], [[24.757, 59.428], [24.81, 59.445], i1c], true, 9),
  mkUnit('u3', 'Põhja 23', 'patrol', 'available', [24.66, 59.41], [[24.66, 59.41], [24.62, 59.42], [24.6, 59.4]], false, 20),
  mkUnit('u4', 'K9-1', 'k9', 'available', LASN),
  { ...mkUnit('u5', 'Kärt 1', 'rapid', 'onscene', i2c), incidentId: 'i2' },
  { ...mkUnit('u5b', 'Põhja 25', 'patrol', 'onscene', i2c), incidentId: 'i2' },
  mkUnit('u6', 'LJ-3', 'traffic', 'transport', [24.7, 59.39], [[24.7, 59.39], [24.6995, 59.4395]], false, 15),
  mkUnit('u7', 'KRIM 4', 'criminal', 'busy', [24.757, 59.428]),
  mkUnit('u8', 'Lennuk 1', 'heli', 'enroute', [24.80, 59.415], [[24.80, 59.415], [24.95, 59.52]], true, 8),
  mkUnit('u9', 'Merevalve 2', 'boat', 'available', [24.72, 59.52]),
  mkUnit('u10', 'Abi 7', 'aux', 'break', [24.5, 59.35]),
  mkUnit('u11', 'Piirk 2', 'community', 'offduty', [24.62, 59.33]),
  mkUnit('u12', 'Transp 1', 'transport', 'emergency', [24.69, 59.455]),
  mkUnit('u13', 'K-komando', 'special', 'available', LASN),
  mkUnit('u14', 'Piir 5', 'border', 'available', LASN),
];

const backupTpl = TEMPLATES.find((tp) => tp.beats?.some((b) => b.kind === 'backup'));

function mkInc(id: string, code: string, p: 1 | 2 | 3 | 4, state: Incident['state'], coord: LngLat, extra: Partial<Incident> = {}): Incident {
  return {
    id,
    number: `PÕ-261017-${id}`,
    templateId: 'x',
    category: 'violence',
    code,
    title: { et: `Sündmus ${code}`, en: `Incident ${code}` },
    priority: p,
    truePriority: p,
    state,
    source: 'hk',
    createdAt: T0 - 300_000,
    location: { address: 'Punane tn 16-45, Lasnamäe', coord, city: 'Tallinn', placeKind: 'residential', zone: 'mainland' },
    summary: { et: '', en: '' },
    details: [],
    hiddenDetails: [],
    persons: [],
    vehicles: [],
    assigned: [],
    unitHistory: [],
    need: [],
    ideal: [],
    onSceneMin: 20,
    workDone: 0,
    slaMin: 10,
    beats: [],
    agencyNeeds: [],
    effects: { success: 0, risk: 0, trust: 0, time: 0, arrests: 0 },
    timeline: [],
    tags: [],
    ...extra,
  };
}

const backupIdx = backupTpl?.beats?.findIndex((b) => b.kind === 'backup') ?? -1;
const incidents: Incident[] = [
  mkInc('i1', 'PV', 1, 'dispatched', i1c, { assigned: ['u1', 'u2'] }),
  mkInc('i2', 'KV', 2, 'onscene', i2c, {
    assigned: ['u5', 'u5b'],
    ...(backupTpl ? { templateId: backupTpl.id, beats: [{ index: backupIdx, status: 'active' as const }] } : {}),
  }),
  mkInc('i3', 'VS', 3, 'incoming', [24.67, 59.43]),
  mkInc('i4', 'AK', 4, 'queued', [24.73, 59.395]),
  mkInc('i5', 'LÕ', 3, 'closed', [24.79, 59.405], { closedAt: T0 - 30_000 }),
  mkInc('i6', 'JÄ', 1, 'dispatched', [24.6, 59.38], {
    pursuit: { suspectPos: [24.58, 59.37], heading: 220, speedKmh: 110, startedAt: T0, risk: 0.1, pressure: 0.3, heli: false, spikes: false, trail: [[24.62, 59.39], [24.61, 59.385], [24.6, 59.38], [24.59, 59.375]] },
  }),
  mkInc('i7', 'KI', 2, 'onscene', [24.55, 59.45], { search: { center: [24.55, 59.45], radiusKm: 1.6, progress: 0.4, startedAt: T0 } }),
  mkInc('i8', 'XX', 1, 'incoming', [24.7, 59.45]),
];

// `origin=lon,lat` moves the whole fake scene (units, incidents, stations) there, e.g. onto a test
// PMTiles extract of another city; `free=1` lifts the Estonia-only camera bounds.
const ORIGIN = q.get('origin')?.split(',').map(Number) as LngLat | undefined;
if (ORIGIN && ORIGIN.length === 2 && ORIGIN.every(Number.isFinite)) {
  const dx = ORIGIN[0] - 24.75;
  const dy = ORIGIN[1] - 59.43;
  const sh = (c: LngLat): LngLat => [c[0] + dx, c[1] + dy];
  for (const u of units) {
    u.pos = sh(u.pos);
    if (u.move) {
      u.move.path = u.move.path.map(sh);
      u.move.cum = cumulative(u.move.path);
    }
  }
  for (const i of incidents) {
    i.location = { ...i.location, coord: sh(i.location.coord) };
    if (i.pursuit) i.pursuit = { ...i.pursuit, suspectPos: sh(i.pursuit.suspectPos), trail: i.pursuit.trail.map(sh) };
    if (i.search) i.search = { ...i.search, center: sh(i.search.center) };
  }
  for (const st of pohja.stations) st.coord = sh(st.coord);
}

const sim = {
  version: 2,
  seed: 1,
  rng: 1,
  mode: 'free',
  difficulty: 'normal',
  regionId: 'pohja',
  playerName: 'Test',
  startTime: T0,
  endTime: T0 + 8 * 3600_000,
  now: T0,
  ended: false,
  weather: { kind: weatherKind, tempC: 4, windMs: 6, roadFactor: 1.1, text: { et: '', en: '' } },
  units: Object.fromEntries(units.map((u) => [u.id, u])),
  unitOrder: units.map((u) => u.id),
  incidents: Object.fromEntries(incidents.map((i) => [i.id, i])),
  incidentOrder: incidents.map((i) => i.id),
  persons: {},
  vehicles: {},
  radio: [],
  calls: [],
  bulletins: [],
  queries: [],
  events: [],
  seq: { incident: 9, radio: 0, person: 0, call: 0, bulletin: 0 },
  nextSpawnAt: T0,
  trust: 50,
  stats: {} as SimState['stats'],
  flags: { 'hidden:i8': true },
} as SimState;

// Self-animating "engine": move units along their paths (ping-pong), drive the suspect.
const SPEED = Number(q.get('speed') ?? 15);
let last = performance.now();
function tick(t: number) {
  const dt = Math.min(100, t - last) * SPEED;
  last = t;
  sim.now += dt;
  for (const u of Object.values(sim.units)) {
    const m = u.move;
    if (!m) continue;
    if (sim.now >= m.arriveAt) {
      m.path.reverse();
      m.cum = cumulative(m.path);
      const dur = m.arriveAt - m.departAt;
      m.departAt = sim.now;
      m.arriveAt = sim.now + dur;
    }
    const f = (sim.now - m.departAt) / (m.arriveAt - m.departAt);
    const r = along(m.path, m.cum, f * m.cum[m.cum.length - 1]);
    u.pos = r.pos;
    u.heading = r.heading;
  }
  const p = sim.incidents.i6.pursuit!;
  p.heading += (Math.sin(sim.now / 40_000) * dt) / 4000;
  p.suspectPos = destination(p.suspectPos, (p.speedKmh * dt) / 3600_000 / 4, p.heading);
  if (!p.trail.length || Math.hypot(p.trail[p.trail.length - 1][0] - p.suspectPos[0], p.trail[p.trail.length - 1][1] - p.suspectPos[1]) > 0.002) p.trail.push(p.suspectPos);
  if (p.trail.length > 80) p.trail.shift();
  requestAnimationFrame(tick);
}
if (q.get('freeze') !== '1') requestAnimationFrame(tick);

function App() {
  const [selUnit, setSelUnit] = useState<string | undefined>(q.get('sel') ?? undefined);
  const [selInc, setSelInc] = useState<string | undefined>(q.get('inc') ?? 'i1');
  const [focus, setFocus] = useState<{ coord: LngLat; zoom?: number; n: number } | null>(null);
  const [log, setLog] = useState<string>('');
  const [show, setShow] = useState(true);
  useEffect(() => {
    if (q.get('free') !== '1') return;
    const lift = setInterval(() => {
      const m = (window as unknown as { __epdMap?: { setMaxBounds: (b: null) => void; setMinZoom: (z: number) => void } }).__epdMap;
      if (!m) return;
      m.setMaxBounds(null);
      m.setMinZoom(0);
    }, 50);
    return () => clearInterval(lift);
  }, []);
  useEffect(() => {
    const z = q.get('zoom');
    const c = q.get('center');
    if (z || c || ORIGIN) {
      const t = setTimeout(
        () => setFocus({ coord: (c ? c.split(',').map(Number) : (ORIGIN ?? [24.75, 59.43])) as LngLat, zoom: z ? Number(z) : undefined, n: 1 }),
        300,
      );
      return () => clearTimeout(t);
    }
  }, []);
  (window as unknown as { __h: unknown }).__h = { sim, setSelUnit, setSelInc, setFocus, setShow };
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {show && <MapView
        sim={sim}
        regionId="pohja"
        lang={(q.get('lang') as 'et' | 'en') ?? 'et'}
        styleKey={styleKey}
        selectedIncidentId={selInc}
        selectedUnitId={selUnit}
        highlightUnitIds={['u3', 'u4']}
        focus={focus}
        onSelectUnit={(id) => {
          setSelUnit(id);
          setLog(`unit ${id}`);
        }}
        onSelectIncident={(id) => {
          setSelInc(id);
          setLog(`incident ${id}`);
        }}
        onMapClick={(c) => setLog(`map ${c[0].toFixed(4)},${c[1].toFixed(4)}`)}
        placing={q.get('placing') === '1'}
        cinematic={q.get('cine') === '1'}
      />}
      <div id="harness-log" style={{ position: 'absolute', left: 8, top: 8, color: '#fff', font: '12px monospace', background: '#0008', padding: 4 }}>
        {log}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
