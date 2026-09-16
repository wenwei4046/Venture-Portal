"use client";

import type { MemberBand, MemberInsightBlock, MemberInsightOrder } from "@/lib/member/types";
import { Icon } from "./MemberUI";
import s from "./LiveBrandMarginList.module.css";

export interface LiveBrandMargin {
  brand: string;
  margin: number | null;
  clearedOrders: number;
  pendingOrders: number;
  unknownMarginCount: number;
  tier: string;
  tone: "threshold" | "pending" | "neutral";
  threshold: number | null;
}

/** The authorised order RPC currently returns at most 200 recent orders. */
export function hasCompleteLiveOrders(block: MemberInsightBlock): boolean {
  return block.orders.length < 200 &&
    block.orders.filter((order) => order.cleared).length === block.me.orders;
}

/** Goods-only margin basis; legacy snapshots used revenue for the same basis. */
const marginRevenue = (order: MemberInsightOrder) => order.marginRevenue ?? order.revenue;

/** Finite nonpositive goods revenue is inapplicable, rather than a missing cost. */
export function hasNoGoodsMargin(order: { marginRevenue?: number; revenue: number }): boolean {
  const basis = order.marginRevenue ?? order.revenue;
  return Number.isFinite(basis) && basis <= 0;
}

/** Deposit-cleared goods margin, weighted by goods revenue, excluding non-goods KPI sales. */
export function summarizeLiveBrandMargins(
  orders: readonly MemberInsightOrder[],
  bands: readonly MemberBand[],
  complete = false,
): LiveBrandMargin[] {
  const brands = [...new Set(orders.map((order) => order.brand))].sort((a, b) => a.localeCompare(b));
  return brands.map((brand) => {
    const selected = orders.filter((order) => order.brand === brand);
    const cleared = selected.filter((order) => order.cleared);
    // KPI-only orders and nonpositive goods returns have no applicable margin.
    // Malformed bases remain pending instead of silently qualifying a brand.
    const marginOrders = cleared.filter((order) => marginRevenue(order) > 0 || !Number.isFinite(marginRevenue(order)));
    const costed = marginOrders.filter((order) => order.margin !== null && Number.isFinite(order.margin)
      && Number.isFinite(marginRevenue(order)) && marginRevenue(order) > 0);
    const revenue = costed.reduce((total, order) => total + marginRevenue(order), 0);
    const margin = revenue > 0
      ? costed.reduce((total, order) => total + marginRevenue(order) * order.margin!, 0) / revenue
      : null;
    const unknownMarginCount = marginOrders.length - costed.length;
    const brandBands = bands.filter((band) => band.brand === brand && band.kind === "incentive");
    const attained = margin === null ? undefined : brandBands
      .filter((band) => margin + 1e-10 >= band.threshold)
      .sort((a, b) => b.threshold - a.threshold)[0];
    const pending = !complete || unknownMarginCount > 0 || margin === null;
    return {
      brand, margin, clearedOrders: cleared.length,
      pendingOrders: selected.length - cleared.length, unknownMarginCount,
      tier: pending ? "Pending" : !brandBands.length ? "No tier configured" : attained ? `${attained.key} threshold` : "Below tier",
      tone: pending ? "pending" : attained ? "threshold" : "neutral",
      threshold: pending ? null : attained?.threshold ?? null,
    };
  });
}

export function LiveBrandMarginList({
  orders, bands, privateMode, title = "Margin", complete = false, onBrand,
}: {
  orders: readonly MemberInsightOrder[];
  bands: readonly MemberBand[];
  privateMode: boolean;
  title?: string;
  complete?: boolean;
  onBrand?: (brand: string) => void;
}) {
  const rows = summarizeLiveBrandMargins(orders, bands, complete);
  return (
    <section className={s.section} aria-label={title}>
      <h2>{title}</h2>
      {rows.length ? rows.map((row) => {
        const percentage = privateMode ? "••••" : row.margin === null ? "—" : `${row.margin.toFixed(2)}%`;
        const caption = !complete ? "Loaded orders · partial"
          : row.unknownMarginCount > 0 ? `${row.unknownMarginCount} ${row.unknownMarginCount === 1 ? "order" : "orders"} awaiting margin`
          : row.clearedOrders === 0 ? "Awaiting deposit clearance"
          : row.threshold !== null ? `At least ${row.threshold}% · cleared sales`
          : "Weighted margin · cleared sales";
        const content = <>
          <span className={s.brand}><strong>{row.brand}</strong><small>{caption}</small></span>
          <span className={s.value}><strong>{percentage}</strong><span className={s.tier} data-tone={row.tone}>{privateMode ? "Hidden" : row.tier}</span></span>
          {onBrand && <Icon name="chevron" size={18} />}
        </>;
        return onBrand ? (
          <button key={row.brand} type="button" className={s.row}
            aria-label={`${row.brand} margin ${percentage}. View sales orders`}
            onClick={() => onBrand(row.brand)}>{content}</button>
        ) : <div className={s.row} key={row.brand}>{content}</div>;
      }) : <p className={s.empty}>Brand margins appear here when your committed orders are available.</p>}
    </section>
  );
}
