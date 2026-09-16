import { useState, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberBand, MemberInsight, MemberInsightOrder, MemberScore } from "@/lib/member/types";
import MemberInsightPanel from "./MemberInsightPanel";
import { LiveBrandMarginList, hasCompleteLiveOrders, summarizeLiveBrandMargins } from "./LiveBrandMarginList";

afterEach(cleanup);

const bands: MemberBand[] = [
  { brand: "Akemi", key: "Tier 1", kind: "incentive", threshold: 35, multiplier: null, amount: 100 },
  { brand: "Zanotti", key: "Tier 1", kind: "incentive", threshold: 50, multiplier: null, amount: 100 },
  { brand: "Akemi", key: "Low margin", kind: "penalty", threshold: 31, multiplier: .5, amount: 0 },
];
const order = (id: string, over: Partial<MemberInsightOrder> = {}): MemberInsightOrder => ({
  id, number: `SO-${id}`, brand: "Akemi", revenue: 3000, margin: 30, date: "2026-09-06",
  manual: false, cleared: true, kpiQty: 2, carried: false, ...over,
});
const orders: MemberInsightOrder[] = [
  order("1"), order("2", { revenue: 1000, margin: 60, kpiQty: 0, carried: true }),
  order("3", { revenue: 40000, margin: 90, cleared: false, kpiQty: 12 }),
  order("4", { brand: "Zanotti", revenue: 2000, margin: 40, kpiQty: 1 }),
  order("5", { brand: "Zanotti", revenue: 500, margin: null, kpiQty: 0 }),
];
const score: MemberScore = {
  staffId: "self", sales: 6500, held: 40000, orders: 4, kpiQty: 3,
  marginRevenue: 6000, marginCost: 3700, blindOrders: 1, lastOrder: "2026-09-06",
};
function snapshot(): MemberInsight {
  return { period: "2026-09", asOf: "2026-09-16T02:00:00Z", live: true, blocks: [{
    membershipId: "fair", schemeId: "scheme", department: "Fair", title: "Team Leader", rank: "A", rankSort: 10,
    me: { ...score, name: "Signed-in person" }, orders: [...orders], target: null,
    boards: [{ departmentId: "fair", department: "Fair", own: true, rows: [
      { ...score, name: "Signed-in person", title: "Team Leader", self: true },
      { ...score, staffId: "report", name: "Direct report", title: "Salesperson", self: false, sales: 3000 },
    ] }],
    downline: [{ ...score, staffId: "report", name: "Direct report", title: "Salesperson", uplineId: "self", depth: 1, sales: 3000 }],
  }] };
}

function Harness({ initialScreen, initialBrand, privateMode = false, insight = snapshot(), membershipId = "fair" }: {
  initialScreen?: "overview" | "orders"; initialBrand?: string; privateMode?: boolean; insight?: MemberInsight; membershipId?: string;
}) {
  const [dialog, setDialog] = useState<{ title: string; content: ReactNode } | null>(null);
  return <><MemberInsightPanel insight={insight} membershipId={membershipId} bands={bands} privateMode={privateMode}
    busy={false} error={null} onRefresh={() => {}} onDialog={setDialog} initialScreen={initialScreen} initialBrand={initialBrand} />
    {dialog && <section role="dialog" aria-label={dialog.title}>{dialog.content}<button onClick={() => setDialog(null)}>Close order</button></section>}</>;
}

