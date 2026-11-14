// Dev-only: plays one camera scenario through the real renderer (see scene.html), for filming whole scenes from
// their start to their end. A street (made up, hand-made or read from a map archive), a cast (by scene kind or from a
// real incident of a shift), the Director, and a situation scripted over time in the address.
//
// The street:
//   place=<PlaceKind>&seed=<n>      a made-up street of a kind of place (procedural.ts)
//   plain=dead|narrow|far|square     a hand-made street: a dead end, a lane 3.6 m wide, the spot far from the road
//   tiles=<lng>,<lat>               a real street read from the archive (archive=<path>, default the Florence one)
// The cast:
//   kind=<SceneKind>&roles=svcw&cars=involved,suspect   roles as letters: s suspect, v victim, c caller, w witness,
//                                    d driver, e extra; flags down, runs, armed, drunk, live=0, single, inRoad, chant,
//                                    riot, carFire, prio=<1..4>
//   tpl=<templateId>                 a real incident: a shift is created, the template spawned and castOf builds it
// The situation (seconds of the scene's clock):
//   u=<id>[:<type>[:<model>]],<side>,c<s>,n<s>,h<s>,l<s>[,t=arrest|hospital|ride]   one unit, repeated for more;
//                                    side a, b (the drive line's ends) or a yaw in radians; n defaults to h - 7
//   ag=<agency>,n<s>,h<s>            another service, repeated for more
//   out=<result>@<s>[,a<n>][,i<n>]   the outcome (closed from then on); closed=<s> closes it without one
//   pursuit=<on>,<over>  search=<from>-<to>  pause=<from>-<to>  open=<s> (the camera opens late: the first update)
// The picture: hour, month, weather, temp, wind as harness.ts; near=<m>&angle&h&fov&at as there; clean=1;
// zoom=<k>&panx=<-1..1>&pany=<-1..1> as the window's own zoom.
// window.__cctv = { ready, step(dt, frames), seek(t) }: seek advances the scene to second t without drawing the
// frames between, then draws one.
import { PMTiles } from 'pmtiles';
import type { Agency, OutcomeResult, PlaceKind, UnitType, Weather } from '@/sim/types';
import { VERSION } from '@/ui/screens/shell/helpers';
import { castOf, type Cast, type CastCar, type CastPerson, type SceneKind } from '../cast';
import { Director } from '../director';
import { envAt } from '../env';
import { lookOfStranger } from '../figure';
import { along, hash32, left, mul, sub, yawOf, type V2 } from '../math';
import { makeStreet } from '../procedural';
import { loadHumanBase } from '../render/human';
import { CameraView, type Frame } from '../render/view';
import { buildSite, onDrive } from '../site';
import type { AgencySit, Situation, UnitSit } from '../stage';
import { readStreet } from '../tiles';
import type { Site, StreetData } from '../types';
import { lookOfAnyCar } from '../vehicle';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.get(k) !== null ? Number(q.get(k)) : d);
const flag = (k: string) => q.get(k) !== null && q.get(k) !== '0';
const log = document.getElementById('log')!;
const seed = num('seed', 3);
const hour = num('hour', 14);
const month = num('month', 7);
const weatherKind = (q.get('weather') ?? 'clear') as Weather['kind'];
const temp = num('temp', month <= 2 || month === 12 ? -4 : 16);

// ------------------------------------------------------------------------------------------------ the street

