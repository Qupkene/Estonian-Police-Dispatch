/**
 * Fleeing vehicles on the roads (display only: the engine and its timings are not involved).
 *
 * The engine moves a pursued vehicle in short straight steps with heading noise (src/sim/pursuit.ts).
 * The map samples that position every few tens of metres and asks the road worker for a short hop
 * from the end of the path drawn so far to the road point of the new position (computeHop in
 * roadGraph.ts, which keeps the suspect on the road it is on instead of zig-zagging between parallel
 * roads). The marker drives along the drawn path at the engine's own speed, a little faster while it
 * is further behind than about one sample (road paths are longer than the engine's straight steps)
 * and with smoothed speed changes, so it keeps moving between samples and turns with the road. A hop
 * without a road (no road data, no road near, no route, a slow answer) is a straight line from the end
 * of the drawn path, never a jump.
 *
 * Pure: no DOM, no worker. The hop function is injected (RoadService.hop in the app, the road graph
 * directly in tests).
 */
import { bearing } from '@/sim/geo';
import type { LngLat } from '@/sim/types';
import { HOP_HISTORY, type HopAnswer, type HopRequest } from './roadGraph';

/** A hop request in flight (answer set once done). */
export interface HopTicket {
  done: boolean;
  /** Real time (ms) of the request. */
  at: number;
  answer?: HopAnswer;
}
export type HopFn = (req: HopRequest, now: number) => HopTicket;

/** A new sample is taken when the engine position moved this far (metres) ... */
export const SAMPLE_M = 35;
/** ... or this long (real ms) after the previous sample, when it moved at all. */
export const SAMPLE_MS = 300;
/** An answer slower than this (real ms) is replaced by a straight hop. */
export const HOP_TIMEOUT_MS = 1500;
/** The engine position is this far (metres) from everything drawn: start again there (a loaded save). */
export const RESET_M = 2000;
/** A hop shorter than this (metres) that turns back against the direction of travel is jitter: skipped. */
export const BACKTRACK_M = 15;
/** The marker closes a gap beyond its normal lag within about this long (real ms) ... */
const CATCH_UP_MS = 300;
/** ... never faster than this many times the engine speed ... */
const MAX_SPEED_X = 4;
/** ... and its speed follows those targets with this time constant (real ms). */
const SPEED_SMOOTH_MS = 150;
/** Time constant (real ms) of the engine speed estimate. */
const ENGINE_SPEED_MS = 250;
/** When the engine stands still the rest of the drawn path is finished within about this long. */
const FINISH_MS = 500;
/** Heading looks this far (metres) ahead along the drawn path, so it turns smoothly with the road. */
const LOOK_AHEAD_M = 12;
/** Trail points closer than this (metres) to the previous one are left out. */
const TRAIL_STEP_M = 5;
/** At most this many trail points are kept (about 6 km and more). */
const TRAIL_MAX = 1200;

const DEG = Math.PI / 180;
const M_PER_DEG = 111194.93;
/** Metres between two nearby points (local equirectangular approximation). */
export function distM(a: LngLat, b: LngLat): number {
  const kx = M_PER_DEG * Math.cos(((a[1] + b[1]) / 2) * DEG);
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * M_PER_DEG);
}
const angDiff = (a: number, b: number) => Math.abs(((b - a + 540) % 360) - 180);

export interface TrackPos {
  pos: LngLat;
  heading: number;
}

/** The display state of one pursued vehicle. */
export class SuspectTrack {
  /** The drawn path from a little behind the marker to its end: vertices with metres from the start. */
  private lon: number[] = [];
  private lat: number[] = [];
  private cum: number[] = [];
  private endEdge = -1;
  private history: number[] = [];
  private pending?: { ticket: HopTicket; req: HopRequest };
  private lastSample: LngLat = [0, 0];
  private lastSampleAt = 0;
  /** Expected real ms between samples (moving average): the marker stays about this far behind. */
  private tau = SAMPLE_MS / 2;
  /** Engine speed estimate and the marker's speed (metres per real ms). */
  private vEngine = 0;
  private speed = 0;
  private lastEngine: LngLat = [0, 0];
  private lastFrame = 0;
  private shown: LngLat = [0, 0];
  private shownD = 0;
  private heading = 0;
  /** Index of the first chain vertex not yet in the trail. */
  private trailNext = 0;
  private trailPts: LngLat[] = [];

  constructor(
    private hop: HopFn,
    engine: LngLat,
    heading: number,
    now: number,
  ) {
    this.reset(engine, heading, now);
  }

