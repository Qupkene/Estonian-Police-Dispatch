// Pure helpers for the career (HQ management) screen. No React / DOM imports. Unit-tested in tests/career-ui.test.ts.
import * as rules from '@/sim/career';
import * as economy from '@/data/economy';
import { DAILY_BUDGET, RANKS, UPGRADES } from '@/data/economy';
import type { CareerProfile, Lang, LedgerEntry, RegionId, RosterUnit, ShiftReport, StaffMember, Text, UnitType } from '@/sim/types';
import type { IconName } from '@/ui/components/Icon';

export const MONTH_DAYS = 30;
export const REGION_ORDER: RegionId[] = ['pohja', 'ida', 'louna', 'laane'];
export const UNIT_TYPES: UnitType[] = [
  'patrol',
  'rapid',
  'criminal',
  'k9',
  'traffic',
  'community',
  'aux',
  'border',
  'special',
  'heli',
  'transport',
  'boat',
];

/** Run a career rule that may still be a stub (throws) and return the fallback instead of crashing the UI. */
export function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

export function clamp(v: number, lo = 0, hi = 1): number {
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
}

// ── Number formatting (Estonian: "10 000 €", decimal comma; English: "€10,000") ──────────────

const NBSP = ' ';
const MINUS = '−';

export function fmtNum(n: number, lang: Lang, digits = 0): string {
  if (!Number.isFinite(n)) return '–';
  const neg = n < 0 && Math.abs(n) >= 0.5 * 10 ** -digits;
  const [int, frac] = Math.abs(n).toFixed(digits).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'et' ? NBSP : ',');
  return (neg ? MINUS : '') + grouped + (frac ? (lang === 'et' ? ',' : '.') + frac : '');
}

export function fmtMoney(n: number, lang: Lang, opts: { sign?: boolean } = {}): string {
  const r = Math.round(Number.isFinite(n) ? n : 0);
  const sign = r < 0 ? MINUS : opts.sign && r > 0 ? '+' : '';
  const body = fmtNum(Math.abs(r), lang);
  return lang === 'et' ? `${sign}${body}${NBSP}€` : `${sign}€${body}`;
}

/** Compact axis label: 12 400 → "12k", 1 250 000 → "1,3 mln" / "1.3M". */
export function fmtCompact(n: number, lang: Lang): string {
  const a = Math.abs(n);
  const sign = n < 0 ? MINUS : '';
  if (a >= 1_000_000) return sign + fmtNum(a / 1_000_000, lang, a >= 10_000_000 ? 0 : 1) + (lang === 'et' ? NBSP + 'mln' : 'M');
  if (a >= 1000) return sign + fmtNum(a / 1000, lang, a >= 10_000 ? 0 : 1).replace(/[,.]0$/, '') + 'k';
  return sign + fmtNum(a, lang);
}

export function fmtSigned(n: number, lang: Lang, digits = 0): string {
  const s = fmtNum(n, lang, digits);
  return n > 0 ? '+' + s : s;
}

export function pct(v: number): number {
  return Math.round(clamp(v) * 100);
}

// ── Calendar (career day → month, payday) ─────────────────────────────────────────────────────

export interface CareerCalendar {
  day: number;
  month: number;
  dayOfMonth: number;
  /** Shifts left until (and including) the payday shift at the end of the month. */
  shiftsToPayday: number;
}

export function calendarOf(day: number): CareerCalendar {
  const d = Math.max(1, Math.floor(Number.isFinite(day) ? day : 1));
  const dayOfMonth = ((d - 1) % MONTH_DAYS) + 1;
  return { day: d, month: Math.floor((d - 1) / MONTH_DAYS) + 1, dayOfMonth, shiftsToPayday: MONTH_DAYS - dayOfMonth + 1 };
}

export function monthOfDay(day: number): number {
  return calendarOf(day).month;
}

// ── Ranks ─────────────────────────────────────────────────────────────────────────────────────

export interface RankInfo {
  index: number;
  name: Text;
  /** xp threshold of the current rank. */
  baseXp: number;
  /** xp threshold of the next rank (undefined at the top). */
  nextXp?: number;
  nextName?: Text;
  /** 0..1 progress towards the next rank. */
  progress: number;
  unlocks: Text[];
  nextUnlocks: Text[];
}

export const FALLBACK_RANK: Text = { et: 'Dispetšer', en: 'Dispatcher' };

