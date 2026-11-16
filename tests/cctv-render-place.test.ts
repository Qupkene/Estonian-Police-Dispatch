// The pure parts of what dresses a place in the camera's picture (src/cctv/render/place.ts): the words on its board
// over every place of the game's own data (which names are painted, which give way to the kind's word, where a long
// one is broken), where a tall thing would hide the place from the camera, where the board goes on the front so that
// the picture holds all of it, which bays the board covers, and how bright a lit board's ground is.
import { describe, expect, it } from 'vitest';
import { boardCovers, boardLines, dressOf, hidesPlace, luminance, planOwn, type FrontPlan, type OwnWall } from '@/cctv/render/place';
import { projectPoint } from '@/cctv/site';
import type { CameraPose, Site } from '@/cctv/types';
import type { PlaceKind } from '@/sim/types';
import { REGIONS, REGION_IDS } from '@/data/regions';

/** Every place of the game whose kind has a board of its own, with the board's word for that kind. */
const PLACES = REGION_IDS.flatMap((id) => REGIONS[id].places).flatMap((p) => {
  const d = dressOf(p.kind, 1);
  return d ? [{ name: p.name, kind: p.kind, word: d.word }] : [];
});
const board = (name: string, narrow = false) => {
  const p = PLACES.find((x) => x.name === name);
  if (!p) throw new Error(`no place named ${name} in src/data`);
  return boardLines(p.name, p.word, narrow).join(' / ');
};
const lettersOf = (word: string) => word.replace(/[^\p{L}]/gu, '').length;

