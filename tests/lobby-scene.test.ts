/**
 * Juhtimiskeskuse saal (src/lobby3d/scene.ts, docs/MULTIPLAYER.md section 19): the description of the multiplayer
 * screen's 3D room follows from what the screen shows. A guest's room is in standby; the create form's mode and
 * prefecture arrange it; a room seats its players with their marks, and its wall says what the room does. Every
 * word comes from the dictionary, in the player's language.
 */
import { describe, expect, it } from 'vitest';
import { DICT, t as translate } from '@/i18n';
import {
  describeScene,
  LED_COLOUR,
  newlySeated,
  PALETTE,
  seatAngles,
  seatStates,
  sceneWords,
  SECTOR_COLOURS,
  type SceneDesc,
  type StageSource,
} from '@/lobby3d/scene';
import { parseRoom, type Room } from '@/net/rooms';
import { defaultDesks } from '@/sim/desks';
import { DEFAULT_ROOM_OPTIONS, roomStart } from '@/sim/room';
import { sectorById } from '@/sim/sectors';
import { hhmm, HOUR } from '@/sim/time';
import type { Lang } from '@/sim/types';

const words = (lang: Lang = 'et', clock = '21:07') =>
  sceneWords(
    (key, vars) => translate(key, lang, vars),
    (text) => text[lang],
    clock,
  );
/** The scene of a source, or of a room as it is. */
const scene = (src: StageSource | Room, lang: Lang = 'et') =>
  describeScene('kind' in src ? src : { kind: 'room', room: src }, words(lang));

/** A room as the server sends it (server/lib/rooms.php epd_room_public), read as the client reads it. */
function room(over: Record<string, unknown> = {}): Room {
  const r = parseRoom({
    code: 'K7M2QX',
    mode: 'race',
    state: 'lobby',
    v: '3.3',
    host: 1,
    me: 2,
    max: 4,
    options: { regionId: 'louna', sector: 'louna-tartu', difficulty: 'normal', hours: 3, slot: 'evening' },
    seed: null,
    day: null,
    created: 1_792_400_000_000,
    started: null,
    players: [
      {
        id: 2,
        name: 'Ivo',
        seat: 1,
        host: false,
        ready: false,
        online: true,
        left: false,
        done: false,
        avatar: 'draw:77',
      },
      { id: 1, name: 'Hanna', seat: 0, host: true, ready: true, online: true, left: false, done: false },
    ],
    results: [],
    ...over,
  });
  if (!r) throw new Error('the fixture is not a room');
  return r;
}

const create = (
  mode: 'race' | 'role' | 'sector',
  regionId: 'pohja' | 'ida' | 'louna' | 'laane' = 'pohja',
): StageSource => ({
  kind: 'create',
  mode,
  options: { ...DEFAULT_ROOM_OPTIONS, regionId, desks: defaultDesks(regionId) },
  me: { name: 'Hanna', avatar: 'draw:5' },
});

describe('a guest and an offline player', () => {
  it('see the room in standby: four dark consoles, a dim wall with the map and the standby line', () => {
    const s = scene({ kind: 'standby' });
    expect(s.phase).toBe('standby');
    expect(seatStates(s)).toBe('dark,dark,dark,dark');
    expect(s.seats.every((x) => x.led === 'off' && !x.picture && !x.name)).toBe(true);
    expect(s.wall.dim).toBe(true);
    expect(s.wall.map).toMatchObject({ regionId: null, zoom: 'country', span: 'full' });
    expect(s.wall.hero).toEqual({ kind: 'title', big: 'Ootel', sub: 'Mitmikmäng' });
    expect(scene({ kind: 'standby' }, 'en').wall.hero).toMatchObject({ big: 'Standby' });
    expect(LED_COLOUR.off).toBe(PALETTE.off);
  });
});