export function rankInfo(xp: number): RankInfo {
  const x = Number.isFinite(xp) ? xp : 0;
  let index = 0;
  let name: Text = FALLBACK_RANK;
  let ruleNext: number | undefined;
  const r = safe<ReturnType<typeof rules.rankOf> | null>(() => rules.rankOf(x), null);
  if (r && typeof r.index === 'number') {
    index = r.index;
    name = r.name ?? RANKS[r.index]?.name ?? FALLBACK_RANK;
    ruleNext = r.next;
  } else if (RANKS.length) {
    RANKS.forEach((rk, i) => {
      if (x >= rk.xp) index = i;
    });
    name = RANKS[index].name;
  }
  const baseXp = RANKS[index]?.xp ?? 0;
  const nextRank = RANKS[index + 1];
  const nextXp = nextRank ? nextRank.xp : ruleNext !== undefined && ruleNext > x ? ruleNext : undefined;
  const progress = nextXp !== undefined && nextXp > baseXp ? clamp((x - baseXp) / (nextXp - baseXp)) : 1;
  return {
    index,
    name,
    baseXp,
    nextXp,
    nextName: nextRank?.name,
    progress,
    unlocks: RANKS[index]?.unlocks ?? [],
    nextUnlocks: nextRank?.unlocks ?? [],
  };
}

/** Name of the rank at RANKS[index] (for lock labels). */
export function rankName(index: number): Text | undefined {
  return RANKS[index]?.name;
}

export function isLocked(minRank: number | undefined, rankIndex: number): boolean {
  return typeof minRank === 'number' && minRank > rankIndex;
}

// ── Money: costs, budget, affordability ───────────────────────────────────────────────────────

export interface MonthlyCosts {
  salaries: number;
  upkeep: number;
  total: number;
}

export function fallbackCosts(p: CareerProfile): MonthlyCosts {
  const salaries = (p.staff ?? []).reduce((s, m) => s + (m.salary || 0), 0);
  const fleet = (p.fleet ?? []).reduce((s, v) => s + (v.upkeep || 0), 0);
  const ups = (p.upgrades ?? []).reduce((s, id) => s + (UPGRADES.find((u) => u.id === id)?.upkeep ?? 0), 0);
  return { salaries, upkeep: fleet + ups, total: salaries + fleet + ups };
}

export function costsOf(p: CareerProfile): MonthlyCosts {
  const c = safe<MonthlyCosts | null>(() => rules.monthlyCosts(p), null);
  return c && Number.isFinite(c.total) ? c : fallbackCosts(p);
}

/** Expected monthly base funding for the prefecture (excl. performance bonuses). */
export function monthlyBudget(regionId: RegionId): number {
  return (DAILY_BUDGET[regionId] ?? 0) * MONTH_DAYS;
}

export type Affordability = 'ok' | 'tight' | 'no';

/**
 * Can the HQ afford a new monthly cost (salary / upkeep) and an up-front price?
 * `no`: not enough cash right now; `tight`: monthly costs would exceed the base budget.
 */
export function affordability(p: CareerProfile, monthly: number, upfront: number, costs: MonthlyCosts, budget: number): Affordability {
  if (upfront > p.money || (upfront === 0 && monthly > p.money)) return 'no';
  if (costs.total + monthly > budget) return 'tight';
  return 'ok';
}

// ── Ledger ────────────────────────────────────────────────────────────────────────────────────

export interface LedgerRow {
  entry: LedgerEntry;
  /** Balance right after this entry. */
  balance: number;
  index: number;
}

/** Chronological rows (oldest first) with the running balance, anchored to the current money. */
export function ledgerRows(money: number, ledger: LedgerEntry[]): LedgerRow[] {
  const sorted = (ledger ?? []).map((entry, index) => ({ entry, index })).sort((a, b) => a.entry.day - b.entry.day || a.index - b.index);
  const total = sorted.reduce((s, r) => s + (r.entry.amount || 0), 0);
  let bal = money - total;
  return sorted.map((r) => {
    bal += r.entry.amount || 0;
    return { entry: r.entry, index: r.index, balance: bal };
  });
}

