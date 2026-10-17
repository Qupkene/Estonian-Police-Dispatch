/**
 * Day/night tint and weather particles over the map canvas.
 *
 * The tint is a pair of blended divs (night = deep-blue multiply, dusk = warm soft-light gradient)
 * and the weather is CSS-animated SVG tiles moved with compositor-only transforms. Both sit inside
 * maplibre's canvas container right after the <canvas>, i.e. below the DOM markers.
 */
import type { SimState, Weather } from '@/sim/types';

const RAD = Math.PI / 180;

/** Approximate solar altitude (degrees), a fallback until the engine's `sun()` is available. */
export function solarAltitude(t: number, lat: number, lon: number): number {
  const d = t / 86_400_000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const gmstH = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const ha = (gmstH * 15 + lon) * RAD - ra;
  const alt = Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(ha));
  return alt / RAD;
}

/**
 * Tint amounts for a solar altitude: `night` 0..1 (full below −12°, i.e. nautical dusk),
 * `dusk` 0..1 (warm horizon glow, peaks around sunset/sunrise).
 */
export function tintFor(altitude: number): { night: number; dusk: number } {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const night = altitude >= 0 ? 0 : altitude <= -12 ? 1 : altitude > -6 ? clamp(-altitude / 6) * 0.6 : 0.6 + clamp((-altitude - 6) / 6) * 0.4;
  const dusk = altitude > 8 || altitude < -9 ? 0 : altitude >= 0 ? clamp((8 - altitude) / 8) * 0.8 : clamp((9 + altitude) / 9);
  return { night, dusk: dusk * (1 - night * 0.6) };
}

export type WeatherKind = Weather['kind'];

// Deterministic pseudo-random for the particle tiles.
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TILE = 256;
const uri = (svg: string) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;

function rainTile(seed: number, n: number, len: number, alpha: number): string {
  const r = prng(seed);
  let lines = '';
  for (let i = 0; i < n; i++) {
    const x = (r() * TILE).toFixed(1);
    const y = r() * TILE;
    const l = len * (0.6 + r() * 0.8);
    lines += `<line x1="${x}" y1="${y.toFixed(1)}" x2="${x}" y2="${(y + l).toFixed(1)}"/>`;
    if (y + l > TILE) lines += `<line x1="${x}" y1="${(y - TILE).toFixed(1)}" x2="${x}" y2="${(y + l - TILE).toFixed(1)}"/>`;
  }
  return uri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}"><g stroke="rgb(185,210,255)" stroke-opacity="${alpha}" stroke-width="1" stroke-linecap="round">${lines}</g></svg>`,
  );
}

function snowTile(seed: number, n: number, rMax: number, alpha: number): string {
  const r = prng(seed);
  let dots = '';
  for (let i = 0; i < n; i++) {
    const x = r() * TILE;
    const y = r() * TILE;
    const rad = 0.7 + r() * rMax;
    // Wrap dots touching an edge so the tile repeats seamlessly.
    const xs = [x, ...(x < rad ? [x + TILE] : x > TILE - rad ? [x - TILE] : [])];
    const ys = [y, ...(y < rad ? [y + TILE] : y > TILE - rad ? [y - TILE] : [])];
    for (const cx of xs) for (const cy of ys) dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(2)}"/>`;
  }
  return uri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}"><g fill="white" fill-opacity="${alpha}">${dots}</g></svg>`,
  );
}

let tiles: Record<string, string> | null = null;
function weatherTiles() {
  tiles ??= {
    rainNear: rainTile(11, 46, 26, 0.55),
    rainFar: rainTile(23, 80, 14, 0.32),
    snowNear: snowTile(5, 34, 1.9, 0.85),
    snowFar: snowTile(9, 70, 1.0, 0.6),
  };
  return tiles;
}

/** Imperative day/night + weather layer. */
export class Atmosphere {
  readonly night: HTMLDivElement;
  readonly dusk: HTMLDivElement;
  readonly weather: HTMLDivElement;
  private kind: WeatherKind | '' = '';
  private motion = true;
  private lastNight = -1;
  private lastDusk = -1;

  constructor(host: HTMLElement, before: Node | null) {
    this.night = document.createElement('div');
    this.night.className = 'epdm-night';
    this.dusk = document.createElement('div');
    this.dusk.className = 'epdm-dusk';
    this.weather = document.createElement('div');
    this.weather.className = 'epdm-wx';
    this.weather.setAttribute('aria-hidden', 'true');
    for (const el of [this.night, this.dusk, this.weather]) host.insertBefore(el, before);
  }

  setTint(altitude: number): void {
    const { night, dusk } = tintFor(altitude);
    if (Math.abs(night - this.lastNight) > 0.004) {
      this.lastNight = night;
      this.night.style.opacity = (night * 0.42).toFixed(3);
    }
    if (Math.abs(dusk - this.lastDusk) > 0.004) {
      this.lastDusk = dusk;
      this.dusk.style.opacity = dusk.toFixed(3);
    }
  }

  setWeather(w: Weather | undefined, motion: boolean): void {
    const kind = w?.kind ?? 'clear';
    if (kind === this.kind && motion === this.motion) return;
    this.kind = kind;
    this.motion = motion;
    const el = this.weather;
    el.className = `epdm-wx epdm-wx--${kind}${motion ? '' : ' epdm-wx--static'}`;
    el.innerHTML = '';
    const tl = weatherTiles();
    const layer = (cls: string, img: string) => {
      const d = document.createElement('div');
      d.className = `epdm-wx__layer ${cls}`;
      d.style.backgroundImage = img;
      el.appendChild(d);
    };
    const wind = Math.max(-20, Math.min(20, (w?.windMs ?? 4) * 1.6));
    el.style.setProperty('--epdm-wind', `${wind.toFixed(1)}deg`);
    if (!motion) {
      // Reduced motion: no moving particles, only a static haze for fog / precipitation.
      if (kind !== 'clear') el.appendChild(Object.assign(document.createElement('div'), { className: 'epdm-wx__haze' }));
      return;
    }
    if (kind === 'rain' || kind === 'storm' || kind === 'sleet') {
      layer('epdm-wx__rain-far', tl.rainFar);
      layer('epdm-wx__rain-near', tl.rainNear);
    }
    if (kind === 'snow' || kind === 'sleet') {
      layer('epdm-wx__snow-far', tl.snowFar);
      layer('epdm-wx__snow-near', tl.snowNear);
    }
    if (kind === 'fog' || kind === 'cloudy' || kind === 'storm' || kind === 'rain' || kind === 'snow' || kind === 'sleet') {
      el.appendChild(Object.assign(document.createElement('div'), { className: 'epdm-wx__haze' }));
    }
    if (kind === 'fog') {
      el.appendChild(Object.assign(document.createElement('div'), { className: 'epdm-wx__fog' }));
      el.appendChild(Object.assign(document.createElement('div'), { className: 'epdm-wx__fog epdm-wx__fog--b' }));
    }
    if (kind === 'storm') el.appendChild(Object.assign(document.createElement('div'), { className: 'epdm-wx__flash' }));
  }

  destroy(): void {
    this.night.remove();
    this.dusk.remove();
    this.weather.remove();
  }
}

/** Sun altitude from the engine selector, falling back to the local approximation. */
export function altitudeOf(s: SimState, sunFn: (s: SimState) => { altitude: number }, center: [number, number]): number {
  try {
    const a = sunFn(s).altitude;
    if (Number.isFinite(a)) return a;
  } catch {
    /* engine not implemented yet */
  }
  return solarAltitude(s.now, center[1], center[0]);
}