  private reset(p: LngLat, heading: number, now: number) {
    this.lon = [p[0]];
    this.lat = [p[1]];
    this.cum = [0];
    this.endEdge = -1;
    this.history = [];
    this.pending = undefined;
    this.lastSample = [p[0], p[1]];
    this.lastSampleAt = now;
    this.vEngine = 0;
    this.speed = 0;
    this.lastEngine = [p[0], p[1]];
    this.lastFrame = now;
    this.shown = [p[0], p[1]];
    this.shownD = 0;
    this.heading = heading;
    this.trailNext = 1;
    this.trailPts = [[p[0], p[1]]];
  }

  /** Where the drawn path ends (the latest road point the marker is heading for). */
  get end(): LngLat {
    const n = this.lon.length - 1;
    return [this.lon[n], this.lat[n]];
  }

  /** The edge the drawn path ends on (-1 = not on a road). */
  get edge(): number {
    return this.endEdge;
  }

  /** Recently driven edges, oldest first. */
  get edges(): readonly number[] {
    return this.history;
  }

  /** The marker's position. */
  get pos(): LngLat {
    return this.shown;
  }

  /** The path driven so far on the map, ending at the marker. */
  trail(): LngLat[] {
    const out = this.trailPts.slice();
    const last = out[out.length - 1];
    if (!last || distM(last, this.shown) > 0.05) out.push(this.shown);
    return out;
  }

  /** Feed the engine's current position (every frame); returns where to draw the marker. */
  update(engine: LngLat, engineHeading: number, now: number): TrackPos {
    if (distM(engine, this.end) > RESET_M && distM(engine, this.shown) > RESET_M) {
      this.reset(engine, engineHeading, now);
      return { pos: this.shown, heading: this.heading };
    }
    const dt = Math.min(250, Math.max(0, now - this.lastFrame));
    this.lastFrame = now;
    if (dt > 0) {
      const v = distM(this.lastEngine, engine) / dt;
      this.vEngine += (v - this.vEngine) * (1 - Math.exp(-dt / ENGINE_SPEED_MS));
    }
    this.lastEngine = [engine[0], engine[1]];
    if (this.pending) {
      const { ticket, req } = this.pending;
      if (ticket.done) {
        this.pending = undefined;
        this.accept(ticket.answer ?? { from: req.from, to: req.to, edge: -1, path: null });
      } else if (now - ticket.at > HOP_TIMEOUT_MS) {
        // Straight to where the engine is by now, so a stalled worker never leaves it far behind.
        this.pending = undefined;
        this.accept({ from: req.from, to: [engine[0], engine[1]], edge: -1, path: null });
        this.lastSample = [engine[0], engine[1]];
        this.lastSampleAt = now;
      }
    }
    if (!this.pending) {
      const moved = distM(engine, this.lastSample);
      if (moved >= SAMPLE_M || (moved >= 1 && now - this.lastSampleAt >= SAMPLE_MS)) {
        const gap = Math.min(2 * SAMPLE_MS, Math.max(0, now - this.lastSampleAt));
        this.tau = Math.min(2 * SAMPLE_MS, Math.max(16, this.tau + (gap - this.tau) * 0.3));
        const req: HopRequest = {
          from: this.end,
          fromEdge: this.endEdge,
          history: this.history.slice(),
          to: [engine[0], engine[1]],
          travel: this.travel(),
          prev: this.lastSample,
        };
        this.lastSample = [engine[0], engine[1]];
        this.lastSampleAt = now;
        const ticket = this.hop(req, now);
        if (ticket.done) this.accept(ticket.answer ?? { from: req.from, to: req.to, edge: -1, path: null });
        else this.pending = { ticket, req };
      }
    }
    this.advance(dt);
    return { pos: this.shown, heading: this.heading };
  }

  /** Direction of travel at the end of the drawn path (undefined before the first metre). */
  private travel(): number | undefined {
    const n = this.lon.length - 1;
    const end = this.end;
    for (let i = n - 1; i >= 0; i--) {
      const q: LngLat = [this.lon[i], this.lat[i]];
      if (distM(q, end) >= 1) return bearing(q, end);
    }
    return undefined;
  }