/** A hand-made street of one road and a few houses, for the awkward places a made-up street rarely gives. */
function plainStreet(shape: string): StreetData {
  const box = (x0: number, y0: number, x1: number, y1: number): V2[] => [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const row = (y0: number, y1: number, from: number, to: number, step: number) => {
    const out: V2[][] = [];
    for (let x = from; x < to; x += step) out.push(box(x, y0, x + step - 1.5, y1));
    return out;
  };
  let road: V2[] = [
    [-120, -6],
    [120, -6],
  ];
  let width = 6.5;
  let houses: V2[][] = [...row(2, 12, -60, 60, 14), ...row(-24, -14, -60, 60, 16)];
  if (shape === 'dead') {
    // A street that ends 14 m past the incident at a house across its end.
    road = [
      [-120, -6],
      [14, -6],
    ];
    houses = [...row(2, 12, -60, 30, 14), ...row(-24, -14, -60, 18, 16), box(20, -16, 32, 4)];
  } else if (shape === 'narrow') {
    // An old town lane: 3.6 m between house fronts, no pavement.
    road = [
      [-120, -2.5],
      [120, -2.5],
    ];
    width = 3.6;
    houses = [...row(0.8, 10, -70, -3, 9), box(-3, 3, 4, 10), ...row(0.8, 10, 5.5, 70, 9), ...row(-15, -5.8, -70, 70, 11)];
  } else if (shape === 'far') {
    // The incident is 28 m from the road, behind a strip of grass.
    road = [
      [-120, -28],
      [120, -28],
    ];
    houses = [box(-10, 2, 12, 14), box(-40, -4, -24, 10), box(24, -6, 40, 8)];
  } else if (shape === 'square') {
    // A square: the road runs along one side of an open paved space.
    road = [
      [-120, -22],
      [120, -22],
    ];
    houses = [box(-30, 14, 30, 26), box(-44, -14, -32, 24), box(32, -14, 44, 24)];
  }
  return {
    source: 'made',
    radius: 150,
    roads: [{ cls: 'residential', pts: road, width, oneway: 0, walk: shape !== 'narrow' }],
    buildings: houses.map((ring, i) => ({ id: i + 1, ring, height: 6 + (i % 3) * 3, base: 0, area: 140, roof: 'flat' as const })),
    areas: shape === 'square' ? [{ kind: 'paved', ring: box(-32, -18, 32, 13) }] : shape === 'far' ? [{ kind: 'green', ring: box(-60, -26, 60, 0) }] : [],
  } as StreetData;
}

async function streetOf(): Promise<StreetData> {
  const tiles = q.get('tiles');
  if (tiles) {
    const [lng, lat] = tiles.split(',').map(Number);
    const file = q.get('archive') ?? '/tmp/claude-0/map-tiles/firenze-v4.pmtiles';
    const got = await readStreet(new PMTiles(`/@fs${file}`), [lng, lat], { timeoutMs: 20000 });
    if (got) return got;
    log.textContent = `no street at ${tiles}: a made-up one instead`;
  }
  if (q.get('plain')) return plainStreet(q.get('plain')!);
  return makeStreet((q.get('place') ?? 'street') as PlaceKind, seed);
}

// ------------------------------------------------------------------------------------------------ the light

const t0 = Date.UTC(2026, month - 1, 14, hour - (month >= 4 && month <= 10 ? 3 : 2), 20);
const weather: Weather = { kind: weatherKind, tempC: temp, windMs: num('wind', 4), roadFactor: 1, text: { et: '', en: '' } };
const env = envAt(t0, [24.75, 59.44], weather);
const dress = { season: env.season, temp };

// ------------------------------------------------------------------------------------------------ the cast

/** A cast by scene kind with sensible people, the way the director's tests make one. */
function castByKind(): Cast {
  const kind = (q.get('kind') ?? 'brawl') as SceneKind;
  const usual: Record<SceneKind, [string, CastCar['role'][]]> = {
    brawl: ['svcw', []],
    threat: ['svcw', []],
    disorder: ['ssc', []],
    lying: ['vc', []],
    crash: ['ddw', ['involved', 'involved']],
    stop: ['dc', ['suspect']],
    theft: ['ssc', ['victim']],
    indoor: ['svc', []],
    crowd: ['s' + 'e'.repeat(16), []],
    fire: ['ceeee', []],
    empty: ['c', []],
  };
  const roles = q.get('roles') ?? usual[kind][0];
  const carRoles = q.get('cars') !== null ? (q.get('cars')!.split(',').filter(Boolean) as CastCar['role'][]) : usual[kind][1];
  const names: Record<string, CastPerson['role']> = { s: 'suspect', v: 'victim', c: 'caller', w: 'witness', d: 'driver', e: 'extra' };
  const people: CastPerson[] = [...roles].map((ch, i) => {
    const s = hash32('scene', kind, seed, i);
    return { id: ch === 'e' ? `e:${i}` : `p:${ch}${i}`, role: names[ch], look: lookOfStranger(s, dress), seed: s };
  });
  return {
    kind,
    seed: hash32('cast', kind, roles, seed),
    people,
    cars: carRoles.map((role, i) => ({ id: `v:S${i}`, role, look: lookOfAnyCar(hash32('car', kind, seed, i)) })),
    dress,
    armed: q.get('armed') !== null ? flag('armed') : kind === 'threat',
    drunk: q.get('drunk') !== null ? flag('drunk') : kind === 'disorder',
    down: q.get('down') !== null ? flag('down') : kind === 'lying',
    live: q.get('live') !== null ? flag('live') : true,
    runs: flag('runs'),
    mayFlee: flag('mayFlee') || q.get('pursuit') !== null,
    priority: num('prio', 3),
    single: flag('single'),
    inRoad: flag('inRoad'),
    chant: flag('chant'),
    riot: flag('riot'),
    carFire: flag('carFire'),
  };
}

/** The cast of a real incident: a shift is created, the template spawned, castOf builds it as the game does. */
async function castOfTemplate(templateId: string): Promise<Cast> {
  const [{ createShift }, { directorSpawn }, { TEMPLATE_BY_ID }, { tallinnTime }] = await Promise.all([
    import('@/sim/engine'),
    import('@/sim/commands'),
    import('@/data/incidents'),
    import('@/sim/time'),
  ]);
  const s = createShift({
    seed: seed + 70,
    regionId: 'pohja',
    mode: 'director',
    difficulty: 'normal',
    start: tallinnTime(2026, month, 14, hour, 0),
    hours: 6,
    playerName: 'Kaamera',
    weather: 'clear',
  });
  const id = directorSpawn(s, { templateId });
  if (!id) throw new Error(`no incident of ${templateId}`);
  return castOf(s, s.incidents[id], TEMPLATE_BY_ID[templateId], dress);
}

// ------------------------------------------------------------------------------------------------ the script

interface UnitScript {
  id: string;
  type: UnitType;
  model: string;
  side: string;
  coming: number;
  near: number;
  here: number;
  left: number;
  takes: UnitSit['takes'];
}

const MODELS: Partial<Record<UnitType, string>> = {
  patrol: 'Škoda Octavia Combi',
  rapid: 'Volkswagen Transporter T6.1',
  k9: 'Škoda Kodiaq RS 4x4',
  traffic: 'Škoda Superb',
  criminal: 'Škoda Superb (märgistamata)',
  special: 'Mercedes-Benz Sprinter',
  transport: 'Volkswagen Transporter T6.1',
};

/** Seconds a script names in its items (`h12`), or Infinity when it does not. */
const at = (items: string[], key: string): number => {
  const it = items.find((s) => s.startsWith(key) && /^-?\d/.test(s.slice(key.length)));
  return it ? Number(it.slice(key.length)) : Infinity;
};

const units: UnitScript[] = q.getAll('u').map((spec, i) => {
  const items = spec.split(',');
  const [id, type = 'patrol', model] = (items[0] || `P${i + 1}`).split(':');
  const here = at(items, 'h');
  const near = at(items, 'n');
  const takes = items.find((s) => s.startsWith('t='))?.slice(2) ?? null;
  return {
    id,
    type: type as UnitType,
    model: model ?? MODELS[type as UnitType] ?? 'Škoda Octavia Combi',
    side: items[1] ?? 'a',
    coming: Math.min(at(items, 'c'), 0),
    near: Number.isFinite(near) ? near : here - 7,
    here,
    left: at(items, 'l'),
    takes: takes as UnitSit['takes'],
  };
});
const agencies = q.getAll('ag').map((spec) => {
  const items = spec.split(',');
  const here = at(items, 'h');
  const near = at(items, 'n');
  return { agency: items[0] as Agency, near: Number.isFinite(near) ? near : here - 7, here };
});
const outSpec = q.get('out')?.split(',') ?? null;
const outAt = outSpec ? Number(outSpec[0].split('@')[1] ?? 0) : Infinity;
const outResult = (outSpec?.[0].split('@')[0] ?? 'resolved') as OutcomeResult;
const closedAt = Math.min(num('closed', Infinity), outAt);
const [pursuitOn, pursuitOver] = (q.get('pursuit') ?? '').split(',').map((s) => (s ? Number(s) : Infinity));
const [searchFrom, searchTo] = (q.get('search') ?? '').split('-').map((s) => (s ? Number(s) : Infinity));
const [pauseFrom, pauseTo] = (q.get('pause') ?? '').split('-').map((s) => (s ? Number(s) : Infinity));
const openAt = num('open', 0);
const firstHere = Math.min(...units.map((u) => u.here));

/** The script's own clock: the scene's clock less the time the game stood paused. */
const gameT = (t: number) => (t < pauseFrom ? t : t < pauseTo ? pauseFrom : t - (pauseTo - pauseFrom));

function situation(t: number, site: Site): Situation {
  const s = gameT(t);
  const fromOf = (side: string): number => {
    const pts = site.drive.pts;
    if (side === 'a') return yawOf(sub(pts[0], [0, 0]));
    if (side === 'b') return yawOf(sub(pts[pts.length - 1], [0, 0]));
    return Number(side);
  };
  const us: UnitSit[] = [];
  for (const u of units) {
    if (s < u.coming) continue;
    const state: UnitSit['state'] = s >= u.left ? 'left' : s >= u.here ? 'here' : s >= u.near ? 'near' : 'coming';
    us.push({
      id: u.id,
      type: u.type,
      model: u.model,
      crew: ['M', 'F'],
      state,
      eta: state === 'near' ? Math.max(0, u.here - s) : 0,
      from: fromOf(u.side),
      takes: state === 'left' ? u.takes : null,
    });
  }
  const ags: AgencySit[] = agencies.map((a) => ({
    agency: a.agency,
    state: s >= a.here ? 'here' : s >= a.near ? 'near' : 'coming',
    eta: s >= a.near && s < a.here ? a.here - s : 0,
  }));
  const arrests = outSpec ? at(outSpec, 'a') : Infinity;
  const injuries = outSpec ? at(outSpec, 'i') : Infinity;
  return {
    closed: s >= closedAt,
    units: us,
    agencies: ags,
    pursuit: s >= pursuitOver ? 'over' : s >= pursuitOn ? 'on' : 'none',
    searching: s >= searchFrom && s < searchTo,
    outcome:
      s >= outAt
        ? {
            result: outResult,
            arrests: Number.isFinite(arrests) ? arrests : outResult === 'arrest' ? 1 : 0,
            injuries: Number.isFinite(injuries) ? injuries : outResult === 'hospital' || outResult === 'tragedy' ? 1 : 0,
          }
        : null,
    progress: s >= outAt ? 1 : s <= firstHere ? 0 : Math.min(0.95, (s - firstHere) / Math.max(1, outAt - firstHere)),
    paused: t >= pauseFrom && t < pauseTo,
  };
}

// ------------------------------------------------------------------------------------------------ the scene

const street = await streetOf();
const site = buildSite(street, seed);
if (!site) throw new Error(`no site on this street (${street.source}: ${street.roads.length} roads, ${street.buildings.length} buildings)`);
if (q.get('near')) {
  const d = Number(q.get('near'));
  const a = num('angle', 0.6);
  const n = mul(left(site.dir), -site.side);
  const atPt = q.get('at')?.split(',').map(Number);
  const target = atPt ? onDrive(site.drive, site.drive.at + atPt[0], atPt[1]).pos : site.spot;
  site.camera = { ...site.camera, pos: along(along(target, n, d * Math.cos(a)), site.dir, d * Math.sin(a)), height: num('h', 2.4), target, targetHeight: 1, fov: num('fov', 34) };
}
const cast = q.get('tpl') ? await castOfTemplate(q.get('tpl')!) : castByKind();
const view = new CameraView(document.getElementById('c') as HTMLCanvasElement);
view.setScene(site, env);
view.setHumans(await loadHumanBase());
if (flag('clean')) {
  const v = view as unknown as { post: { setLook: (l: unknown) => void }; look: Record<string, unknown> };
  v.post.setLook({ ...v.look, noise: 0, blocks: 0, soft: 0, trail: 0, vignette: 0, scan: 0, barrel: 0, saturation: 1, contrast: 1, lift: 0 });
}
const night = env.night >= 0.5;
const STEP = 0.1;
let director: Director | null = null;
let t = 0;

/** Start again from the scene's first second (seeking backwards). */
function reset() {
  director = null;
  t = 0;
}

/** Advance the scene by `dt` seconds: the camera's first update comes at `open`, as the session would make it. */
function advance(dt: number) {
  const next = t + dt;
  if (next < openAt) {
    t = next;
    return;
  }
  if (!director) {
    director = new Director(site!, cast, { night, quiet: flag('quiet'), wet: env.rain });
    t = Math.max(t, openAt);
    director.update(situation(t, site!), 0);
  }
  const moved = next - t;
  if (moved > 0) director.update(situation(next, site!), moved);
  t = next;
}

const pad = (n: number) => String(n).padStart(2, '0');
const osd = () => {
  const mins = 20 + Math.floor(t / 60);
  return {
    name: `K-${100 + (seed % 900)} · ${cast.kind.toUpperCase()}`,
    clock: `14.${pad(month)}.2026 ${pad((hour + Math.floor(mins / 60)) % 24)}:${pad(mins % 60)}`,
    note: '',
    mark: `EPD v${VERSION}`,
    rec: Math.floor(t) % 2 === 0,
  };
};

function draw() {
  const f: Frame = director ? director.frame() : { t, people: [], cars: [], smoke: null };
  view.render(f, osd(), num('zoom', 1), num('panx', 0), num('pany', 0));
  const sit = situation(t, site!);
  const states = sit.units.map((u) => `${u.id}:${u.state}`).join(' ');
  log.textContent =
    `t=${t.toFixed(1)} phase=${director?.phase ?? 'closed-camera'} people=${f.people.length} cars=${f.cars.length} ` +
    `kind=${cast.kind} ${states}${sit.outcome ? ' out=' + sit.outcome.result : ''}${sit.paused ? ' PAUSED' : ''} ` +
    `src=${street.source} night=${night ? 1 : 0}` +
    // who=1: everybody on stage with where they stand and what they do, for finding a figure in the picture.
    (flag('who') ? '\n' + f.people.map((p) => `${p.id} ${p.pos.map((v) => v.toFixed(1)).join(',')} yaw=${p.yaw.toFixed(2)}`).join('\n') : '');
}

const api = {
  ready: true,
  /** Advance the scene by `dt` and draw, `frames` times. */
  step(dt: number, frames = 1) {
    for (let i = 0; i < frames; i++) {
      advance(dt);
      draw();
    }
    return t;
  },
  /** Advance the scene to second `to` without drawing the frames between (backwards: from the start), then draw one. */
  seek(to: number) {
    if (to < t) reset();
    while (t + STEP <= to + 1e-9) advance(STEP);
    if (to > t) advance(to - t);
    draw();
    return t;
  },
};
const w = window as unknown as { __cctv: typeof api; __site: Site; __cast: Cast; __director: () => Director | null };
w.__cctv = api;
w.__site = site;
w.__cast = cast;
w.__director = () => director;
if (!q.get('manual')) {
  let last = performance.now();
  const loop = (now: number) => {
    if (now - last >= 80) {
      advance(Math.min(0.5, (now - last) / 1000));
      last = now;
      draw();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
} else draw();
