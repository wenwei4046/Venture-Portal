"use client";

import type { KpiVM } from "./insight-model";
import { SubHead } from "./parts";
import s from "./insight.module.css";

/** KPI items — how many, how they got there, week by week, bill by bill (456–518). */
export default function KpiPage({ vm, dateLabel, onBill, onBack, onDate }: {
  vm: KpiVM | null;
  dateLabel: string;
  onBill: (id: string) => void;
  onBack: () => void;
  onDate: () => void;
}) {
  return (
    <div className={s.subPage}>
      <SubHead title="KPI items" dateLabel={dateLabel} onBack={onBack} onDate={onDate} />
      {!vm ? <p className={s.empty}>Loading your KPI items…</p> : (
        <>
          <section className={`${s.kpiHero} ${vm.enabled ? "" : s.kpiHeroOff}`}>
            <div className={s.kpiHeroTop}>
              <div><span className={s.kpiHeroLabel}>Eligible KPI items</span><span className={s.kpiHeroValue}>{vm.total}</span></div>
              <span className={`${s.kpiHeroPill} ${!vm.enabled ? s.kpiHeroPillOff : vm.hit ? "" : s.kpiHeroPillTodo}`}>{vm.pill}</span>
            </div>
            {vm.enabled && (
              <div className={s.kpiBar}>
                <div className={s.kpiBarFill} style={{ width: `${vm.fill}%` }} />
                {vm.marker !== null && <span className={s.kpiBarMark} style={{ left: `${vm.marker}%` }} />}
              </div>
            )}
            <div className={s.kpiFoot}><span>{vm.need}</span>{vm.above && <span className={s.kpiFootStrong}>{vm.above}</span>}</div>
          </section>
          {vm.how && (
            <section className={s.kpiHow}>
              <div className={`${s.sectHead} ${s.sectHeadFlat}`}><h2 className={s.sectTitle}>{vm.how.title}</h2><span className={s.sectNote}>{vm.how.threshold}</span></div>
              <div className={s.kpiStackWrap}>
                {vm.how.thLeft && <span className={s.kpiStackLabel} style={{ left: vm.how.thLeft }}>{vm.how.threshold.replace("Threshold ", "")}</span>}
                <div className={s.kpiStack}>
                  {vm.how.items.map(k => <span key={k.name} style={{ flex: `${k.n} 1 0`, background: k.color }} />)}
                </div>
                {vm.how.thLeft && <span className={s.kpiStackMark} style={{ left: vm.how.thLeft }} />}
              </div>
              <div className={s.kpiScale}><span>0</span><span>{vm.how.total}</span></div>
              <div className={s.kpiLegend}>
                {vm.how.items.map(k => (
                  <div key={k.name} className={s.kpiLegendRow}>
                    <span className={s.kpiSwatch} style={{ background: k.color }} />
                    <span className={s.kpiLegendName}>{k.name}</span>
                    <span className={s.kpiLegendN}>{k.n}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {vm.weeks.length > 0 && (
            <section>
              <h2 className={s.weekTitle}>By week</h2>
              <div className={s.kpiWeeks}>
                {vm.weeks.map(w => (
                  <div key={w.key} className={s.kpiWeek} style={{ background: w.tint }}>
                    <span className={s.kpiWeekLabel} style={{ color: w.color }}>{w.week}</span>
                    <span className={s.kpiWeekN}>{w.n}</span>
                    <span className={s.kpiWeekBrand}>{w.brand}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {vm.enabled && (
            <section>
              <div className={s.sectHead}><h2 className={s.sectTitle}>Orders with KPI items</h2><span className={s.sectNote}>{vm.orderCount}</span></div>
              {vm.orders.map(o => (
                <button key={o.id} className={`${s.bill} ${s.kpiOrderBill}`} onClick={() => onBill(o.id)}>
                  <span className={s.billText}><span className={s.billNo}>{o.no}</span><span className={s.billSub}>{o.items}</span></span>
                  <span className={s.kpiOrderPill}>KPI {o.kpi}</span>
                </button>
              ))}
              {!vm.orders.length && <p className={s.empty}>No KPI items on a counted bill yet.</p>}
            </section>
          )}
          <p className={s.footnote}>All eligible KPI quantities count together, including eligible giveaway items. Only deposit-cleared orders count.</p>
        </>
      )}
    </div>
  );
}
