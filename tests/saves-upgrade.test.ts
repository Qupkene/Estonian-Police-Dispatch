// @vitest-environment jsdom
// Saved games survive updates (docs/DESIGN.md, "Salvestuste ühilduvus").
//
// tests/fixtures/saves/<commit>/ holds what a released version wrote, byte for byte (see its README). Every
// set is loaded here through the real code: the persisted stores (rehydrated from localStorage), the autosave
// loader and resume, and the cloud sync against an in-memory copy of the PHP API. Nothing may be lost.
// Also covered: a newer or unknown version stays untouched, garbage never crashes and is backed up, and the
// zustand behaviour the persist guard exists for.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useCareer } from '@/store/career';
import { useSettings } from '@/store/settings';
import { autosave, loadAutosave, stopLoop, useGame } from '@/store/game';
import { keepBackup, normalizeCareerProfile, readBackups } from '@/store/migrate';
import { parseMeta, SLOTS } from '@/net/sync';
import { rankOf, rosterFromCareer } from '@/sim/career';
import { careerSectors, coversWholeRegion } from '@/sim/careerSectors';
import { sectorsOf } from '@/sim/sectors';
import { createShift, finalizeShift, step } from '@/sim/engine';
import * as cmd from '@/sim/commands';
import { queue, recommendUnits } from '@/sim/selectors';
import { MIN } from '@/sim/time';
import type { CareerProfile, SimState } from '@/sim/types';

// The game loop runs on requestAnimationFrame: never let it run on its own here.
vi.stubGlobal('requestAnimationFrame', () => 1);
vi.stubGlobal('cancelAnimationFrame', () => {});

const ROOT = join(__dirname, 'fixtures', 'saves');
/** Every fixture set (one per released version whose saves must keep loading). */
const SETS = readdirSync(ROOT).filter((d) => statSync(join(ROOT, d)).isDirectory());
const files = (set: string, re: RegExp) => readdirSync(join(ROOT, set)).filter((f) => re.test(f));
const raw = (set: string, f: string) => readFileSync(join(ROOT, set, f), 'utf8');

type Stored<T> = { state: T; version: number };
type CareerData = { profile: CareerProfile | null; inbox: unknown[] };

/**
 * What this version makes of a stored profile: a career from before sectors gets every sector of each unlocked
 * prefecture (docs/SECTORS.md, "Old careers"); everything else stays exactly as it was.
 */
const upgraded = (p: CareerProfile): CareerProfile =>
  p.sectors ? p : { ...p, sectors: Object.fromEntries(p.unlockedRegions.map((r) => [r, sectorsOf(r).map((x) => x.id)])) };

/** Backup keys of the guest (epd:backup.*) and of every account cache (epd:acct:<id>:backup.*). */
const backupKeys = () => Object.keys(localStorage).filter((k) => /^epd:(acct:\d+:)?backup\./.test(k));

// The first page load transforms the whole module graph: done once here, outside any test's time budget.
beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
  await import('@/net/account'); // every test's beforeEach installs its own fetch
}, 60_000);

