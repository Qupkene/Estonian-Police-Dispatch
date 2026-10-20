/**
 * The AI colleagues at the neighbouring desks (src/sim/colleagues.ts, docs/SECTORS.md): help requests,
 * pursuit hand-over, night cover and their radio lines. Deterministic, off in the daily challenge and on
 * every shift without sectors, and absent from older saves.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { COLLEAGUES } from '@/data/sectors';
import { REGION_IDS, REGIONS } from '@/data/regions';
import { TEMPLATES } from '@/data/incidents';
import { newCareer, rosterFromCareer } from '@/sim/career';
import {
  colleagueName,
  deskCallsign,
  HANDOVER_REPLIES,
  helpGivenCount,
  helpRefs,
  helpSector,
  helpTemplates,
  nightCoverFor,
} from '@/sim/colleagues';
import { dispatchUnits, replyRadio } from '@/sim/commands';
import { createShift, finalizeShift, shiftKindOf, step, SUBSTEP_MS } from '@/sim/engine';
import { haversineKm } from '@/sim/geo';
import { publishIncident } from '@/sim/internal';
import { startPursuit } from '@/sim/pursuit';
import type { ReportExtras } from '@/sim/report';
import { areaShare, inArea, neighbourSectors, sectorAt, sectorById, sectorOf, starterSectors } from '@/sim/sectors';
import { recommendUnits } from '@/sim/selectors';
import { createIncident } from '@/sim/spawner';
import { MIN, tallinnTime } from '@/sim/time';
import type { Incident, LngLat, NewShiftOptions, RegionId, ShiftReport, SimState } from '@/sim/types';

const ready = REGION_IDS.every((id) => REGIONS[id].roster.length > 0) && TEMPLATES.length > 50;

vi.setConfig({ testTimeout: 120_000 });

const shiftOpts = (regionId: RegionId, o: Partial<NewShiftOptions> = {}): NewShiftOptions => ({
  seed: 7,
  regionId,
  mode: 'free',
  difficulty: 'normal',
  start: tallinnTime(2026, 10, 14, 7, 0),
  hours: 8,
  playerName: 'Test',
  ...o,
});

/** A career shift at a starter sector with a new career's force. */
function careerShift(regionId: RegionId, sector: string, o: Partial<NewShiftOptions> = {}): SimState {
  const career = newCareer('Test', '777', regionId, 4242, sector);
  const start = o.start ?? tallinnTime(2026, 10, 14, 7, 0);
  return createShift(
    shiftOpts(regionId, { mode: 'career', roster: rosterFromCareer(career, shiftKindOf(start), regionId), sectors: [sector], ...o, start }),
  );
}

const helpCalls = (s: SimState): Incident[] => s.incidentOrder.map((id) => s.incidents[id]).filter((i) => helpSector(i) !== undefined);
const deskLines = (s: SimState) => s.radio.filter((m) => m.from.startsWith('JK '));
const extrasOf = (r: ShiftReport) => (r as ShiftReport & { extras?: ReportExtras }).extras;

/** A quiet sector shift (no ordinary calls) whose colleague asks for help right now. */
function askNow(o: Partial<NewShiftOptions> = {}, sector = 'louna-tartu'): { s: SimState; inc: Incident } {
  for (let seed = 1; seed < 40; seed++) {
    const s = createShift(shiftOpts('louna', { sectors: [sector], seed, ...o }));
    s.flags.autoSpawn = false;
    step(s, (COLLEAGUES.helpQuietStartMin + 5) * MIN);
    s.colleagues!.nextHelpAt = s.now;
    step(s, SUBSTEP_MS);
    const inc = helpCalls(s)[0];
    if (inc) return { s, inc };
  }
  throw new Error('no help request in 40 seeds');
}