describe('the board of a place', () => {
  it('covers the game\'s places', () => {
    expect(PLACES.length).toBeGreaterThan(350);
  });

  it('paints a name the game made up as the word in front of its brackets', () => {
    expect(board('Pank (Liivalaia)')).toBe('PANK');
    expect(board('Tankla (Jüri)')).toBe('TANKLA');
    expect(board('Saku Suurhall (Unibet Arena)')).toBe('SAKU SUURHALL');
    expect(boardLines(null, 'BAAR')).toEqual(['BAAR']);
    expect(boardLines('(x)', 'BAAR')).toEqual(['BAAR']);
  });

  it('breaks a long name before the word for what it is, not inside the name', () => {
    expect(board('Rocca al Mare keskus')).toBe('ROCCA AL MARE / KESKUS');
    expect(board('Rocca al Mare parkla')).toBe('ROCCA AL MARE / PARKLA');
    expect(board('Aleksander Nevski katedraal')).toBe('ALEKSANDER NEVSKI / KATEDRAAL');
    expect(board('Hugo Treffneri Gümnaasium')).toBe('HUGO TREFFNERI / GÜMNAASIUM');
    expect(board('Ülemiste keskuse parkla')).toBe('ÜLEMISTE KESKUSE / PARKLA');
    expect(board('Mustvee vanausuliste palvela')).toBe('MUSTVEE VANAUSULISTE / PALVELA');
  });

  it('takes the most equal lines when the last word alone would leave them far apart', () => {
    expect(board('Telliskivi Loomelinnaku baar')).toBe('TELLISKIVI / LOOMELINNAKU BAAR');
    expect(board('Lennart Meri Tallinna lennujaam')).toBe('LENNART MERI / TALLINNA LENNUJAAM');
    expect(board('Tartu Ülikooli Narva kolledž')).toBe('TARTU ÜLIKOOLI / NARVA KOLLEDŽ');
  });

  it('never ends the first line with a short joining word', () => {
    expect(board('Eesti Muusika- ja Teatriakadeemia')).toBe('EESTI MUUSIKA- / JA TEATRIAKADEEMIA');
    expect(board('Haridus- ja Teadusministeerium')).toBe('HARIDUS- / JA TEADUSMINISTEERIUM');
    expect(board('Narva staadion ja spordikeskus')).toBe('NARVA STAADION / JA SPORDIKESKUS');
    expect(board('T1 Mall of Tallinn', true)).toBe('T1 MALL / OF TALLINN');
    // Where every break follows a short word, the most equal one is taken all the same.
    expect(board('A. Le Coq õlletehas')).toBe('A. LE COQ / ÕLLETEHAS');
    for (const p of PLACES) for (const narrow of [false, true]) {
      const lines = boardLines(p.name, p.word, narrow);
      if (lines.length < 2) continue;
      const words = lines.join(' ').split(' ');
      const other = words.slice(0, -1).some((w) => lettersOf(w) > 3);
      if (other && !p.name.includes(',')) expect(lettersOf(lines[0].split(' ').pop()!), `${p.name}: ${lines.join(' / ')}`).toBeGreaterThan(3);
    }
  });

  it('breaks at a comma first, and leaves the comma out', () => {
    expect(board('Vanasadam, A-terminal')).toBe('VANASADAM / A-TERMINAL');
    expect(boardLines('Tallinna-Narva mnt (E20), 18. km', 'TEE')).toEqual(['TALLINNA-NARVA MNT', '18. KM']);
  });

  it('paints the kind\'s word for a name that describes an area', () => {
    expect(board('Lasnamäe tööstuspiirkond')).toBe('TEHAS');
    expect(board('Muuga sadama tööstusala')).toBe('TEHAS');
    expect(board('Ropka tööstusrajoon')).toBe('TEHAS');
    expect(board('Endine Raadi lennuväli')).toBe('TEHAS');
    expect(board('Kohtla-Järve poolkoksimägi')).toBe('TEHAS');
    expect(board('Riigipiir, Narva jõe kallas (Siivertsi)')).toBe('PIIRIPUNKT');
    expect(board('Riigipiir (Meremäe)')).toBe('PIIRIPUNKT');
    expect(board('Sõprussild (riigipiir)')).toBe('PIIRIPUNKT');
    expect(board('Valga-Valka linnapiir (Riia tn)')).toBe('PIIRIPUNKT');
    expect(board('Maakri kvartali büroohooned')).toBe('BÜROOHOONE');
    expect(board('Uue politseimaja krunt')).toBe('EHITUS');
    expect(board('Angla tuulikumägi')).toBe('MUUSEUM');
    // A festival's ground has no concert hall to name.
    expect(board('Pärimusmuusika festivali ala (lossimäed)')).toBe('FESTIVAL');
    expect(board('Arvamusfestivali ala (Vallimägi)')).toBe('FESTIVAL');
    expect(board('Festivaliala (Raeküla)')).toBe('FESTIVAL');
  });

  it('keeps the names that end like an area word but are not one', () => {
    expect(board('Tallinna lauluväljak')).toBe('TALLINNA / LAULUVÄLJAK');
    expect(board('Piiriületuse ooteala parkla')).toBe('PIIRIÜLETUSE / OOTEALA PARKLA');
    expect(board('Rotermanni kvartal')).toBe('ROTERMANNI KVARTAL');
    expect(board('Narva piiripunkt (Narva-1)')).toBe('NARVA PIIRIPUNKT');
    expect(board('Vaala keskus')).toBe('VAALA KESKUS');
    expect(board('Haljala kirik')).toBe('HALJALA KIRIK');
    expect(board('Tapa linnak (Kaitsevägi)')).toBe('TAPA LINNAK');
  });

  it('gives every place one or two clean lines in capitals', () => {
    for (const p of PLACES) for (const narrow of [false, true]) {
      const lines = boardLines(p.name, p.word, narrow);
      expect(lines.length === 1 || lines.length === 2, p.name).toBe(true);
      for (const l of lines) {
        expect(l.length, p.name).toBeGreaterThan(0);
        expect(l, p.name).toBe(l.trim());
        expect(l, p.name).toBe(l.toUpperCase());
        expect(/[(),]/.test(l), `${p.name}: ${l}`).toBe(false);
      }
      // One line holds what fits one; a name without a space cannot be broken.
      if (lines.length === 1 && lines[0].includes(' ')) expect(lines[0].length, p.name).toBeLessThanOrEqual(narrow ? 9 : 18);
    }
  });
});

