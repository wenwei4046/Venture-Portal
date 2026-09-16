"use client";

/**
 * Insight — how am I doing, right now.
 *
 * Personal and Team share one authorised snapshot. Own-order filters and the
 * existing department board are drilldowns; the team's order-level facts are
 * never invented from aggregate rows. Everything it shows is read
 * from committed orders rather than from the month's statement, so the
 * heading says "estimate" everywhere and never "commission": the run decides
 * pay, this page only says where the month stands.
 */

import { useState, type ReactNode } from "react";
import {
  blendedMargin,
  daysSince,
  downlineBranches,
  downlineSignal,
  gateProgress,
  marginLevels,
  medianSales,
  monthPace,
  rankBoard,
  streakSummary,
  totalScore,
} from "@/lib/member/insight";
import type {
  MemberBand,
  MemberBoardRow,
  MemberDownlineRow,
  MemberInsight,
  MemberInsightBlock,
  MemberInsightOrder,
  MemberScore,
} from "@/lib/member/types";
import { Empty, Icon, Pill, date, fmt, initials } from "./MemberUI";
import base from "./member.module.css";
import live from "./MemberLiveInsight.module.css";
import { LiveBrandMarginList, hasCompleteLiveOrders, hasNoGoodsMargin, summarizeLiveBrandMargins } from "./LiveBrandMarginList";

const s = { ...base, ...live };

type InsightView = "sales" | "ranking" | "downline";

const views: { id: InsightView; icon: string; label: string }[] = [
  { id: "sales", icon: "chart", label: "Personal" },
  { id: "downline", icon: "branch", label: "Team" },
];