  /** Append an answered hop to the drawn path. */
  private accept(a: HopAnswer) {
    if (a.hold) return;
    const pts: LngLat[] = [];
    if (a.path && a.path.lon.length >= 2) for (let i = 0; i < a.path.lon.length; i++) pts.push([a.path.lon[i], a.path.lat[i]]);
    else pts.push(a.from, a.to);
    const n0 = this.lon.length;
    // Jitter: a very short hop back against the direction of travel is not drawn (the next hop starts
    // from the same end again, so nothing is lost).
    const len = polyLen(pts);
    if (len < BACKTRACK_M && n0 >= 2 && this.cum[n0 - 1] - this.cum[n0 - 2] > 0.5) {
      const travel = bearing([this.lon[n0 - 2], this.lat[n0 - 2]], this.end);
      const first = pts.find((q) => distM(q, pts[0]) > 0.5);
      if (first && angDiff(travel, bearing(pts[0], first)) > 110) return;
    }
    // Always continue from the end of the drawn path (a straight piece if the hop starts elsewhere).
    for (const q of pts) this.push(q);
    if (a.edge >= 0) {
      this.endEdge = a.edge;
      if (this.history[this.history.length - 1] !== a.edge) {
        this.history.push(a.edge);
        if (this.history.length > HOP_HISTORY) this.history.splice(0, this.history.length - HOP_HISTORY);
      }
    } else this.endEdge = -1;
  }

  private push(q: LngLat) {
    const n = this.lon.length - 1;
    const d = distM([this.lon[n], this.lat[n]], q);
    if (d < 0.05) return;
    this.lon.push(q[0]);
    this.lat.push(q[1]);
    this.cum.push(this.cum[n] + d);
  }

  /**
   * Drive the marker dt real ms further along the drawn path: at the engine's speed while it is about
   * one sample behind (the lag that keeps it moving between samples), faster when further behind.
   */
  private advance(dt: number) {
    const total = this.cum[this.cum.length - 1];
    const left = total - this.shownD;
    const v = this.vEngine;
    const lag = 0.75 * Math.max(SAMPLE_M, v * this.tau);
    // Slows down smoothly towards the end of the drawn path, speeds up beyond the normal lag.
    let want = left < lag ? (v * left) / lag : v * (1 + (left - lag) / Math.max(1, v * CATCH_UP_MS));
    want = Math.min(MAX_SPEED_X * v, Math.max(0, want));
    // Standing still (a paused game): finish what is drawn instead of waiting a sample behind.
    want = Math.max(want, left / FINISH_MS);
    if (left < 0.05) want = 0;
    this.speed += (want - this.speed) * (1 - Math.exp(-dt / SPEED_SMOOTH_MS));
    const d = Math.min(total, this.shownD + this.speed * dt);
    this.shownD = d;
    this.shown = this.at(d);
    const ahead = this.at(Math.min(total, d + LOOK_AHEAD_M));
    if (distM(this.shown, ahead) > 1) this.heading = bearing(this.shown, ahead);
    this.collect(d);
  }

  /** Point at chain metres d. */
  private at(d: number): LngLat {
    const c = this.cum;
    const n = c.length;
    if (n === 1 || d <= c[0]) return [this.lon[0], this.lat[0]];
    if (d >= c[n - 1]) return [this.lon[n - 1], this.lat[n - 1]];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (c[mid] <= d) lo = mid;
      else hi = mid;
    }
    const span = c[hi] - c[lo];
    const t = span > 0 ? (d - c[lo]) / span : 1;
    return [this.lon[lo] + (this.lon[hi] - this.lon[lo]) * t, this.lat[lo] + (this.lat[hi] - this.lat[lo]) * t];
  }

  /** Move the vertices the marker has passed into the trail and drop them from the chain. */
  private collect(d: number) {
    while (this.trailNext < this.lon.length && this.cum[this.trailNext] <= d) {
      const q: LngLat = [this.lon[this.trailNext], this.lat[this.trailNext]];
      const last = this.trailPts[this.trailPts.length - 1];
      if (!last || distM(last, q) >= TRAIL_STEP_M) this.trailPts.push(q);
      this.trailNext++;
    }
    if (this.trailPts.length > TRAIL_MAX) this.trailPts.splice(0, this.trailPts.length - TRAIL_MAX);
    // Keep one passed vertex before the marker (the segment it is on).
    const drop = this.trailNext - 2;
    if (drop > 64) {
      this.lon.splice(0, drop);
      this.lat.splice(0, drop);
      this.cum.splice(0, drop);
      this.trailNext -= drop;
    }
  }
}

function polyLen(pts: readonly LngLat[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += distM(pts[i - 1], pts[i]);
  return l;
}
