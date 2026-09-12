import { describe, expect, it } from "vitest";
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
} from "./insight";
import type {
  MemberBand,
  MemberBoardRow,
  MemberDownlineRow,
  MemberInsightOrder,
  MemberScore,
} from "./types";

const score = (over: Partial<MemberScore> = {}): MemberScore => ({
  staffId: "s",
  sales: 0,
  held: 0,
  orders: 0,
  kpiQty: 0,
  marginRevenue: 0,
  marginCost: 0,
  blindOrders: 0,
  lastOrder: null,
  ...over,
});
const boardRow = (name: string, sales: number, over: Partial<MemberBoardRow> = {}): MemberBoardRow => ({
  ...score({ staffId: name.toLowerCase(), sales }),
  name,
  title: "Revenue Specialist",
  self: false,
  ...over,
});
const downlineRow = (
  staffId: string,
  depth: number,
  uplineId: string | null,
  sales: number,
): MemberDownlineRow => ({
  ...score({ staffId, sales }),
  name: staffId.toUpperCase(),
  title: "Revenue Specialist",
  uplineId,
  depth,
});
const order = (over: Partial<MemberInsightOrder> = {}): MemberInsightOrder => ({
  id: "o1",
  number: "SO-1",
  brand: "Akemi",
  revenue: 1000,
  margin: 30,
  date: "2026-09-05",
  manual: false,
  cleared: true,
  kpiQty: 0,
  carried: false,
  ...over,
});
const bands: MemberBand[] = [
  { brand: "Akemi", key: "Low", kind: "penalty", threshold: 20, multiplier: 0.5, amount: 0 },
  { brand: "Akemi", key: "Tier 1", kind: "incentive", threshold: 32, multiplier: null, amount: 500 },
  { brand: "Zanotti", key: "Tier 1", kind: "incentive", threshold: 45, multiplier: null, amount: 500 },
];

describe("blendedMargin", () => {
  it("weights by revenue rather than averaging the percentages", () => {
    // 9,000 at 10% and 1,000 at 50% is 14%, not the 30% a flat average gives.
    expect(blendedMargin({ marginRevenue: 10000, marginCost: 8600 })).toBeCloseTo(14, 10);
  });

  it("separates 'no order carried a margin' from 'the margin is zero'", () => {
    expect(blendedMargin({ marginRevenue: 0, marginCost: 0 })).toBeNull();
    expect(blendedMargin({ marginRevenue: 1000, marginCost: 1000 })).toBe(0);
  });

  it("reports a loss rather than clamping at zero", () => {
    expect(blendedMargin({ marginRevenue: 1000, marginCost: 1200 })).toBeCloseTo(-20, 10);
  });
});

describe("totalScore", () => {
  it("adds every figure and keeps the latest order date", () => {
    const total = totalScore([
      score({ sales: 100, held: 10, orders: 1, kpiQty: 2, marginRevenue: 100, marginCost: 70, lastOrder: "2026-09-02" }),
      score({ sales: 250, held: 0, orders: 3, kpiQty: 1, blindOrders: 1, lastOrder: "2026-09-09" }),
      score({ sales: 0, lastOrder: null }),
    ]);
    expect(total).toMatchObject({
      sales: 350,
      held: 10,
      orders: 4,
      kpiQty: 3,
      marginRevenue: 100,
      marginCost: 70,
      blindOrders: 1,
      lastOrder: "2026-09-09",
    });
  });

  it("is all zeroes for nobody", () => {
    expect(totalScore([])).toMatchObject({ sales: 0, orders: 0, lastOrder: null });
  });
});