/** End-of-day balance per day (plus a starting point), for the balance chart. */
export function balanceSeries(money: number, ledger: LedgerEntry[]): { day: number; balance: number }[] {
  const rows = ledgerRows(money, ledger);
  if (!rows.length) return [];
  const out: { day: number; balance: number }[] = [{ day: rows[0].entry.day - 1, balance: rows[0].balance - (rows[0].entry.amount || 0) }];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last.day === r.entry.day) last.balance = r.balance;
    else out.push({ day: r.entry.day, balance: r.balance });
  }
  return out;
}

export interface KindTotal {
  kind: LedgerEntry['kind'];
  income: number;
  expense: number;
  net: number;
  count: number;
}

/** Totals by ledger kind for one career month, biggest absolute amount first. */
export function monthBreakdown(ledger: LedgerEntry[], month: number): { kinds: KindTotal[]; income: number; expense: number } {
  const map = new Map<LedgerEntry['kind'], KindTotal>();
  let income = 0;
  let expense = 0;
  for (const e of ledger ?? []) {
    if (monthOfDay(e.day) !== month) continue;
    const k = map.get(e.kind) ?? { kind: e.kind, income: 0, expense: 0, net: 0, count: 0 };
    if (e.amount >= 0) {
      k.income += e.amount;
      income += e.amount;
    } else {
      k.expense += -e.amount;
      expense += -e.amount;
    }
    k.net += e.amount;
    k.count++;
    map.set(e.kind, k);
  }
  const kinds = [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.income + b.expense - (a.income + a.expense));
  return { kinds, income, expense };
}

// ── Chart geometry ────────────────────────────────────────────────────────────────────────────

/** "Nice" axis ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

export function linearScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** SVG path "M x y L x y …" for points. */
export function linePath(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
}

/** Column path with a 4px rounded data-end and a square baseline. */
export function columnPath(x: number, y: number, w: number, baseY: number, r = 4): string {
  const h = baseY - y;
  if (h <= 0.5) return `M${x} ${baseY} h${w} v-0.5 h${-w} Z`;
  const rr = Math.min(r, w / 2, h);
  return `M${x} ${baseY} V${y + rr} Q${x} ${y} ${x + rr} ${y} H${x + w - rr} Q${x + w} ${y} ${x + w} ${y + rr} V${baseY} Z`;
}

// ── Labels & tones ────────────────────────────────────────────────────────────────────────────

export const UNIT_ICON: Record<UnitType, IconName> = {
  patrol: 'car',
  rapid: 'siren',
  k9: 'dog',
  traffic: 'gauge',
  criminal: 'fingerprint',
  special: 'target',
  heli: 'heli',
  border: 'flag',
  aux: 'users',
  community: 'home',
  transport: 'handcuffs',
  boat: 'boat',
};

export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger' | 'accent' | 'gold';

export function gradeTone(g: ShiftReport['grade'] | string): Tone {
  switch (g) {
    case 'S':
      return 'gold';
    case 'A':
      return 'ok';
    case 'B':
      return 'accent';
    case 'C':
      return 'warn';
    default:
      return 'danger';
  }
}

/** Meter tone for 0..1 values where higher is better. */
export function levelTone(v: number): 'accent' | 'ok' | 'warn' | 'danger' {
  if (v < 0.3) return 'danger';
  if (v < 0.55) return 'warn';
  if (v < 0.8) return 'accent';
  return 'ok';
}

/** Staatus (0..100) severity: low reputation is a warning sign. */
export function reputationTone(rep: number): 'accent' | 'ok' | 'warn' | 'danger' {
  if (rep < 15) return 'danger';
  if (rep < 40) return 'warn';
  if (rep < 75) return 'accent';
  return 'ok';
}

export function statusTone(s: StaffMember['status']): Tone {
  return s === 'active' ? 'ok' : s === 'injured' ? 'danger' : s === 'training' ? 'info' : 'neutral';
}

/** Pick an icon/tone for an inbox message from its text (payday, promotion, injury…). */
export function inboxStyle(text: Text): { icon: IconName; tone: Tone } {
  const s = `${text.et} ${text.en}`.toLowerCase();
  if (/saavutus|achievement/.test(s)) return { icon: 'trophy', tone: 'gold' };
  if (/edutat|auaste|promot|rank/.test(s)) return { icon: 'star', tone: 'gold' };
  if (/vigast|injur|haigla|hospital/.test(s)) return { icon: 'ambulance', tone: 'danger' };
  if (/miinus|võlg|deficit|debt|negative|puudu/.test(s)) return { icon: 'warning', tone: 'warn' };
  if (/palga|payday|eelarve|budget|€|boonus|bonus/.test(s)) return { icon: 'money', tone: 'ok' };
  if (/kandidaa|candidate|värba|recruit/.test(s)) return { icon: 'users', tone: 'info' };
  if (/prefektuur|prefecture|avatud|unlock/.test(s)) return { icon: 'map', tone: 'accent' };
  return { icon: 'info', tone: 'info' };
}