describe("Live brand margins", () => {
  it("weights cleared revenue and applies the actual brand's thresholds", () => {
    const rows = summarizeLiveBrandMargins(orders.filter((item) => item.id !== "5"), bands, true);
    expect(rows[0]).toMatchObject({ brand: "Akemi", margin: 37.5, clearedOrders: 2, pendingOrders: 1, tier: "Tier 1 threshold", threshold: 35 });
    expect(rows[1]).toMatchObject({ brand: "Zanotti", margin: 40, tier: "Below tier", threshold: null });
  });

  it("weights goods-only margins without letting non-goods KPI sales inflate a brand's tier", () => {
    const mixed = [
      order("mixed", { revenue: 1000, marginRevenue: 100, margin: 50 }),
      order("goods", { revenue: 100, marginRevenue: 100, margin: 0 }),
    ];
    expect(summarizeLiveBrandMargins(mixed, bands, true)[0]).toMatchObject({ margin: 25, tier: "Below tier", unknownMarginCount: 0 });
    expect(mixed.map(item => item.revenue)).toEqual([1000, 100]);
  });

  it("does not treat cleared KPI-only orders as missing goods costs", () => {
    const mixed = [
      order("goods", { revenue: 100, marginRevenue: 100, margin: 50 }),
      order("kpi-only", { revenue: 900, marginRevenue: 0, margin: null }),
      order("held-goods", { revenue: 100, marginRevenue: 100, margin: null, cleared: false }),
    ];
    expect(summarizeLiveBrandMargins(mixed, bands, true)[0]).toMatchObject({ margin: 50, tier: "Tier 1 threshold", unknownMarginCount: 0, clearedOrders: 2, pendingOrders: 1 });
    expect(summarizeLiveBrandMargins([mixed[1]], bands, true)[0]).toMatchObject({ margin: null, unknownMarginCount: 0 });
    expect(summarizeLiveBrandMargins([...mixed, order("blind-goods", { marginRevenue: 100, margin: null })], bands, true)[0]).toMatchObject({ unknownMarginCount: 1, tier: "Pending" });
  });

  it("excludes nonpositive goods returns even when a manual margin was entered", () => {
    const returns = [
      order("manual-return", { revenue: -100, marginRevenue: -100, margin: 90, manual: true }),
      order("uncosted-return", { revenue: -200, marginRevenue: -200, margin: null }),
    ];
    expect(summarizeLiveBrandMargins([order("goods", { revenue: 100, marginRevenue: 100, margin: 50 }), ...returns], bands, true)[0])
      .toMatchObject({ margin: 50, unknownMarginCount: 0, tier: "Tier 1 threshold", clearedOrders: 3 });
    expect(summarizeLiveBrandMargins(returns, bands, true)[0]).toMatchObject({ margin: null, unknownMarginCount: 0 });
  });

  it("shows partial margins as pending without awarding a tier from known orders", () => {
    const rows = summarizeLiveBrandMargins(orders, bands, true);
    expect(rows[1]).toMatchObject({ margin: 40, unknownMarginCount: 1, tier: "Pending", tone: "pending" });
    expect(summarizeLiveBrandMargins(orders, bands)[0].tier).toBe("Pending");
  });

  it("distinguishes zero margin, missing costs, and unconfigured brands", () => {
    expect(summarizeLiveBrandMargins([order("zero", { margin: 0 })], bands, true)[0].margin).toBe(0);
    expect(summarizeLiveBrandMargins([order("missing", { margin: null })], bands, true)[0].margin).toBeNull();
    expect(summarizeLiveBrandMargins([order("other", { brand: "Another brand", margin: 80 })], bands, true)[0].tier).toBe("No tier configured");
  });

  it("does not claim a complete month if the loaded order feed is truncated", () => {
    const block = snapshot().blocks[0];
    expect(hasCompleteLiveOrders(block)).toBe(true);
    expect(hasCompleteLiveOrders({ ...block, me: { ...block.me, orders: 5 } })).toBe(false);
    const many = Array.from({ length: 200 }, (_, i) => order(String(i)));
    expect(hasCompleteLiveOrders({ ...block, orders: many, me: { ...block.me, orders: 200 } })).toBe(false);
  });

  it("uses the same shared row component for Today and Insight without leaking hidden margins", () => {
    const onBrand = vi.fn();
    render(<LiveBrandMarginList orders={orders} bands={bands} privateMode complete onBrand={onBrand} title="This month's margin" />);
    const akemi = screen.getByRole("button", { name: /Akemi margin/ });
    expect(akemi).not.toHaveTextContent("37.50%");
    expect(akemi).toHaveTextContent("Hidden");
    fireEvent.click(akemi);
    expect(onBrand).toHaveBeenCalledWith("Akemi");
  });
});