beforeEach(() => {
  // Every test starts like a fresh page: default stores, empty browser storage.
  useCareer.setState(useCareer.getInitialState(), true);
  useSettings.setState(useSettings.getInitialState(), true);
  localStorage.clear();
  stopLoop();
  useGame.setState({ sim: null, report: null, screen: 'menu' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A dispatcher that keeps a resumed shift moving with the new engine. */
function playOn(s: SimState, minutes: number) {
  for (let i = 0; i < minutes && !s.ended; i++) {
    step(s, MIN);
    for (const c of s.calls) {
      if (c.endedAt) continue;
      if (!c.answeredAt) cmd.answerCall(s, c.id);
      else cmd.endCall(s, c.id, { action: 'create', priority: s.incidents[c.incidentId]?.truePriority ?? 3 });
    }
    for (const inc of queue(s)) {
      if (inc.state === 'incoming') cmd.acknowledge(s, inc.id);
      const recs = recommendUnits(s, inc.id);
      if (inc.assigned.length === 0 && recs.length) cmd.dispatchUnits(s, inc.id, [recs[0].unit.id]);
    }
  }
}

it('has at least the 92ed7f5 fixture set, each with a README', () => {
  expect(SETS).toContain('92ed7f5');
  for (const set of SETS) expect(existsSync(join(ROOT, set, 'README.md'))).toBe(true);
});

for (const set of SETS) {
  describe(`saves written by ${set}`, () => {
    describe('career (epd:career)', () => {
      for (const f of files(set, /^epd-career.*\.json$/)) {
        it(`${f}: rehydrates with every field, writes nothing on load and everything on the next change`, async () => {
          const text = raw(set, f);
          const stored = JSON.parse(text) as Stored<CareerData>;
          localStorage.setItem('epd:career', text);
          await useCareer.persist.rehydrate();
          const s = useCareer.getState();
          const want = stored.state.profile;

          expect(s.inbox).toEqual(stored.state.inbox);
          if (want === null) {
            expect(s.profile).toBeNull();
          } else {
            const p = s.profile!;
            // Field by field what a player would miss first, then the whole profile.
            expect(p.name).toBe(want.name);
            expect(p.badge).toBe(want.badge);
            expect(p.regionId).toBe(want.regionId);
            expect(p.day).toBe(want.day);
            expect(p.money).toBe(want.money);
            expect(p.reputation).toBe(want.reputation);
            expect(p.xp).toBe(want.xp);
            expect(rankOf(p.xp).index).toBe(rankOf(want.xp).index);
            expect(p.staff).toHaveLength(want.staff.length);
            expect(p.fleet).toHaveLength(want.fleet.length);
            expect(p.upgrades).toEqual(want.upgrades);
            expect(p.ledger).toHaveLength(want.ledger.length);
            expect(p.achievements).toEqual(want.achievements);
            expect(p.unlockedRegions).toEqual(want.unlockedRegions);
            expect(p.history).toHaveLength(want.history.length);
            expect(p.recruits).toHaveLength(want.recruits.length);
            expect(p.stats).toEqual(want.stats);
            expect(p.staff).toEqual(want.staff);
            expect(p.fleet).toEqual(want.fleet);
            expect(p.history).toEqual(want.history);
            // A career from before sectors covers every unlocked prefecture whole, so it plays as it did.
            for (const r of want.unlockedRegions) {
              if (!want.sectors) expect(careerSectors(p, r)).toEqual(sectorsOf(r).map((x) => x.id));
              if (!want.sectors) expect(coversWholeRegion(p, r)).toBe(true);
            }
            expect(p).toEqual(upgraded(want));
          }
          // Loading alone changes nothing in the browser and needs no backup.
          expect(localStorage.getItem('epd:career')).toBe(text);
          expect(backupKeys()).toEqual([]);

          if (want) {
            useCareer.getState().update((p) => ({ ...p, money: p.money + 1 }));
            const after = JSON.parse(localStorage.getItem('epd:career')!) as Stored<CareerData>;
            expect(after.version).toBe(stored.version);
            expect(after.state.profile).toEqual({ ...upgraded(want), money: want.money + 1 });
            expect(after.state.inbox).toEqual(stored.state.inbox);
          }
        });
      }

      it('epd-career.json: this version plays on with it (roster, a paid shift, old extras kept)', async () => {
        if (!existsSync(join(ROOT, set, 'epd-career.json'))) return;
        localStorage.setItem('epd:career', raw(set, 'epd-career.json'));
        await useCareer.persist.rehydrate();
        const before = useCareer.getState().profile!;
        const roster = rosterFromCareer(before, 'day');
        expect(roster.length).toBeGreaterThan(0);
        const sim = createShift({
          seed: 99,
          regionId: before.regionId,
          mode: 'career',
          difficulty: 'normal',
          start: Date.UTC(2026, 9, 20, 4, 0),
          hours: 2,
          playerName: before.name,
          roster,
          upgrades: before.upgrades,
          reputation: before.reputation,
          // The career's area: every sector (the whole prefecture, as before) for a career from before sectors.
          sectors: careerSectors(before, before.regionId),
          openPosts: before.openPosts,
        });
        playOn(sim, 3 * 60);
        expect(sim.ended).toBe(true);
        const report = { ...finalizeShift(sim), shiftKey: `${sim.seed}:${sim.startTime}` };
        useCareer.getState().applyReport(report);
        const after = useCareer.getState().profile!;
        expect(after.day).toBe(before.day + 1);
        expect(after.stats.shifts).toBe(before.stats.shifts + 1);
        expect(after.paidShifts).toEqual([...(before.paidShifts ?? []), report.shiftKey]);
        expect(after.ledger.length).toBeGreaterThan(before.ledger.length);
        expect(after.achievements).toEqual(expect.arrayContaining(before.achievements));
        expect((after as CareerProfile & { counters?: unknown }).counters).toBeTruthy();
        // The area, the posts and a waiting offer stay as they were.
        expect(after.sectors).toEqual(before.sectors);
        expect(after.openPosts).toEqual(before.openPosts);
        expect(after.sectorsChangedDay).toEqual(before.sectorsChangedDay);
        if (before.offer) expect(after.offer).toEqual(before.offer);
        expect(JSON.parse(localStorage.getItem('epd:career')!).state.profile.day).toBe(before.day + 1);
      });
    });

    if (files(set, /^epd-settings.*\.json$/).length) describe('settings (epd:settings)', () => {
      for (const f of files(set, /^epd-settings.*\.json$/)) {
        it(`${f}: every value survives`, async () => {
          const text = raw(set, f);
          const stored = JSON.parse(text) as Stored<Record<string, unknown>>;
          localStorage.setItem('epd:settings', text);
          await useSettings.persist.rehydrate();
          const s = useSettings.getState() as unknown as Record<string, unknown>;
          for (const [k, v] of Object.entries(stored.state)) expect(s[k], k).toEqual(v);
          expect(typeof useSettings.getState().set).toBe('function');
          expect(localStorage.getItem('epd:settings')).toBe(text);
          useSettings.getState().set({});
          expect(JSON.parse(localStorage.getItem('epd:settings')!).state).toEqual(stored.state);
          expect(backupKeys()).toEqual([]);
        });
      }
    });

    if (files(set, /^epd-autosave.*\.json$/).length) describe('shift autosave (epd:autosave)', () => {
      for (const f of files(set, /^epd-autosave.*\.json$/)) {
        it(`${f}: loads unchanged and resumes (same incidents, units, calls, clock), then plays on`, () => {
          const text = raw(set, f);
          const want = JSON.parse(text) as SimState;
          localStorage.setItem('epd:autosave', text);
          const sim = loadAutosave();
          expect(sim).not.toBeNull();
          expect(sim).toEqual(want);
          expect(localStorage.getItem('epd:autosave')).toBe(text);

          useGame.getState().resumeShift(sim!);
          const g = useGame.getState();
          if (want.ended) {
            // Finished before its report was opened: the report comes straight away, exactly once.
            expect(g.screen).toBe('report');
            expect(g.report?.shiftKey).toBe(`${want.seed}:${want.startTime}`);
            expect(localStorage.getItem('epd:autosave')).toBeNull();
            return;
          }
          expect(g.screen).toBe('game');
          const s = g.sim!;
          expect(s.now).toBe(want.now);
          expect(s.mode).toBe(want.mode);
          expect(s.regionId).toBe(want.regionId);
          expect(s.incidentOrder).toEqual(want.incidentOrder);
          expect(s.unitOrder).toEqual(want.unitOrder);
          expect(Object.keys(s.incidents)).toEqual(Object.keys(want.incidents));
          expect(s.calls).toEqual(want.calls);
          expect(s.stats).toEqual(want.stats);
          // The new engine keeps running it to the end.
          playOn(s, 13 * 60);
          expect(s.ended).toBe(true);
          expect(() => finalizeShift(s)).not.toThrow();
          stopLoop();
        });
      }
    });

    if (files(set, /^epd-sync.*\.json$/).length) describe('sync marker (epd:sync)', () => {
      for (const f of files(set, /^epd-sync.*\.json$/)) {
        it(`${f}: is understood, and unknown history counts as changed (never replaced without a backup)`, () => {
          const text = raw(set, f);
          const stored = JSON.parse(text) as {
            owner?: number | null;
            account?: number | null;
            updated?: Record<string, number>;
          };
          const meta = parseMeta(text);
          const owner = stored.owner ?? null;
          for (const slot of ['career', 'settings', 'autosave'] as const) {
            expect(meta.slots[slot].owner).toBe(owner);
            expect(meta.slots[slot].dirty).toBe(true);
            if (stored.updated) expect(meta.slots[slot].base).toBe(stored.updated[slot]);
          }
          if ('owner' in stored && !('account' in stored)) expect(meta.account).toBe(owner);
        });
      }
    });

    if (existsSync(join(ROOT, set, 'cloud-save-response.json'))) {
      describe('cloud saves (GET /api/save)', () => {
        const cloud = () =>
          JSON.parse(raw(set, 'cloud-save-response.json')) as Record<string, unknown> & {
            updated: Record<string, number>;
          };

        it('a new device gets the whole cloud career, settings and shift, and uploads nothing over them', async () => {
          const res = cloud();
          api.cookie = 7;
          api.load(7, res);
          const page = await boot();
          const c = res.career as CareerData;
          expect(page.useCareer.getState().profile).toEqual(upgraded(c.profile!));
          expect(page.useCareer.getState().inbox).toEqual(c.inbox);
          const st = page.useSettings.getState() as unknown as Record<string, unknown>;
          for (const [k, v] of Object.entries(res.settings as Record<string, unknown>))
            expect(st[k], k).toEqual(v);
          expect(page.game.loadAutosave()).toEqual(res.autosave);
          expect(api.writes()).toEqual([]);
          expect(api.json(7, 'career')).toEqual(res.career);
        });

        it('the browser that synced it before the update: nothing is replaced or backed up, only sectors are added', async () => {
          const res = cloud();
          const sameAsCloud = [
            ['epd:career', 'epd-career.json', 'career'],
            ['epd:settings', 'epd-settings-custom.json', 'settings'],
            ['epd:autosave', 'epd-autosave-career.json', 'autosave'],
          ] as const;
          for (const [key, f, slot] of sameAsCloud) {
            if (!existsSync(join(ROOT, set, f))) return;
            const v = JSON.parse(raw(set, f));
            // The fixtures were written by one session: the browser copy is what it uploaded.
            expect(slot === 'autosave' ? v : v.state).toEqual(res[slot]);
            localStorage.setItem(key, raw(set, f));
          }
          localStorage.setItem('epd:sync', raw(set, 'epd-sync.json'));
          api.cookie = 7;
          api.load(7, res);
          const page = await boot();
          const cloudCareer = res.career as CareerData;
          expect(page.useCareer.getState().profile).toEqual(upgraded(cloudCareer.profile!));
          expect(page.game.loadAutosave()).toEqual(res.autosave);
          // The 92ed7f5 marker counts every slot as changed here. A career from before sectors loads with its
          // sectors filled in (docs/SECTORS.md), so it differs from the cloud copy and goes up once, on the
          // version it was synced with: the cloud copy plus `sectors`, nothing lost. Nothing else is written.
          const writes = api.writes();
          expect(writes.filter((c) => c.path !== '/api/save/career')).toEqual([]);
          const careerUp = writes.length > 0;
          expect(careerUp).toBe(!cloudCareer.profile!.sectors);
          if (careerUp) expect(api.json(7, 'career')).toEqual({ ...cloudCareer, profile: upgraded(cloudCareer.profile!) });
          expect(backupKeys()).toEqual([]);
          // The account's data moved into its own namespace, byte for byte; the guest's keys hold none of it.
          expect(localStorage.getItem('epd:acct:7:career')).toBe(raw(set, 'epd-career.json'));
          expect(localStorage.getItem('epd:acct:7:autosave')).toBe(raw(set, 'epd-autosave-career.json'));
          expect(localStorage.getItem('epd:career')).toBeNull();
          expect(localStorage.getItem('epd:autosave')).toBeNull();
          const meta = JSON.parse(localStorage.getItem('epd:acct:7:sync')!);
          for (const slot of ['career', 'settings', 'autosave'] as const) {
            const base = slot === 'career' && careerUp ? api.rows.get('7:career')!.updated : res.updated[slot];
            expect(meta.slots[slot]).toEqual({ owner: 7, base, dirty: false });
          }
        });

        it('a guest who logs in to an account with another career keeps the guest career as the guest\'s', async () => {
          if (!existsSync(join(ROOT, set, 'epd-career-new.json'))) return;
          const guest = raw(set, 'epd-career.json');
          localStorage.setItem('epd:career', guest);
          if (existsSync(join(ROOT, set, 'epd-sync-guest.json')))
            localStorage.setItem('epd:sync', raw(set, 'epd-sync-guest.json'));
          const other = (JSON.parse(raw(set, 'epd-career-new.json')) as Stored<CareerData>).state;
          api.write(7, 'career', other);
          const page = await boot();
          expect(page.useCareer.getState().profile).toEqual(upgraded((JSON.parse(guest) as Stored<CareerData>).state.profile!));
          expect(await page.useAccount.getState().login('mari_tamm', 'x')).toBe(true);
          await settle();
          expect(page.useCareer.getState().profile).toEqual(upgraded(other.profile!));
          expect(api.json(7, 'career')).toEqual(other);
          // The guest's career never left its key, and a copy waits for a rollback to 92ed7f5 (src/net/sync.ts legacyMeta).
          expect(localStorage.getItem('epd:career')).toBe(guest);
          expect(readBackups('career.guest', null)[0].data).toEqual((JSON.parse(guest) as Stored<CareerData>).state);
          const out = page.useAccount.getState().logout();
          await vi.advanceTimersByTimeAsync(3500);
          await out;
          expect(page.useCareer.getState().profile).toEqual(upgraded((JSON.parse(guest) as Stored<CareerData>).state.profile!));
        });
      });
    }
  });
}

// ── Versions this code does not know, garbage, repairs ──────────────────────

describe('a newer or unknown version is kept untouched', () => {
  const fixture = () =>
    JSON.parse(raw('92ed7f5', 'epd-career.json')) as Stored<CareerData & Record<string, unknown>>;

  it('career: read for play, never written over, copied to a backup, and logged', async () => {
    const f = fixture();
    const future = JSON.stringify({
      state: {
        ...f.state,
        profile: { ...f.state.profile, version: 7, prestige: { level: 3 } },
        contracts: [{ id: 'c1' }],
      },
      version: 99,
    });
    localStorage.setItem('epd:career', future);
    await useCareer.persist.rehydrate();
    const p = useCareer.getState().profile as CareerProfile & { prestige?: unknown };
    expect(p.name).toBe(f.state.profile!.name);
    expect(p.money).toBe(f.state.profile!.money);
    expect(p.prestige).toEqual({ level: 3 });
    expect((useCareer.getState() as unknown as Record<string, unknown>).contracts).toEqual([{ id: 'c1' }]);
    expect(localStorage.getItem('epd:backup.career.v99')).toBe(future);
    // Playing on changes the screen, never the stored copy of the newer version.
    useCareer.getState().update((x) => ({ ...x, money: x.money + 500 }));
    useCareer.getState().reset();
    expect(localStorage.getItem('epd:career')).toBe(future);
    expect(console.warn).toHaveBeenCalled();
  });

  it('settings: the same', async () => {
    const future = JSON.stringify({ state: { lang: 'en', volume: 0.2, hapticFeedback: true }, version: 5 });
    localStorage.setItem('epd:settings', future);
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().lang).toBe('en');
    expect(useSettings.getState().volume).toBe(0.2);
    expect((useSettings.getState() as unknown as Record<string, unknown>).hapticFeedback).toBe(true);
    useSettings.getState().set({ volume: 1 });
    expect(localStorage.getItem('epd:settings')).toBe(future);
    expect(localStorage.getItem('epd:backup.settings.v5')).toBe(future);
  });

  it('a version-less envelope is not guessed at either', async () => {
    const odd = JSON.stringify({ state: { profile: fixture().state.profile, inbox: [] } });
    localStorage.setItem('epd:career', odd);
    await useCareer.persist.rehydrate();
    expect(useCareer.getState().profile?.name).toBe(fixture().state.profile!.name);
    useCareer.getState().update((x) => ({ ...x, day: x.day + 1 }));
    expect(localStorage.getItem('epd:career')).toBe(odd);
  });

  it('autosave of a newer SimState version: not resumed, moved to its backup key byte for byte, never deleted', () => {
    const text = raw('92ed7f5', 'epd-autosave-free.json').replace('"version":2', '"version":3');
    localStorage.setItem('epd:autosave', text);
    expect(loadAutosave()).toBeNull();
    expect(localStorage.getItem('epd:backup.autosave.v3')).toBe(text);
    expect(localStorage.getItem('epd:autosave')).toBeNull();
  });

  it('an older career version is migrated, and the original kept', async () => {
    const f = fixture();
    const old = JSON.stringify({ ...f, version: 0 });
    localStorage.setItem('epd:career', old);
    await useCareer.persist.rehydrate();
    expect(useCareer.getState().profile).toEqual(upgraded(f.state.profile!));
    expect(localStorage.getItem('epd:backup.career.v0')).toBe(old);
    expect(JSON.parse(localStorage.getItem('epd:career')!)).toEqual({ ...f, state: { ...f.state, profile: upgraded(f.state.profile!) }, version: 1 });
  });
});

describe('garbage never crashes and is backed up', () => {
  it('career, settings and autosave', async () => {
    localStorage.setItem('epd:career', '{"state":{"profile":{"name":"Mari"');
    localStorage.setItem('epd:settings', 'not json at all');
    localStorage.setItem('epd:autosave', '{"version":2,"units":');
    await useCareer.persist.rehydrate();
    await useSettings.persist.rehydrate();
    expect(useCareer.getState().profile).toBeNull();
    expect(useSettings.getState().lang).toBe('et');
    expect(loadAutosave()).toBeNull();
    expect(localStorage.getItem('epd:backup.career.invalid')).toBe('{"state":{"profile":{"name":"Mari"');
    expect(localStorage.getItem('epd:backup.settings.invalid')).toBe('not json at all');
    expect(localStorage.getItem('epd:backup.autosave.invalid')).toBe('{"version":2,"units":');
    // With the copy safe, the game may start over.
    useCareer.getState().create('Uus Algus', '123', 'louna');
    expect(JSON.parse(localStorage.getItem('epd:career')!).state.profile.name).toBe('Uus Algus');
  });

  it('when even the backup cannot be written, the stored value stays as it is', async () => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith('epd:backup.')) throw new DOMException('full', 'QuotaExceededError');
      setItem.call(this, k, v);
    });
    localStorage.setItem('epd:career', '{broken');
    localStorage.setItem('epd:autosave', '{broken');
    await useCareer.persist.rehydrate();
    useCareer.getState().create('Keegi', '555', 'pohja');
    expect(localStorage.getItem('epd:career')).toBe('{broken');
    expect(loadAutosave()).toBeNull();
    expect(localStorage.getItem('epd:autosave')).toBe('{broken');
  });

  it('broken entries are dropped one by one, the rest stays, and the original is kept', async () => {
    const f = JSON.parse(raw('92ed7f5', 'epd-career.json')) as Stored<CareerData>;
    const p = f.state.profile!;
    const broken = {
      ...f,
      state: {
        ...f.state,
        inbox: [...f.state.inbox, 42],
        profile: {
          ...p,
          money: String(p.money), // a sloppy writer: numbers stay numbers
          staff: [...p.staff, 7, { firstName: 'Ilma Id' }],
          ledger: [...p.ledger, { day: 3, kind: 'bonus', text: 'x' }],
          unlockedRegions: [...p.unlockedRegions, 'saared'],
          stats: { ...p.stats, arrests: null },
        },
      },
    };
    const text = JSON.stringify(broken);
    localStorage.setItem('epd:career', text);
    await useCareer.persist.rehydrate();
    const got = useCareer.getState().profile!;
    expect(got.money).toBe(p.money);
    expect(got.staff).toEqual(p.staff);
    expect(got.ledger).toEqual(p.ledger);
    expect(got.unlockedRegions).toEqual(p.unlockedRegions);
    expect(got.stats).toEqual({ ...p.stats, arrests: 0 });
    expect(got.fleet).toEqual(p.fleet);
    expect(useCareer.getState().inbox).toEqual(f.state.inbox);
    expect(localStorage.getItem('epd:backup.career.repaired')).toBe(text);
  });

  it('the normaliser fills what is missing and is idempotent', () => {
    const p = normalizeCareerProfile({ name: 'Tühi', regionId: 'ida' })!;
    expect(p).toMatchObject({
      name: 'Tühi',
      regionId: 'ida',
      day: 1,
      staff: [],
      fleet: [],
      ledger: [],
      unlockedRegions: ['ida'],
    });
    expect(normalizeCareerProfile(p)).toEqual(p);
    expect(normalizeCareerProfile('nope')).toBeNull();
    expect(normalizeCareerProfile(null)).toBeNull();
  });
});

