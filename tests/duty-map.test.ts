// Valvekaart duty map (src/ui/screens/shell/dutyMap.ts): projection, path building, the land border, sector
// shapes and the label placement of the player's overlay.
import { describe, expect, it } from 'vitest';
import { REGIONS } from '@/data/regions';
import { sectorById } from '@/sim/sectors';
import { lest97 } from '@/ui/screens/shell/helpers';
import {
  baseMap,
  DESKTOP_VIEW,
  dutyOverlay,
  fitView,
  pathData,
  project,
  sectorShape,
  simplifyLine,
  spotsIn,
  STRIP_VIEW,
  textWidth,
  type DutyInput,
  type PlacedText,
  type XY,
} from '@/ui/screens/shell/dutyMap';

const names = {
  sector: (id: string) => {
    const s = sectorById(id)!;
    return { name: s.name.et, short: s.name.et.toLocaleUpperCase('et') };
  },
  mineSub: 'sinu sektor',
};

/** Every vertex of an SVG path written by pathData (absolute M, relative l). */
function points(d: string): XY[] {
  const out: XY[] = [];
  for (const sub of d.split('M').filter(Boolean)) {
    const [head, rest = ''] = sub.replace(/z$/, '').split('l');
    let [x, y] = head.trim().split(/[ ,]/).map(Number);
    out.push([x, y]);
    const nums = (rest.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      x += nums[i];
      y += nums[i + 1];
      out.push([x, y]);
    }
  }
  return out;
}

function box(l: PlacedText): [number, number, number, number] {
  const size = l.kind === 'capital' || l.kind === 'challenge' ? 13.5 : l.kind === 'city' ? 12.5 : 12;
  const w = textWidth(l.text, size, l.kind === 'mine' ? 'display' : 'text', l.kind === 'mine' ? 0.1 : 0);
  const x0 = l.anchor === 'middle' ? l.x - w / 2 : l.anchor === 'end' ? l.x - w : l.x;
  return [x0, l.y - size, x0 + w, l.y + size * 0.3];
}

describe('projection', () => {
  it('is L-EST97: Tallinn and Narva land where the Valvekaart design has them', () => {
    const [tx, ty] = project(DESKTOP_VIEW, [24.7536, 59.437]);
    const [nx, ny] = project(DESKTOP_VIEW, [28.1903, 59.3772]);
    expect(tx).toBeCloseTo(684.9, 0);
    expect(ty).toBeCloseTo(305.4, 0);
    expect(nx).toBeCloseTo(1040.3, 0);
    expect(ny).toBeCloseTo(304.4, 0);
    // The projection's own origin: 24° E is the central meridian, so its x does not depend on the latitude.
    expect(lest97([24, 58])[0]).toBeCloseTo(lest97([24, 59.5])[0], 6);
  });

  it('fits a prefecture into a view', () => {
    const v = fitView(REGIONS.louna.bounds, 600, 400, 20);
    const [x, y] = project(v, REGIONS.louna.center);
    expect(x).toBeGreaterThan(20);
    expect(x).toBeLessThan(580);
    expect(y).toBeGreaterThan(20);
    expect(y).toBeLessThan(380);
  });
});

describe('paths', () => {
  it('simplifies a line, keeping its ends and its corners', () => {
    const line: XY[] = [
      [0, 0],
      [1, 0.01],
      [2, 0],
      [3, 5],
      [4, 0],
    ];
    expect(simplifyLine(line, 0.5)).toEqual([
      [0, 0],
      [2, 0],
      [3, 5],
      [4, 0],
    ]);
  });

  it('writes an absolute move, then relative steps of 0.1 px', () => {
    expect(
      pathData(
        [
          [10, 10],
          [10.04, 10],
          [12.5, 9],
          [10, 10],
        ],
        true,
      ),
    ).toBe('M10 10l2.5-1z');
    expect(pathData([[1, 1]], false)).toBe('');
  });
});

describe('base layers', () => {
  const base = baseMap(DESKTOP_VIEW);

  it('builds every layer once and caches it', () => {
    expect(baseMap({ ...DESKTOP_VIEW })).toBe(base);
    for (const k of [
      'land',
      'coast',
      'border',
      'neighbours',
      'neighbourCoast',
      'lakes',
      'prefLines',
      'graticule',
      'roadsMain',
    ] as const)
      expect(base[k].length, k).toBeGreaterThan(100);
    for (const id of ['pohja', 'ida', 'louna', 'laane'] as const)
      expect(base.prefectures[id].length, id).toBeGreaterThan(100);
    // Harju is one county: Põhja has no county lines inside; Lõuna has six counties.
    expect(base.countyLines.pohja).toBe('');
    expect(base.countyLines.louna.length).toBeGreaterThan(100);
  });

  it('draws the land border only in the south and east, and far less of it than coast', () => {
    const border = points(base.border);
    expect(border.length).toBeGreaterThan(20);
    const narva = project(DESKTOP_VIEW, [27.9, 59.4]);
    // The Latvian border reaches its northernmost point near Mõisaküla, about 58.1° N.
    const latvia = project(DESKTOP_VIEW, [25.2, 58.2]);
    for (const [x, y] of border) expect(x > narva[0] - 60 || y > latvia[1], `${x},${y}`).toBe(true);
    expect(base.border.length).toBeLessThan(base.coast.length / 3);
  });

  it('places the county towns inside the view, and the strip has its own scale', () => {
    expect(base.towns.map((t) => t.name)).toEqual(
      expect.arrayContaining(['Tallinn', 'Tartu', 'Narva', 'Pärnu', 'Kuressaare']),
    );
    const strip = baseMap(STRIP_VIEW);
    for (const t of strip.towns) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(STRIP_VIEW.width);
    }
    expect(strip.land.length).toBeLessThan(base.land.length);
  });
});

