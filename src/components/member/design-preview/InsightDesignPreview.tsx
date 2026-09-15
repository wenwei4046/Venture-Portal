"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, initials } from "../MemberUI";
import { fairs, people, brands, getPerson, getFair, selectOrders, summarize, summarizeBrandMargins, summarizeKpi, venueRanking, marginImpact, tierLabels, type InsightOrder, type InsightPeriod, type InsightTier } from "./insight-model";
import shell from "./InsightShell.module.css";
import theme from "./InsightTheme.module.css";
import s from "./InsightDesignPreview.module.css";
import QuickInsightDialog from "./QuickInsightDialog";
import { RevenuePreviewHeader, RevenuePreviewNav } from "./RevenuePreviewChrome";
import motion from "./ArenaMotion.module.css";
import { BrandMarginList } from "./BrandMarginList";

type Screen = "insight" | "insight-member" | "insight-orders" | "insight-order" | "insight-fairs" | "insight-venue" | "insight-target" | "insight-kpi";
type Route = { screen: Screen; scope: "personal" | "team"; person: string; period: InsightPeriod; fair: string; brand: string; tier: InsightTier | "all"; query: string; order: string; lens: "sales" | "margin" | "kpi"; quantity: string };
const screens: Screen[] = ["insight", "insight-member", "insight-orders", "insight-order", "insight-fairs", "insight-venue", "insight-target", "insight-kpi"];
const defaults: Route = { screen: "insight", scope: "personal", person: "jia", period: "month", fair: "all", brand: "all", tier: "all", query: "", order: "", lens: "margin", quantity: "any" };
const money = (value: number) => `RM ${new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(value)}`;
const percent = (value: number | null) => value === null ? "—" : `${value.toFixed(1)}%`;
const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const periodLabel = (period: InsightPeriod) => period === "month" ? "September 2026" : "Last week · 31 Aug–6 Sep";
const tiers: (InsightTier | "all")[] = ["all", "tier2", "tier1", "standard", "low", "unknown"];
const statusLabels = { estimated: "Estimated", pending: "Pending", settled: "Settled", paid: "Paid" };
const average = (value: number | null) => value === null ? "—" : value.toFixed(1);

function readRoute(): Route {
  const p = new URL(window.location.href).searchParams;
  return { screen: screens.includes(p.get("view") as Screen) ? p.get("view") as Screen : "insight",
    scope: p.get("scope") === "team" ? "team" : "personal", person: people.some(person => person.id === p.get("person")) ? p.get("person")! : "jia",
    period: p.get("period") === "last-week" ? "last-week" : "month", fair: fairs.some(fair => fair.id === p.get("fair")) ? p.get("fair")! : "all",
    brand: brands.includes(p.get("brand") ?? "") ? p.get("brand")! : "all",
    tier: tiers.includes(p.get("tier") as InsightTier) ? p.get("tier") as InsightTier : "all", query: p.get("query") ?? "", order: p.get("order") ?? "",
    lens: p.get("lens") === "kpi" ? "kpi" : p.get("lens") === "sales" ? "sales" : "margin", quantity: /^(0|[1-9]\d{0,2})$/.test(p.get("quantity") ?? "") ? p.get("quantity")! : "any" };
}

function Progress({ value, target, label }: { value: number; target: number; label: string }) {
  return <div className={s.progress} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, value / target * 100))}><span style={{ width: `${Math.min(100, Math.max(0, value / target * 100))}%` }} /></div>;
}
function Badge({ tier }: { tier: InsightTier }) { return <span className={s.badge} data-tier={tier}>{tierLabels[tier]}</span>; }
function SectionHead({ title, aside }: { title: string; aside?: ReactNode }) { return <div className={s.sectionHead}><h2>{title}</h2>{aside}</div>; }
function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className={s.empty}><Icon name="search" size={26} /><h2>{title}</h2><p>{children}</p></div>; }
function CommentIcon() {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M7 9h10M7 13h6" /></svg>;
}
function KpiQuantityFilter({ value, max, onChange }: { value: string; max: number; onChange: (value: string) => void }) {
  return <div className={s.quantityField}><span>KPI quantity</span><div className={s.quantityStepper} role="group" aria-label="KPI quantity filter"><button aria-label="Decrease KPI quantity" disabled={value === "0"} onClick={() => onChange(value === "any" ? "0" : String(Number(value) - 1))}>−</button><span aria-label="KPI item quantity" aria-live="polite">{value === "any" ? "Any" : value}</span><button aria-label="Increase KPI quantity" disabled={value !== "any" && Number(value) >= max} onClick={() => onChange(value === "any" ? "1" : String(Number(value) + 1))}>+</button></div></div>;
}

