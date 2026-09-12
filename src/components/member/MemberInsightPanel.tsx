"use client";

/**
 * Insight — how am I doing, right now.
 *
 * Three screens over one snapshot: MY SALES (own numbers against the gate
 * ahead), RANKING (the whole department, split by sub-department) and
 * DOWNLINE (each leg of the caller's own team). Everything it shows is read
 * from committed orders rather than from the month's statement, so the
 * heading says "estimate" everywhere and never "commission": the run decides
 * pay, this page only says where the month stands.
 */

import { useMemo, useState, type ReactNode } from "react";
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
import s from "./member.module.css";

type InsightView = "sales" | "ranking" | "downline";

const views: { id: InsightView; icon: string; label: string }[] = [
  { id: "sales", icon: "chart", label: "My sales" },
  { id: "ranking", icon: "trophy", label: "Ranking" },
  { id: "downline", icon: "branch", label: "Downline" },
];

const pct = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)}%`);
const place = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

export default function MemberInsightPanel({
  insight,
  membershipId,
  bands,
  privateMode,
  busy,
  error,
  onRefresh,
  onDialog,
}: {
  insight: MemberInsight | null;
  membershipId: string;
  bands: MemberBand[];
  privateMode: boolean;
  busy: boolean;
  error: string | null;
  onRefresh: () => void;
  onDialog: (dialog: { title: string; content: ReactNode }) => void;
}) {
  const [view, setView] = useState<InsightView>("sales");
  const [boardId, setBoardId] = useState("");
  const block: MemberInsightBlock | undefined =
    insight?.blocks.find((b) => b.membershipId === membershipId) ?? insight?.blocks[0];

  const money = (value: number | null | undefined) =>
    privateMode ? "••••••" : value == null ? "—" : fmt(value);
  const shortMoney = (value: number) =>
    privateMode
      ? "••••"
      : `RM ${new Intl.NumberFormat("en-MY", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;

  const me = block?.me;
  const margin = me ? blendedMargin(me) : null;
  const marginBandTone = useMemo(() => {
    if (!block || margin === null) return "neutral";
    const brand = block.orders[0]?.brand;
    const level = marginLevels(
      [
        {
          id: "blended",
          number: "",
          brand: brand ?? "",
          revenue: me?.marginRevenue ?? 0,
          margin,
          date: "",
          manual: false,
          cleared: true,
          kpiQty: 0,
          carried: false,
        },
      ],
      bands,
    )[0];
    return level?.tone ?? "neutral";
  }, [block, margin, me, bands]);

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
          <Empty title="Loading your numbers">
            Reading this month&apos;s committed orders.
          </Empty>
        ) : (
          <Empty title="No performance data yet">
            Insight appears once your department has committed orders for this month.
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
  const mine = ranked.find((r) => r.self);
  const branches = downlineBranches(block.downline);
  const teamTotal = totalScore(block.downline);
  const boardMedian = medianSales(board?.rows ?? []);

  function orderDialog(order: MemberInsightOrder) {
    const band = marginLevels([order], bands)[0];
    onDialog({
      title: order.number,
      content: (
        <div className={s.stack}>
          <div className={s.row}>
            <span className={s.quoteValue}>{pct(order.margin)}</span>
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
            <dd>{order.manual ? "Keyed in by hand" : "Product and gift costs"}</dd>
            <dt>Deposit</dt>
            <dd>{order.cleared ? "Cleared — counted this month" : "Not yet cleared"}</dd>
          </dl>
          <p className={s.sub}>
            {order.margin === null
              ? "No unit cost and no keyed-in margin, so this order is in your sales but not in your margin."
              : band.multiplier < 1
                ? `Product commission, Open Bill and your upline's override on this bill are multiplied by ${band.multiplier}. Fixed KPI allowances are not affected.`
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
    <>
      <div className={s.titleRow}>
        <div>
          <p className={s.eyebrow}>WHERE YOU STAND TODAY</p>
          <h1>Insight</h1>
          <p className={`${s.sub} ${s.intro}`}>
            {block.department} · {insight.period} · {block.title}
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

      <div className={`${s.tabs} ${s.tabsEven}`}>
        {views.map((v) => (
          <button key={v.id} aria-pressed={view === v.id} onClick={() => setView(v.id)}>
            <Icon name={v.icon} size={17} />
            {v.label}
          </button>
        ))}
      </div>

      {view === "sales" && (
        <div className={s.grid}>
          <div className={s.stack}>
            <section className={s.hero}>
              <div className={s.row}>
                <span className={s.sub}>Personal sales · {insight.period}</span>
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
                orders — your statement is what pays.
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
            </section>

            <section className={s.card}>
              <div className={s.sectionHead}>
                <h2>{block.target ? `Next: ${block.target.rank}` : "Your current rung"}</h2>
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
                      : `${money(group.gap)} to go, counting you and your whole downline.`}
                  </p>
                </>
              ) : (
                <p className={s.sub}>
                  No sales gate is configured above {block.rank}. Your title and rank
                  changes come from HR.
                </p>
              )}
            </section>

            <section className={s.card}>
              <h2>This month at a glance</h2>
              <div className={s.statGrid}>
                <div className={s.stat}>
                  <span className={s.caption}>KPI units sold</span>
                  <span className={s.statValue}>{me?.kpiQty ?? 0}</span>
                </div>
                <div className={s.stat}>
                  <span className={s.caption}>Margin to date</span>
                  <span className={s.statValue}>{pct(margin)}</span>
                  <Pill tone={marginBandTone}>
                    {margin === null ? "No costed order" : "Blended"}
                  </Pill>
                </div>
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
                  unit cost and no keyed-in margin, so the margin above is taken from the
                  rest.
                </p>
              )}
              {freshness}
            </section>
          </div>

          <div className={s.stack}>
            <section className={s.card}>
              <div className={s.sectionHead}>
                <h2>Orders by margin level</h2>
                <span className={s.caption}>{block.orders.length} this month</span>
              </div>
              {block.orders.length ? (
                marginLevels(block.orders, bands).map((level) => (
                  <div key={level.label} className={s.level}>
                    <div className={`${s.row} ${s.rowWrap}`}>
                      <Pill tone={level.tone}>{level.label}</Pill>
                      <span className={s.amount}>{money(level.revenue)}</span>
                    </div>
                    <p className={s.caption}>
                      {level.orders.length}{" "}
                      {level.orders.length === 1 ? "order" : "orders"}
                      {level.multiplier < 1 && ` · commission × ${level.multiplier}`}
                    </p>
                    {level.orders.map((order) => (
                      <button
                        key={order.id}
                        className={`${s.listRow} ${s.listButton}`}
                        onClick={() => orderDialog(order)}
                      >
                        <div>
                          <h3>{order.number}</h3>
                          <p className={s.caption}>
                            {order.brand} · {date(order.date)}
                            {!order.cleared && " · awaiting deposit"}
                            {order.carried && " · carried forward"}
                          </p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className={s.amount}>{pct(order.margin)}</div>
                          <span className={s.caption}>{money(order.revenue)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ))
              ) : (
                <Empty title="No orders yet this month">
                  Orders appear here once your department commits its sync.
                </Empty>
              )}
            </section>
          </div>
        </div>
      )}

      {view === "ranking" && (
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
                  {b.own && " · mine"}
                </button>
              ))}
            </div>
          )}
          {mine && (
            <section className={s.hero}>
              <span className={s.sub}>
                Your place in {board?.department} · {insight.period}
              </span>
              <div className={s.heroValue}>
                {place(mine.position)}
                <span className={s.currency} style={{ marginLeft: 8 }}>
                  of {ranked.length}
                </span>
              </div>
              <p className={s.caption}>
                {mine.chasing === null
                  ? "Top of the board. The rest of the department is chasing you."
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
                  className={`${s.listRow} ${s.listButton} ${row.self ? s.rankSelf : ""}`}
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
                      {row.self && <Pill tone="active">You</Pill>}
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
              shown here, including yours. Everyone is listed, whether or not they
              have sold yet.
            </p>
            {freshness}
          </section>
        </div>
      )}

      {view === "downline" && (
        <div className={s.stack}>
          {block.downline.length ? (
            <>
              <section className={s.hero}>
                <span className={s.sub}>Your team&apos;s sales · {insight.period}</span>
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
                  You and {block.downline.length}{" "}
                  {block.downline.length === 1 ? "person" : "people"} below you.
                  Your own {money(me?.sales ?? 0)} is included, as group sales
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
                        personDialog(branch.leader, `Reports to you · ${block.department}`)
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
              <Empty title="You have no downline yet">
                Once members report to you in {block.department}, each of their legs
                appears here with its sales and margin.
              </Empty>
            </section>
          )}
          {freshness}
        </div>
      )}
    </>
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