describe('the create page', () => {
  it('lights four consoles, the first of them inviting the player with their own picture', () => {
    const s = scene(create('race'));
    expect(s.phase).toBe('create');
    expect(seatStates(s)).toBe('invite,open,open,open');
    expect(s.seats[0]).toMatchObject({
      led: 'invite',
      me: true,
      name: 'Hanna',
      picture: { avatar: 'draw:5', name: 'Hanna' },
    });
    expect(s.seats.slice(1).every((x) => x.led === 'idle' && !x.me && !x.picture)).toBe(true);
    expect(LED_COLOUR.invite).toBe(PALETTE.cyan);
  });

  it('a race: separate consoles, and the wall a scoreboard of four empty ranks beside the map', () => {
    const s = scene(create('race', 'ida'));
    expect(s.arrangement).toBe('separate');
    expect(s.wall.hero).toEqual({
      kind: 'ranks',
      title: 'Võistlus',
      rows: [1, 2, 3, 4].map((n) => ({ rank: String(n), name: '', score: '', me: false })),
    });
    expect(s.wall.map).toMatchObject({ regionId: 'ida', zoom: 'country', span: 'wing', sectors: [] });
    expect(s.seats.map((x) => x.title)).toEqual(['Pult 1', 'Pult 2', 'Pult 3', 'Pult 4']);
  });

  it('role co-op: one team, every console titled with its role, the wall one shared map', () => {
    const s = scene(create('role', 'laane'));
    expect(s.arrangement).toBe('team');
    expect(s.seats.map((x) => x.title)).toEqual([
      'Dispetšer',
      'Kõnevastuvõtja',
      'Raadio ja registrid',
      'Dispetšer',
    ]);
    expect(s.wall.map).toMatchObject({ regionId: 'laane', span: 'full', zoom: 'country' });
    expect(s.wall.hero).toEqual({ kind: 'title', big: 'Rollid', sub: 'Lääne prefektuur' });
    expect(scene(create('role'), 'en').seats[1].title).toBe('Call-taker');
  });

  it("sector co-op: the map split into the prefecture's desks in their colours, each console under its own", () => {
    const s = scene(create('sector', 'louna'));
    const desks = defaultDesks('louna');
    expect(s.arrangement).toBe('sectors');
    expect(s.wall.map.zoom).toBe('region');
    expect(s.wall.map.sectors.map((x) => x.id)).toEqual(desks);
    expect(new Set(s.wall.map.sectors.map((x) => x.colour)).size).toBe(desks.length);
    s.seats.forEach((seat, i) => {
      const desk = desks[i % desks.length];
      expect(seat.sector).toBe(desk);
      expect(seat.tint).toBe(SECTOR_COLOURS[desks.indexOf(desk)]);
      expect(seat.title).toBe(sectorById(desk)!.name.et);
    });
    // The desks are on the wall's list too, with their colours.
    expect(s.wall.side.filter((r) => r.colour).map((r) => r.label)).toEqual(
      desks.map((d) => sectorById(d)!.name.et),
    );
    // No sector colour is the ready green or the waiting amber.
    for (const c of SECTOR_COLOURS) expect([PALETTE.green, PALETTE.amber, PALETTE.gold]).not.toContain(c);
  });

  it('follows the prefecture chosen', () => {
    for (const r of ['pohja', 'ida', 'louna', 'laane'] as const) {
      const s = scene(create('race', r));
      expect(s.wall.map.regionId).toBe(r);
      expect(s.wall.side[1].value).toBe(translate(`account.lb.region.${r}`, 'et'));
    }
  });
});