describe('nothing is replaced without a copy', () => {
  it('resetting the career keeps it in epd:backup.career', async () => {
    const f = JSON.parse(raw('92ed7f5', 'epd-career.json')) as Stored<CareerData>;
    localStorage.setItem('epd:career', raw('92ed7f5', 'epd-career.json'));
    await useCareer.persist.rehydrate();
    useCareer.getState().reset();
    const [b] = readBackups('career');
    expect(b).toMatchObject({ reason: 'reset', unique: true });
    expect(b.data).toEqual({ ...f.state, profile: upgraded(f.state.profile!) });
  });

  it('a new shift taking the save key keeps the other unfinished shift', () => {
    const old = raw('92ed7f5', 'epd-autosave-free.json');
    localStorage.setItem('epd:autosave', old);
    const s = createShift({
      seed: 4321,
      regionId: 'laane',
      mode: 'free',
      difficulty: 'normal',
      start: Date.UTC(2026, 9, 21, 16, 0),
      hours: 4,
      playerName: 'Mari',
    });
    autosave(s);
    expect(loadAutosave()?.seed).toBe(4321);
    expect(readBackups('autosave')[0].data).toEqual(JSON.parse(old));
  });

  it('storage full: the copy of a replaced shift makes room for the shift being played, nothing else does', () => {
    localStorage.setItem(
      'epd:backup.autosave',
      JSON.stringify({ at: 1, reason: 'replaced', unique: true, data: {} }),
    );
    localStorage.setItem('epd:backup.autosave.v3', '{"version":3}');
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === 'epd:autosave' && this.getItem('epd:backup.autosave') !== null) {
        throw new DOMException('full', 'QuotaExceededError');
      }
      setItem.call(this, k, v);
    });
    const s = JSON.parse(raw('92ed7f5', 'epd-autosave-free.json')) as SimState;
    autosave(s, { cloud: false }); // a cloud copy never pushes a backup out
    expect(localStorage.getItem('epd:autosave')).toBeNull();
    expect(localStorage.getItem('epd:backup.autosave')).not.toBeNull();
    autosave(s);
    expect(loadAutosave()?.seed).toBe(s.seed);
    expect(localStorage.getItem('epd:backup.autosave')).toBeNull();
    expect(localStorage.getItem('epd:backup.autosave.v3')).toBe('{"version":3}');
  });

  it('a cloud shift this version will not resume (here: report still pending) is kept in the browser', async () => {
    const ended = JSON.parse(raw('92ed7f5', 'epd-autosave-ended.json')) as SimState;
    api.cookie = 7;
    api.write(7, 'autosave', ended);
    await boot();
    // In the account's own namespace (epd:acct:7:backup.autosave.cloud).
    expect(readBackups('autosave.cloud', 7)[0].data).toEqual(ended);
  });

  it('backups are bounded and copies found nowhere else are kept over the others', () => {
    keepBackup('career', { n: 1 }, { reason: 'cloud', unique: true });
    keepBackup('career', { n: 2 }, { reason: 'cloud' });
    keepBackup('career', { n: 3 }, { reason: 'cloud' });
    expect(readBackups('career').map((b) => b.data)).toEqual([{ n: 3 }, { n: 1 }]);
    keepBackup('career', { n: 3 }, { reason: 'cloud' }); // the same copy twice is kept once
    keepBackup('career', { n: 4 }, { reason: 'reset', unique: true });
    expect(readBackups('career').map((b) => b.data)).toEqual([{ n: 4 }, { n: 1 }]);
    expect(backupKeys().sort()).toEqual(['epd:backup.career', 'epd:backup.career.prev']);
  });
});

