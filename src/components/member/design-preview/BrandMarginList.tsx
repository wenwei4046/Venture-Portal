"use client";

import { Icon } from "../MemberUI";
import { tierLabels, type InsightTier } from "./insight-model";
import s from "./BrandMarginList.module.css";

export interface BrandMarginRow {
  brand: string;
  margin: number | null;
  tier: InsightTier;
  unknownMarginCount: number;
}

export interface BrandMarginListProps {
  rows: readonly BrandMarginRow[];
  title?: string;
  onSelectBrand?: (brand: string) => void;
  hrefForBrand?: (brand: string) => string;
}

export function BrandMarginList({ rows, title = "Margin", onSelectBrand, hrefForBrand }: BrandMarginListProps) {
  return <section className={s.section} aria-label={title}>
    <h2 className={s.heading}>{title}</h2>
    <div className={s.list}>
      {rows.map(row => {
        const margin = row.margin !== null && Number.isFinite(row.margin) ? `${row.margin.toFixed(2)}%` : "—";
        const pending = row.unknownMarginCount > 0 || row.tier === "unknown";
        const status = pending ? "Pending" : tierLabels[row.tier];
        const label = `${row.brand} margin ${margin}, ${status}${row.unknownMarginCount > 0 ? `, ${row.unknownMarginCount} ${row.unknownMarginCount === 1 ? "order" : "orders"} awaiting margin` : ""}. View sales orders`;
        const content = <>
          <span className={s.brand}>{row.brand}<small className={s.caption}>{row.unknownMarginCount > 0 ? <>{row.unknownMarginCount} {row.unknownMarginCount === 1 ? "order" : "orders"} awaiting margin{margin !== "—" ? " · partial margin" : ""}</> : "Weighted sales margin"}</small></span>
          <span className={s.result}><strong className={s.margin}>{margin}</strong><span className={s.tier} data-tier={pending ? "unknown" : row.tier}>{status}</span></span>
          <Icon name="chevron" size={17} />
        </>;
        return onSelectBrand
          ? <button key={row.brand} type="button" className={s.row} onClick={() => onSelectBrand(row.brand)} aria-label={label}>{content}</button>
          : hrefForBrand
            ? <a key={row.brand} className={s.row} href={hrefForBrand(row.brand)} aria-label={label}>{content}</a>
            : <div key={row.brand} className={s.row}>{content}</div>;
      })}
      {!rows.length && <p className={s.empty}>No brand sales in this view.</p>}
    </div>
  </section>;
}
