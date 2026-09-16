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
export interface ArenaBrandWeeks {
  weeks: 4 | 5;
  counts: { AKEMI: number; ERGOTEX: number; ZANOTTI: number; DUNLOP: number };
}
export interface MemberArenaSnapshot {
  principalView?: boolean; viewedStaffId?: string;
  membershipId: string; department: string; selfId: string;
  period: string; window: ArenaWindow; from: string; through: string; asOf: string; live: boolean;
  people: ArenaPerson[]; brands: { code: string; name: string }[];
  brandWeeks: ArenaBrandWeeks | null;
}
export interface ArenaRankedPerson {
  id: string; name: string; self: boolean; position: number | null; value: number | null;
  pending: boolean; hasActivity: boolean;
}
export const ARENA_WEEK_BRANDS = [
  { code: "AKEMI", name: "Akemi" }, { code: "DUNLOP", name: "Dunlopillo" },
  { code: "ZANOTTI", name: "Zanotti" }, { code: "ERGOTEX", name: "Ergotex" },
] as const;
export function validArenaBrandWeeks(value: unknown): value is ArenaBrandWeeks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as ArenaBrandWeeks;
  if (candidate.weeks !== 4 && candidate.weeks !== 5) return false;
  if (!candidate.counts || typeof candidate.counts !== "object" || Array.isArray(candidate.counts)) return false;
  const keys = Object.keys(candidate.counts);
  return keys.length === 4 && ARENA_WEEK_BRANDS.every(({ code }) => Number.isInteger(candidate.counts[code]) && candidate.counts[code] >= 0)
    && ARENA_WEEK_BRANDS.reduce((sum, { code }) => sum + candidate.counts[code], 0) === candidate.weeks;
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