describe('zustand behaviour the persist guard exists for', () => {
  it('without migrate, a version change throws the stored state away and the next change overwrites it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('zustand-probe', JSON.stringify({ state: { money: 5000 }, version: 1 }));
    const probe = create<{ money: number; add: () => void }>()(
      persist((set, get) => ({ money: 0, add: () => set({ money: get().money + 1 }) }), {
        name: 'zustand-probe',
        version: 2,
      }),
    );
    expect(probe.getState().money).toBe(0);
    probe.getState().add();
    expect(JSON.parse(localStorage.getItem('zustand-probe')!).state.money).toBe(1);
  });
});

// ── Each identity's own browser data (src/store/space.ts) ───────────────────

describe('each identity has its own browser data: account data moves out of the plain keys once', () => {
  const fx = (f: string) => raw('92ed7f5', f);
  const state = (f: string) => (JSON.parse(fx(f)) as Stored<CareerData>).state;
  const dump = () => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]));
  const synced = (base: number) => ({ owner: 7, base, dirty: false });

  it("account-owned plain keys move into the account's namespace byte for byte; the guest starts without them", async () => {
    localStorage.setItem('epd:career', fx('epd-career.json'));
    localStorage.setItem('epd:settings', fx('epd-settings-custom.json'));
    localStorage.setItem('epd:autosave', fx('epd-autosave-career.json'));
    localStorage.setItem('epd:sync', fx('epd-sync.json')); // 92ed7f5: owner 7
    const page = await boot(); // signed out
    expect(localStorage.getItem('epd:acct:7:career')).toBe(fx('epd-career.json'));
    expect(localStorage.getItem('epd:acct:7:autosave')).toBe(fx('epd-autosave-career.json'));
    expect(localStorage.getItem('epd:acct:7:settings')).toBe(fx('epd-settings-custom.json'));
    expect(localStorage.getItem('epd:career')).toBeNull();
    expect(localStorage.getItem('epd:autosave')).toBeNull();
    // The preferences of this browser stay for the guest as well.
    expect(localStorage.getItem('epd:settings')).toBe(fx('epd-settings-custom.json'));
    expect(page.useCareer.getState().profile).toBeNull();
    expect(page.game.loadAutosave()).toBeNull();
    // Unknown history (format 1) still counts as changed: never replaced without a backup, uploaded when in sync.
    const fmt1 = JSON.parse(fx('epd-sync.json')) as { updated: Record<string, number> };
    const acct = JSON.parse(localStorage.getItem('epd:acct:7:sync')!);
    for (const slot of SLOTS) expect(acct.slots[slot]).toEqual({ owner: 7, base: fmt1.updated[slot], dirty: true });
    expect(JSON.parse(localStorage.getItem('epd:sync')!)).toMatchObject({ v: 3, account: 7 });
    expect(backupKeys()).toEqual([]);
    // Only once: the next load changes nothing.
    const before = dump();
    await boot();
    expect(dump()).toEqual(before);
  });

  it('the guest gets back what an account once replaced (guest backups); the backups stay', async () => {
    const guest = state('epd-career-new.json');
    const guestShift = JSON.parse(fx('epd-autosave-free.json')) as SimState;
    localStorage.setItem('epd:career', fx('epd-career.json'));
    localStorage.setItem('epd:autosave', fx('epd-autosave-career.json'));
    // The release before kept the guest's career and shift when account 7's cloud copies replaced them at sign-in.
    // A newer backup of another kind (a career reset, no owner) is not the guest's.
    const guestBackup = JSON.stringify({ at: 1, reason: 'cloud', unique: true, owner: null, data: guest });
    const resetBackup = JSON.stringify({ at: 2, reason: 'reset', unique: true, data: state('epd-career.json') });
    localStorage.setItem('epd:backup.career', resetBackup);
    localStorage.setItem('epd:backup.career.prev', guestBackup);
    localStorage.setItem('epd:backup.autosave', JSON.stringify({ at: 1, reason: 'cloud', unique: true, owner: null, data: guestShift }));
    localStorage.setItem('epd:sync', JSON.stringify({ v: 2, account: 7, slots: { career: synced(10), settings: synced(10), autosave: synced(10) } }));
    const page = await boot();
    expect(page.useCareer.getState().profile).toEqual(upgraded(guest.profile!));
    expect(JSON.parse(localStorage.getItem('epd:career')!)).toEqual({ state: guest, version: 1 });
    expect(page.game.loadAutosave()?.seed).toBe(guestShift.seed);
    expect(localStorage.getItem('epd:backup.career')).toBe(resetBackup);
    expect(localStorage.getItem('epd:backup.career.prev')).toBe(guestBackup);
    expect(localStorage.getItem('epd:acct:7:career')).toBe(fx('epd-career.json'));
    expect(localStorage.getItem('epd:acct:7:autosave')).toBe(fx('epd-autosave-career.json'));
  });

  it('changes the server never got (also what a guest played after signing out before) are uploaded at the next sign-in', async () => {
    api.write(7, 'career', state('epd-career.json'));
    const base = api.rows.get('7:career')!.updated;
    const changed = { ...state('epd-career.json'), profile: { ...state('epd-career.json').profile!, money: 4242 } };
    localStorage.setItem('epd:career', JSON.stringify({ state: changed, version: 1 }));
    localStorage.setItem('epd:sync', JSON.stringify({ v: 2, account: null, slots: { career: { owner: 7, base, dirty: true } } }));
    const page = await boot();
    expect(page.useCareer.getState().profile).toBeNull(); // the guest has none
    expect(JSON.parse(localStorage.getItem('epd:acct:7:career')!).state.profile.money).toBe(4242);
    expect(await page.useAccount.getState().login('mari_tamm', 'x')).toBe(true);
    await settle();
    expect((api.json(7, 'career') as CareerData).profile!.money).toBe(4242);
    expect(page.useCareer.getState().profile!.money).toBe(4242);
  });

  it("data of no account, an unknown one or with no marker at all stays the guest's", async () => {
    for (const marker of [fx('epd-sync-guest.json'), null, 'garbage', JSON.stringify({ v: 2, account: 3, slots: {} })]) {
      localStorage.clear();
      localStorage.setItem('epd:career', fx('epd-career.json'));
      localStorage.setItem('epd:autosave', fx('epd-autosave-free.json'));
      if (marker !== null) localStorage.setItem('epd:sync', marker);
      const page = await boot();
      expect(page.useCareer.getState().profile).toEqual(upgraded(state('epd-career.json').profile!));
      expect(localStorage.getItem('epd:career')).toBe(fx('epd-career.json'));
      expect(page.game.loadAutosave()?.seed).toBe((JSON.parse(fx('epd-autosave-free.json')) as SimState).seed);
      expect(Object.keys(localStorage).filter((k) => k.startsWith('epd:acct:'))).toEqual([]);
    }
  });

  it('after a rollback (92ed7f5 wrote its marker again) it moves again, keeping a changed cache and the guest career', async () => {
    const guest = state('epd-career-new.json');
    // This version had a cache of account 7 with a change the server never got, and the sign-in copy of the
    // guest's career...
    const cached = JSON.stringify({ state: { ...state('epd-career.json'), profile: { ...state('epd-career.json').profile!, money: 1111 } }, version: 1 });
    localStorage.setItem('epd:acct:7:career', cached);
    localStorage.setItem('epd:acct:7:sync', JSON.stringify({ v: 3, slots: { career: { owner: 7, base: 5, dirty: true } } }));
    localStorage.setItem('epd:backup.career.guest', JSON.stringify({ at: 5, reason: 'guest', unique: true, owner: null, data: guest }));
    // ...then 92ed7f5 ran signed in: the account's cloud career in the plain keys, its marker.
    localStorage.setItem('epd:career', fx('epd-career.json'));
    localStorage.setItem('epd:sync', fx('epd-sync.json'));
    const page = await boot();
    expect(localStorage.getItem('epd:acct:7:career')).toBe(fx('epd-career.json'));
    expect(localStorage.getItem('epd:acct:7:backup.career.replaced')).toBe(cached);
    expect(page.useCareer.getState().profile).toEqual(upgraded(guest.profile!));
  });

  it('when storage refuses the move nothing is lost, and it is tried again on the next load', async () => {
    localStorage.setItem('epd:career', fx('epd-career.json'));
    localStorage.setItem('epd:autosave', fx('epd-autosave-career.json'));
    localStorage.setItem('epd:sync', fx('epd-sync.json'));
    const setItem = Storage.prototype.setItem;
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith('epd:acct:')) throw new DOMException('full', 'QuotaExceededError');
      setItem.call(this, k, v);
    });
    await boot();
    expect(localStorage.getItem('epd:career')).toBe(fx('epd-career.json'));
    expect(localStorage.getItem('epd:autosave')).toBe(fx('epd-autosave-career.json'));
    expect(localStorage.getItem('epd:sync')).toBe(fx('epd-sync.json'));
    full.mockRestore();
    await boot();
    expect(localStorage.getItem('epd:acct:7:career')).toBe(fx('epd-career.json'));
    expect(localStorage.getItem('epd:acct:7:autosave')).toBe(fx('epd-autosave-career.json'));
    expect(localStorage.getItem('epd:career')).toBeNull();
  });

  it("a sign-in on the load whose move failed leaves the move pending and gives the guest none of the account's data", async () => {
    localStorage.setItem('epd:career', fx('epd-career.json'));
    localStorage.setItem('epd:autosave', fx('epd-autosave-career.json'));
    localStorage.setItem('epd:sync', fx('epd-sync.json'));
    api.cookie = 7;
    const setItem = Storage.prototype.setItem;
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith('epd:acct:')) throw new DOMException('full', 'QuotaExceededError');
      setItem.call(this, k, v);
    });
    await boot(); // signed in: the guest's marker is written (it records the account)
    expect(JSON.parse(localStorage.getItem('epd:sync')!)).toMatchObject({ account: 7 });
    full.mockRestore();
    window.dispatchEvent(new StorageEvent('storage', { key: 'epd:sync', newValue: null }));
    api.cookie = null;
    const page = await boot(); // signed out
    expect(localStorage.getItem('epd:acct:7:career')).toBe(fx('epd-career.json'));
    expect(localStorage.getItem('epd:acct:7:autosave')).toBe(fx('epd-autosave-career.json'));
    expect(page.useCareer.getState().profile).toBeNull();
    expect(page.game.loadAutosave()).toBeNull();
    expect(localStorage.getItem('epd:backup.career.guest')).toBeNull();
  });
});

