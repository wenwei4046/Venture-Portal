"use client";

import { ICON, Svg } from "../icons";
import { TONES } from "./ladder";
import type { InsightMainVM } from "./insight-model";
import { DateChip } from "./parts";
import s from "./insight.module.css";

export type InsightTab = "personal" | "team";

export interface InsightMainActions {
  openDate: () => void;
  setTab: (tab: InsightTab) => void;
  toBills: () => void;
  toKpi: () => void;
  toWaiting: () => void;
  openBrand: (code: string) => void;
  /** The Principal's whole sub-department (2026-10-25): a member's row views them — their own bills, read-only. */
  openPerson?: (staffId: string) => void;
}

/**
 * Insight — sales, margin and KPI in one place (RevenueApp.dc.html 585–665). `whole` (2026-10-25 — the Principal
 * viewing nobody, "直接 show 全部人的单 … 或者点按过去看全部人的"): the sub-department named — everybody's bills on the
 * first tab, everybody on the second, a tap on one viewing them.
 */
export default function InsightMain({ vm, tab, dateLabel, actions, whole }: {
  vm: InsightMainVM | null; tab: InsightTab; dateLabel: string; actions: InsightMainActions; whole?: string;
}) {
  return (
    <div className={s.page}>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>Insight</h1>
          <p className={s.lede}>Sales, margin and KPI in one place.</p>
        </div>
        <DateChip label={dateLabel} onClick={actions.openDate} />
      </div>
      <div className={s.seg}>
        {(["personal", "team"] as const).map(id => (
          <button key={id} className={`${s.segBtn} ${tab === id ? s.segOn : ""}`} onClick={() => actions.setTab(id)} aria-pressed={tab === id}>
            {id === "personal" ? (whole ? `All of ${whole}` : "Personal") : whole ? "Members" : "My team"}
          </button>
        ))}
      </div>
      {!vm ? <p className={s.empty}>{whole ? `Loading ${whole}’s sales…` : "Loading your sales…"}</p>
        : tab === "personal" ? <Personal vm={vm.personal} actions={actions} whole={whole} />
        : <Team vm={vm.team} whole={whole} onPerson={actions.openPerson} />}
    </div>
  );
}

