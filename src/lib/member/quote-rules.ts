import { toKpiItems, type KpiItemRow } from "@/lib/commission/run-payload";
import type { KpiItem } from "@/lib/commission/kpi";

/**
 * The department rules a quote context carries beyond its bands and default
 * divisor (2026-09-27) — read defensively, since they arrive as JSON from
 * `member_quote_context` / `member_principal_quote_context`.
 */

/**
 * The SKUs judged at their own cost ratio (Product List › Costing Setting),
 * as the quote context sends them: `{ "<product code>": ratio }`. Anything
 * that is not a positive number is left out — that SKU keeps the default.
 */
export function quoteCostRatios(raw: unknown): { productCode: string; ratio: number }[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>).flatMap(([productCode, value]) => {
    const ratio = Number(value);
    return productCode.trim() && Number.isFinite(ratio) && ratio > 0 ? [{ productCode, ratio }] : [];
  });
}

/** The department's KPI items as the quote context sends them — none while KPI pay is off. */
export function quoteKpiItems(raw: unknown): KpiItem[] {
  if (!Array.isArray(raw)) return [];
  return toKpiItems(
    raw.filter((row): row is KpiItemRow => !!row && typeof row === "object").map((row) => ({
      source: row.source ?? null,
      product_code: row.product_code ?? null,
      product_name: row.product_name ?? null,
      option_pool: row.option_pool ?? null,
      option_value: row.option_value ?? null,
      kpi_amount: row.kpi_amount,
    })),
  );
}

