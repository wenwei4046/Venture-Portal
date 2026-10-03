import type { ArenaHistorySnapshot } from "./arena-history";

/** Live Arena facts only. No sample scores or client-awarded championship points. */
export type ArenaWindow = "monthly" | "quarterly" | "annual";
export type ArenaMetric = "sales" | "margin" | "kpi";
export interface ArenaScore {
  sales: number; held: number; orders: number; kpiQty: number;
  marginRevenue: number; marginCost: number; blindOrders: number;
}
export interface ArenaPerson extends ArenaScore {
  id: string; name: string; self: boolean; brands: Record<string, ArenaScore>;
}
export type ArenaWeekBrand = "AKEMI" | "ERGOTEX" | "ZANOTTI" | "DUNLOP";
/**
 * The brand a member worked each week of a month, keyed by the week's Friday
 * (`YYYY-MM-DD`); a week left out is not picked (2026-10-03). The Fair results
 * rank the member only at that brand's booth that week.
 */
export type ArenaWeekPicks = Partial<Record<string, ArenaWeekBrand>>;
export interface ArenaBrandWeeks {
  weeks: 4 | 5;
  counts: { AKEMI: number; ERGOTEX: number; ZANOTTI: number; DUNLOP: number };
  /** Which brand each week was — the counts follow from it. */
  picks?: ArenaWeekPicks;
}
/** One rung of one brand's incentive ladder, exactly as the scheme has it. */
export interface ArenaTier {
  brand: string; bandKey: string; label: string; marginPct: number; amount: number;
}
/**
 * Whether a week of the month can still be picked (2026-10-03, user: 结束之后
 * 的一个星期 … 没有填就 closing 了): open until seven days after its fair's
 * last day. Closed, only the back office changes it.
 */
export interface ArenaWeekLock { week: string; closesOn: string; locked: boolean }
export interface MemberArenaSnapshot {
  principalView?: boolean; viewedStaffId?: string;
  membershipId: string; department: string; selfId: string;
  period: string; window: ArenaWindow; from: string; through: string; asOf: string; live: boolean;
  people: ArenaPerson[]; brands: { code: string; name: string }[];
  brandWeeks: ArenaBrandWeeks | null;
  /** The month's weeks, each with the day it closes. */
  weekLocks?: ArenaWeekLock[];
  /** Empty until the scheme configures a ladder; the board then says so. */
  tiers: ArenaTier[];
  /** Optional during the read-only Fair history rollout. Never replaced by fixtures. */
  history?: ArenaHistorySnapshot;
  historyError?: string;
}
export interface ArenaRankedPerson {
  id: string; name: string; self: boolean; position: number | null; value: number | null;
  pending: boolean; hasActivity: boolean;
}
export const ARENA_WEEK_BRANDS = [
  { code: "AKEMI", name: "Akemi" }, { code: "DUNLOP", name: "Dunlopillo" },
  { code: "ZANOTTI", name: "Zanotti" }, { code: "ERGOTEX", name: "Ergotex" },
] as const;
/**
 * The weeks of a month (`YYYY-MM`), each named by its Friday — the fair
 * weekends a member picks a brand for. A fair belongs to the week it opens in,
 * so September 2026 is 4, 11, 18 and 25; October has five. The twin of SQL's
 * `member_arena_month_fridays`.
 */
