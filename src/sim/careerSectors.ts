/**
 * Career responsibility (docs/SECTORS.md): which sectors a career covers, the prefect's offers of new ones,
 * posts opened with money and the player's post in the juhtimiskeskus. Pure rules over CareerProfile: every
 * function returns new objects and never mutates its input. Numbers live in data/economy.ts.
 */
import { RANKS, SECTOR_HANDOVER, SECTOR_OFFER } from '@/data/economy';
import { REGION_IDS, REGIONS } from '@/data/regions';
import { randomName } from '@/gen/names';
import { makePlate } from '@/gen/vehicle';
import { euro, fleetVehicle, makeStaff, pushLedger, rankOf, uniqueBadge } from './career';
import { hashString, Rng } from './rng';
import { sectorById, sectorsOf, starterSectors } from './sectors';
import type {
  CareerProfile,
  FleetVehicle,
  Gender,
  RegionId,
  SectorDef,
  SpeakerLang,
  StaffMember,
  Text,
  UnitType,
} from './types';

const T = (et: string, en: string): Text => ({ et, en });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r2 = (x: number) => Math.round(x * 100) / 100;

function clone<X>(x: X): X {
  return JSON.parse(JSON.stringify(x)) as X;
}

/**
 * Sectors the career covers in a prefecture: every sector when it is covered whole. Ids this version does not
 * know (a later version's sectors, isLaterSectorId) stay in the profile but are not played here.
 */
export function careerSectors(p: Pick<CareerProfile, 'sectors'>, regionId: RegionId): string[] {
  const all = sectorsOf(regionId).map((x) => x.id);
  const mine = p.sectors?.[regionId];
  if (!mine) return all;
  const known = new Set(all);
  return mine.filter((id) => known.has(id));
}

/**
 * An id a later version may give a new sector of the prefecture (`<prefecture>-<name>`, unknown here). Kept so
 * that opening the career in an older tab and syncing it never loses a sector the player has.
 */
export function isLaterSectorId(regionId: RegionId, id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length <= 48 &&
    id.startsWith(`${regionId}-`) &&
    /^[a-z]+-[a-z0-9-]+$/.test(id) &&
    !sectorById(id)
  );
}

/** True when the career covers every sector of the prefecture. */
export function coversWholeRegion(p: Pick<CareerProfile, 'sectors'>, regionId: RegionId): boolean {
  const all = sectorsOf(regionId).map((x) => x.id);
  const mine = new Set(careerSectors(p, regionId));
  return all.every((id) => mine.has(id));
}

/** Sectors the career covers in all its unlocked prefectures together (its whole force answers for them). */
export function sectorCount(p: CareerProfile): number {
  return REGION_IDS.filter((r) => p.unlockedRegions.includes(r)).reduce(
    (a, r) => a + careerSectors(p, r).length,
    0,
  );
}

/**
 * True for a career created with sectors (it has `sectorsChangedDay`). A career converted from before sectors
 * has none: it covers every unlocked prefecture whole, takes new ones whole and keeps the old daily budget.
 */
export function isSectorCareer(p: Pick<CareerProfile, 'sectorsChangedDay'>): boolean {
  return typeof p.sectorsChangedDay === 'number';
}

/** The sector a new career starts in: `wanted` when it is a sector of the prefecture, else its first starter. */
export function startSector(regionId: RegionId, wanted?: string): string | undefined {
  const all = sectorsOf(regionId);
  if (wanted && all.some((x) => x.id === wanted)) return wanted;
  return (starterSectors(regionId)[0] ?? all[0])?.id;
}

/** The starter sector of a prefecture unlocked later by rank: a normal one when there is one. */
function unlockSector(regionId: RegionId): string | undefined {
  const starters = starterSectors(regionId);
  const order = ['normal', 'easy', 'hard'];
  const best = [...starters].sort(
    (a, b) => order.indexOf(a.starter!.difficulty) - order.indexOf(b.starter!.difficulty),
  )[0];
  return (best ?? sectorsOf(regionId)[0])?.id;
}

