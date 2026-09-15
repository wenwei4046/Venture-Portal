import type { MemberKpi } from "@/lib/member/types";

/**
 * Illustrative Today preview policy requested for Pillow + Protector.
 * This is not the live scheme's product-code eligibility or threshold config.
 */
export const TODAY_KPI_PREVIEW_POLICY = {
  itemLabels: ["Pillow", "Protector"],
  threshold: 10,
} as const;

export interface TodayKpiSummaryData {
  items: { label: string; quantity: number | null }[];
  total: number | null;
  threshold: number | null;
  hit: boolean | null;
}

/** Missing or ambiguous counts remain pending; item-level targets never apply. */
export function todayKpiSummary(goals: readonly MemberKpi[]): TodayKpiSummaryData {
  const items = TODAY_KPI_PREVIEW_POLICY.itemLabels.map((label) => {
    const matches = goals.filter((goal) => goal.label === label);
    const goal = matches.length === 1 ? matches[0] : undefined;
    const quantity = goal && goal.unit === "units" && Number.isFinite(goal.current) && goal.current >= 0
      ? goal.current : null;
    return { label, quantity };
  });
  const total = items.every((item) => item.quantity !== null)
    ? items.reduce((sum, item) => sum + item.quantity!, 0) : null;
  const threshold = TODAY_KPI_PREVIEW_POLICY.threshold;
  return { items, total, threshold, hit: total === null ? null : total >= threshold };
}