describe("rankBoard", () => {
  it("gives a tie the same place and skips the one behind it", () => {
    const ranked = rankBoard([
      boardRow("Bala", 80_000),
      boardRow("Amir", 80_000),
      boardRow("Chen", 40_000),
    ]);
    expect(ranked.map((r) => [r.name, r.position])).toEqual([
      ["Amir", 1],
      ["Bala", 1],
      ["Chen", 3],
    ]);
  });

  it("ranks everybody, including the people still on nothing", () => {
    const ranked = rankBoard([boardRow("Amir", 0), boardRow("Bala", 0), boardRow("Chen", 10)]);
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 2]);
  });

  it("reports the sales of the person one place above", () => {
    const ranked = rankBoard([boardRow("Amir", 100), boardRow("Bala", 60)]);
    expect(ranked[0].chasing).toBeNull();
    expect(ranked[1].chasing).toBe(100);
  });
});

describe("gateProgress", () => {
  it("measures the gap to the gate", () => {
    expect(gateProgress(72_000, 100_000)).toMatchObject({ gap: 28_000, percent: 72, met: false });
  });

  it("never shows a negative gap or more than a full bar", () => {
    expect(gateProgress(140_000, 100_000)).toMatchObject({ gap: 0, percent: 100, met: true });
    expect(gateProgress(140_000, 100_000)?.ratio).toBeCloseTo(1.4, 10);
  });

  it("is absent when the rung carries no such gate", () => {
    expect(gateProgress(10, null)).toBeNull();
    expect(gateProgress(10, 0)).toBeNull();
  });
});

describe("streakSummary", () => {
  const target = (met: boolean[], months = met.length) => ({
    rank: "Senior Revenue Specialist",
    personal: 100_000,
    months,
    group: null,
    streak: met.map((m, i) => ({
      period: `2026-0${8 + i}`,
      sales: m ? 120_000 : 60_000,
      live: i === met.length - 1,
      met: m,
    })),
  });

  it("counts the months already banked apart from the one still running", () => {
    expect(streakSummary(target([true, false]))).toMatchObject({
      months: 2,
      met: 1,
      banked: 1,
      complete: false,
    });
  });

  it("is complete only when every month of the run is met", () => {
    expect(streakSummary(target([true, true]))?.complete).toBe(true);
    expect(streakSummary(target([false, true]))?.complete).toBe(false);
  });

  it("exposes the live month so the screen can say the numbers are still moving", () => {
    expect(streakSummary(target([true, false]))?.live).toEqual({
      period: "2026-09",
      sales: 60_000,
      met: false,
    });
  });

  it("is absent without a streak gate", () => {
    expect(streakSummary(null)).toBeNull();
    expect(
      streakSummary({ rank: "Team Assistant", personal: null, months: null, group: 300_000, streak: null }),
    ).toBeNull();
  });
});

describe("marginLevels", () => {
  it("reads every order against its own brand's ladder", () => {
    // 30% clears Akemi's Tier 1 threshold of 32%? No — but it is well clear of
    // Zanotti's 45%, so the same percentage lands in different bands.
    const levels = marginLevels(
      [order({ id: "a", brand: "Akemi", margin: 35 }), order({ id: "z", brand: "Zanotti", margin: 35 })],
      bands,
    );
    expect(levels.map((l) => l.label).sort()).toEqual(["Below reference range", "Tier 1 threshold"]);
  });

  it("puts the bills that cost money first", () => {
    const levels = marginLevels(
      [
        order({ id: "good", margin: 40, revenue: 9000 }),
        order({ id: "bad", margin: 12, revenue: 1000 }),
      ],
      bands,
    );
    expect(levels[0].multiplier).toBe(0.5);
    expect(levels[0].orders.map((o) => o.id)).toEqual(["bad"]);
  });

  it("keeps orders with no margin in a band of their own", () => {
    const levels = marginLevels([order({ margin: null })], bands);
    expect(levels).toHaveLength(1);
    expect(levels[0]).toMatchObject({ label: "Cost pending", revenue: 1000 });
  });

  it("totals the revenue in each band", () => {
    const levels = marginLevels(
      [order({ id: "a", margin: 40, revenue: 2000 }), order({ id: "b", margin: 40, revenue: 3000 })],
      bands,
    );
    expect(levels[0].revenue).toBe(5000);
  });
});