// ── In-memory PHP API (docs/SERVER.md 4.1: slot versions, ?base= preconditions) ──

type Slot = 'career' | 'settings' | 'autosave';

class FakeApi {
  cookie: number | null = null;
  rows = new Map<string, { json: string; updated: number }>();
  clock = 1_900_000_000_000;
  calls: { method: string; path: string }[] = [];

  /** Rows exactly as a GET /api/save reply describes them. */
  load(uid: number, res: Record<string, unknown> & { updated: Record<string, number> }) {
    for (const slot of ['career', 'settings', 'autosave'] as const) {
      if (res[slot] !== null && res[slot] !== undefined) {
        this.rows.set(`${uid}:${slot}`, { json: JSON.stringify(res[slot]), updated: res.updated[slot] });
      }
    }
  }
  write(uid: number, slot: Slot, data: unknown) {
    this.rows.set(`${uid}:${slot}`, { json: JSON.stringify(data), updated: ++this.clock });
  }
  json(uid: number, slot: Slot): unknown {
    const row = this.rows.get(`${uid}:${slot}`);
    return row ? JSON.parse(row.json) : undefined;
  }
  writes() {
    return this.calls.filter(
      (c) => (c.method === 'PUT' || c.method === 'DELETE') && c.path.startsWith('/api/save/'),
    );
  }

