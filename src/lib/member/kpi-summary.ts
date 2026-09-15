/** Safe own-member KPI projection returned by member_kpi_summary. */
export interface MemberKpiSummary {
  schemeId: string;
  period: string;
  asOf: string;
  enabled: boolean;
  items: { productCode: string; label: string; quantity: number }[];
  total: number;
  threshold: number | null;
  hit: boolean | null;
}

export type MemberKpiSummaryOutcome = { ok: true; data: MemberKpiSummary } | { ok: false; error: string };

/** Validate and project fields; accidental future SQL payload additions stay server-side. */
export function readKpiSummary(value: unknown, schemeId: string): MemberKpiSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.schemeId !== schemeId || typeof raw.period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.period)
    || typeof raw.asOf !== "string" || !Number.isFinite(Date.parse(raw.asOf)) || typeof raw.enabled !== "boolean"
    || !Array.isArray(raw.items) || typeof raw.total !== "number" || !Number.isFinite(raw.total)
    || !(raw.threshold === null || (typeof raw.threshold === "number" && Number.isFinite(raw.threshold) && raw.threshold > 0))
    || !(raw.hit === null || typeof raw.hit === "boolean")) return null;
  const items: MemberKpiSummary["items"] = [];
  const codes = new Set<string>();
  for (const item of raw.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.productCode !== "string" || !row.productCode.trim() || codes.has(row.productCode)
      || typeof row.label !== "string" || !row.label.trim() || typeof row.quantity !== "number" || !Number.isFinite(row.quantity)) return null;
    codes.add(row.productCode);
    items.push({ productCode: row.productCode, label: row.label, quantity: row.quantity });
  }
  if (Math.abs(items.reduce((sum, item) => sum + item.quantity, 0) - raw.total) > .000001) return null;
  if (raw.hit !== (raw.threshold === null ? null : raw.total >= raw.threshold)) return null;
  if (!raw.enabled && (items.length > 0 || raw.total !== 0 || raw.threshold !== null || raw.hit !== null)) return null;
  return { schemeId, period: raw.period, asOf: raw.asOf, enabled: raw.enabled, items, total: raw.total, threshold: raw.threshold, hit: raw.hit };
}