/** What a career gets in a prefecture it has just unlocked: one starter sector, or all of it when converted. */
export function sectorsForNewRegion(p: CareerProfile, regionId: RegionId): string[] {
  if (!isSectorCareer(p)) return sectorsOf(regionId).map((x) => x.id);
  const id = unlockSector(regionId);
  return id ? [id] : [];
}

const sectorName = (id: string): Text => sectorById(id)?.name ?? T(id, id);

/** "A", "A või B", "A, B või C" in one language. */
function orList(names: string[], or: string): string {
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} ${or} ${names[names.length - 1]}`;
}

/** Sector names joined with "või" / "or" (offer messages). */
export function sectorNames(ids: string[]): Text {
  const names = ids.map(sectorName);
  const et = names.map((n) => n.et);
  const en = names.map((n) => n.en);
  return T(orList(et, 'või'), orList(en, 'or'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Position
// ─────────────────────────────────────────────────────────────────────────────

/** The player's post in the juhtimiskeskus, by the area covered (display only). */
export function positionTitle(p: CareerProfile): Text {
  const regions = REGION_IDS.filter((r) => p.unlockedRegions.includes(r));
  const whole = regions.filter((r) => coversWholeRegion(p, r)).length;
  if (whole >= REGION_IDS.length) return T('Keskuse juht', 'Head of the command centre');
  if (whole >= 2) return T('Grupijuht', 'Group leader');
  if (whole === 1) return T('Vahetuse vanem', 'Shift supervisor');
  return sectorCount(p) >= 2
    ? T('Vanem-operatiivinfo haldur', 'Senior dispatcher')
    : T('Operatiivinfo haldur', 'Dispatcher');
}

// ─────────────────────────────────────────────────────────────────────────────
// Offers
// ─────────────────────────────────────────────────────────────────────────────

/** Staatus and rank index needed for an offer when the career covers `n` sectors of the prefecture. */
export function offerThresholds(n: number): { reputation: number; rank: number } {
  const k = Math.max(1, n);
  return {
    reputation: Math.min(
      SECTOR_OFFER.maxReputation,
      SECTOR_OFFER.reputation + SECTOR_OFFER.reputationStep * (k - 1),
    ),
    rank: Math.min(RANKS.length - 1, k),
  };
}

/** Paid shifts since the last change of responsibility. */
function shiftsSinceChange(p: CareerProfile): number {
  const from = p.sectorsChangedDay ?? 1;
  return p.history.filter((h) => h.day >= from).length;
}

/** The prefecture the next offer would be for: the home one unless it is covered whole. */
function offerRegion(p: CareerProfile): RegionId | undefined {
  const order = [p.regionId, ...p.unlockedRegions.filter((r) => r !== p.regionId)];
  return order.find((r) => p.unlockedRegions.includes(r) && !coversWholeRegion(p, r));
}

/**
 * What the career still needs before the prefect offers more sectors in a prefecture (by default the home
 * one, or the first unlocked one not covered whole), as short texts for the career screen. `ready` means
 * the next paid shift brings an offer if the results hold. An offer waiting for an answer: ready, nothing
 * needed. Every unlocked prefecture covered whole: not ready, nothing needed (there is nothing to offer).
 */
export function offerProgress(p: CareerProfile, regionId?: RegionId): { ready: boolean; needs: Text[] } {
  if (p.offer) return { ready: true, needs: [] };
  const r = regionId ?? offerRegion(p);
  if (!r || !p.unlockedRegions.includes(r) || coversWholeRegion(p, r)) return { ready: false, needs: [] };
  const n = careerSectors(p, r).length;
  const need = offerThresholds(n);
  const needs: Text[] = [];
  // A declined offer sets sectorsChangedDay ahead: the shifts before it do not count either.
  const pause = Math.max(0, (p.sectorsChangedDay ?? 1) - p.day);
  const shifts = SECTOR_OFFER.shifts - shiftsSinceChange(p) + pause;
  if (shifts > 0)
    needs.push(
      shifts === 1
        ? T('Veel 1 vahetus', '1 more shift')
        : T(`Veel ${shifts} vahetust`, `${shifts} more shifts`),
    );
  if (p.reputation < need.reputation)
    needs.push(
      T(
        `Staatus vähemalt ${need.reputation} (praegu ${Math.round(p.reputation)})`,
        `Staatus at least ${need.reputation} (now ${Math.round(p.reputation)})`,
      ),
    );
  if (rankOf(p.xp).index < need.rank) {
    const rk = RANKS[need.rank]?.name;
    needs.push(T(`Auaste: ${rk?.et.toLowerCase() ?? need.rank}`, `Rank: ${rk?.en ?? need.rank}`));
  }
  return { ready: needs.length === 0, needs };
}

/**
 * After a paid shift: the prefect's offer when the career has earned one, else the profile unchanged. No offer
 * while one waits, in a prefecture that is locked or covered whole, or before the thresholds (offerThresholds,
 * SECTOR_OFFER.shifts). The offer is one or two not covered neighbours of the covered sectors (any sector not
 * covered when none is next to them), drawn from the career seed and day.
 */
export function maybeOffer(p: CareerProfile, regionId: RegionId): CareerProfile {
  if (p.offer || !p.unlockedRegions.includes(regionId) || coversWholeRegion(p, regionId)) return p;
  const mine = new Set(careerSectors(p, regionId));
  const need = offerThresholds(mine.size);
  if (
    shiftsSinceChange(p) < SECTOR_OFFER.shifts ||
    p.reputation < need.reputation ||
    rankOf(p.xp).index < need.rank
  )
    return p;
  const all = sectorsOf(regionId);
  const free = all.filter((x) => !mine.has(x.id));
  const next = free.filter(
    (x) =>
      all.some((c) => mine.has(c.id) && c.neighbours.includes(x.id)) || x.neighbours.some((n) => mine.has(n)),
  );
  const pool = next.length ? next : free;
  if (!pool.length) return p;
  const rng = new Rng(hashString(`${p.seed}:${p.day}:${regionId}:offer`));
  const count = pool.length >= 2 && rng.chance(0.5) ? 2 : 1;
  const picked = new Set(rng.shuffle(pool.map((x) => x.id)).slice(0, count));
  const choices = all.filter((x) => picked.has(x.id)).map((x) => x.id);
  return { ...p, offer: { regionId, choices, day: p.day } };
}

/** Officers who come with a sector: patrol mostly, one may be a community or traffic officer. */
function handoverStaff(p: CareerProfile, sector: SectorDef, rng: Rng): StaffMember[] {
  const [lo, hi] = SECTOR_HANDOVER.staff;
  const n = rng.int(lo, hi);
  const third = rng.pick<UnitType>(['patrol', 'community', 'traffic']);
  const specs = (['patrol', 'patrol', third, 'patrol'] as UnitType[]).slice(0, n);
  const ruP = /narva|johvi|kohtla/.test(sector.id)
    ? 0.75
    : sector.regionId === 'ida'
      ? 0.4
      : sector.regionId === 'pohja'
        ? 0.25
        : 0.06;
  const used = new Set(p.staff.map((m) => m.badge).concat(p.badge));
  const ids = new Set(p.staff.map((m) => m.id));
  // A tired crew: one or two of them start with low morale.
  const tired = rng.int(1, Math.min(2, n));
  return specs.map((spec, i) => {
    const gender: Gender = rng.chance(0.35) ? 'F' : 'M';
    const lang: SpeakerLang = rng.chance(ruP) ? 'ru' : 'et';
    const years = rng.int(1, 14);
    const nm = randomName(rng, lang, gender, new Date().getUTCFullYear() - (22 + years));
    const skill = r2(clamp(0.43 + years * 0.02 + rng.normal(0, 0.05), 0.38, 0.82));
    let id = `staff-${sector.id}-${i + 1}`;
    for (let k = 2; ids.has(id); k++) id = `staff-${sector.id}-${i + 1}-${k}`;
    ids.add(id);
    const m = makeStaff(
      id,
      {
        ...nm,
        badge: uniqueBadge(rng, used),
        gender,
        specialty: spec,
        years,
        skill,
        avatarSeed: rng.int(1, 0x7fffffff),
      },
      p.day,
    );
    if (i < tired) {
      m.morale = r2(rng.range(SECTOR_HANDOVER.lowMorale[0], SECTOR_HANDOVER.lowMorale[1]));
      m.stress = r2(rng.range(0.15, 0.3));
    } else m.morale = r2(rng.range(0.55, 0.72));
    return m;
  });
}

/** Two used cars that come with a sector: a patrol Octavia and an Octavia or a RAV4. */
function handoverFleet(p: CareerProfile, rng: Rng): FleetVehicle[] {
  const plates = new Set(p.fleet.map((v) => v.plate));
  const ids = new Set(p.fleet.map((v) => v.id));
  let n = p.fleet.length + 1;
  return ['skoda_octavia_combi', rng.pick(['skoda_octavia_combi', 'toyota_rav4_hybrid'])].map((catalogId) => {
    while (ids.has(`veh-${n}`)) n++;
    const id = `veh-${n}`;
    ids.add(id);
    let plate = makePlate(rng);
    for (let i = 0; i < 20 && plates.has(plate); i++) plate = makePlate(rng);
    plates.add(plate);
    const v = fleetVehicle(id, catalogId, plate, p.day);
    v.condition = r2(rng.range(SECTOR_HANDOVER.condition[0], SECTOR_HANDOVER.condition[1]));
    return v;
  });
}

/**
 * Take one of the offered sectors: it joins the career's area with 3-4 officers of that area (some of them
 * tired) and two used cars, the daily budget grows (dailyBudget in src/sim/career.ts) and the prefecture pays a
 * one-off handover grant. The offer is answered and the next one is paced from today.
 */
export function acceptOffer(p: CareerProfile, sectorId: string): { profile: CareerProfile; error?: Text } {
  const offer = p.offer;
  if (!offer)
    return {
      profile: p,
      error: T('Prefektil ei ole praegu pakkumist.', 'The prefect has no offer at the moment.'),
    };
  const sector = sectorById(sectorId);
  if (!sector || sector.regionId !== offer.regionId || !offer.choices.includes(sectorId))
    return { profile: p, error: T('Seda sektorit ei pakutud.', 'This sector was not offered.') };
  const out = clone(p);
  const rng = new Rng(hashString(`${out.seed}:${out.day}:${sectorId}:handover`));
  const covered = out.sectors?.[offer.regionId] ?? careerSectors(out, offer.regionId);
  out.sectors = {
    ...(out.sectors ?? {}),
    [offer.regionId]: covered.includes(sectorId) ? covered : [...covered, sectorId],
  };
  const staff = handoverStaff(out, sector, rng);
  const fleet = handoverFleet(out, rng);
  out.staff.push(...staff);
  out.fleet.push(...fleet);
  delete out.offer;
  out.sectorsChangedDay = out.day;
  out.money += SECTOR_HANDOVER.grant;
  pushLedger(out, {
    day: out.day,
    kind: 'budget',
    amount: SECTOR_HANDOVER.grant,
    text: T(
      `Uus sektor: ${sector.name.et} (${staff.length} ametnikku, ${fleet.length} sõidukit, üleandmise toetus)`,
      `New sector: ${sector.name.en} (${staff.length} officers, ${fleet.length} vehicles, handover grant)`,
    ),
  });
  return { profile: out };
}

/** Say no to the offer: it is gone, and a new one comes about five shifts later. */
export function declineOffer(p: CareerProfile): CareerProfile {
  if (!p.offer) return p;
  const out = clone(p);
  delete out.offer;
  out.sectorsChangedDay = out.day + SECTOR_OFFER.declinePause;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Posts
// ─────────────────────────────────────────────────────────────────────────────

/** The sector and SectorDef.posts entry of a post station. */
export function postOf(stationId: string): { sector: SectorDef; price: number; upkeep: number } | undefined {
  for (const regionId of REGION_IDS) {
    for (const sector of sectorsOf(regionId)) {
      const post = sector.posts?.find((x) => x.stationId === stationId);
      if (post) return { sector, price: post.price, upkeep: post.upkeep };
    }
  }
  return undefined;
}

/**
 * Monthly upkeep of the opened posts that have a crew (each counted once): a post in a covered sector of an
 * unlocked prefecture the career does not cover whole. Covering it whole, the crews follow the old allocation
 * (rosterFromCareer) and the career screen no longer lists posts, so a post there costs nothing; nor does a
 * post this version does not know.
 */
export function postsUpkeep(p: Pick<CareerProfile, 'openPosts' | 'sectors' | 'unlockedRegions'>): number {
  return [...new Set(p.openPosts ?? [])].reduce((a, id) => {
    const post = postOf(id);
    if (!post) return a;
    const r = post.sector.regionId;
    const crewed =
      p.unlockedRegions.includes(r) &&
      careerSectors(p, r).includes(post.sector.id) &&
      !coversWholeRegion(p, r);
    return crewed ? a + post.upkeep : a;
  }, 0);
}

/** Open a post (SectorDef.posts) in a covered sector with career money. */
export function openPost(p: CareerProfile, stationId: string): { profile: CareerProfile; error?: Text } {
  const post = postOf(stationId);
  if (!post)
    return { profile: p, error: T('Sellist politseipunkti ei ole.', 'There is no such police post.') };
  const { sector } = post;
  if (!p.unlockedRegions.includes(sector.regionId) || !careerSectors(p, sector.regionId).includes(sector.id))
    return {
      profile: p,
      error: T(
        'Politseipunkti saab avada ainult oma sektoris.',
        'You can only open a post in a sector you cover.',
      ),
    };
  if (p.openPosts?.includes(stationId))
    return { profile: p, error: T('See politseipunkt on juba avatud.', 'This police post is already open.') };
  if (p.money < post.price)
    return {
      profile: p,
      error: T(
        `Eelarves pole piisavalt raha (vaja ${euro(post.price)}).`,
        `Not enough money in the budget (${euro(post.price)} needed).`,
      ),
    };
  const out = clone(p);
  out.openPosts = [...(out.openPosts ?? []), stationId];
  out.money -= post.price;
  const name =
    REGIONS[sector.regionId]?.stations.find((x) => x.id === stationId)?.name ?? T(stationId, stationId);
  pushLedger(out, {
    day: out.day,
    kind: 'upgrade',
    amount: -post.price,
    text: T(`Politseipunkt avatud: ${name.et}`, `Police post opened: ${name.en}`),
  });
  return { profile: out };
}

// ─────────────────────────────────────────────────────────────────────────────
// Old careers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The career's `sectors` made whole (the career normaliser runs it on every load; idempotent):
 * - a career from before sectors (no `sectors`) gets every sector of each unlocked prefecture, so it plays
 *   exactly as before; a converted career keeps covering every unlocked prefecture whole;
 * - ids that are not sectors of their prefecture are dropped, each id is kept once; an id a later version may
 *   use for a sector of the prefecture (isLaterSectorId) is kept but not played;
 * - every unlocked prefecture gets an entry (a career created with sectors: one starter sector);
 * - an offer whose choices are all gone or covered, or that is for a locked prefecture, is dropped.
 */
export function withSectors(p: CareerProfile): CareerProfile {
  const legacy = !isSectorCareer(p);
  const sectors: Partial<Record<RegionId, string[]>> = {};
  for (const r of REGION_IDS) {
    const ids = p.sectors?.[r];
    if (!ids) continue;
    const known = new Set(sectorsOf(r).map((x) => x.id));
    sectors[r] = [...new Set(ids)].filter((id) => known.has(id) || isLaterSectorId(r, id));
  }
  for (const r of p.unlockedRegions) {
    if (!REGION_IDS.includes(r)) continue;
    if (!p.sectors || legacy) sectors[r] = sectorsOf(r).map((x) => x.id);
    else if (!sectors[r] || !careerSectors({ sectors }, r).length)
      sectors[r] = [...(sectors[r] ?? []), ...sectorsForNewRegion(p, r)];
  }
  const out: CareerProfile = { ...p, sectors };
  if (p.offer) {
    const r = p.offer.regionId;
    const covered = new Set(sectors[r] ?? []);
    const choices = p.offer.choices.filter((id) => sectorById(id)?.regionId === r && !covered.has(id));
    if (!p.unlockedRegions.includes(r) || !choices.length) delete out.offer;
    else if (choices.length !== p.offer.choices.length) out.offer = { ...p.offer, choices };
  }
  return out;
}