describe.skipIf(!ready)('help requests', () => {
  it('a neighbouring desk asks for help with an ordinary call just across the border', () => {
    const { s, inc } = askNow();
    const desk = helpSector(inc)!;
    expect(neighbourSectors(['louna-tartu']).map((x) => x.id)).toContain(desk);
    expect(sectorOf(REGIONS.louna, inc.location)).toBe(desk);
    expect(inArea(s, REGIONS.louna, inc.location)).toBe(false);
    expect(inc.location.address).not.toMatch(/Kaardipunkt/);
    // Close to the player's crews: worth a crew's drive.
    expect(Math.min(...helpRefs(s).map((p) => haversineKm(p, inc.location.coord)))).toBeLessThanOrEqual(COLLEAGUES.helpMaxKm);
    expect(helpTemplates().map((t) => t.id)).toContain(inc.templateId);
    expect(COLLEAGUES.helpPriorities).toContain(inc.truePriority);
    // In the queue at once (no acknowledgement to miss), with the colleague's timeout.
    expect(s.flags[`hidden:${inc.id}`]).toBeUndefined();
    expect(inc.state).toBe('queued');
    expect(inc.expiresAt).toBe(inc.createdAt + COLLEAGUES.helpTimeoutMin * MIN);
    // The request on the radio, from the desk, and in the timeline.
    const sector = sectorById(desk)!;
    const line = deskLines(s).find((m) => m.incidentId === inc.id)!;
    expect(line.from).toBe(deskCallsign(sector));
    expect(line.text.et).toContain(colleagueName(sector));
    expect(line.text.et).toContain(inc.location.address);
    expect(inc.timeline.some((t) => t.text.et.includes(colleagueName(sector)))).toBe(true);
  });

  it('goes back to the colleague when nobody is sent: no penalty, not counted as the player’s', () => {
    const { s, inc } = askNow();
    const trust = s.trust;
    const incidents = s.stats.incidents - 1;
    step(s, (COLLEAGUES.helpTimeoutMin + 1) * MIN);
    expect(inc.state).toBe('closed');
    expect(inc.closedBy).toBe('colleague');
    expect(inc.outcome).toBeUndefined();
    expect(s.trust).toBe(trust);
    expect(s.stats.expired).toBe(0);
    expect(s.stats.incidents).toBe(incidents);
    expect(helpGivenCount(s)).toBe(0);
    const back = deskLines(s).filter((m) => m.incidentId === inc.id);
    expect(back.length).toBe(2);
    const r = finalizeShift(s);
    expect(extrasOf(r)?.helpGiven).toBeUndefined();
    expect(r.reputationDelta).toBeGreaterThanOrEqual(0);
  });

  it('counts in ReportExtras.helpGiven when the player’s crew gets there, and the colleague says thanks', () => {
    const { s, inc } = askNow();
    const rec = recommendUnits(s, inc.id).find((r) => r.fit === 'ideal' || r.fit === 'need' || r.fit === 'weak')!;
    expect(dispatchUnits(s, inc.id, [rec.unit.id]).ok).toBe(true);
    for (let i = 0; i < 180 && inc.firstArrivalAt === undefined; i++) step(s, MIN);
    expect(inc.firstArrivalAt).toBeDefined();
    step(s, MIN);
    expect(helpGivenCount(s)).toBe(1);
    expect(deskLines(s).filter((m) => m.incidentId === inc.id).length).toBe(2);
    expect(extrasOf(finalizeShift(s))?.helpGiven).toBe(1);
  });

  it('a call nobody went to never keeps the player in overtime', () => {
    const { s, inc } = askNow();
    // The shift ends while the call is still open (the test moves the end forward).
    s.endTime = s.now + 2 * MIN;
    step(s, 3 * MIN);
    expect(inc.closedBy).toBe('colleague');
  });

  it('comes now and then on sector shifts, close to the crews, at most one open and a few a shift', () => {
    let total = 0;
    let runs = 0;
    const kms: number[] = [];
    const bySector = new Map<string, number>();
    for (const r of REGION_IDS) {
      for (const x of starterSectors(r)) {
        for (const seed of [1, 2, 3]) {
          const s = careerShift(r, x.id, { seed });
          const seen = new Set<string>();
          while (!s.ended) {
            step(s, MIN);
            // Measured the minute it comes, against where the crews are then (a crew moves about a km a minute).
            for (const inc of helpCalls(s)) {
              if (seen.has(inc.id)) continue;
              seen.add(inc.id);
              const km = Math.min(...helpRefs(s).map((p) => haversineKm(p, inc.location.coord)));
              expect(km, `${x.id}: ${inc.location.address}`).toBeLessThanOrEqual(COLLEAGUES.helpMaxKm + 2);
              kms.push(km);
            }
          }
          const calls = helpCalls(s);
          expect(calls.length, x.id).toBeLessThanOrEqual(COLLEAGUES.helpMax);
          for (const inc of calls) {
            expect(inc.createdAt).toBeGreaterThanOrEqual(s.startTime + COLLEAGUES.helpQuietStartMin * MIN);
            expect(inc.createdAt).toBeLessThanOrEqual(s.endTime - COLLEAGUES.helpQuietEndMin * MIN);
            // Nobody plays: every one went back to its colleague, none was left open.
            expect(inc.closedBy, inc.id).toBe('colleague');
          }
          // One at a time: each was closed before the next one came.
          for (let i = 1; i < calls.length; i++) expect(calls[i - 1].closedAt ?? Infinity).toBeLessThanOrEqual(calls[i].createdAt);
          total += calls.length;
          bySector.set(x.id, (bySector.get(x.id) ?? 0) + calls.length);
          runs++;
        }
      }
    }
    const mean = total / runs;
    expect(mean).toBeGreaterThan(0.2);
    expect(mean).toBeLessThan(2.5);
    // The city desks, whose crews are a few km from the next sector, get them...
    for (const id of ['pohja-kesklinn', 'pohja-lasnamae', 'louna-tartu', 'laane-parnu']) expect(bySector.get(id), id).toBeGreaterThan(0);
    // ...an island desk never: nothing of the neighbours is near its crews.
    expect(bySector.get('laane-saaremaa')).toBe(0);
    kms.sort((a, b) => a - b);
    expect(kms[Math.floor(kms.length / 2)]).toBeLessThan(6);
  });

  it('never on a whole-prefecture shift, in free play without sectors, the daily challenge, the tutorial or the director', () => {
    const shifts = [
      createShift(shiftOpts('pohja')),
      createShift(shiftOpts('pohja', { mode: 'career' })),
      createShift(shiftOpts('louna', { sectors: ['louna-tartu'], fixedSchedule: true })),
      createShift(shiftOpts('louna', { sectors: ['louna-tartu'], mode: 'tutorial' })),
      createShift(shiftOpts('louna', { sectors: ['louna-tartu'], mode: 'director' })),
    ];
    for (const s of shifts) {
      expect(s.colleagues).toBeUndefined();
      expect(s.coverSectors).toBeUndefined();
      step(s, 6 * 60 * MIN);
      expect(helpCalls(s)).toEqual([]);
      expect(deskLines(s)).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/** A quiet Tartu shift with a pursuit whose suspect is in Tartumaa, at Elva. */
function pursuitOutside(o: Partial<NewShiftOptions> = {}): { s: SimState; inc: Incident } {
  const s = createShift(shiftOpts('louna', { sectors: ['louna-tartu'], ...o }));
  s.flags.autoSpawn = false;
  const tpl = TEMPLATES.find((t) => !t.easterEgg && t.category === 'traffic' && t.units.need.every((n) => n.type === 'patrol'))!;
  const inc = createIncident(s, tpl, { location: { address: 'Riia tn 2', coord: [26.7232, 58.3776], city: 'Tartu', placeKind: 'street', zone: 'mainland' }, source: 'hk' });
  publishIncident(s, inc);
  const unit = s.unitOrder.map((id) => s.units[id]).find((u) => u.type === 'patrol' && u.status === 'available')!;
  expect(dispatchUnits(s, inc.id, [unit.id]).ok).toBe(true);
  startPursuit(s, inc, unit.pos);
  const elva: LngLat = REGIONS.louna.towns.find((t) => t.name === 'Elva')!.coord;
  expect(sectorAt(REGIONS.louna, elva)).toBe('louna-tartumaa');
  inc.pursuit!.suspectPos = elva;
  return { s, inc };
}

const offersOf = (s: SimState, inc: Incident) => s.radio.filter((m) => m.incidentId === inc.id && m.replies?.some((r) => r.id === 'handover'));

describe.skipIf(!ready)('pursuit hand-over', () => {
  it('offers the hand-over once when the pursuit leaves the area; handing over closes it as the neighbour’s', () => {
    const { s, inc } = pursuitOutside();
    step(s, SUBSTEP_MS);
    const offers = offersOf(s, inc);
    expect(offers.length).toBe(1);
    const offer = offers[0];
    expect(offer.from).toBe(deskCallsign(sectorById('louna-tartumaa')!));
    expect(offer.kind).toBe('pursuit');
    expect(offer.replies).toEqual(HANDOVER_REPLIES);
    expect(offer.expiresAt).toBe(offer.t + COLLEAGUES.handoverOfferMin * MIN);
    const trust = s.trust;
    const units = [...inc.assigned];
    replyRadio(s, offer.id, 'handover');
    expect(offer.answered).toBe('handover');
    expect(inc.state).toBe('closed');
    expect(inc.closedBy).toBe('colleague');
    expect(inc.pursuit!.ended).toBe('handedOver');
    expect(inc.outcome).toBeUndefined();
    expect(inc.tags).toContain('pursuit:handover');
    expect(s.trust).toBe(trust);
    for (const id of units) expect(s.units[id].incidentId).not.toBe(inc.id);
    expect(s.radio.some((m) => m.from === 'JK' && m.incidentId === inc.id && /naaber/.test(m.text.et))).toBe(true);
    // Neutral in the report: the event is not the player's.
    const r = finalizeShift(s);
    expect(r.highlights.some((h) => JSON.stringify(h).includes(inc.id))).toBe(false);
    expect(r.newspaper.stories.some((x) => JSON.stringify(x).includes(inc.title.et))).toBe(false);
  });

  it('keeping it (or not answering) changes nothing and is not asked again', () => {
    const kept = pursuitOutside();
    step(kept.s, SUBSTEP_MS);
    replyRadio(kept.s, offersOf(kept.s, kept.inc)[0].id, 'keep');
    expect(kept.inc.state).not.toBe('closed');
    expect(kept.inc.pursuit!.ended).toBeUndefined();
    step(kept.s, 2 * MIN);
    expect(offersOf(kept.s, kept.inc).length).toBe(1);

    const silent = pursuitOutside();
    step(silent.s, (COLLEAGUES.handoverOfferMin + 1) * MIN);
    expect(offersOf(silent.s, silent.inc).length).toBe(1);
    expect(silent.inc.pursuit!.ended === undefined || silent.inc.pursuit!.ended !== 'handedOver').toBe(true);
    expect(silent.inc.closedBy).not.toBe('colleague');
  });

  it('no offer while the pursuit stays in the area, nor on a shift without colleagues', () => {
    const { s, inc } = pursuitOutside();
    inc.pursuit!.suspectPos = [26.7232, 58.3776];
    step(s, SUBSTEP_MS);
    expect(offersOf(s, inc)).toEqual([]);
    const fixed = pursuitOutside({ fixedSchedule: true });
    step(fixed.s, SUBSTEP_MS);
    expect(offersOf(fixed.s, fixed.inc)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!ready)('night cover', () => {
  const night = tallinnTime(2026, 10, 14, 19, 0);
  const day = tallinnTime(2026, 10, 14, 7, 0);

  it('picks a small neighbouring sector on some nights, never by day, deterministically', () => {
    for (const r of REGION_IDS) {
      for (const x of starterSectors(r)) {
        let n = 0;
        for (let seed = 1; seed <= 200; seed++) {
          expect(nightCoverFor({ regionId: r, sectors: [x.id], seed, start: day })).toEqual([]);
          const cover = nightCoverFor({ regionId: r, sectors: [x.id], seed, start: night });
          expect(cover).toEqual(nightCoverFor({ regionId: r, sectors: [x.id], seed, start: night }));
          if (!cover.length) continue;
          n++;
          expect(cover.length).toBe(1);
          expect(x.neighbours).toContain(cover[0]);
          expect(areaShare(REGIONS[r], cover)).toBeLessThanOrEqual(COLLEAGUES.nightCoverMaxShare);
        }
        // A sector with no small neighbour reachable by road never gets one.
        if (n) {
          expect(n / 200, x.id).toBeGreaterThan(COLLEAGUES.nightCoverChance - 0.12);
          expect(n / 200, x.id).toBeLessThan(COLLEAGUES.nightCoverChance + 0.12);
        }
      }
    }
  });

  it('a career night shift covers it: calls spawn there, no crew is based there, the orders say so', () => {
    let seed = 1;
    while (!nightCoverFor({ regionId: 'louna', sectors: ['louna-viljandi'], seed, start: night }).length) seed++;
    const cover = nightCoverFor({ regionId: 'louna', sectors: ['louna-viljandi'], seed, start: night });
    const s = careerShift('louna', 'louna-viljandi', { seed, start: night, hours: 12, difficulty: 'realistic' });
    expect(s.coverSectors).toEqual(cover);
    expect(s.sectors).toEqual(['louna-viljandi']);
    const own = new Set(sectorById('louna-viljandi')!.stationIds);
    const theirs = sectorById(cover[0])!.stationIds.filter((id) => !own.has(id));
    for (const id of s.unitOrder) expect(theirs).not.toContain(s.units[id].stationId);
    const order = s.bulletins.find((b) => b.title.et === 'Vastutusala')!;
    expect(order.text.et).toContain('Öine katmine');
    expect(order.text.et).toContain(sectorById(cover[0])!.name.et);
    while (!s.ended) step(s, 5 * MIN);
    const inCover = s.incidentOrder.filter((id) => !helpSector(s.incidents[id]) && sectorOf(REGIONS.louna, s.incidents[id].location) === cover[0]);
    expect(inCover.length).toBeGreaterThan(0);
    // The cover sector's colleague is off: no help request or radio line from that desk.
    // Help requests come from the desks next to the player's own sector, never from the one covered tonight.
    for (const inc of helpCalls(s)) {
      expect(helpSector(inc)).not.toBe(cover[0]);
      expect(sectorById('louna-viljandi')!.neighbours).toContain(helpSector(inc));
    }
    for (const m of deskLines(s)) expect(m.from).not.toBe(deskCallsign(sectorById(cover[0])!));
  });

  it('none by day, in free play or in the daily challenge', () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(careerShift('louna', 'louna-viljandi', { seed, start: day }).coverSectors).toBeUndefined();
      expect(createShift(shiftOpts('louna', { seed, start: night, sectors: ['louna-viljandi'] })).coverSectors).toBeUndefined();
      expect(createShift(shiftOpts('louna', { seed, start: night, sectors: ['louna-viljandi'], fixedSchedule: true })).coverSectors).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!ready)('radio from the neighbouring desks', () => {
  it('a few short lines a shift, well apart, from the desks next door', () => {
    for (const [r, x] of [
      ['pohja', 'pohja-kesklinn'],
      ['ida', 'ida-narva'],
      ['louna', 'louna-viljandi'],
      ['laane', 'laane-parnu'],
    ] as const) {
      const s = createShift(shiftOpts(r, { sectors: [x], hours: 12, seed: 3 }));
      s.flags.autoSpawn = false;
      while (!s.ended) step(s, 5 * MIN);
      const lines = deskLines(s).filter((m) => !m.incidentId);
      expect(lines.length, x).toBeGreaterThan(0);
      expect(lines.length, x).toBeLessThanOrEqual(COLLEAGUES.chatterMax);
      const desks = neighbourSectors([x]).map(deskCallsign);
      for (const m of lines) {
        expect(desks, m.text.et).toContain(m.from);
        expect(m.replies).toBeUndefined();
        expect(m.level).toBe('routine');
        expect(m.t).toBeLessThan(s.endTime);
        expect(m.text.et + m.text.en).not.toMatch(/\{\w+\}/);
      }
      for (let i = 1; i < lines.length; i++) expect(lines[i].t - lines[i - 1].t).toBeGreaterThanOrEqual(COLLEAGUES.chatterGapMin * MIN);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!ready)('determinism and saves', () => {
  it('the same seed gives the same colleagues, also across a save and resume', () => {
    const o = shiftOpts('louna', { sectors: ['louna-tartu'], hours: 8, seed: 11 });
    const a = createShift(o);
    const b = createShift(o);
    step(a, 4 * 60 * MIN);
    step(b, 4 * 60 * MIN);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = JSON.parse(JSON.stringify(a)) as SimState;
    step(a, 4 * 60 * MIN);
    step(c, 4 * 60 * MIN);
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
    expect(deskLines(a).length).toBeGreaterThan(0);
  });

  it('a save without the colleagues field (every older save) has no colleague events', () => {
    const s = createShift(shiftOpts('louna', { sectors: ['louna-tartu'], hours: 8, seed: 11 }));
    delete s.colleagues;
    step(s, 8 * 60 * MIN);
    expect(helpCalls(s)).toEqual([]);
    expect(deskLines(s)).toEqual([]);
    const dir = join(__dirname, 'fixtures', 'saves');
    let n = 0;
    for (const set of readdirSync(dir)) {
      for (const f of readdirSync(join(dir, set))) {
        if (!/autosave.*\.json$/.test(f)) continue;
        const sim = JSON.parse(readFileSync(join(dir, set, f), 'utf8')) as SimState;
        if (!sim || typeof sim !== 'object' || !('incidents' in sim) || sim.ended) continue;
        expect(sim.colleagues).toBeUndefined();
        step(sim, 2 * 60 * MIN);
        expect(helpCalls(sim)).toEqual([]);
        expect(deskLines(sim)).toEqual([]);
        expect(sim.colleagues).toBeUndefined();
        n++;
      }
    }
    expect(n).toBeGreaterThanOrEqual(2);
  });
});