export function arenaMonthFridays(period: string): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return [];
  const [year, month] = period.split("-").map(Number);
  const fridays: string[] = [];
  for (let day = 1; day <= 31; day++) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1) break;
    if (date.getUTCDay() === 5) fridays.push(date.toISOString().slice(0, 10));
  }
  return fridays;
}
/** Picks a member may save for a month: only its weeks, only the four brands. */
export function validArenaWeekPicks(period: string, value: unknown): value is ArenaWeekPicks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const weeks = new Set(arenaMonthFridays(period));
  return weeks.size > 0 && Object.entries(value).every(([week, brand]) => weeks.has(week)
    && (brand === null || brand === undefined || ARENA_WEEK_BRANDS.some(({ code }) => code === brand)));
}
/** The weeks picked, as the save stores them: picked weeks only. */
export function arenaWeekPicksToSave(period: string, picks: ArenaWeekPicks): ArenaWeekPicks {
  return Object.fromEntries(arenaMonthFridays(period).flatMap(week => picks[week] ? [[week, picks[week]]] : []));
}
/** What a save leaves the month holding: the weeks, the count per brand and the picks. */
export function arenaBrandWeeksFrom(period: string, picks: ArenaWeekPicks): ArenaBrandWeeks {
  const saved = arenaWeekPicksToSave(period, picks);
  const count = (code: ArenaWeekBrand) => Object.values(saved).filter(brand => brand === code).length;
  return { weeks: arenaMonthFridays(period).length === 5 ? 5 : 4,
    counts: { AKEMI: count("AKEMI"), ERGOTEX: count("ERGOTEX"), ZANOTTI: count("ZANOTTI"), DUNLOP: count("DUNLOP") }, picks: saved };
}
/**
 * Whether a member's own save could change this week: a closed week must come
 * back exactly as it was stored (the back office is not held to it).
 */
