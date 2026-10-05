import { toKpiItems, type KpiItemRow } from "@/lib/commission/run-payload";
import type { KpiItem } from "@/lib/commission/kpi";
import type { QuoteRules } from "./types";

/**
 * The department rules a quote is judged by beyond its bands — read
 * defensively, since they arrive as JSON. The KPI items come with the quote
 * context (`member_quote_context` / `member_principal_quote_context`), which a
 * member's own login can call. The cost rules do NOT (2026-10-05, user: nobody
 * may open the browser and see how our cost is made up): they come from
 * `member_quote_cost_rules`, which only the service role may run, read after
 * the context has authorised the session — and they never leave the server.
 */

/**
 * How the Revenue Team's cost is worked out for a scheme, as
 * `member_quote_cost_rules` answers it: the default ratio and the SKUs with
 * one of their own. Null when the answer is not that shape — the quote then
 * refuses rather than judge a margin on the cost as keyed.
 */
export function quoteCostRules(raw: unknown): Pick<QuoteRules, "costDivisor" | "costRatios"> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.costDivisor !== "number" && typeof value.costDivisor !== "string") return null;
  const costDivisor = Number(value.costDivisor);
  if (!Number.isFinite(costDivisor) || costDivisor <= 0) return null;
  return { costDivisor, costRatios: quoteCostRatios(value.costRatios) };
}

/**
 * The SKUs judged at their own cost ratio (Product List › Costing Setting):
 * `{ "<product code>": ratio }`. Anything that is not a positive number is
 * left out — that SKU keeps the default.
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

