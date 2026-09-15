import type { BrandCode } from "./arena-model";

/** Self-reported whole-week allocation. The choice of four/five is always manual. */
export interface MonthlyBrandWeeks {
  weeks: 4 | 5;
  counts: Record<BrandCode, number>;
}

/** Keys are calendar months such as 2026-09, never order creation dates. */
export type BrandWeeksByMonth = Record<string, MonthlyBrandWeeks>;

const BRAND_KEYS: readonly BrandCode[] = ["AKEMI", "ERGOTEX", "ZANOTTI", "DUNLOP"];

export function allocatedWeeks(value: MonthlyBrandWeeks): number {
  return BRAND_KEYS.reduce((sum, brand) => sum + value.counts[brand], 0);
}

/** Reject unknown count keys and incomplete/overbooked plans instead of normalizing them. */
export function isValidBrandWeeks(value: unknown): value is MonthlyBrandWeeks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const plan = value as Record<string, unknown>;
  if (plan.weeks !== 4 && plan.weeks !== 5) return false;
  const weeks = plan.weeks;
  if (!plan.counts || typeof plan.counts !== "object" || Array.isArray(plan.counts)) return false;
  const counts = plan.counts as Record<string, unknown>;
  if (Object.keys(counts).length !== BRAND_KEYS.length) return false;
  if (!BRAND_KEYS.every(brand => {
    const count = counts[brand];
    return Object.prototype.hasOwnProperty.call(counts, brand) && typeof count === "number"
      && Number.isInteger(count) && count >= 0 && count <= weeks;
  })) return false;
  return allocatedWeeks(value as MonthlyBrandWeeks) === weeks;
}