describe('sectors', () => {
  it('draws a county sector as its county and a town sector as the game outline cut to the land', () => {
    const viljandi = sectorShape(DESKTOP_VIEW, 'louna-viljandi')!;
    const tartu = sectorShape(DESKTOP_VIEW, 'louna-tartu')!;
    expect(viljandi.clip).toBeNull();
    expect(tartu.clip).not.toBeNull();
    expect(tartu.area).toBeLessThan(viljandi.area / 10);
    expect(sectorShape(DESKTOP_VIEW, 'louna-tartu')).toBe(tartu);
    expect(sectorShape(DESKTOP_VIEW, 'no-such-sector')).toBeNull();
  });

  it('puts the marker on the main station: Narva for the Narva sector', () => {
    const narva = sectorShape(DESKTOP_VIEW, 'ida-narva')!;
    const town = project(DESKTOP_VIEW, [28.1903, 59.3772]);
    expect(Math.hypot(narva.pin[0] - town[0], narva.pin[1] - town[1])).toBeLessThan(15);
  });

  it('finds label spots inside a ring, apart from each other', () => {
    const ring: XY[] = [
      [0, 0],
      [100, 0],
      [100, 40],
      [0, 40],
    ];
    const spots = spotsIn(ring, 3);
    expect(spots.length).toBeGreaterThan(1);
    for (const [x, y] of spots) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(100);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(40);
    }
    expect(Math.abs(spots[0][1] - 20)).toBeLessThan(4);
  });
});

describe('the player overlay', () => {
  const input: DutyInput = {
    mine: ['louna-tartu'],
    whole: [],
    offered: ['louna-tartumaa'],
    challenge: { sector: 'ida-narva', regionId: 'ida' },
    home: 'louna',
  };

  it('labels the desk, the offer and the challenge, clear of each other and inside the view', () => {
    const o = dutyOverlay(DESKTOP_VIEW, input, names);
    const kinds = o.labels.map((l) => l.kind);
    expect(kinds).toEqual(expect.arrayContaining(['mine', 'mineSub', 'offer', 'challenge', 'capital']));
    expect(o.labels.find((l) => l.kind === 'mine')!.text).toBe('TARTU LINN');
    expect(o.labels.find((l) => l.kind === 'challenge')!.text).toBe('Narva');
    const boxes = o.labels.map(box);
    for (let i = 0; i < boxes.length; i++) {
      const [x0, y0, x1, y1] = boxes[i];
      expect(x0).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(DESKTOP_VIEW.width);
      expect(y0).toBeGreaterThanOrEqual(0);
      expect(y1).toBeLessThanOrEqual(DESKTOP_VIEW.height);
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j];
        const overlap =
          Math.min(x1, b[2]) - Math.max(x0, b[0]) > 2 && Math.min(y1, b[3]) - Math.max(y0, b[1]) > 2;
        expect(overlap, `${o.labels[i].text} / ${o.labels[j].text}`).toBe(false);
      }
    }
  });

  it("hides the dots under a filled city and under the challenge's marker", () => {
    const o = dutyOverlay(DESKTOP_VIEW, input, names);
    const towns = o.towns.map((t) => t.name);
    expect(towns).not.toContain('Tartu');
    expect(towns).not.toContain('Narva');
    expect(towns).toContain('Tallinn');
  });

  it('a whole-prefecture challenge gets a marker at its headquarters, and no sector', () => {
    const o = dutyOverlay(DESKTOP_VIEW, { ...input, challenge: { sector: '', regionId: 'laane' } }, names);
    expect(o.challenge).toBeNull();
    const parnu = project(DESKTOP_VIEW, REGIONS.laane.stations.find((s) => s.kind === 'hq')!.coord);
    expect(o.challengePin).toEqual(parnu);
  });

  it("a challenge at the player's own desk keeps the desk's name and adds only its marker", () => {
    const o = dutyOverlay(DESKTOP_VIEW, { ...input, challenge: { sector: 'louna-tartu', regionId: 'louna' } }, names);
    expect(o.labels.some((l) => l.kind === 'challenge')).toBe(false);
    expect(o.labels.filter((l) => l.kind === 'mine')).toHaveLength(1);
    expect(o.challengePin).not.toBeNull();
  });

  it('the phone strip names the cities only and leaves the offer unnamed', () => {
    const o = dutyOverlay(STRIP_VIEW, input, names, true);
    expect(o.labels.some((l) => l.kind === 'offer' || l.kind === 'town')).toBe(false);
    expect(o.labels.find((l) => l.kind === 'mine')?.text).toBe('TARTU LINN');
  });
});
