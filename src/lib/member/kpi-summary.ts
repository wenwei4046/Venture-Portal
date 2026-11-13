/** Safe own-member KPI projection returned by member_kpi_summary. */
export interface MemberKpiSummary {
  schemeId: string;
  period: string;
  asOf: string;
  enabled: boolean;
  /**
   * `brand` (2026-11-12): the item is a brand's own on its own commission scheme (2990s' Upgrade fabric) — counted
   * whatever the sub-department's KPI switch says, and no part of the sub-department's ladder. Absent = its own.
   */
  items: { productCode: string; label: string; quantity: number; brand?: string }[];
  total: number;
  /**
   * The sub-department's own units — what `threshold` is read against (2026-11-12: a brand's own units are no part
   * of that ladder). Absent (an answer from before) = `total`.
   */
  ladderTotal?: number;
  threshold: number | null;
  hit: boolean | null;
}

export type MemberKpiSummaryOutcome = { ok: true; data: MemberKpiSummary } | { ok: false; error: string };

/** The units a summary's threshold is read against: the sub-department's own, else every unit (an answer from before). */
export function kpiLadderUnits(kpi: Pick<MemberKpiSummary, "total" | "ladderTotal">): number {
  return kpi.ladderTotal ?? kpi.total;
}

/** Validate and project fields; accidental future SQL payload additions stay server-side. */
export function readKpiSummary(value: unknown, schemeId: string): MemberKpiSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.schemeId !== schemeId || typeof raw.period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.period)
    || typeof raw.asOf !== "string" || !Number.isFinite(Date.parse(raw.asOf)) || typeof raw.enabled !== "boolean"
    || !Array.isArray(raw.items) || typeof raw.total !== "number" || !Number.isFinite(raw.total)
    || !(raw.threshold === null || (typeof raw.threshold === "number" && Number.isFinite(raw.threshold) && raw.threshold > 0))
    || !(raw.hit === null || typeof raw.hit === "boolean")
    || !(raw.ladderTotal === undefined || (typeof raw.ladderTotal === "number" && Number.isFinite(raw.ladderTotal)))) return null;
  const items: MemberKpiSummary["items"] = [];
  const codes = new Set<string>();
  let ladder = 0;
  for (const item of raw.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.productCode !== "string" || !row.productCode.trim() || codes.has(row.productCode)
      || typeof row.label !== "string" || !row.label.trim() || typeof row.quantity !== "number" || !Number.isFinite(row.quantity)
      || !(row.brand === undefined || (typeof row.brand === "string" && row.brand.trim() !== ""))) return null;
    codes.add(row.productCode);
    if (row.brand === undefined) ladder += row.quantity;
    items.push({ productCode: row.productCode, label: row.label, quantity: row.quantity, ...(row.brand === undefined ? {} : { brand: row.brand }) });
  }
  if (Math.abs(items.reduce((sum, item) => sum + item.quantity, 0) - raw.total) > .000001) return null;
  // The ladder's units are the items no brand owns.
  if (raw.ladderTotal !== undefined && Math.abs(ladder - raw.ladderTotal) > .000001) return null;
  if (raw.hit !== (raw.threshold === null ? null : (raw.ladderTotal ?? raw.total) >= raw.threshold)) return null;
  if (!raw.enabled && (items.length > 0 || raw.total !== 0 || raw.threshold !== null || raw.hit !== null)) return null;
  return {
    schemeId, period: raw.period, asOf: raw.asOf, enabled: raw.enabled, items, total: raw.total,
    ...(raw.ladderTotal === undefined ? {} : { ladderTotal: raw.ladderTotal }),
    threshold: raw.threshold, hit: raw.hit,
  };
}