describe('what hides a place from its camera', () => {
  // A camera 6 m up looking east along a forecourt: the spot 30 m ahead, the pumps 20 m ahead and 6 m to the left.
  const camera: CameraPose = { pos: [0, 0], height: 6, target: [30, 0], targetHeight: 1, fov: 40, mount: 'pole' };
  const marks: [number, number][] = [[30, 0], [20, 6]];

  it('is anything tall on the line from the lens to the pumps, however far from the lens', () => {
    // 13 m ahead on the line to the pumps: beyond the 12 m in which street furniture is kept out of the view.
    expect(hidesPlace(camera, [13, 3.9], marks)).toBe(true);
    expect(hidesPlace(camera, [18, 5.4], marks)).toBe(true);
    expect(hidesPlace(camera, [25, 0.5], marks)).toBe(true);
  });

  it('is anything in the field of view close before the lens', () => {
    expect(hidesPlace(camera, [10, -4], marks)).toBe(true);
    expect(hidesPlace(camera, [13, -5], marks)).toBe(true);
  });

  it('is not what stands beside the view, behind the lens or far off to the side of the lines', () => {
    expect(hidesPlace(camera, [10, -14], marks)).toBe(false);
    expect(hidesPlace(camera, [-6, 2], marks)).toBe(false);
    expect(hidesPlace(camera, [26, -9], marks)).toBe(false);
    expect(hidesPlace(camera, [40, 14], marks)).toBe(false);
  });
});

describe('where the board goes on the front', () => {
  /** A front along the x axis from 0 to `len` (the street on its -y side), its entrance `door` metres along it, three floors over the shop. */
  const front = (len: number, door: number, more: Partial<OwnWall> = {}) =>
    ({ a: [0, 0], t: [1, 0], n: [0, -1], len, s0: 0, s1: len, door, at: door, street: true, base: 0, g1: 4, eaves: 13, top: 13.4, uppers: 3,
      wall: null, kind: 'brick', bb: null, rise: 0, plain: [0, 0, 1, 1], ...more }) as unknown as OwnWall;
  /** A tall hall of one floor: its board goes on the edge of its roof, 8 m up. */
  const hall = (len: number, door: number) => front(len, door, { g1: 7.5, eaves: 8, top: 8.3, uppers: 0 });
  /** A camera 5 m up at (x, y) looking at the point (tx, 0) a metre up. */
  const camAt = (x: number, y: number, tx: number): CameraPose => ({ pos: [x, y], height: 5, target: [tx, 0], targetHeight: 1, fov: 36, mount: 'pole' });
  /** The plan of the front `w` of a kind of place seen by `camera`, its board five times as wide as high. */
  const plan = (camera: CameraPose, w: OwnWall, kind: PlaceKind) => {
    const ring = [[0, 0], [w.len, 0], [w.len, 15], [0, 15]];
    const site = { camera, street: { buildings: [{ id: 1, ring, height: w.eaves, base: 0, area: w.len * 15, roof: 'flat' }] } } as unknown as Site;
    return planOwn({ site, dress: dressOf(kind, 1)!, sheet: { aspect: 5, lines: 1 } as never, own: 0 }, [{ w, main: true }])!;
  };
  /** Where the board's corners land in the picture: its first letter's foot and top, then its last letter's. */
  const corners = (camera: CameraPose, p: FrontPlan) => {
    const { s, h, off, W, H } = p.board;
    return [[s - W / 2, h], [s - W / 2, h + H], [s + W / 2, h], [s + W / 2, h + H]].map(([x, z]) => projectPoint(camera, [x, -off], z));
  };
  const inside = (q: { x: number; y: number; z: number }) => q.z > 1 && Math.abs(q.x) <= 0.92 && Math.abs(q.y) <= 0.92;

  it('slides along the wall towards the middle of the picture when the entrance is at its edge', () => {
    // The entrance 6 m along a 30 m front, at the left edge of the picture: over it, the board's first letters were cut.
    const camera = camAt(15, -4, 16);
    expect(projectPoint(camera, [6, 0], 3).x).toBeLessThan(-1);
    const p = plan(camera, front(30, 6), 'shop');
    expect(corners(camera, p).every(inside)).toBe(true);
    expect(p.board.s).toBeGreaterThan(6 + p.board.W / 2);
  });

  it('comes down from the roof of a tall hall of one floor that the picture does not reach', () => {
    const camera = camAt(-5, -6, 0);
    expect(projectPoint(camera, [7, 0], 8).y).toBeGreaterThan(1);
    const p = plan(camera, hall(14, 7), 'hotel');
    expect(corners(camera, p).every(inside)).toBe(true);
    expect(p.board.h + p.board.H).toBeLessThan(3);
  });

  it('moves and shrinks a church\'s plate beside its door until all of it is in the picture', () => {
    const camera = camAt(5, -4, 8);
    const p = plan(camera, front(14, 2.8), 'church');
    expect(corners(camera, p).every(inside)).toBe(true);
    // A church's plate stands 1.5 m from the door's middle; here it had to go further out.
    expect(Math.abs(p.board.s - 2.8)).toBeGreaterThan(p.board.W / 2 + 1.5 + 0.25);
  });

  it('shows from its first letter a board the picture cannot hold whole anywhere', () => {
    const camera = camAt(-5, -10, -4);
    const p = plan(camera, front(14, 2.8), 'church');
    const [foot, top, foot1, top1] = corners(camera, p);
    expect([foot1, top1].every(inside)).toBe(false);
    expect([foot, top].every(inside)).toBe(true);
  });
});