export function closedWeekChanged(picks: ArenaWeekPicks, stored: ArenaWeekPicks, locks: readonly ArenaWeekLock[]): string | null {
  const changed = locks.find(lock => lock.locked && (picks[lock.week] ?? null) !== (stored[lock.week] ?? null));
  return changed?.week ?? null;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
/** "13 Sep" — the day a week closes. */
export function arenaShortDay(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  return `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`;
}
/** "4–6 Sep" for the weekend that starts on Friday 4 September; "30 Oct – 1 Nov" across a month. */
export function arenaWeekendLabel(friday: string): string {
  const start = new Date(`${friday}T00:00:00Z`);
  const end = new Date(start.getTime() + 2 * 86_400_000);
  const day = (date: Date) => date.getUTCDate();
  // A fixed spelling: en-GB writes September "Sept" in some runtimes and "Sep" in others.
  const month = (date: Date) => MONTHS[date.getUTCMonth()];
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${day(start)}–${day(end)} ${month(end)}`
    : `${day(start)} ${month(start)} – ${day(end)} ${month(end)}`;
}
export function arenaRankings(people: readonly ArenaPerson[], metric: ArenaMetric, brand?: string): ArenaRankedPerson[] {
  const rows = people.map(person => {
    const score = brand ? person.brands[brand] : person;
    const hasActivity = !!score && (metric === "sales" ? score.sales !== 0 : metric === "kpi" ? score.kpiQty > 0 : score.marginRevenue > 0);
    const pending = !!score && (metric === "margin" ? score.blindOrders > 0 || !Number.isFinite(score.marginRevenue) || !Number.isFinite(score.marginCost) : !Number.isFinite(metric === "sales" ? score.sales : score.kpiQty));
    const value = pending || !score ? null : metric === "sales" ? score.sales : metric === "kpi" ? score.kpiQty
      : score.marginRevenue > 0 ? ((score.marginRevenue - score.marginCost) / score.marginRevenue) * 100 : null;
    return { id: person.id, name: person.name, self: person.self, value, pending, hasActivity, position: null as number | null };
  }).sort((a, b) => a.value === null ? b.value === null ? a.name.localeCompare(b.name) : 1
    : b.value === null ? -1 : b.value - a.value || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  let previous: number | null = null;
  let position = 0;
  let ranked = 0;
  return rows.map(row => {
    if (row.value === null || !row.hasActivity) return row;
    ranked++;
    if (previous === null || row.value !== previous) position = ranked;
    previous = row.value;
    return { ...row, position };
  });
}

/** The brand a bill carries when the ERP put none on it. */
export const ARENA_UNBRANDED = "UNCLASSIFIED";

export type ArenaIncentiveBlock =
  | { reason: "no_brand" }
  | { reason: "no_cost"; brand: string }
  | { reason: "no_ladder"; brand: string };

export interface ArenaBrandStanding {
  brand: string; revenue: number; marginPct: number | null; blindOrders: number;
  /** Band keys this brand's own margin clears. */
  cleared: string[];
  /** The next rung of this brand's ladder, and how far off it is. */
  next: { label: string; marginPct: number; gap: number } | null;
}

export interface ArenaIncentive {
  brands: ArenaBrandStanding[];
  blocked: ArenaIncentiveBlock | null;
  earned: { bandKey: string; label: string; amount: number }[];
  amount: number;
}

/** A brand's blended margin, or null when a bill of it has no cost. */
function brandMargin(score: ArenaScore): number | null {
  if (score.blindOrders > 0) return null;
  if (!(score.marginRevenue > 0)) return null;
  return (score.marginRevenue - score.marginCost) / score.marginRevenue;
}

/**
 * The monthly margin incentive as the ENGINE pays it, not as a ranking.
 *
 * Mirrors `marginIncentiveAcrossBrands`: thresholds follow the brand, EVERY
 * brand sold has to clear a tier for it to count, so the tiers earned are the
 * intersection of what each brand clears and the money stacks up that
 * intersection. Anything that makes one brand unjudgeable — a bill with no
 * brand, a bill with no cost, a brand with no ladder — blocks the whole
 * incentive and says which, rather than quietly paying on the rest.
 *
 * Kept as a pure function beside the ranking because the board's one promise
 * is that it agrees with the run, and that is only checkable if the rule lives
 * somewhere a test can reach.
 */
export function arenaIncentive(person: ArenaPerson, tiers: readonly ArenaTier[]): ArenaIncentive {
  // A brand counts the moment it carries commissionable goods revenue, costed
  // or not — the same test the engine makes before it tallies a bill.
  const active = Object.entries(person.brands)
    .filter(([, score]) => score.marginRevenue > 0 || score.blindOrders > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  const brands: ArenaBrandStanding[] = active.map(([brand, score]) => {
    const marginPct = brandMargin(score);
    const ladder = tiers.filter(tier => tier.brand === brand).slice().sort((a, b) => a.marginPct - b.marginPct);
    const cleared = marginPct === null ? [] : ladder.filter(tier => marginPct + 1e-9 >= tier.marginPct).map(tier => tier.bandKey);
    const next = marginPct === null ? undefined : ladder.find(tier => marginPct + 1e-9 < tier.marginPct);
    return {
      brand, revenue: score.marginRevenue, marginPct, blindOrders: score.blindOrders, cleared,
      next: next ? { label: next.label, marginPct: next.marginPct, gap: next.marginPct - marginPct! } : null,
    };
  });

  if (brands.length === 0) return { brands, blocked: null, earned: [], amount: 0 };

  const unbranded = brands.some(brand => brand.brand === ARENA_UNBRANDED);
  const blind = brands.find(brand => brand.marginPct === null);
  const bare = brands.find(brand => !tiers.some(tier => tier.brand === brand.brand));
  const blocked: ArenaIncentiveBlock | null = unbranded ? { reason: "no_brand" }
    : blind ? { reason: "no_cost", brand: blind.brand }
    : bare ? { reason: "no_ladder", brand: bare.brand } : null;
  if (blocked) return { brands, blocked, earned: [], amount: 0 };

  let keys = new Set(brands[0].cleared);
  for (const brand of brands.slice(1)) keys = new Set([...keys].filter(key => brand.cleared.includes(key)));

  // Amounts should agree across brands; the engine takes the lowest if they
  // ever disagree, so this does too.
  const earned = [...keys].map(key => {
    const defs = tiers.filter(tier => tier.bandKey === key);
    return { bandKey: key, label: defs[0].label, amount: Math.min(...defs.map(def => def.amount)) };
  }).sort((a, b) => b.amount - a.amount || a.bandKey.localeCompare(b.bandKey));

  return { brands, blocked: null, earned, amount: Math.round(earned.reduce((sum, tier) => sum + tier.amount, 0) * 100) / 100 };
}
