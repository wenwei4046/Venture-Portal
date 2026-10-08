"use client";

import type { CSSProperties } from "react";
import type { BillsVM } from "./insight-model";
import { BillButton, SubHead } from "./parts";
import s from "./insight.module.css";

export type BillsStatus = "counted" | "waiting";

/** My sales orders — Counted / Waiting tiles over the month's weeks (`soLayout="a"`, 519–584). */
export default function BillsPage({ vm, dateLabel, status, week, onStatus, onWeek, onBill, onBack, onDate }: {
  vm: BillsVM | null;
  dateLabel: string;
  status: BillsStatus;
  week: string | null;
  onStatus: (status: BillsStatus) => void;
  onWeek: (key: string) => void;
  onBill: (id: string) => void;
  onBack: () => void;
  onDate: () => void;
}) {
  // The prototype opens on the first week; carried-in bills wait behind their own tab.
  const selected = vm ? (week && vm.weeks[week] ? week : (vm.tabs.find(t => t.key !== "earlier") ?? vm.tabs[0])?.key ?? null) : null;
  const card = selected && vm ? vm.weeks[selected] : null;
  return (
    <div className={s.billsPage}>
      <SubHead title="My sales orders" dateLabel={dateLabel} onBack={onBack} onDate={onDate} />
      {!vm ? <p className={s.empty}>Loading your bills…</p> : (
        <>
          <section className={s.tiles}>
            <button className={`${s.tile} ${s.tileCounted} ${status === "counted" ? s.tileCountedOn : ""}`} onClick={() => onStatus("counted")} aria-pressed={status === "counted"}>
              <span className={s.tileLabel}>Counted sales</span>
              <span className={s.tileAmount}>{vm.counted.amount}</span>
              <span className={s.tileSub}>{vm.counted.sub}</span>
            </button>
            <button className={`${s.tile} ${s.tileWaiting} ${status === "waiting" ? s.tileWaitingOn : ""}`} onClick={() => onStatus("waiting")} aria-pressed={status === "waiting"}>
              <span className={s.tileLabel}>Waiting for deposit</span>
              <span className={`${s.tileAmount} ${s.tileAmountWait}`}>{vm.waiting.amount}</span>
              <span className={s.tileSub}>{vm.waiting.sub}</span>
            </button>
          </section>
          {status === "counted" ? (
            vm.tabs.length ? (
              <>
                <div className={s.weekTabs}>
                  {vm.tabs.map(t => {
                    const on = t.key === selected;
                    return (
                      <button key={t.key} className={`${s.weekTab} ${on ? s.weekTabOn : ""}`} onClick={() => onWeek(t.key)} aria-pressed={on}
                        style={on ? { borderColor: t.color, background: t.tint } : undefined}>
                        <span className={s.weekTabTitle}>{t.title}</span>
                        <span className={s.weekTabBrand} style={on ? { color: t.color } as CSSProperties : undefined}>{t.brand}</span>
                        <span className={s.weekTabDates}>{t.dates}</span>
                      </button>
                    );
                  })}
                </div>
                {card && (
                  <section className={s.weekList}>
                    <div className={s.weekCard} style={{ background: card.tint }}>
                      <div className={s.weekCardTop}><span className={s.weekCardTitle}>{card.brandWeek}</span><span className={s.weekCardTotal}>{card.total}</span></div>
                      <span className={s.weekCardPlace}>{card.place}</span>
                      <span className={s.weekCardDates}>{card.dates} · {card.stats}</span>
                    </div>
                    {card.bills.map(b => <BillButton key={b.id} {...b} onClick={() => onBill(b.id)} />)}
                  </section>
                )}
              </>
            ) : <p className={s.empty}>No bills this {dateLabel.includes(" ") ? "month" : "period"} yet.</p>
          ) : (
            <section className={s.weekList}>
              <div className={s.waitCard}>
                <span className={s.waitTitle}>Waiting for deposit</span>
                <span className={s.waitBody}>These orders count toward sales, margin and KPI once the deposit clears, in that commission month.</span>
              </div>
              {vm.waitBills.map(b => <BillButton key={b.id} {...b} onClick={() => onBill(b.id)} />)}
              {!vm.waitBills.length && <p className={s.empty}>Nothing is waiting for a deposit.</p>}
            </section>
          )}
          <p className={s.footnote}>{vm.footnote}</p>
        </>
      )}
    </div>
  );
}