/** Rough age for staff (Officer has no age field): academy at ~21 + years of service. */
export function staffAge(m: Pick<StaffMember, 'years' | 'avatarSeed'>): number {
  return 21 + Math.max(0, Math.round(m.years || 0)) + (Math.abs(m.avatarSeed || 0) % 4);
}

// ── Readiness for the next shift ──────────────────────────────────────────────────────────────

export interface Readiness {
  active: number;
  injured: number;
  away: number;
  vehicles: number;
  crews: number;
  issues: { key: string; tone: 'danger' | 'warn' | 'info'; vars?: Record<string, number> }[];
}

export function readiness(p: CareerProfile, roster: RosterUnit[] | null): Readiness {
  const staff = p.staff ?? [];
  const active = staff.filter((m) => m.status === 'active').length;
  const injured = staff.filter((m) => m.status === 'injured').length;
  const away = staff.filter((m) => m.status === 'vacation' || m.status === 'training').length;
  const vehicles = (p.fleet ?? []).length;
  const crews = roster ? roster.length : 0;
  const issues: Readiness['issues'] = [];
  if (p.money < 0) issues.push({ key: 'career.ready.debt', tone: 'danger' });
  if (active === 0) issues.push({ key: 'career.ready.noStaff', tone: 'danger' });
  else if (vehicles === 0) issues.push({ key: 'career.ready.noVehicles', tone: 'warn' });
  if (injured > 0) issues.push({ key: 'career.ready.injured', tone: 'info', vars: { n: injured } });
  if (p.reputation < 15) issues.push({ key: 'career.ready.lowRep', tone: 'warn' });
  return { active, injured, away, vehicles, crews, issues };
}

// ── Sorting ───────────────────────────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc';

export function sortRows<T>(rows: T[], key: (r: T) => number | string, dir: SortDir): T[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (typeof ka === 'number' && typeof kb === 'number') return (ka - kb) * m;
    return String(ka).localeCompare(String(kb), 'et') * m;
  });
}

/** Validate onboarding input: name 2..40 chars, badge exactly 3 digits. */
export function validateOnboarding(name: string, badge: string): { name?: string; badge?: string } {
  const err: { name?: string; badge?: string } = {};
  const n = name.trim();
  if (n.length < 2) err.name = 'career.onb.err.name';
  else if (n.length > 40) err.name = 'career.onb.err.nameLong';
  if (!/^\d{3}$/.test(badge.trim())) err.badge = 'career.onb.err.badge';
  return err;
}

export function randomBadge(seed = Math.random()): string {
  return String(100 + Math.floor(clamp(seed, 0, 0.999999) * 900)).padStart(3, '0');
}

// ── Prefecture unlocks ────────────────────────────────────────────────────────────────────────

export interface RegionLock {
  id: RegionId;
  unlocked: boolean;
  /** RANKS index that unlocks it (undefined = unknown / home). */
  minRank?: number;
}

/** Which prefectures are open for shifts, and the rank that opens the rest (EXTRA_REGION_RANKS × REGION_UNLOCK_ORDER). */
export function regionLocks(p: Pick<CareerProfile, 'regionId' | 'unlockedRegions'>): RegionLock[] {
  const eco = economy as unknown as { EXTRA_REGION_RANKS?: number[]; REGION_UNLOCK_ORDER?: RegionId[] };
  const open = new Set<RegionId>([p.regionId, ...(p.unlockedRegions ?? [])]);
  const order = (eco.REGION_UNLOCK_ORDER ?? REGION_ORDER).filter((id) => id !== p.regionId);
  const ranks = eco.EXTRA_REGION_RANKS ?? [];
  return REGION_ORDER.map((id) => {
    const i = order.indexOf(id);
    return { id, unlocked: open.has(id), minRank: id === p.regionId || i < 0 ? undefined : ranks[i] };
  });
}

export function capitalize(s: string): string {
  return s ? s[0].toLocaleUpperCase('et') + s.slice(1) : s;
}