const pct = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)}%`);
const place = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

function orderMarginLevels(orders: readonly MemberInsightOrder[], bands: readonly MemberBand[]) {
  const noGoods = orders.filter(hasNoGoodsMargin);
  return [...marginLevels(orders.filter(order => !hasNoGoodsMargin(order)), bands),
    ...(noGoods.length ? [{ label: "No goods margin", tone: "neutral" as const, multiplier: 1, orders: noGoods, revenue: noGoods.reduce((total, order) => total + order.revenue, 0) }] : [])];
}

export default function MemberInsightPanel({
  insight,
  membershipId,
  bands,
  privateMode,
  busy,
  error,
  onRefresh,
  onDialog,
  initialScreen = "overview",
  initialBrand = "all",
  onPeriodChange,
  onScreenChange,
  viewedStaffId,
}: {
  insight: MemberInsight | null;
  membershipId: string;
  bands: MemberBand[];
  privateMode: boolean;
  busy: boolean;
  error: string | null;
  onRefresh: () => void;
  onDialog: (dialog: { title: string; content: ReactNode }) => void;
  initialScreen?: "overview" | "orders";
  initialBrand?: string;
  onPeriodChange?: (period: string) => void;
  onScreenChange?: (screen: "overview" | "orders", brand?: string) => void;
  /** Explicit Principal read context; does not alter any employee identity flag. */
  viewedStaffId?: string;
}) {
  const [view, setView] = useState<InsightView>("sales");
  const [screen, setScreen] = useState(initialScreen);
  const [brand, setBrand] = useState(initialBrand);
  const [query, setQuery] = useState("");
  const [deposit, setDeposit] = useState("all");
  const [kpi, setKpi] = useState("all");
  const [marginFilter, setMarginFilter] = useState("all");
  const [groupBy, setGroupBy] = useState("brand");
  const [boardId, setBoardId] = useState("");
  const block: MemberInsightBlock | undefined =
    insight?.blocks.find((b) => b.membershipId === membershipId);

  const money = (value: number | null | undefined) =>
    privateMode ? "••••••" : value == null ? "—" : fmt(value);
  const shortMoney = (value: number) =>
    privateMode
      ? "••••"
      : `RM ${new Intl.NumberFormat("en-MY", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;

  const me = block?.me;
  const principalView = !!viewedStaffId;

  if (error)
    return (
      <section className={s.card}>
        <Empty title="Insight is unavailable">{error}</Empty>
        <button className={`${s.button} ${s.full}`} onClick={onRefresh} disabled={busy}>
          <Icon name="refresh" size={17} />
          Try again
        </button>
      </section>
    );
  if (!insight || !block)
    return (
      <section className={s.card}>
        {busy ? (
          <Empty title={principalView ? "Loading member performance" : "Loading your numbers"}>
            Reading this month&apos;s committed orders.
          </Empty>
        ) : (
          <Empty title="No performance data yet">
            Insight appears once the department has committed orders for this month.
          </Empty>
        )}
      </section>
    );

  const pace = insight.live ? monthPace(me?.sales ?? 0, insight.period) : null;
  const personal = gateProgress(me?.sales ?? 0, block.target?.personal);
  const streak = streakSummary(block.target);
  const group = gateProgress(
    (me?.sales ?? 0) + totalScore(block.downline).sales,
    block.target?.group,
  );
  const boards = block.boards ?? [];
  const board = boards.find((b) => b.departmentId === boardId) ?? boards[0];
  const ranked = board ? rankBoard(board.rows) : [];
  const mine = ranked.find((r) => principalView ? r.staffId === viewedStaffId : r.self);
  const branches = downlineBranches(block.downline);
  const teamTotal = totalScore(block.downline);
  const boardMedian = medianSales(board?.rows ?? []);
  const completeOrders = hasCompleteLiveOrders(block);
  const brands = [...new Set(block.orders.map((order) => order.brand))].sort((a, b) => a.localeCompare(b));
  const selectedOrders = block.orders.filter((order) => {
    if (brand !== "all" && order.brand !== brand) return false;
    if (query.trim() && !`${order.number} ${order.brand}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (deposit === "cleared" && !order.cleared || deposit === "held" && order.cleared) return false;
    if (kpi === "with" && order.kpiQty <= 0 || kpi === "without" && order.kpiQty > 0) return false;
    const band = orderMarginLevels([order], bands)[0];
    return marginFilter === "all" ||
      marginFilter === "pending" && order.margin === null && !hasNoGoodsMargin(order) ||
      marginFilter === "penalty" && band.multiplier < 1 ||
      marginFilter === "threshold" && band.tone === "good";
  });
  const clearedSelection = selectedOrders.filter((order) => order.cleared);
  const selectedSales = clearedSelection.reduce((total, order) => total + order.revenue, 0);
  const selectedKpi = clearedSelection.reduce((total, order) => total + order.kpiQty, 0);
  const selectedBrandMargin = brand === "all" ? null : summarizeLiveBrandMargins(selectedOrders, bands, completeOrders)[0];
  const orderGroups = groupBy === "margin" ? orderMarginLevels(selectedOrders, bands).map((level) => ({
    label: level.label, orders: level.orders,
  })) : [...new Set(selectedOrders.map((order) => order.brand))].sort((a, b) => a.localeCompare(b)).map((name) => ({
    label: name, orders: selectedOrders.filter((order) => order.brand === name),
  }));

  function openOrders(selectedBrand = "all", kpiOnly = false) {
    setBrand(selectedBrand);
    setQuery("");
    setDeposit("all");
    setKpi(kpiOnly ? "with" : "all");
    setMarginFilter("all");
    setGroupBy("brand");
    setScreen("orders");
    onScreenChange?.("orders", selectedBrand === "all" ? undefined : selectedBrand);
  }

  function orderDialog(order: MemberInsightOrder) {
    const band = orderMarginLevels([order], bands)[0];
    onDialog({
      title: order.number,
      content: (
        <div className={s.stack}>
          <div className={s.row}>
            <span className={s.quoteValue}>{hasNoGoodsMargin(order) ? "—" : pct(order.margin)}</span>
            <Pill tone={band.tone}>{band.label}</Pill>
          </div>
          <dl className={s.dl}>
            <dt>Brand</dt>
            <dd>{order.brand}</dd>
            <dt>Order date</dt>
            <dd>{order.date}</dd>
            <dt>Commissionable amount</dt>
            <dd>{money(order.revenue)}</dd>
            <dt>KPI units</dt>
            <dd>{order.kpiQty || "None"}</dd>
            <dt>Margin source</dt>
            <dd>{hasNoGoodsMargin(order) ? "Not applicable" : order.manual ? "Keyed in by hand" : "Product and gift costs"}</dd>
            <dt>Deposit</dt>
            <dd>{order.cleared ? "Cleared — counted this month" : "Not yet cleared"}</dd>
          </dl>
          <p className={s.sub}>
            {hasNoGoodsMargin(order) ? "This order has no positive goods revenue as a margin basis. Its sales and KPI quantities remain in their totals; no goods margin applies."
              : order.margin === null
              ? "No unit cost and no keyed-in margin, so this order counts toward sales but has no margin result."
              : band.multiplier < 1
                ? `Product commission, Open Bill and the upline's override on this bill are multiplied by ${band.multiplier}. Fixed KPI allowances are not affected.`
                : "This band reflects this order's own margin. Monthly incentives need every brand to qualify."}
            {order.carried &&
              " Written last month and carried into this one because its deposit cleared here."}
          </p>
        </div>
      ),
    });
  }

  function personDialog(row: MemberScore & { name: string; title: string }, context: string) {
    const rowMargin = blendedMargin(row);
    onDialog({
      title: row.name,
      content: (
        <div className={s.stack}>
          <dl className={s.dl}>
            <dt>Title</dt>
            <dd>{row.title}</dd>
            <dt>Where</dt>
            <dd>{context}</dd>
            <dt>Sales this month</dt>
            <dd>{money(row.sales)}</dd>
            <dt>Orders</dt>
            <dd>{row.orders || "None yet"}</dd>
            <dt>KPI units</dt>
            <dd>{row.kpiQty || "None"}</dd>
            <dt>Margin</dt>
            <dd>{rowMargin === null ? "No costed order yet" : pct(rowMargin)}</dd>
            <dt>Last order</dt>
            <dd>{row.lastOrder ? date(row.lastOrder) : "No order yet this month"}</dd>
            {row.held > 0 && (
              <>
                <dt>Awaiting deposit</dt>
                <dd>{money(row.held)}</dd>
              </>
            )}
          </dl>
          <p className={s.sub}>
            Sales and margin only. Commission, rate and salary stay between each
            member, HR and the Principal.
          </p>
        </div>
      ),
    });
  }

  const freshness = (
    <p className={s.caption}>
      {insight.live ? "Updates as orders are committed" : "Closed month"} · as of{" "}
      {new Date(insight.asOf).toLocaleString("en-MY", {
        timeZone: "Asia/Kuala_Lumpur",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </p>
  );

  return (
    <div className={live.panel} data-member-insight>
      {screen === "orders" && <button className={live.back} type="button" onClick={() => { setScreen("overview"); onScreenChange?.("overview"); }}>
        <Icon name="back" size={18} /> Back to Insight
      </button>}
      {screen === "overview" && view === "ranking" && <button className={live.back} type="button" onClick={() => setView("downline")}>
        <Icon name="back" size={18} /> Back to Team
      </button>}
      <div className={s.titleRow}>
        <div>
          <p className={s.eyebrow}>{screen === "orders" ? principalView ? "MEMBER COMMITTED ORDERS" : "YOUR COMMITTED ORDERS" : principalView ? "MEMBER PERFORMANCE" : "YOUR PERFORMANCE"}</p>
          <h1>{screen === "orders" ? "Sales orders" : "Insight"}</h1>
          <p className={`${s.sub} ${s.intro}`}>
            {principalView && `${me?.name} · `}{block.department} · {insight.period} · {block.title}
          </p>
        </div>
        <button
          className={s.iconButton}
          onClick={onRefresh}
          disabled={busy}
          aria-label="Refresh performance"
        >
          <Icon name="refresh" />
        </button>
      </div>

      {screen === "overview" && <div className={`${s.tabs} ${s.tabsEven}`}>
        {views.map((v) => (
          <button key={v.id} aria-pressed={view === v.id || v.id === "downline" && view === "ranking"} onClick={() => setView(v.id)}>
            <Icon name={v.icon} size={17} />
            {v.label}
          </button>
        ))}
      </div>}

      {onPeriodChange && <label className={live.period}>Month
        <input type="month" aria-label="Insight month" value={insight.period} disabled={busy}
          onChange={(event) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) onPeriodChange(event.target.value); }} />
      </label>}

      {screen === "overview" && view === "sales" && (
        <div className={s.grid}>
          <div className={s.stack}>
            <section className={s.hero}>
              <div className={s.row}>
                <span className={live.heroLabel}><span className={live.heroIcon}><Icon name="chart" size={28} /></span>Personal sales</span>
                {insight.live && <Pill tone="active">Live</Pill>}
              </div>
              <div className={s.heroValue}>
                {privateMode ? (
                  "••••••"
                ) : (
                  <>
                    <span className={s.currency}>RM</span>
                    {new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2 }).format(
                      me?.sales ?? 0,
                    )}
                  </>
                )}
              </div>
              <p className={s.caption}>
                Deposit-cleared commissionable sales across {me?.orders ?? 0}{" "}
                {me?.orders === 1 ? "order" : "orders"}. An estimate from committed
                orders — the commission statement determines payment.
              </p>
              <hr className={s.divider} />
              <div className={`${s.row} ${s.rowWrap}`}>
                <span className={s.sub}>
                  Awaiting deposit{" "}
                  <strong style={{ color: "inherit" }}>{money(me?.held ?? 0)}</strong>
                </span>
                {pace && (
                  <span className={s.sub}>
                    At this pace{" "}
                    <strong style={{ color: "inherit" }}>{shortMoney(pace.projected)}</strong>
                  </span>
                )}
              </div>
              <button className={s.link} type="button" onClick={() => openOrders()}>View sales orders <Icon name="arrow" size={17} /></button>
            </section>

            <LiveBrandMarginList orders={block.orders} bands={bands} privateMode={privateMode}
              complete={completeOrders} onBrand={(selectedBrand) => openOrders(selectedBrand)} />
            <button type="button" className={live.metricEntry} onClick={() => openOrders("all", true)}>
              <span className={live.metricIcon}><Icon name="target" size={28} /></span>
              <span><strong>KPI items</strong><b>{me?.kpiQty ?? 0} <small>units sold</small></b><small>View orders with KPI items</small></span>
              <Icon name="chevron" size={18} />
            </button>
          </div>

          <div className={s.stack}>
            <section className={s.card}>
              <div className={s.sectionHead}>
                <h2>{block.target ? `Next: ${block.target.rank}` : principalView ? "Current rung" : "Your current rung"}</h2>
                {personal?.met || group?.met ? <Pill tone="good">Cleared</Pill> : null}
              </div>
              {personal ? (
                <>
                  <InsightBar
                    label="Personal sales this month"
                    value={money(personal.current)}
                    percent={personal.percent}
                  />
                  <p className={s.sub} style={{ marginTop: 10 }}>
                    {personal.met
                      ? `This month is clear of ${money(personal.target)}.`
                      : `${money(personal.gap)} to go to reach ${money(personal.target)}.`}
                  </p>
                  {streak && (
                    <>
                      <div className={s.streak}>
                        {(block.target?.streak ?? []).map((month) => (
                          <div
                            key={month.period}
                            className={`${s.streakMonth} ${month.met ? s.streakMet : ""}`}
                          >
                            <span className={s.streakTick}>
                              <Icon name={month.met ? "check" : "calendar"} size={14} />
                            </span>
                            <strong>{month.period}</strong>
                            <span className={s.caption}>{shortMoney(month.sales)}</span>
                            {month.live && <span className={s.caption}>still running</span>}
                          </div>
                        ))}
                      </div>
                      <p className={s.sub}>
                        This rung needs {money(block.target?.personal ?? 0)} in{" "}
                        {streak.months} months running — {streak.banked} already banked.{" "}
                        {streak.complete
                          ? "Every month is met; the rung is earned once this one closes."
                          : "A month that misses restarts the run."}
                      </p>
                    </>
                  )}
                </>
              ) : group ? (
                <>
                  <InsightBar
                    label="Group sales this month"
                    value={money(group.current)}
                    percent={group.percent}
                  />
                  <p className={s.sub} style={{ marginTop: 10 }}>
                    {group.met
                      ? `Group sales are clear of ${money(group.target)} this month.`
                      : `${money(group.gap)} to go, counting ${principalView ? me?.name : "you"} and the whole downline.`}
                  </p>
                </>
              ) : (
                <p className={s.sub}>
                  No sales gate is configured above {block.rank}. The title and rank
                  changes come from HR.
                </p>
              )}
            </section>

            <section className={s.card}>
              <h2>This month at a glance</h2>
              <div className={s.statGrid}>
                <div className={s.stat}>
                  <span className={s.caption}>Orders</span>
                  <span className={s.statValue}>{me?.orders ?? 0}</span>
                </div>
                <div className={s.stat}>
                  <span className={s.caption}>Last order</span>
                  <span className={s.statValue}>
                    {me?.lastOrder ? date(me.lastOrder) : "—"}
                  </span>
                </div>
              </div>
              {!!me?.blindOrders && (
                <p className={s.sub} style={{ marginTop: 14 }}>
                  {me.blindOrders} {me.blindOrders === 1 ? "order has" : "orders have"} no
                  unit cost and no keyed-in margin. Their brand margin remains pending
                  until these costs are available.
                </p>
              )}
              {freshness}
            </section>
            <button type="button" className={live.metricEntry} onClick={() => openOrders()}>
              <span className={live.metricIcon} data-tone="brown"><Icon name="receipt" size={28} /></span>
              <span><strong>Sales orders</strong><small>By brand, margin level or deposit status</small></span>
              <Icon name="chevron" size={18} />
            </button>
          </div>
        </div>
      )}

      {screen === "orders" && <div className={live.orderPage}>
        <div className={live.orderSummary} aria-label="Selected order summary">
          <div><small>Cleared sales</small><strong>{money(selectedSales)}</strong></div>
          <div><small>KPI units</small><strong>{selectedKpi}</strong></div>
          {selectedBrandMargin && <div><small>{selectedBrandMargin.unknownMarginCount ? "Known-order margin · partial" : "Cleared margin"}</small>
            <strong>{privateMode ? "••••" : selectedBrandMargin.margin === null ? "—" : `${selectedBrandMargin.margin.toFixed(2)}%`}</strong></div>}
        </div>
        {!completeOrders && <p className={live.notice}>This list contains the available recent orders. Monthly totals on Insight include all cleared orders.</p>}
        <div className={live.orderControls}>
          <label className={live.search}><Icon name="search" size={20} /><input aria-label="Search sales orders" type="search" placeholder="Search order number or brand" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label className={live.field}>Brand<select value={brand} onChange={(event) => { setBrand(event.target.value); onScreenChange?.("orders", event.target.value === "all" ? undefined : event.target.value); }}>
            <option value="all">All brands</option>{!brands.includes(brand) && brand !== "all" && <option value={brand}>{brand}</option>}{brands.map((name) => <option key={name} value={name}>{name}</option>)}
          </select></label>
          <details className={live.moreFilters}><summary>More filters <Icon name="chevron" size={16} /></summary>
            <div className={live.filterGrid}>
              <label className={live.field}>Deposit<select value={deposit} onChange={(event) => setDeposit(event.target.value)}><option value="all">All deposits</option><option value="cleared">Cleared</option><option value="held">Awaiting deposit</option></select></label>
              <label className={live.field}>KPI items<select value={kpi} onChange={(event) => setKpi(event.target.value)}><option value="all">All orders</option><option value="with">With KPI items</option><option value="without">Without KPI items</option></select></label>
              <label className={live.field}>Margin status<select value={marginFilter} onChange={(event) => setMarginFilter(event.target.value)}><option value="all">All margins</option><option value="pending">Cost pending</option><option value="penalty">Commission reduced</option><option value="threshold">Incentive threshold</option></select></label>
              <label className={live.field}>Group orders by<select value={groupBy} onChange={(event) => setGroupBy(event.target.value)}><option value="brand">Brand</option><option value="margin">Margin level</option></select></label>
            </div>
          </details>
        </div>
        <div className={s.sectionHead}><span className={s.caption}>{selectedOrders.length} {selectedOrders.length === 1 ? "order" : "orders"}</span>
          <button type="button" className={s.link} onClick={() => openOrders()}>Reset filters</button></div>
        <div className={live.orderGroups}>
          {orderGroups.map((group) => <section className={live.orderGroup} key={group.label} aria-label={`${group.label} orders`}>
            <div className={s.sectionHead}><h2>{group.label}</h2><span className={s.caption}>{group.orders.length} orders</span></div>
            {group.orders.map((order) => {
              const band = orderMarginLevels([order], bands)[0];
              return <button key={order.id} type="button" className={live.orderRow} onClick={() => orderDialog(order)} aria-label={`View order ${order.number}`}>
                <span className={live.orderHeading}><strong>{order.number}</strong><Icon name="chevron" size={17} /></span>
                <span className={s.caption}>{order.brand} · {date(order.date)}{order.carried && " · carried forward"}</span>
                <span className={live.orderValues}><span><small>Sales</small><strong>{money(order.revenue)}</strong></span><span><small>Margin</small><strong>{privateMode ? "••••" : hasNoGoodsMargin(order) || order.margin === null ? "—" : `${order.margin.toFixed(2)}%`}</strong></span><span><small>KPI</small><strong>{order.kpiQty}</strong></span></span>
                <span className={live.orderStatus}><span>{order.cleared ? "Deposit cleared" : "Awaiting deposit · not counted"}</span><span>{privateMode ? "Margin hidden" : band.label}</span></span>
              </button>;
            })}
          </section>)}
        </div>
        {!selectedOrders.length && <Empty title="No orders match these filters">Try another brand or reset your filters.</Empty>}
        {freshness}
      </div>}

      {screen === "overview" && view === "ranking" && (
        <div className={s.stack}>
          {boards.length > 1 && (
            <div className={s.filters}>
              {boards.map((b) => (
                <button
                  key={b.departmentId}
                  className={s.filter}
                  aria-pressed={board?.departmentId === b.departmentId}
                  onClick={() => setBoardId(b.departmentId)}
                >
                  {b.department}
                  {b.own && (principalView ? " · selected" : " · mine")}
                </button>
              ))}
            </div>
          )}
          {mine && (
            <section className={s.hero}>
              <span className={s.sub}>
                {principalView ? `${me?.name}'s place` : "Your place"} in {board?.department} · {insight.period}
              </span>
              <div className={s.heroValue}>
                {place(mine.position)}
                <span className={s.currency} style={{ marginLeft: 8 }}>
                  of {ranked.length}
                </span>
              </div>
              <p className={s.caption}>
                {mine.chasing === null
                  ? principalView ? "Top of the department board." : "Top of the board. The rest of the department is chasing you."
                  : `${money(mine.chasing - mine.sales)} behind ${place(
                      Math.max(1, mine.position - 1),
                    )} place.`}
              </p>
            </section>
          )}
          <section className={s.card}>
            <div className={s.sectionHead}>
              <h2>{board?.department ?? "Department"} ranking</h2>
              <span className={s.caption}>By sales this month</span>
            </div>
            {ranked.length ? (
              ranked.map((row) => (
                <button
                  key={row.staffId}
                  className={`${s.listRow} ${s.listButton} ${(principalView ? row.staffId === viewedStaffId : row.self) ? s.rankSelf : ""}`}
                  onClick={() => personDialog(row, board?.department ?? "")}
                >
                  <span
                    className={`${s.rankPlace} ${row.position <= 3 ? s.rankTop : ""}`}
                    aria-hidden="true"
                  >
                    {row.position}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={`${s.row} ${s.rowWrap}`}>
                      <h3>{row.name}</h3>
                      {(principalView ? row.staffId === viewedStaffId : row.self) && <Pill tone="active">{principalView ? "Viewing" : "You"}</Pill>}
                    </div>
                    <p className={s.caption}>
                      {row.title} · {row.orders}{" "}
                      {row.orders === 1 ? "order" : "orders"} · margin{" "}
                      {pct(blendedMargin(row))}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className={s.amount}>{shortMoney(row.sales)}</div>
                    <span className={s.caption}>{row.kpiQty} KPI</span>
                  </div>
                </button>
              ))
            ) : (
              <Empty title="Nobody is placed in this department yet" />
            )}
            <p className={s.sub} style={{ marginTop: 16 }}>
              Sales and margin only — nobody&apos;s commission, rate or salary is
              shown here. Everyone is listed, whether or not they
              have sold yet.
            </p>
            {freshness}
          </section>
        </div>
      )}

      {screen === "overview" && view === "downline" && (
        <div className={s.stack}>
          {boards.length > 0 && <button type="button" className={live.metricEntry} onClick={() => setView("ranking")}>
            <span className={live.metricIcon} data-tone="brown"><Icon name="trophy" size={28} /></span>
            <span><strong>Department ranking</strong><small>Compare the department&apos;s sales results</small></span>
            <Icon name="chevron" size={18} />
          </button>}
          {block.downline.length ? (
            <>
              <section className={s.hero}>
                <span className={s.sub}>{principalView ? `${me?.name}'s team sales` : "Your team's sales"} · {insight.period}</span>
                <div className={s.heroValue}>
                  {privateMode ? (
                    "••••••"
                  ) : (
                    <>
                      <span className={s.currency}>RM</span>
                      {new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2 }).format(
                        teamTotal.sales + (me?.sales ?? 0),
                      )}
                    </>
                  )}
                </div>
                <p className={s.caption}>
                  {principalView ? me?.name : "You"} and {block.downline.length}{" "}
                  {block.downline.length === 1 ? "person" : "people"} in the reporting tree.
                  Personal sales of {money(me?.sales ?? 0)} are included, as group sales
                  counts it.
                </p>
              </section>
              {branches.map((branch) => {
                const signal = downlineSignal(branch.leader, { median: boardMedian });
                const idle = daysSince(branch.leader.lastOrder);
                return (
                  <section key={branch.leader.staffId} className={s.card}>
                    <div className={s.row}>
                      <div style={{ minWidth: 0 }}>
                        <div className={`${s.row} ${s.rowWrap}`}>
                          <h2>{branch.leader.name}</h2>
                          <Pill tone={signalTone(signal)}>{signalLabel(signal, idle)}</Pill>
                        </div>
                        <p className={s.treeMeta}>
                          {branch.leader.title}
                          {branch.members.length > 0 &&
                            ` · ${branch.members.length} below them`}
                        </p>
                      </div>
                      <span className={s.avatar}>{initials(branch.leader.name)}</span>
                    </div>
                    <div className={s.statGrid} style={{ marginTop: 14 }}>
                      <div className={s.stat}>
                        <span className={s.caption}>Leg total</span>
                        <span className={s.statValue}>{shortMoney(branch.total.sales)}</span>
                      </div>
                      <div className={s.stat}>
                        <span className={s.caption}>Their own</span>
                        <span className={s.statValue}>{shortMoney(branch.leader.sales)}</span>
                      </div>
                      <div className={s.stat}>
                        <span className={s.caption}>Leg margin</span>
                        <span className={s.statValue}>{pct(blendedMargin(branch.total))}</span>
                      </div>
                      <div className={s.stat}>
                        <span className={s.caption}>KPI units</span>
                        <span className={s.statValue}>{branch.total.kpiQty}</span>
                      </div>
                    </div>
                    {branch.members.map((member) => (
                      <button
                        key={member.staffId}
                        className={`${s.listRow} ${s.listButton}`}
                        onClick={() => personDialog(member, `Under ${branch.leader.name}`)}
                      >
                        <div>
                          <h3>
                            {"· ".repeat(Math.max(0, member.depth - 1))}
                            {member.name}
                          </h3>
                          <p className={s.caption}>
                            {member.title} ·{" "}
                            {member.lastOrder
                              ? `last order ${date(member.lastOrder)}`
                              : "no order yet"}
                          </p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className={s.amount}>{shortMoney(member.sales)}</div>
                          <span className={s.caption}>{pct(blendedMargin(member))}</span>
                        </div>
                      </button>
                    ))}
                    <button
                      className={s.link}
                      onClick={() =>
                        personDialog(branch.leader, `Reports to ${principalView ? me?.name : "you"} · ${block.department}`)
                      }
                    >
                      Open {branch.leader.name.split(" ")[0]}&apos;s numbers{" "}
                      <Icon name="arrow" size={16} />
                    </button>
                  </section>
                );
              })}
              <p className={s.sub}>
                Sales and margin only. A quiet flag means a fortnight without a
                cleared order — a reason to ask, not a verdict.
              </p>
            </>
          ) : (
            <section className={s.card}>
              <Empty title={principalView ? `${me?.name} has no downline yet` : "You have no downline yet"}>
                Once members report to {principalView ? me?.name : "you"} in {block.department}, each of their legs
                appears here with its sales and margin.
              </Empty>
            </section>
          )}
          {freshness}
        </div>
      )}
    </div>
  );
}

function InsightBar({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent: number;
}) {
  return (
    <div className={s.kpi}>
      <div className={`${s.row} ${s.rowWrap}`}>
        <span className={s.kpiTitle}>{label}</span>
        <span className={s.amount}>{value}</span>
      </div>
      <div
        className={s.progress}
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function signalTone(signal: ReturnType<typeof downlineSignal>) {
  return signal === "leading"
    ? "good"
    : signal === "quiet"
      ? "warning"
      : signal === "none"
        ? "neutral"
        : "active";
}
function signalLabel(signal: ReturnType<typeof downlineSignal>, idle: number | null) {
  return signal === "leading"
    ? "Leading"
    : signal === "quiet"
      ? `Quiet ${idle ?? 0} days`
      : signal === "none"
        ? "No orders yet"
        : "Steady";
}

export type { InsightView, MemberBoardRow, MemberDownlineRow };