describe("Production Insight navigation", () => {
  it("separates inapplicable goods margin from missing costs in filters, groups and details", () => {
    const value = snapshot();
    value.blocks[0].orders = [
      order("kpi-only", { revenue: 900, marginRevenue: 0, margin: null }),
      order("return", { revenue: -100, marginRevenue: -100, margin: 90, manual: true }),
      order("blind-goods", { revenue: 100, marginRevenue: 100, margin: null }),
    ];
    value.blocks[0].me.orders = 3;
    render(<Harness insight={value} initialScreen="orders" />);
    fireEvent.change(screen.getByLabelText("Margin status"), { target: { value: "pending" } });
    expect(screen.getAllByRole("button", { name: /View order SO-/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "View order SO-blind-goods" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Margin status"), { target: { value: "threshold" } });
    expect(screen.queryByRole("button", { name: "View order SO-return" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Margin status"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Group orders by"), { target: { value: "margin" } });
    expect(within(screen.getByRole("region", { name: "No goods margin orders" })).getAllByRole("button", { name: /View order SO-/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "View order SO-return" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("no positive goods revenue as a margin basis");
    expect(screen.getByRole("dialog")).toHaveTextContent("Not applicable");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("No unit cost");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("90.0%");
  });
  it("keeps order sales totals intact while showing the goods-weighted brand margin", () => {
    const value = snapshot();
    value.blocks[0].orders = [order("mixed", { revenue: 1000, marginRevenue: 100, margin: 50 }), order("goods", { revenue: 100, marginRevenue: 100, margin: 0 })];
    value.blocks[0].me.orders = 2;
    render(<Harness insight={value} initialScreen="orders" initialBrand="Akemi" />);
    expect(screen.getByLabelText("Selected order summary")).toHaveTextContent("25.00%");
    expect(screen.getByLabelText("Selected order summary")).toHaveTextContent("1,100");
    fireEvent.click(screen.getByRole("button", { name: "View order SO-mixed" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("1,000");
  });
  it("opens real brand orders, preserves brand after order detail, and goes back to Personal", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Personal" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Ranking" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Akemi margin 37.50%/ }));
    expect(screen.getByRole("heading", { name: "Sales orders", level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText("Brand")).toHaveValue("Akemi");
    expect(screen.getAllByRole("button", { name: /View order SO-/ })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "View order SO-4" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Selected order summary")).toHaveTextContent("37.50%");
    fireEvent.click(screen.getByRole("button", { name: "View order SO-2" }));
    const dialog = screen.getByRole("dialog", { name: "SO-2" });
    expect(dialog).toHaveTextContent("Akemi");
    expect(dialog).toHaveTextContent("carried into this one");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close order" }));
    expect(screen.getByLabelText("Brand")).toHaveValue("Akemi");
    fireEvent.click(screen.getByRole("button", { name: "Back to Insight" }));
    expect(screen.getByRole("heading", { name: "Insight", level: 1 })).toBeInTheDocument();
  });

  it("supports a Today deep link and combines brand, deposit, KPI, and search filters", () => {
    render(<Harness initialScreen="orders" initialBrand="Akemi" />);
    fireEvent.change(screen.getByLabelText("Deposit"), { target: { value: "cleared" } });
    fireEvent.change(screen.getByLabelText("KPI items"), { target: { value: "with" } });
    expect(screen.getAllByRole("button", { name: /View order SO-/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "View order SO-1" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search sales orders" }), { target: { value: "SO-2" } });
    expect(screen.getByText("No orders match these filters")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByLabelText("Brand")).toHaveValue("all");
    expect(screen.getAllByRole("button", { name: /View order SO-/ })).toHaveLength(5);
    fireEvent.change(screen.getByLabelText("Margin status"), { target: { value: "pending" } });
    expect(screen.getByRole("button", { name: "View order SO-5" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /View order SO-/ })).toHaveLength(1);
  });

  it("preserves the margin-level review and excludes held KPI units from the summary", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /KPI items.*View orders with KPI items/ }));
    expect(screen.getByLabelText("KPI items")).toHaveValue("with");
    expect(screen.getByLabelText("Selected order summary")).toHaveTextContent(/KPI units3/);
    fireEvent.change(screen.getByLabelText("Group orders by"), { target: { value: "margin" } });
    expect(screen.getByRole("region", { name: "Commission ×0.5 orders" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Margin status"), { target: { value: "penalty" } });
    expect(screen.getAllByRole("button", { name: /View order SO-/ })).toHaveLength(1);
  });

  it("keeps Team and department aggregate drilldowns without inventing their order data", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /^Team$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Open Direct's numbers/ }));
    const dialog = screen.getByRole("dialog", { name: "Direct report" });
    expect(dialog).toHaveTextContent("Reports to you · Fair");
    expect(dialog).not.toHaveTextContent("SO-1");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close order" }));
    fireEvent.click(screen.getByRole("button", { name: /Department ranking Compare/ }));
    expect(screen.getByRole("heading", { name: "Fair ranking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Team$/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Back to Team" }));
    expect(screen.getByRole("button", { name: /Open Direct's numbers/ })).toBeInTheDocument();
  });

  it("never falls back to another membership when the selected membership is absent", () => {
    render(<Harness membershipId="not-in-snapshot" />);
    expect(screen.getByText("No performance data yet")).toBeInTheDocument();
    expect(screen.queryByText("Signed-in person")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Akemi margin/ })).not.toBeInTheDocument();
  });

  it("delegates month selection and refreshing to the existing authorised loader", () => {
    const onPeriodChange = vi.fn(), onRefresh = vi.fn();
    render(<MemberInsightPanel insight={snapshot()} membershipId="fair" bands={bands} privateMode={false}
      busy={false} error={null} onRefresh={onRefresh} onDialog={() => {}} onPeriodChange={onPeriodChange} />);
    fireEvent.change(screen.getByLabelText("Insight month"), { target: { value: "2026-08" } });
    expect(onPeriodChange).toHaveBeenCalledWith("2026-08");
    fireEvent.click(screen.getByRole("button", { name: "Refresh performance" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