function Personal({ vm, actions, whole }: { vm: InsightMainVM["personal"]; actions: InsightMainActions; whole?: string }) {
  return (
    <div className={s.col20}>
      <button className={s.salesCard} onClick={actions.toBills}>
        <div className={s.cardTop}>
          <span className={s.cardLabel}>{whole ? `${whole} sales` : "My sales"}</span>
          <span className={`${s.cardRight} ${vm.sales.rightAccent ? s.cardRightAccent : ""}`}>{vm.sales.right}</span>
        </div>
        <div className={s.cardAmount}>{vm.sales.amount}</div>
        {vm.sales.bar !== null && <div className={s.track}><div className={s.trackFill} style={{ width: `${vm.sales.bar}%` }} /></div>}
        <div className={s.cardFoot}>
          <span className={s.cardSub}>{vm.sales.sub}</span>
          <span className={s.cardLink}>All bills<Svg d={ICON.chevronRight} size={15} sw={1.9} /></span>
        </div>
      </button>
      <div className={s.pair}>
        <button className={s.mini} onClick={actions.toKpi}>
          <span className={s.miniTop}>KPI items<Svg d={ICON.chevronRight} size={14} sw={1.9} stroke="var(--rv-sub)" /></span>
          <div className={s.miniValue}>{vm.kpi.value}</div>
          <span className={s.miniPill} style={{ color: TONES[vm.kpi.pillTone].ink, background: vm.kpi.pillTone === "neutral" ? "var(--rv-sand)" : TONES[vm.kpi.pillTone].bg }}>{vm.kpi.pill}</span>
          <span className={s.miniSub}>{vm.kpi.sub}</span>
        </button>
        <button className={s.mini} onClick={actions.toWaiting}>
          <span className={s.miniTop}>Orders<Svg d={ICON.chevronRight} size={14} sw={1.9} stroke="var(--rv-sub)" /></span>
          <div className={s.miniValue}>{vm.orders.value}</div>
          <span className={s.miniPill} style={{ color: "var(--rv-sub)", background: "var(--rv-sand)" }}>{vm.orders.pill}</span>
          <span className={`${s.miniSub} ${vm.orders.subAmber ? s.miniSubAmber : ""}`}>{vm.orders.sub}</span>
        </button>
      </div>
      <section>
        <div className={s.sectHead}><h2 className={s.sectTitle}>Margin by brand</h2><span className={s.sectNote}>{vm.overall}</span></div>
        {vm.brands.map(b => (
          <button key={b.code} className={s.brandRow} onClick={() => actions.openBrand(b.code)}>
            <span><span className={s.brandName}>{b.name}</span><span className={s.brandSub}>{b.sub}</span></span>
            <span className={s.brandRight}>
              <span className={s.brandPct}>{b.pct}</span>
              <span className={s.brandPill} style={{ color: TONES[b.tone].ink, background: TONES[b.tone].bg }}>{b.pill}</span>
            </span>
            <Svg d={ICON.chevronRight} size={16} sw={1.8} stroke="var(--rv-sub)" />
          </button>
        ))}
        {!vm.brands.length && <p className={s.empty}>No counted sales yet.</p>}
        {vm.notice && (
          <div className={s.notice}>
            <p className={s.noticeTitle}>{vm.notice.title}</p>
            <p className={s.noticeBody}>{vm.notice.body}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Team({ vm, whole, onPerson }: { vm: InsightMainVM["team"]; whole?: string; onPerson?: (staffId: string) => void }) {
  return (
    <div className={s.col20}>
      <section className={s.teamCard}>
        <div className={s.cardTop}>
          <span className={s.cardLabel}>{whole ? `${whole} sales` : "Team sales"}</span>
          <span className={`${s.cardRight} ${vm.sales.rightAccent ? s.cardRightAccent : ""}`}>{vm.sales.right}</span>
        </div>
        <div className={s.cardAmount}>{vm.sales.amount}</div>
        {vm.sales.bar !== null && <div className={s.track}><div className={s.trackFill} style={{ width: `${vm.sales.bar}%` }} /></div>}
        <p className={s.teamSub}>{vm.sales.sub}</p>
      </section>
      <div className={s.pair}>
        <div className={s.miniStatic}><span className={s.miniLabel}>Members</span><div className={s.miniValueTeam}>{vm.members.value}</div><p className={s.miniNote}>{vm.members.sub}</p></div>
        <div className={s.miniStatic}><span className={s.miniLabel}>KPI hit</span><div className={s.miniValueTeam}>{vm.kpiHit.value}</div><p className={s.miniNote}>{vm.kpiHit.sub}</p></div>
      </div>
      <section>
        <div className={s.sectHead}><h2 className={s.sectTitle}>{whole ? "Members" : "Team members"}</h2><span className={s.sectNote}>By sales</span></div>
        {vm.rows.map(t => {
          const body = (
            <>
              <span className={`${s.av} ${t.mine ? s.avMine : ""}`}>{t.ini}</span>
              <span className={s.teamText}><span className={s.teamName}>{t.name}</span><span className={s.teamTitle}>{t.title}</span></span>
              <span className={s.teamRight}><span className={s.teamSales}>{t.sales}</span><span className={s.teamMeta}>{t.meta}</span></span>
            </>
          );
          // A tap views them — their own bills, read-only (2026-10-25: "点按过去看全部人的").
          return t.open && onPerson
            ? <button key={t.id} className={`${s.teamRow} ${s.teamRowTap}`} onClick={() => onPerson(t.id)} aria-label={`View ${t.name}`}>{body}</button>
            : <div key={t.id} className={s.teamRow}>{body}</div>;
        })}
      </section>
    </div>
  );
}