describe('the bays a board covers', () => {
  const wall = { a: [0, 0], t: [1, 0], n: [0, -1], len: 20 } as unknown as OwnWall;
  const other = { ...wall } as OwnWall;
  const plan = (off: number) => ({ board: { v: wall, s: 10, h: 3, off, W: 4, H: 1.2 } }) as unknown as FrontPlan;

  it('are the pieces of its own wall behind it', () => {
    expect(boardCovers(plan(0.145), wall, 9, 12, 3.2, 4)).toBe(true);
    expect(boardCovers(plan(0.145), wall, 6, 9, 3.2, 4)).toBe(true);
    // Beside it, above it, under it.
    expect(boardCovers(plan(0.145), wall, 12, 15, 3.2, 4)).toBe(false);
    expect(boardCovers(plan(0.145), wall, 9, 12, 4.3, 6)).toBe(false);
    expect(boardCovers(plan(0.145), wall, 9, 12, 0.6, 2.9)).toBe(false);
    // A sliver of overlap is no reason to brick a window up.
    expect(boardCovers(plan(0.145), wall, 5, 8.1, 3.2, 4)).toBe(false);
  });

  it('are none on another wall, under a board on the canopy\'s edge, or without a plan', () => {
    expect(boardCovers(plan(0.145), other, 9, 12, 3.2, 4)).toBe(false);
    expect(boardCovers(plan(2.2), wall, 9, 12, 3.2, 4)).toBe(false);
    expect(boardCovers(null, wall, 9, 12, 3.2, 4)).toBe(false);
  });
});

describe('a lit board after dark', () => {
  it('measures a colour as light', () => {
    expect(luminance(0x000000)).toBe(0);
    expect(luminance(0xffffff)).toBeCloseTo(1, 5);
    expect(luminance(0xf6f3ea)).toBeGreaterThan(0.85);
    expect(luminance(0x2a2420)).toBeLessThan(0.03);
  });

  it('has a light ground only where it is dimmed (a hospital, a yellow brand), a dark one elsewhere', () => {
    // The night picture's gain is 2.15: a ground brighter than 0.37 would be a white blot, so makePlaceSheet dims it.
    const lit = ['bar', 'nightclub', 'mall', 'shop', 'bank', 'hospital', 'trainstation', 'busstation', 'port', 'airport', 'concert', 'hotel', 'border'] as const;
    const light = lit.filter((k) => luminance(parseInt(dressOf(k, 1)!.bg.slice(1), 16)) > 0.37);
    expect(light).toEqual(['hospital']);
    for (const k of lit) expect(dressOf(k, 1)!.lit, k).toBe(true);
  });
});