describe("downlineBranches", () => {
  const rows = [
    downlineRow("lee", 1, "me", 50_000),
    downlineRow("tan", 1, "me", 10_000),
    downlineRow("ravi", 2, "lee", 30_000),
    downlineRow("wong", 3, "ravi", 5_000),
  ];

  it("totals a whole leg, not just its leader", () => {
    const [first] = downlineBranches(rows);
    expect(first.leader.staffId).toBe("lee");
    expect(first.members.map((m) => m.staffId)).toEqual(["ravi", "wong"]);
    expect(first.total.sales).toBe(85_000);
  });

  it("orders the legs by what they are worth", () => {
    expect(downlineBranches(rows).map((b) => b.leader.staffId)).toEqual(["lee", "tan"]);
  });

  it("places somebody whose upline is missing rather than dropping them", () => {
    const orphan = downlineRow("kumar", 3, "nobody", 7_000);
    const branches = downlineBranches([...rows, orphan]);
    expect(branches.map((b) => b.leader.staffId)).toContain("kumar");
    expect(branches.flatMap((b) => [b.leader, ...b.members]).map((m) => m.staffId)).toHaveLength(5);
  });

  it("survives a cycle without looping", () => {
    const a = downlineRow("a", 1, "b", 1);
    const b = downlineRow("b", 2, "a", 1);
    expect(downlineBranches([a, b]).flatMap((x) => [x.leader, ...x.members])).toHaveLength(2);
  });

  it("is empty for somebody with no downline", () => {
    expect(downlineBranches([])).toEqual([]);
  });
});

describe("daysSince and downlineSignal", () => {
  const today = new Date("2026-09-20T09:00:00Z");

  it("counts whole days back to the last cleared order", () => {
    expect(daysSince("2026-09-06", today)).toBe(14);
    expect(daysSince(null, today)).toBeNull();
  });

  it("calls somebody with no order at all 'none', not 'quiet'", () => {
    expect(downlineSignal(score({ orders: 0 }), { median: 10 }, today)).toBe("none");
  });

  it("flags a fortnight without a cleared order", () => {
    const row = score({ orders: 3, sales: 90_000, lastOrder: "2026-09-01" });
    expect(downlineSignal(row, { median: 10_000 }, today)).toBe("quiet");
  });

  it("reads an active member against the middle of the board", () => {
    const busy = score({ orders: 3, sales: 90_000, lastOrder: "2026-09-19" });
    expect(downlineSignal(busy, { median: 40_000 }, today)).toBe("leading");
    expect(downlineSignal(busy, { median: 120_000 }, today)).toBe("steady");
  });
});

describe("medianSales", () => {
  it("takes the middle of an odd board and the mean of the middle two of an even one", () => {
    expect(medianSales([{ sales: 10 }, { sales: 30 }, { sales: 20 }])).toBe(20);
    expect(medianSales([{ sales: 10 }, { sales: 30 }])).toBe(20);
    expect(medianSales([])).toBe(0);
  });
});

describe("monthPace", () => {
  it("projects the month from the days already gone", () => {
    // 72k over 12 days of a 30-day month lands at 180k.
    expect(monthPace(72_000, "2026-09", new Date("2026-09-12T10:00:00Z"))).toMatchObject({
      elapsed: 12,
      days: 30,
    });
    expect(monthPace(72_000, "2026-09", new Date("2026-09-12T10:00:00Z"))?.projected).toBeCloseTo(180_000, 6);
  });

  it("treats a month that is not the current one as fully elapsed", () => {
    expect(monthPace(65_000, "2026-08", new Date("2026-09-12T10:00:00Z"))).toMatchObject({
      elapsed: 31,
      days: 31,
      projected: 65_000,
    });
  });

  it("knows February and never divides by a zeroth day", () => {
    expect(monthPace(1000, "2026-02", new Date("2026-02-01T00:30:00Z"))).toMatchObject({
      elapsed: 1,
      days: 28,
    });
  });

  it("is absent for a period it cannot read", () => {
    expect(monthPace(1000, "not-a-month")).toBeNull();
  });
});
