import { describe, expect, it } from "vitest";
import { fairs, getFair, marginImpact, orders, people, selectOrders, summarize, summarizeKpi, venueRanking } from "./insight-model";
import type { InsightOrder } from "./insight-model";

describe("Insight preview order facts", () => {
  it("weights margin by costed sales instead of averaging percentages", () => {
    const totals = summarize(selectOrders({ personId: "marcus", period: "last-week" }));
    expect(totals).toMatchObject({ sales: 40000, profit: 10640, kpi: 9, orderCount: 3, unknownMarginCount: 0, lowSalesShare: 60 });
    expect(totals.margin).toBeCloseTo(26.6);
    expect(totals.margin).not.toBeCloseTo((42 + 38 + 18) / 3);
  });

  it("excludes unavailable costing from margin but retains sales and KPI units", () => {
    const known = { ...orders[0], sales: 100, margin: 40, kpi: 2, commission: 12 };
    const pending: InsightOrder = { ...orders[0], id: "pending", sales: 900, margin: null, tier: "unknown", kpi: 3, commission: null };
    expect(summarize([known, pending])).toMatchObject({ sales: 1000, margin: 40, profit: 40, kpi: 5, commission: 12, unknownMarginCount: 1 });
    expect(summarize([pending])).toMatchObject({ margin: null, profit: 0, unknownMarginCount: 1 });
    expect(summarize([])).toMatchObject({ sales: 0, margin: null, orderCount: 0, lowSalesShare: 0 });
    expect(summarize([{ ...known, margin: 0 }]).margin).toBe(0);
  });

  it("keeps different organizer occurrences at the same venue separate", () => {
    const mle = getFair("mv-mle-sep04")!;
    const bigHome = getFair("mv-bighome-sep11")!;
    expect(mle.venue).toBe(bigHome.venue);
    expect(mle.organizer).not.toBe(bigHome.organizer);
    const first = selectOrders({ personId: "marcus", fairId: mle.id });
    const second = selectOrders({ personId: "marcus", fairId: bigHome.id });
    expect(summarize(first).sales).toBe(40000);
    expect(summarize(second).sales).toBe(21000);
    expect(second.some((order) => first.includes(order))).toBe(false);
    expect(selectOrders({ fairId: bigHome.id, period: "last-week" })).toEqual([]);
  });

  it("combines person, date, occurrence, category, tier and search filters", () => {
    const filtered = selectOrders({ personId: "marcus", period: "last-week", fairId: "mv-mle-sep04", category: "Living", tier: "low", query: "  SO-2609-014  " });
    expect(filtered.map((order) => order.number)).toEqual(["SO-2609-014"]);
    expect(selectOrders({ personId: "marcus", query: "Big Home" }).map((order) => order.fairId)).toEqual(["mv-bighome-sep11", "mv-bighome-sep11"]);
    expect(selectOrders({ personId: "marcus", tier: "all", category: "All", fairId: "all" })).toHaveLength(5);
    expect(selectOrders({ personId: "no-such-member" })).toEqual([]);
    expect(selectOrders({ query: "no-such-order" })).toEqual([]);
  });

  it("reports KPI coverage and distinguishes averages over all orders from qualifying orders", () => {
    const sample: InsightOrder[] = [
      { ...orders[0], id: "with-three", kpi: 3, sales: 1000 },
      { ...orders[0], id: "without-first", kpi: 0, sales: 2000 },
      { ...orders[0], id: "with-one", kpi: 1, sales: 3000 },
      { ...orders[0], id: "without-second", kpi: 0, sales: 4000 },
    ];
    expect(summarizeKpi(sample)).toEqual({
      orderCount: 4, items: 4, withKpi: 2, withoutKpi: 2, coverage: 50,
      averagePerOrder: 1, averagePerKpiOrder: 2, averageSalesPerOrder: 2500,
    });
  });

  it("distinguishes zero KPI performance from unavailable averages for empty selections", () => {
    expect(summarizeKpi([{ ...orders[0], kpi: 0, sales: 0 }])).toEqual({
      orderCount: 1, items: 0, withKpi: 0, withoutKpi: 1, coverage: 0,
      averagePerOrder: 0, averagePerKpiOrder: null, averageSalesPerOrder: 0,
    });
    expect(summarizeKpi([])).toEqual({
      orderCount: 0, items: 0, withKpi: 0, withoutKpi: 0, coverage: null,
      averagePerOrder: null, averagePerKpiOrder: null, averageSalesPerOrder: null,
    });
  });

  it("filters exact KPI quantities, including zero, rather than a minimum", () => {
    expect(selectOrders({ personId: "jia", kpiQuantity: 2 }).map((order) => order.number)).toEqual(["SO-2609-003"]);
    expect(selectOrders({ personId: "jia", kpiQuantity: 3 }).map((order) => order.number)).toEqual(["SO-2609-001"]);
    expect(selectOrders({ personId: "jia", kpiQuantity: 0 }).map((order) => order.number)).toEqual(["SO-2609-006", "SO-2609-002"]);
    expect(selectOrders({ personId: "jia", kpiQuantity: undefined })).toHaveLength(6);
    expect(selectOrders({ personId: "jia", kpiQuantity: 2 }).some((order) => order.kpi === 3)).toBe(false);
  });

  it("combines KPI quantity with person, period, fair, category and search context", () => {
    const filters = { personId: "jia", period: "last-week" as const, fairId: "mv-mle-sep04", category: "Dining", kpiQuantity: 2, query: "SO-2609-003" };
    expect(selectOrders(filters).map((order) => order.number)).toEqual(["SO-2609-003"]);
    expect(selectOrders({ ...filters, personId: "marcus" })).toEqual([]);
    expect(selectOrders({ ...filters, fairId: "mv-bighome-sep11" })).toEqual([]);
    expect(selectOrders({ ...filters, category: "Bedroom" })).toEqual([]);
    expect(selectOrders({ personId: "jia", period: "last-week", kpiQuantity: 6 })).toEqual([]);
  });

  it("offers qualifying-only orders while keeping sample KPI summaries and item lines consistent", () => {
    const personal = selectOrders({ personId: "jia" });
    const qualifying = selectOrders({ personId: "jia", kpiOnly: true });
    expect(qualifying.map((order) => order.number)).toEqual(["SO-2609-005", "SO-2609-004", "SO-2609-003", "SO-2609-001"]);
    expect(selectOrders({ personId: "jia", kpiOnly: false })).toEqual(personal);
    expect(selectOrders({ personId: "jia", kpiOnly: true, kpiQuantity: 0 })).toEqual([]);
    const totals = summarizeKpi(personal);
    expect(totals).toMatchObject({ orderCount: 6, items: 12, withKpi: 4, withoutKpi: 2, averagePerOrder: 2, averagePerKpiOrder: 3 });
    expect(totals.coverage).toBeCloseTo(66.6667);
    expect(totals.averageSalesPerOrder).toBeCloseTo(50200 / 6);
    expect(totals.items).toBe(summarize(personal).kpi);
  });

  it("explains the large low-tier order with a recomputed weighted margin", () => {
    const selected = selectOrders({ personId: "marcus", period: "last-week" });
    const impact = marginImpact(selected)!;
    expect(impact.order.number).toBe("SO-2609-014");
    expect(impact.withoutMargin).toBeCloseTo(39.5);
    expect(impact.delta).toBeCloseTo(12.9);
    expect(impact.withoutMargin).toBe(summarize(selected.filter((order) => order.id !== impact.order.id)).margin);
    expect(marginImpact([])).toBeNull();
    expect(marginImpact([orders[0]])).toBeNull();
    expect(marginImpact([{ ...orders[0], margin: null }])).toBeNull();
  });

  it("finds the greatest weighted effect rather than simply the lowest percentage", () => {
    const sample: InsightOrder[] = [
      { ...orders[0], id: "tiny", sales: 10, margin: 1 },
      { ...orders[0], id: "large", sales: 10000, margin: 20 },
      { ...orders[0], id: "good", sales: 10000, margin: 40 },
    ];
    expect(marginImpact(sample)?.order.id).toBe("large");
  });

  it("ranks all fair participants and applies competition ranks to tied sales", () => {
    const rows = venueRanking("mv-mle-sep04", "last-week");
    expect(rows.map((row) => [row.personId, row.rank])).toEqual([
      ["daniel", 1], ["marcus", 2], ["sophia", 2], ["jia", 4], ["aisyah", 5], ["wei", 6],
    ]);
    for (const row of rows) {
      const totals = summarize(selectOrders({ personId: row.personId, fairId: "mv-mle-sep04", period: "last-week" }));
      expect(row).toMatchObject({ sales: totals.sales, margin: totals.margin, kpi: totals.kpi });
    }
    expect(people.map((person) => person.id)).not.toContain("daniel");
    expect(venueRanking("mv-bighome-sep11", "last-week")).toEqual([]);
    expect(venueRanking("no-such-fair")).toEqual([]);
  });

  it("keeps fixture orders inside their fair dates and KPI item totals consistent", () => {
    for (const order of orders) {
      const fair = fairs.find((entry) => entry.id === order.fairId)!;
      expect(fair).toBeDefined();
      expect(order.date >= fair.start && order.date <= fair.end).toBe(true);
      expect(order.items.filter((item) => item.kpi).reduce((total, item) => total + item.qty, 0)).toBe(order.kpi);
    }
    expect(new Set(orders.map((order) => order.number)).size).toBe(orders.length);
  });
});
