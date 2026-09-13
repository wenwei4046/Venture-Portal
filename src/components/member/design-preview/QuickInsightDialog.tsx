"use client";

import { useEffect, useId, useRef } from "react";
import { Icon, initials } from "../MemberUI";
import { type InsightOrder } from "./insight-model";
import { personQuickInsight, teamQuickInsight } from "./quick-insight-model";
import s from "./QuickInsightDialog.module.css";

type Props = {
  personId?: string;
  onClose: () => void;
  onOrder: (order: InsightOrder) => void;
  onMember: (personId: string) => void;
  onLowMargin: (personId: string) => void;
};

const number = (value: number) => new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(value);
const money = (value: number) => `RM ${number(value)}`;
const percent = (value: number | null) => value === null ? "—" : `${value.toFixed(1)}%`;
const change = (value: number | null, unit: string) => value === null ? "No comparison" : `${value > 0 ? "+" : ""}${value.toFixed(unit === " items" ? 0 : 1)}${unit}`;
const direction = (value: number | null) => value === null || Math.abs(value) < 0.05 ? "neutral" : value > 0 ? "positive" : "attention";

export default function QuickInsightDialog({ personId, onClose, onOrder, onMember, onLowMargin }: Props) {
  const report = personId ? personQuickInsight(personId) : teamQuickInsight();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeAction = useRef(onClose);
  closeAction.current = onClose;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // showModal makes the page behind inert; Tab boundaries also wrap below.
    // The fallback also supports DOM-only preview tests and older webviews.
    try {
      if (typeof element.showModal === "function") element.showModal();
      else element.setAttribute("open", "");
    } catch {
      element.setAttribute("open", "");
    }
    closeButton.current?.focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAction.current();
      }
      if (event.key !== "Tab") return;
      const hasLayout = element.getClientRects().length > 0;
      const targets = Array.from(element.querySelectorAll<HTMLElement>("button, [href], summary, [tabindex]:not([tabindex='-1'])"))
        .filter(target => {
          const closedDetails = target.closest("details:not([open])");
          const style = window.getComputedStyle(target);
          return !target.matches(":disabled, [tabindex='-1']") && !target.closest("[hidden], [inert]")
            && (!closedDetails || closedDetails.querySelector("summary") === target)
            && style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse"
            && (!hasLayout || target.getClientRects().length > 0);
        });
      const first = targets[0];
      const last = targets[targets.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === element || !element.contains(active))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (active === last || active === element || !element.contains(active))) {
        event.preventDefault(); first?.focus();
      }
    };
    element.addEventListener("keydown", handleKey);
    return () => {
      element.removeEventListener("keydown", handleKey);
      if (typeof element.close === "function" && element.open) element.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  const metrics = [
    { label: "Sales · RM", current: number(report.current.sales), previous: report.previous ? number(report.previous.sales) : "—", delta: change(report.salesChangePercent, "%"), tone: direction(report.salesChangePercent) },
    { label: "Margin", current: percent(report.current.margin), previous: percent(report.previous?.margin ?? null), delta: change(report.marginChangePoints, " pts"), tone: direction(report.marginChangePoints) },
    { label: "KPI items", current: number(report.current.kpi), previous: report.previous ? number(report.previous.kpi) : "—", delta: change(report.kpiChange, " items"), tone: direction(report.kpiChange) },
  ];

  return <dialog ref={dialog} className={s.dialog} aria-labelledby={titleId} aria-modal="true" data-testid="quick-insight-dialog"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={s.window}>
      <header className={s.header}>
        <span className={s.headerIcon}><Icon name={personId ? "chart" : "team"} size={20} /></span>
        <div><h2 id={titleId}>{personId ? "Quick insight" : "Team quick insight"}</h2><p>{report.subject}</p></div>
        <button ref={closeButton} type="button" className={s.close} aria-label="Close quick insight" onClick={onClose}><Icon name="close" size={20} /></button>
      </header>
      <div className={s.body}>
        <div className={s.context}><span><Icon name="calendar" size={14} />{report.periodLabel}</span><small>{report.comparisonLabel} · same days</small></div>
        <section className={s.conclusion} aria-label="Monthly performance summary"><span>THE MONTH SO FAR</span><h3>{report.title}</h3><p>{report.summary}</p></section>
        <section aria-label="Monthly performance comparison" className={s.metrics}>
          {metrics.map(metric => <div key={metric.label} className={s.metric}><span>{metric.label}</span><strong>{metric.current}</strong><small>Prev. {metric.previous}</small><em data-tone={metric.tone}>{metric.delta}</em>{metric.label === "Margin" && <small className={s.costingLabel}>Costed sales only</small>}</div>)}
        </section>
        <div className={s.facts}><span>{report.current.orders} orders</span>{report.coverage !== null && <span>{Math.round(report.coverage)}% with KPI items</span>}</div>
        {report.target !== null && report.targetPercent !== null && <section className={s.target} aria-label="Monthly sales target"><div><span>Monthly sales target</span><strong>{Math.round(report.targetPercent)}%</strong></div><div className={s.track} role="progressbar" aria-label="Sales target achieved" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, Math.max(0, report.targetPercent)))}><span style={{ width: `${Math.min(100, Math.max(0, report.targetPercent))}%` }} /></div><small>{money(report.current.sales)} of {money(report.target)}</small></section>}
        {report.lowOrders.length > 0 && <section className={s.section} aria-label="Low-margin orders to review"><div className={s.sectionHeading}><h3>Orders to look at</h3><span>Low margin</span></div><div className={s.orders}>{report.lowOrders.slice(0, 3).map(({ order, personName, sharePercent, withoutMargin }) => <button type="button" className={s.order} key={order.id} onClick={() => onOrder(order)} aria-label={`Review low-margin order ${order.number}`}><div className={s.orderTop}><span>{personName}</span><strong>{percent(order.margin)}</strong></div><div className={s.orderNumber}><strong>{order.number}</strong><span>{money(order.sales)} <Icon name="chevron" size={15} /></span></div><p>{Math.round(sharePercent)}% of {personId ? "monthly" : "team"} sales{withoutMargin !== null && <> · Margin without it: <strong>{percent(withoutMargin)}</strong></>}</p></button>)}</div>{personId && <button type="button" className={s.textButton} onClick={() => onLowMargin(personId)}>Review all low-margin orders <Icon name="arrow" size={16} /></button>}</section>}
        {report.members && report.members.length > 0 && <details className={s.memberComparison} aria-label="Team member comparisons"><summary>Compare team members <span>{report.members.length} members</span></summary><div className={s.members}>{report.members.map(member => <div key={member.personId} className={s.member}><button type="button" className={s.memberButton} onClick={() => onMember(member.personId)} aria-label={`View ${member.name}'s performance`}><span className={s.avatar}>{initials(member.name)}</span><span className={s.memberDetails}><strong>{member.name}</strong><small><span data-tone={direction(member.salesChangePercent)}>Sales {change(member.salesChangePercent, "%")}</span><span data-tone={direction(member.marginChangePoints)}>Margin {change(member.marginChangePoints, " pts")}</span></small></span><Icon name="chevron" size={16} /></button>{report.lowOrders.some(entry => entry.order.staffId === member.personId) && <button type="button" className={s.memberReview} onClick={() => onLowMargin(member.personId)} aria-label={`Review ${member.name}'s low-margin orders`}>Review low-margin orders <Icon name="arrow" size={14} /></button>}</div>)}</div></details>}
        <details className={s.method}><summary>How this summary works</summary><p>Sales and KPI items are calculated from orders in this monthly view, across all venues. Targets apply to the whole month. Changes compare the same days of the previous month. Margin is weighted by sales and excludes orders without costing.</p>{(report.current.unknownMarginCount > 0 || (report.previous?.unknownMarginCount ?? 0) > 0) && <p>Margin excludes orders awaiting costing: {report.current.unknownMarginCount} this month{report.previous && `, ${report.previous.unknownMarginCount} in the comparison period`}. Sales and KPI totals still include them.</p>}<p>Highlights follow data rules: changes in performance and low-margin orders. The margin without an order is a comparison of the remaining orders, not a forecast.</p></details>
        <p className={s.footnote}>Calculated from sample data. No AI service connected.</p>
      </div>
    </div>
  </dialog>;
}