  async fetch(input: unknown, init: RequestInit = {}): Promise<Response> {
    const url = new URL(String(input), 'http://epd.test');
    const method = init.method ?? 'GET';
    const path = url.pathname;
    this.calls.push({ method, path });
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const user = { id: 7, name: 'mari_tamm', created: 1 };
    if (path === '/api/health') return reply({ ok: true, version: 'test', accounts: true });
    if (path === '/api/me') return reply({ user: this.cookie === null ? null : user });
    if (path === '/api/login') {
      this.cookie = 7;
      return reply({ user });
    }
    if (path === '/api/logout') {
      this.cookie = null;
      return reply({ ok: true });
    }
    if (this.cookie === null) return reply({ error: 'auth_required' }, 401);
    const uid = this.cookie;
    if (path === '/api/save' && method === 'GET') {
      const out: Record<string, unknown> = {};
      const updated: Record<string, number> = {};
      for (const slot of ['career', 'settings', 'autosave'] as const) {
        const row = this.rows.get(`${uid}:${slot}`);
        if (url.searchParams.get('versions') !== '1') out[slot] = row ? JSON.parse(row.json) : null;
        if (row) updated[slot] = row.updated;
      }
      return reply({ ...out, updated });
    }
    const m = /^\/api\/save\/(career|settings|autosave)$/.exec(path);
    if (m && (method === 'PUT' || method === 'DELETE')) {
      const key = `${uid}:${m[1]}`;
      const current = this.rows.get(key)?.updated ?? 0;
      const base = url.searchParams.get('base');
      if (base !== null && Number(base) !== current)
        return reply({ error: 'save_conflict', updated: current }, 409);
      const updated = Math.max(++this.clock, current + 1);
      this.rows.set(key, { json: method === 'PUT' ? String(init.body) : 'null', updated });
      return reply({ ok: true, updated });
    }
    return reply({ error: 'not_found' }, 404);
  }
}

let api: FakeApi;

/** One page load on the current browser storage: fresh modules, stores hydrate, the account syncs. */
async function boot() {
  vi.resetModules();
  const account = await import('@/net/account');
  const careerStore = await import('@/store/career');
  const settingsStore = await import('@/store/settings');
  const game = await import('@/store/game');
  await account.useAccount.getState().init();
  await settle();
  return {
    useAccount: account.useAccount,
    useCareer: careerStore.useCareer,
    useSettings: settingsStore.useSettings,
    game,
  };
}

const settle = () => vi.advanceTimersByTimeAsync(2500);

beforeEach(() => {
  api = new FakeApi();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown, init?: RequestInit) => api.fetch(input, init)),
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
});

afterEach(() => {
  // Earlier pages stop syncing (their tab "closed").
  window.dispatchEvent(new StorageEvent('storage', { key: 'epd:sync', newValue: null }));
  vi.unstubAllGlobals();
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