describe('a room in its lobby', () => {
  it('has a console per seat: players seated with picture, name and marks, the rest free', () => {
    const s = scene(room());
    expect(s.id).toBe('K7M2QX');
    expect(s.phase).toBe('lobby');
    expect(seatStates(s)).toBe('seated,seated,free,free');
    expect(s.seats[0]).toMatchObject({
      name: 'Hanna',
      host: true,
      hostWord: 'Looja',
      me: false,
      led: 'ready',
      status: 'Valmis',
    });
    expect(s.seats[0].picture).toEqual({ avatar: '', name: 'Hanna' });
    expect(s.seats[1]).toMatchObject({ name: 'Ivo', host: false, me: true, led: 'waiting', status: 'Ootab' });
    expect(s.seats[1].picture).toEqual({ avatar: 'draw:77', name: 'Ivo' });
    // An empty seat says so in the seats list's own words.
    expect(s.seats[2]).toMatchObject({ name: DICT['rooms.seat.free'].et, led: 'idle', picture: null });
    expect(LED_COLOUR.ready).toBe(PALETTE.green);
    expect(LED_COLOUR.waiting).toBe(PALETTE.amber);
  });

  it('has as many consoles as the room has seats, and a grey strip for a player who is offline', () => {
    const r = room({ max: 2 });
    r.players[1].online = false;
    const s = scene({ kind: 'room', room: r });
    expect(s.seats).toHaveLength(2);
    const off = s.seats.find((x) => x.name === r.players[1].name)!;
    expect(off).toMatchObject({ led: 'offline', status: 'Ühendus katkenud' });
    expect(LED_COLOUR.offline).toBe(PALETTE.grey);
    expect(scene(room({ max: 3 })).seats).toHaveLength(3);
  });

  it('a player who left does not hold a console', () => {
    const r = room();
    r.players.find((p) => p.name === 'Ivo')!.left = true;
    expect(seatStates(scene({ kind: 'room', room: r }))).toBe('seated,free,free,free');
  });

  it("the wall is a status board: the code in big type, the mode, the prefecture and the shift's time", () => {
    const s = scene(room());
    expect(s.wall.hero).toEqual({
      kind: 'code',
      label: 'Kood',
      code: 'K7M 2QX',
      sub: 'Võistlus · Lõuna prefektuur',
    });
    expect(s.wall.state).toBe('ootab alustamist');
    expect(s.wall.clock).toBe('21:07');
    expect(s.wall.side).toEqual([
      { label: 'Režiim', value: 'Võistlus' },
      { label: 'Prefektuur', value: 'Lõuna' },
      { label: 'Vahetus', value: 'Õhtu · 3 h' },
      { label: 'Mängijad', value: '2/4' },
    ]);
    expect(s.wall.map).toMatchObject({ regionId: 'louna', span: 'wing' });
    expect(scene(room(), 'en').wall.hero).toMatchObject({
      label: 'Code',
      sub: 'Competition · South Prefecture',
    });
  });

  it('role and sector rooms title each console with its role or desk, a picked one before the default', () => {
    const roles = room({ mode: 'role' });
    roles.players.find((p) => p.name === 'Ivo')!.role = 'radio';
    const a = scene({ kind: 'room', room: roles });
    expect(a.arrangement).toBe('team');
    expect(a.seats.map((x) => x.title)).toEqual([
      'Dispetšer',
      'Raadio ja registrid',
      'Raadio ja registrid',
      'Dispetšer',
    ]);

    const desks = defaultDesks('louna');
    const sectors = room({
      mode: 'sector',
      options: {
        regionId: 'louna',
        sector: desks[0],
        desks,
        difficulty: 'normal',
        hours: 3,
        slot: 'evening',
      },
    });
    sectors.players.find((p) => p.name === 'Hanna')!.desk = desks[1];
    const b = scene({ kind: 'room', room: sectors });
    expect(b.arrangement).toBe('sectors');
    expect(b.seats[0]).toMatchObject({ sector: desks[1], tint: SECTOR_COLOURS[1] });
    expect(b.seats[1]).toMatchObject({ sector: desks[1 % desks.length] });
    expect(b.wall.map).toMatchObject({ zoom: 'region', span: 'wing' });
    expect(b.wall.map.sectors.map((x) => x.id)).toEqual(desks);
  });
});