export default function InsightDesignPreview({ design }: { design: "a" | "b" | "c" }) {
  const [route, setRoute] = useState<Route>(defaults);
  const [quickInsight, setQuickInsight] = useState<{ personId?: string } | null>(null);
  const heading = useRef<HTMLElement>(null);
  useEffect(() => {
    const sync = () => { setRoute(readRoute()); setQuickInsight(null); };
    sync(); window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); heading.current?.focus({ preventScroll: true }); }, [route.screen, route.scope, route.person, route.order]);
  function go(change: Partial<Route>, replace = false) {
    setQuickInsight(null);
    const next = { ...route, ...change };
    const url = new URL(window.location.href);
    url.searchParams.set("view", next.screen);
    url.searchParams.delete("category");
    for (const key of ["scope", "person", "period", "fair", "brand", "tier", "query", "order", "lens", "quantity"] as const) {
      if (next[key] === defaults[key]) url.searchParams.delete(key); else url.searchParams.set(key, next[key]);
    }
    window.history[replace ? "replaceState" : "pushState"](window.history.state, "", url);
    setRoute(next);
  }
  const person = getPerson(route.person) ?? people[0];
  const team = people.filter(member => !member.self);
  const baseOrders = selectOrders({ personId: person.id, period: route.period, fairId: route.fair === "all" ? undefined : route.fair });
  const total = summarize(baseOrders);
  const monthly = summarize(selectOrders({ personId: person.id, period: "month" }));
  const teamOrders = selectOrders({ period: route.period, fairId: route.fair === "all" ? undefined : route.fair }).filter(order => team.some(member => member.id === order.staffId));
  const teamTotal = summarize(teamOrders);
  const isHome = route.screen === "insight";
  const isTeam = route.scope === "team";
  const currentFair = getFair(route.fair);
  const impact = marginImpact(baseOrders);
  const selectedOrder = baseOrders.find(order => order.id === route.order);
  const openOrders = (change: Partial<Route> = {}) => go({ screen: "insight-orders", brand: "all", tier: "all", query: "", order: "", lens: "margin", quantity: "any", ...change });
  const openKpiOrders = (quantity = "any") => openOrders({ lens: "kpi", quantity });
  const openMember = (id: string) => go({ screen: "insight-member", scope: "team", person: id, brand: "all", tier: "all", query: "", lens: "margin", quantity: "any" });
  const openOrder = (order: InsightOrder) => go({ screen: "insight-order", person: order.staffId, order: order.id });
  const home = () => go({ ...defaults, period: route.period, scope: route.scope });
  function back() {
    if (route.screen === "insight-order") go({ screen: "insight-orders", order: "" });
    else if (route.screen === "insight-venue") go({ screen: "insight-fairs", fair: "all" });
    else if (route.screen === "insight-orders" && route.lens === "sales") go({ screen: "insight-target", brand: "all", tier: "all", query: "", quantity: "any" });
    else if (route.screen === "insight-orders" && route.lens === "kpi") go({ screen: "insight-kpi", brand: "all", tier: "all", query: "", quantity: "any" });
    else if (route.screen === "insight-target" && route.lens === "kpi") go({ screen: "insight-kpi" });
    else if (["insight-orders", "insight-target", "insight-kpi"].includes(route.screen)) go({ screen: isTeam ? "insight-member" : "insight", brand: "all", tier: "all", query: "", lens: "margin", quantity: "any" });
    else home();
  }
  function FairSelect({ label = "Fair / venue" }: { label?: string }) {
    return <label className={s.selectField}><span>{label}</span><select aria-label={label} value={route.fair} onChange={event => go({ fair: event.target.value }, true)}><option value="all">All fair venues</option>{fairs.filter(fair => route.period === "month" || fair.start <= "2026-09-06").map(fair => <option key={fair.id} value={fair.id}>{fair.venue} · {fair.organizer} · {fair.label}</option>)}</select></label>;
  }
  function FairContext() {
    return currentFair ? <div className={s.contextStrip} role="region" aria-label="Selected fair"><Icon name="map" size={17} /><span>{currentFair.venue}<small>{currentFair.organizer} · {currentFair.label}</small></span><button onClick={() => go({ fair: "all" }, true)} aria-label="Clear fair filter"><Icon name="close" size={16} /></button></div> : null;
  }
  function ReviewNote() {
    if (!impact || !baseOrders.some(order => order.tier === "low")) return null;
    return <button className={s.reviewNote} onClick={() => openOrder(impact.order)}><span className={s.noteIcon}><Icon name="search" size={19} /></span><span><small>A CLOSER LOOK</small><strong>One order changes the picture.</strong><span>{percent(impact.order.margin)} on {money(impact.order.sales)}. Without this order, margin is {percent(impact.withoutMargin)}.</span></span><Icon name="chevron" size={17} /></button>;
  }
  function Performance() {
    return <>
      <div className={s.overviewLabel}><span>PERFORMANCE OVERVIEW</span><span>{currentFair ? "Selected fair" : "All venues"}</span></div>
      <section className={s.salesHero} aria-label={`${person.name} sales performance`}>
        <div className={s.heroTop}><span className={s.salesLabel}>{design === "c" && <span className={s.heroIcon}><Icon name="chart" size={28} /></span>}{isTeam ? `${person.name.split(" ")[0]}’s sales` : "Your sales"}</span><span>{total.orderCount} orders</span></div>
        <div className={s.heroNumber}><span>RM</span>{new Intl.NumberFormat("en-MY").format(total.sales)}</div>
        <button className={s.targetButton} onClick={() => go({ screen: "insight-target", lens: "sales" })}>
          <span>{route.period === "month" ? `${Math.round(monthly.sales / person.target * 100)}% of monthly target` : `${money(monthly.sales)} this month`}<strong>{money(person.target)} <Icon name="chevron" size={13} /></strong></span>
          <Progress value={monthly.sales} target={person.target} label="Monthly sales target" />
        </button>
      </section>
      <BrandMarginList rows={summarizeBrandMargins(baseOrders)} onSelectBrand={brand => openOrders({ brand })} />
      <div className={`${s.metricGrid} ${s.singleMetric}`}>
        <button className={s.metricCard} data-color="olive" onClick={() => go({ screen: "insight-kpi", lens: "kpi", quantity: "any" })}><span>{design === "c" && <span className={s.metricIcon}><Icon name="receipt" size={28} /></span>}<span className={s.metricCaption}>KPI items</span><Icon name="arrow" size={17} /></span><strong>{total.kpi}<em> sold</em></strong><small>Order coverage & averages</small></button>
      </div>
      <SectionHead title="Behind the numbers" />
      <button className={s.entry} onClick={() => go({ screen: "insight-fairs", fair: "all" })}><span className={s.entryIcon}><Icon name="map" /></span><span><strong>Performance by venue</strong><small>Fair, organizer & your place</small></span><Icon name="chevron" size={18} /></button>
      <ReviewNote />
    </>;
  }
  function MemberRow({ id }: { id: string }) {
    const member = getPerson(id)!;
    const memberOrders = teamOrders.filter(order => order.staffId === id);
    const stats = summarize(memberOrders);
    const monthStats = summarize(selectOrders({ personId: id, period: "month" }));
    const latestOrder = [...memberOrders].sort((a, b) => b.date.localeCompare(a.date))[0];
    const fair = getFair(latestOrder?.fairId ?? "");
    return <button className={s.memberCard} onClick={() => openMember(id)}>
      <div className={s.memberTop}><span className={s.avatar}>{initials(member.name)}</span><span><strong>{member.name}</strong><small>{member.role}</small></span><Icon name="chevron" size={18} /></div>
      <div className={s.memberMetrics}><span><strong>{money(stats.sales)}</strong><small>Sales</small></span><span data-low={memberOrders.some(order => order.tier === "low")}><strong>{percent(stats.margin)}</strong><small>Margin</small></span><span><strong>{stats.kpi}</strong><small>KPI items</small></span></div>
      <Progress value={monthStats.sales} target={member.target} label={`${member.name} monthly sales target`} />
      <div className={s.memberFoot}><span>{Math.round(monthStats.sales / member.target * 100)}% of monthly target</span>{memberOrders.some(order => order.tier === "low") && <span className={s.lowDot}>Review margin</span>}</div>
      <p className={s.venueMeta}><Icon name="map" size={13} /><span>{fair ? `${fair.venue} · ${fair.organizer}` : "No sales in this period"}{fair && <small>{fair.label} · latest fair</small>}{stats.unknownMarginCount > 0 && <small>{stats.unknownMarginCount} order awaiting margin</small>}</span></p>
    </button>;
  }
  let title = "Insight";
  let subtitle = "Your performance, with perspective.";
  let content: ReactNode;
  if (isHome && !isTeam) content = <Performance />;
  else if (isHome) {
    content = <>
      <div className={s.teamSummary}><span><small>Team sales</small><strong>{money(teamTotal.sales)}</strong></span><span><small>Margin</small><strong>{percent(teamTotal.margin)}</strong></span><span><small>KPI</small><strong>{teamTotal.kpi}</strong></span></div>
      <button className={s.teamInsightButton} onClick={() => setQuickInsight({})}><CommentIcon /><span><strong>Team quick insight</strong><small>This month’s progress & people to follow up</small></span><Icon name="arrow" size={18} /></button>
      <div className={s.teamActions}><span>{team.length} downlines · excludes you</span><button onClick={() => go({ screen: "insight-fairs", person: "jia", fair: "all" })}>By venue <Icon name="arrow" size={15} /></button></div>
      <FairSelect />
      <SectionHead title="Your people" aside={<span>Tap to understand their results</span>} />
      <div className={s.memberList}>{team.map(member => <MemberRow key={member.id} id={member.id} />)}</div>
      {teamTotal.unknownMarginCount > 0 && <p className={s.footnote}>Team margin excludes {teamTotal.unknownMarginCount} order awaiting costing.</p>}
    </>;
  } else if (route.screen === "insight-member") {
    title = person.name; subtitle = `${person.role} · ${person.self ? "Your performance" : "Your downline"}`;
    content = <Performance />;
  } else if (route.screen === "insight-orders") {
    const kpiLens = route.lens === "kpi";
    const salesLens = route.lens === "sales";
    const hasQuantity = kpiLens || salesLens;
    title = salesLens ? "All sales orders" : kpiLens ? "KPI sales orders" : "Sales orders";
    subtitle = `${person.name} · ${salesLens ? "Sales, margin & KPI in one view" : kpiLens ? "Every qualifying item, by order" : "Follow the margin"}`;
    const filtered = selectOrders({ personId: person.id, period: route.period, fairId: route.fair === "all" ? undefined : route.fair, brand: route.brand, tier: kpiLens ? "all" : route.tier, query: route.query,
      kpiQuantity: hasQuantity && route.quantity !== "any" ? Number(route.quantity) : undefined, kpiOnly: kpiLens && route.quantity === "any" });
    const stats = summarize(filtered);
    const summaryMargin = stats.margin === null ? "—" : route.brand === "all" ? percent(stats.margin) : `${stats.margin.toFixed(2)}%`;
    const kpiStats = summarizeKpi(filtered);
    const quantityMax = Math.max(3, ...baseOrders.map(order => order.kpi), route.quantity === "any" ? 0 : Number(route.quantity));
    content = <>
      {kpiLens ? <section className={s.kpiListSummary} aria-label="Matching KPI orders"><span><small>Orders</small><strong>{kpiStats.orderCount}</strong></span><span><small>KPI items</small><strong>{kpiStats.items}</strong></span><span><small>Avg / match</small><strong>{average(kpiStats.averagePerOrder)}</strong></span></section> : <div className={s.summaryStrip}><span><small>Sales</small><strong>{money(stats.sales)}</strong></span><span><small>Margin</small><strong>{summaryMargin}</strong></span><span><small>KPI items</small><strong>{stats.kpi}</strong></span></div>}
      <label className={s.search}><Icon name="search" size={19} /><input aria-label="Search sales orders" placeholder="Search order number or brand" value={route.query} onChange={event => go({ query: event.target.value }, true)} />{route.query && <button aria-label="Clear search" onClick={() => go({ query: "" }, true)}><Icon name="close" size={16} /></button>}</label>
      <div className={s.filters}><label className={s.selectField}><span>Brand</span><select aria-label="Order brand" value={route.brand} onChange={event => go({ brand: event.target.value }, true)}><option value="all">All brands</option>{brands.map(brand => <option key={brand}>{brand}</option>)}</select></label>{kpiLens ? <KpiQuantityFilter value={route.quantity} max={quantityMax} onChange={quantity => go({ quantity }, true)} /> : <label className={s.selectField}><span>Margin tier</span><select aria-label="Margin tier" value={route.tier} onChange={event => go({ tier: event.target.value as Route["tier"] }, true)}>{tiers.map(tier => <option key={tier} value={tier}>{tier === "all" ? "All tiers" : tierLabels[tier]}</option>)}</select></label>}</div>
      {salesLens && <div className={s.combinedQuantity}><KpiQuantityFilter value={route.quantity} max={quantityMax} onChange={quantity => go({ quantity }, true)} /></div>}
      {hasQuantity && <div className={s.quantityHelp}><span>{route.quantity === "any" ? salesLens ? "Any quantity includes orders without KPI" : "Any = at least 1 KPI item per order" : route.quantity === "0" ? "Orders without a KPI item" : `Exactly ${route.quantity} KPI ${route.quantity === "1" ? "item" : "items"} per order`}</span>{route.quantity !== "any" && <button onClick={() => go({ quantity: "any" }, true)}>Any quantity</button>}</div>}
      <FairSelect />
      {currentFair && <p className={s.selectedFairNote}>{currentFair.venue} · {currentFair.organizer} · {currentFair.label}</p>}
      <div className={s.resultCount} role="status">{filtered.length} {filtered.length === 1 ? "order" : "orders"}{kpiLens ? ` · ${route.quantity === "0" ? "without KPI" : "with KPI"}` : stats.unknownMarginCount > 0 ? ` · ${stats.unknownMarginCount} missing margin` : ""}</div>
      {brands.filter(brand => filtered.some(order => order.brand === brand)).map(brand => {
        const group = filtered.filter(order => order.brand === brand);
        return <section className={s.orderGroup} key={brand}><SectionHead title={brand} aside={<span>{group.length} {group.length === 1 ? "order" : "orders"}</span>} /><div className={s.orderList}>{group.map(order => <button key={order.id} className={s.orderCard} onClick={() => openOrder(order)}>
          <div className={s.orderTop}><strong>{order.number}</strong>{kpiLens ? <span className={s.kpiCountBadge} data-zero={order.kpi === 0}>{order.kpi === 0 ? "No KPI" : `${order.kpi} KPI ${order.kpi === 1 ? "item" : "items"}`}</span> : <Badge tier={order.tier} />}</div>
          <p>{order.brand} · {dateLabel(order.date)}<Icon name="chevron" size={16} /></p>
          {kpiLens && <div className={s.qualifyingItems}>{order.kpi ? order.items.filter(item => item.kpi).map((item, index) => <div key={index}><Icon name="check" size={14} /><span>{item.name}</span><strong>×{item.qty}</strong></div>) : <span>No qualifying items on this order</span>}</div>}
          <div className={s.orderMetrics}><span><small>Sales amount</small><strong>{money(order.sales)}</strong></span><span><small>Margin</small><strong>{percent(order.margin)}</strong></span><span><small>{kpiLens ? "Margin tier" : "KPI"}</small><strong>{kpiLens ? tierLabels[order.tier] : `${order.kpi} ${order.kpi === 1 ? "item" : "items"}`}</strong></span></div>
          <div className={s.commissionLine}><span className={s.status} data-status={order.commissionStatus}>{statusLabels[order.commissionStatus]}</span><span>Commission <strong>{order.commission === null ? "Pending calculation" : money(order.commission)}</strong></span></div>
        </button>)}</div></section>;
      })}
      {!filtered.length && <Empty title="No matching orders">{salesLens ? "Try another brand, margin tier, KPI quantity or venue." : kpiLens ? "Try another quantity, brand or fair." : "Try another brand, tier or fair."}<button onClick={() => go({ brand: "all", tier: "all", query: "", fair: "all", quantity: "any" }, true)}>Clear filters</button></Empty>}
      <p className={s.footnote}>{kpiLens ? "Quantity counts qualifying KPI items on each order. Avg / match uses only the orders matching your filters." : "Margin is weighted by sales amount. Orders without margin data are excluded from the margin calculation."}</p>
    </>;
  } else if (route.screen === "insight-order") {
    title = selectedOrder?.number ?? "Order unavailable"; subtitle = `${person.name} · Sales order`;
    if (!selectedOrder) content = <Empty title="This order is unavailable">Return to the order list to select an order in this period.<button onClick={() => openOrders()}>View orders</button></Empty>;
    else {
      const order = selectedOrder, fair = getFair(order.fairId)!;
      const comparisonOrders = selectOrders({ personId: person.id, period: route.period, fairId: route.fair === "all" ? undefined : route.fair });
      const all = summarize(comparisonOrders), without = summarize(comparisonOrders.filter(item => item.id !== order.id));
      content = <>
        <section className={s.orderHero}><div className={s.heroTop}><span>{order.brand}</span><Badge tier={order.tier} /></div><small>Sales amount</small><strong>{money(order.sales)}</strong><div className={s.orderHeroMetrics}><span><small>Order margin</small><strong>{percent(order.margin)}</strong></span><span><small>KPI items</small><strong>{order.kpi}</strong></span><span><small>Order date</small><strong>{dateLabel(order.date)}</strong></span></div></section>
        <section className={s.panel}><SectionHead title="Commission" aside={<span className={s.status} data-status={order.commissionStatus}>{statusLabels[order.commissionStatus]}</span>} /><p className={s.commissionAmount}>{order.commission === null ? "Pending calculation" : money(order.commission)}</p><p className={s.muted}>{order.commissionNote ?? (order.commissionStatus === "paid" ? "Payment has been released for this order." : order.commissionStatus === "settled" ? "Settlement confirmed. Awaiting payment release." : order.commissionStatus === "pending" ? "Awaiting eligibility confirmation before commission is finalized." : "An estimate until eligibility and settlement are confirmed.")}</p></section>
        {order.tier === "low" && order.margin !== null && all.margin !== null && without.margin !== null && <section className={s.analysisPanel}>
          <div className={s.analysisLabel}><Icon name="search" size={18} />FOR YOUR SALES MEETING</div>
          <h2>The impact of this order</h2>
          <p>This order contributes <strong>{Math.round(order.sales / all.sales * 100)}%</strong> of {person.name.split(" ")[0]}’s sales in this view.</p>
          <div className={s.comparison}><span><small>With this order</small><strong>{percent(all.margin)}</strong></span><Icon name="arrow" size={20} /><span><small>Without this order</small><strong>{percent(without.margin)}</strong></span></div>
          <p>{without.margin > all.margin + 0.05
            ? "Review the discount and product mix together. On the next fair, check the quoted margin before confirming a large order."
            : without.margin < all.margin - 0.05
              ? "This low-tier order is above the current blended margin. Removing it lowers the average; focus on the orders pulling the blend down, while reviewing this order against its brand’s tier rules."
              : "This low-tier order has little effect on the blended margin. Review it against its brand’s tier rules and the rest of the sales mix."}</p>
          <small className={s.analysisFoot}>Order-exclusion comparison · {periodLabel(route.period)}{currentFair ? ` · ${currentFair.venue}` : " · all venues"}</small>
        </section>}
        <section className={s.panel}><SectionHead title="Items sold" />{order.items.map((item, index) => <div className={s.itemRow} key={`${item.name}-${index}`}><span>{item.name}{item.kpi && <small>KPI item</small>}</span><strong>×{item.qty}</strong></div>)}</section>
        <button className={s.entry} onClick={() => go({ screen: "insight-venue", fair: fair.id })}><span className={s.entryIcon}><Icon name="map" /></span><span><strong>{fair.venue}</strong><small>{fair.organizer}<br />{fair.label}</small></span><Icon name="chevron" size={18} /></button>
        <p className={s.footnote}>Tier labels and commission amounts are illustrative. Actual tiers follow the configured brand rules; monthly incentives are separate.</p>
      </>;
    }
  } else if (route.screen === "insight-fairs") {
    title = "By venue"; subtitle = isTeam && person.self ? "Your team, fair by fair." : `${person.name} · Every fair has a story.`;
    const fairOrders = isTeam && person.self ? teamOrders : selectOrders({ personId: person.id, period: route.period });
    const relevantFairs = fairs.filter(fair => fairOrders.some(order => order.fairId === fair.id));
    content = <><p className={s.intro}>One venue, one organizer, one date range. Each fair has its own results.</p><div className={s.fairList}>{relevantFairs.map(fair => {
      const stats = summarize(fairOrders.filter(order => order.fairId === fair.id));
      const ranked = venueRanking(fair.id, route.period), rank = ranked.find(row => row.personId === person.id);
      return <button className={s.fairCard} key={fair.id} onClick={() => go({ screen: "insight-venue", fair: fair.id })}><div className={s.fairDate}><Icon name="calendar" size={15} />{fair.label}<Icon name="chevron" size={17} /></div><h2>{fair.venue}</h2><p>{fair.organizer}</p><div className={s.summaryStrip}><span><small>{isTeam && person.self ? "Team sales" : "Sales"}</small><strong>{money(stats.sales)}</strong></span><span><small>Margin</small><strong>{percent(stats.margin)}</strong></span><span><small>KPI</small><strong>{stats.kpi}</strong></span></div>{stats.unknownMarginCount > 0 && <span className={s.coverage}>{stats.unknownMarginCount} order awaiting margin</span>}<div className={s.fairRank}><Icon name="trophy" size={15} />{isTeam && person.self ? `${ranked.length} sellers at this fair · View standings` : rank ? `#${rank.rank} of ${ranked.length} sellers at this fair` : "No ranked sales"}</div></button>;
    })}</div>{!relevantFairs.length && <Empty title="No fair results yet">Choose another period to see fair performance.</Empty>}</>;
  } else if (route.screen === "insight-venue") {
    title = currentFair?.venue ?? "Fair unavailable"; subtitle = currentFair ? `${currentFair.organizer} · ${currentFair.label}` : "Choose a fair to see its results.";
    const ranked = currentFair ? venueRanking(currentFair.id, route.period) : [];
    const stats = summarize(isTeam && person.self ? teamOrders : baseOrders);
    content = !currentFair ? <Empty title="No fair selected">Return to the venue list.<button onClick={() => go({ screen: "insight-fairs" })}>View venues</button></Empty> : <>
      <div className={s.venueHeader}><span className={s.venueIcon}><Icon name="map" size={26} /></span><span>FAIR PERFORMANCE<small>{isTeam && person.self ? "Your downlines" : person.name}</small></span></div>
      <div className={s.summaryStrip}><span><small>Sales</small><strong>{money(stats.sales)}</strong></span><span><small>Margin</small><strong>{percent(stats.margin)}</strong></span><span><small>KPI items</small><strong>{stats.kpi}</strong></span></div>
      {stats.unknownMarginCount > 0 && <p className={s.footnote}>{stats.unknownMarginCount} order awaiting margin; excluded from the margin calculation.</p>}
      {!(isTeam && person.self) && <button className={s.textLink} onClick={() => openOrders()}>See {stats.orderCount} sales orders <Icon name="arrow" size={16} /></button>}
      <SectionHead title="At this fair" aside={<span>{ranked.length} sellers · ranked by sales</span>} />
      <ol className={s.venueBoard}>{ranked.map(row => {
        const canOpen = team.some(member => member.id === row.personId) || row.personId === "jia";
        const details = <><span className={s.rank}>{String(row.rank).padStart(2, "0")}</span><span className={s.boardName}><strong>{row.name}{row.personId === "jia" && <em>You</em>}</strong><small>{percent(row.margin)} margin · {row.kpi} KPI items</small>{row.unknownMarginCount > 0 && <small>{row.unknownMarginCount} order awaiting margin</small>}</span><span className={s.boardAmount}>{money(row.sales)}{canOpen && <Icon name="chevron" size={14} />}</span></>;
        return <li key={row.personId} data-self={row.personId === person.id}>{canOpen ? <button onClick={() => row.personId === "jia" ? go({ screen: "insight-member", person: "jia", scope: "personal" }) : openMember(row.personId)}>{details}</button> : <div>{details}</div>}</li>;
      })}</ol>
      <p className={s.footnote}>Ranking includes all sellers at this fair. Equal sales share a rank. Open yourself or a downline for order details.</p>
    </>;
  } else if (route.screen === "insight-target") {
    title = "Monthly targets"; subtitle = `${person.name} · September 2026`;
    content = <><section className={s.panel}><SectionHead title="Sales target" aside={<Icon name="target" />} /><div className={s.targetAmount}>{money(monthly.sales)}<small>of {money(person.target)}</small></div><Progress value={monthly.sales} target={person.target} label="Sales target" /><p className={s.targetGap}>{monthly.sales >= person.target ? "Target achieved" : `${money(person.target - monthly.sales)} to go`}</p></section><section className={s.panel}><SectionHead title="KPI item target" /><div className={s.targetAmount}>{monthly.kpi}<small>of {person.kpiTarget} items</small></div><Progress value={monthly.kpi} target={person.kpiTarget} label="KPI target" /><p className={s.targetGap}>{monthly.kpi >= person.kpiTarget ? "Target achieved" : `${person.kpiTarget - monthly.kpi} items to go`}</p></section><p className={s.intro}>Targets apply to the whole month, across all venues. Your selected fair or week does not change the monthly target.</p><button className={s.entry} onClick={() => openOrders({ period: "month", fair: "all", lens: "sales" })}><Icon name="receipt" /><span><strong>Explore this month’s orders</strong><small>Find the sales behind your progress</small></span><Icon name="chevron" size={18} /></button></>;
  } else {
    title = "KPI items"; subtitle = `${person.name} · Items that count`;
    const kpi = summarizeKpi(baseOrders);
    const qualifying = baseOrders.filter(order => order.kpi > 0);
    const items = new Map<string, number>();
    baseOrders.forEach(order => order.items.filter(item => item.kpi).forEach(item => items.set(item.name, (items.get(item.name) ?? 0) + item.qty)));
    content = <>
      <section className={s.kpiCoverageHero} aria-label="KPI order coverage">
        <div className={s.kpiHeroLabel}><span>ORDER COVERAGE</span><Icon name="target" size={22} /></div>
        <div className={s.coverageNumber}>{percent(kpi.coverage)}<span>{kpi.withKpi} of {kpi.orderCount} orders with KPI</span></div>
        <div className={s.coverageBar} role="progressbar" aria-label="Orders with KPI" aria-valuemin={0} aria-valuemax={100} aria-valuenow={kpi.coverage ?? 0}><span style={{ width: `${kpi.coverage ?? 0}%` }} /></div>
        <div className={s.coverageSplit}><button onClick={() => openKpiOrders()}><strong>{kpi.withKpi}</strong><span>With KPI</span><Icon name="chevron" size={14} /></button><button onClick={() => openKpiOrders("0")}><strong>{kpi.withoutKpi}</strong><span>Without KPI</span><Icon name="chevron" size={14} /></button></div>
        <p>With KPI = at least 1 qualifying item on an order.</p>
      </section>
      <section className={s.kpiAverages} aria-label="KPI order averages"><div><span><small>KPI items sold</small><strong>{kpi.items}</strong></span><span><small>Avg KPI / order</small><strong>{average(kpi.averagePerOrder)}</strong></span><span><small>Avg sale / order</small><strong>{kpi.averageSalesPerOrder === null ? "—" : money(kpi.averageSalesPerOrder)}</strong></span></div><p>Averages include all {kpi.orderCount} orders, including those without KPI.</p></section>
      <section className={s.kpiOrderPreview} aria-label="Recent orders with KPI"><SectionHead title="Orders with KPI" aside={<span>Latest {Math.min(2, qualifying.length)} of {qualifying.length}</span>} />{qualifying.slice(0, 2).map(order => <button key={order.id} className={s.kpiPreviewRow} onClick={() => { go({ screen: "insight-order", lens: "kpi", quantity: "any", order: order.id, brand: "all", tier: "all", query: "" }); }}><Icon name="receipt" size={18} /><span><strong>{order.number}</strong><small>{order.brand} · {dateLabel(order.date)}</small></span><span className={s.kpiCountBadge}>{order.kpi} KPI {order.kpi === 1 ? "item" : "items"}</span><Icon name="chevron" size={14} /></button>)}{!qualifying.length && <p className={s.muted}>{kpi.orderCount ? "These orders have no KPI items yet." : "No orders in this period."}</p>}<button className={s.primaryAction} onClick={() => openKpiOrders()}>View sales orders <Icon name="arrow" size={18} /></button></section>
      <button className={s.monthlyKpiTarget} onClick={() => go({ screen: "insight-target", lens: "kpi" })}><Icon name="target" size={18} /><span>Monthly KPI target<strong>{monthly.kpi} / {person.kpiTarget} items</strong></span><Icon name="chevron" size={17} /></button>
      <details className={s.productDetails}><summary>Product breakdown<span>{items.size} {items.size === 1 ? "product" : "products"}</span></summary>{[...items].map(([name, qty]) => <div className={s.itemRow} key={name}><span>{name}</span><strong>{qty} sold</strong></div>)}{!items.size && <p>No KPI items sold in this view.</p>}</details>
    </>;
  }
  const showPeriod = !["insight-order", "insight-target", "insight-venue"].includes(route.screen);
  const backLabel = route.screen === "insight-order" ? route.lens === "kpi" ? "KPI sales orders" : route.lens === "sales" ? "All sales orders" : "Sales orders"
    : route.screen === "insight-venue" ? "Venues" : route.screen === "insight-orders" ? route.lens === "kpi" ? "KPI items" : route.lens === "sales" ? "Sales overview" : "Insight" : "Insight";
  return <div className={`${theme.theme} ${shell.app} ${s.app} ${motion.shell}`} data-insight-design={design} data-arena-design={design}>
    <RevenuePreviewHeader design={design} />
    <main key={`${route.screen}:${route.scope}:${route.person}:${route.order}`} className={`${s.main} ${motion.page}`} ref={heading} tabIndex={-1} data-insight-home={isHome || undefined}>
      {!isHome && <button className={s.back} onClick={back}><Icon name="back" size={18} />{backLabel}</button>}
      <div className={s.pageHeading}><div>{isHome && <p className={s.eyebrow}>SEE WHAT MOVES YOU FORWARD</p>}<h1>{title}</h1><p>{subtitle}</p></div>{(isHome && !isTeam || route.screen === "insight-member") ? <button className={s.quickInsightTrigger} aria-label={`Open ${person.name} quick insight`} title="Monthly quick insight" onClick={() => setQuickInsight({ personId: person.id })}><CommentIcon /><span>Insight</span></button> : isHome && <span className={s.headingIcon}><Icon name="chart" size={25} /></span>}</div>
      {isHome && <div className={s.scopeTabs} role="group" aria-label="Performance perspective"><button aria-pressed={!isTeam} onClick={() => go({ ...defaults, period: route.period, scope: "personal" })}><Icon name="user" size={17} />Personal</button><button aria-pressed={isTeam} onClick={() => go({ ...defaults, period: route.period, scope: "team" })}><Icon name="team" size={17} />Team</button></div>}
      {showPeriod && <div className={s.periodRow}><label><Icon name="calendar" size={15} /><select aria-label="Performance period" value={route.period} onChange={event => go({ period: event.target.value as InsightPeriod, fair: "all" }, true)}><option value="month">September 2026</option><option value="last-week">Last week · 31 Aug–6 Sep</option></select></label><span>Sample data</span></div>}
      {(isHome || route.screen === "insight-member" || route.screen === "insight-kpi") && <FairContext />}
      {content}
      <p className={s.previewNote}>Design preview · Illustrative performance data</p>
    </main>
    <RevenuePreviewNav design={design} active="insight" onSelect={{ insight: home }} />
    {quickInsight && <QuickInsightDialog personId={quickInsight.personId} onClose={() => setQuickInsight(null)}
      onOrder={order => go({ screen: "insight-order", person: order.staffId, scope: order.staffId === "jia" ? "personal" : "team", period: "month", fair: "all", lens: "margin", tier: "all", brand: "all", quantity: "any", query: "", order: order.id })}
      onMember={personId => go({ screen: "insight-member", person: personId, scope: personId === "jia" ? "personal" : "team", period: "month", fair: "all", lens: "margin", tier: "all", brand: "all", quantity: "any", query: "", order: "" })}
      onLowMargin={personId => openOrders({ person: personId, scope: personId === "jia" ? "personal" : "team", period: "month", fair: "all", tier: "low" })} />}
  </div>;
}
