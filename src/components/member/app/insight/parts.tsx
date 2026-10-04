"use client";

import type { ReactNode } from "react";
import { ICON, Svg } from "../icons";
import s from "./insight.module.css";

/** The date chip: calendar · `Sep 2026` · chevron. */
export function DateChip({ label, small, onClick }: { label: string; small?: boolean; onClick: () => void }) {
  return (
    <button className={`${s.dateChip} ${small ? s.dateChipSm : ""}`} onClick={onClick}>
      <Svg d={ICON.calendar} size={15} sw={1.8} stroke="var(--rv-accent)" />
      {label}
      <Svg d={ICON.chevronDown} size={13} sw={2.2} stroke="var(--rv-sub)" />
    </button>
  );
}

/** ‹ Insight · the date chip, then the page's title (and whatever sits between). */
export function SubHead({ title, dateLabel, onBack, onDate, children, titleClass }: {
  title: string;
  dateLabel: string;
  onBack: () => void;
  onDate: () => void;
  children?: ReactNode;
  titleClass?: string;
}) {
  return (
    <div className={s.subHead}>
      <div className={s.subTop}>
        <button className={s.back} onClick={onBack}><Svg d={ICON.back} size={20} sw={1.9} />Insight</button>
        <DateChip label={dateLabel} small onClick={onDate} />
      </div>
      {children}
      <h1 className={`${s.subTitle} ${titleClass ?? ""}`}>{title}</h1>
    </div>
  );
}

/** A bill on a list: number and line, amount and its margin · KPI. */
export function BillButton({ no, sub, amt, amtMuted, pill, pillInk, kpiText, onClick }: {
  no: string; sub: string; amt: string; amtMuted: boolean; pill: string; pillInk: string; kpiText: string | null; onClick: () => void;
}) {
  return (
    <button className={s.bill} onClick={onClick}>
      <span className={s.billText}><span className={s.billNo}>{no}</span><span className={s.billSub}>{sub}</span></span>
      <span className={s.billRight}>
        <span className={`${s.billAmt} ${amtMuted ? s.billAmtMuted : ""}`}>{amt}</span>
        <span className={s.billMeta}>
          <span className={s.billPill} style={{ color: pillInk }}>{pill}</span>
          {kpiText && <span className={s.billKpi}> · {kpiText}</span>}
        </span>
      </span>
    </button>
  );
}