describe('a room whose round is on or over', () => {
  const started = { state: 'running', seed: 123456789, day: '2026-10-20', started: 1_792_400_100_000 };

  it("running: the wall says the shift is on, with the shift's hours and the clock", () => {
    const r = room(started);
    const s = scene({ kind: 'room', room: r });
    const start = roomStart({ seed: r.seed!, day: r.day!, options: r.options });
    const hours = `${hhmm(start)}-${hhmm(start + 3 * HOUR)}`;
    expect(s.phase).toBe('running');
    expect(s.wall.hero).toEqual({ kind: 'title', big: 'Vahetus käib', sub: hours });
    expect(s.wall.state).toBe('vahetus käib');
    expect(s.wall.clock).toBe('21:07');
    expect(s.wall.side[2]).toEqual({ label: 'Vahetus', value: hours });
    // On shift: amber until the player's result is in, then green.
    expect(s.seats[0]).toMatchObject({ led: 'waiting', status: 'Vahetus pooleli' });
    r.players.find((p) => p.name === 'Hanna')!.done = true;
    expect(scene({ kind: 'room', room: r }).seats[0]).toMatchObject({ led: 'ready', status: 'Lõpetas' });
  });

  it("finished: the wall shows the room's results, ranks and names in order", () => {
    const s = scene(
      room({
        ...started,
        state: 'finished',
        results: [
          { id: 2, name: 'Ivo', score: 64, grade: 'C', incidents: 9, arrests: 1, xp: 0, at: 20, rank: 2 },
          { id: 1, name: 'Hanna', score: 91, grade: 'S', incidents: 12, arrests: 3, xp: 0, at: 10, rank: 1 },
        ],
      }),
    );
    expect(s.phase).toBe('finished');
    expect(s.wall.hero).toEqual({
      kind: 'ranks',
      title: 'Ruumi tulemused',
      rows: [
        { rank: '1', name: 'Hanna', score: '91', me: false },
        { rank: '2', name: 'Ivo', score: '64', me: true },
      ],
    });
  });
});

describe('what the room does with a description', () => {
  it('knows who has just sat down, in the same room only', () => {
    const one = room();
    one.players = one.players.filter((p) => p.name === 'Hanna');
    const before = scene({ kind: 'room', room: one });
    const after = scene(room());
    expect(newlySeated(before, after)).toEqual([1]);
    expect(newlySeated(after, after)).toEqual([]);
    expect(newlySeated(null, after)).toEqual([]);
    // Coming from the create page, or into another room, nobody "joins": the room is simply shown.
    expect(newlySeated(scene(create('race')), after)).toEqual([]);
    expect(newlySeated(scene(room({ code: 'ABCDEF' })), after)).toEqual([]);
  });

  it('stands the consoles on an arc around the middle, a team closer together than separate desks', () => {
    for (const n of [2, 3, 4]) {
      const a = seatAngles(n, 'separate');
      expect(a).toHaveLength(n);
      expect(a[0]).toBeCloseTo(-a[n - 1]);
      expect(a.reduce((x, y) => x + y, 0)).toBeCloseTo(0);
    }
    const gap = (list: number[]) => list[1] - list[0];
    expect(gap(seatAngles(4, 'team'))).toBeLessThan(gap(seatAngles(4, 'separate')));
    expect(gap(seatAngles(4, 'sectors'))).toBe(gap(seatAngles(4, 'separate')));
  });

  it('describes the same thing the same way (the room repaints only what changed)', () => {
    const a: SceneDesc = scene(room());
    const b: SceneDesc = scene(room());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('has every word it shows in both languages', () => {
    for (const key of ['rooms.stage.header', 'rooms.stage.standby', 'rooms.stage.on', 'rooms.stage.seat'])
      expect(DICT[key]?.et && DICT[key]?.en).toBeTruthy();
  });
});
