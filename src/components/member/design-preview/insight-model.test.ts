import { describe, expect, it } from "vitest";
import { brands, fairs, getFair, marginImpact, orders, people, selectOrders, summarize, summarizeBrandMargins, summarizeKpi, venueRanking } from "./insight-model";
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

  it("filters canonical brands independently from the compatible category filter", () => {
    expect(brands).toEqual(["Akemi", "Zanotti"]);
    const personal = selectOrders({ personId: "jia" });
    const zanotti = selectOrders({ personId: "jia", brand: "Zanotti" });
    expect(zanotti.map((order) => order.number)).toEqual(["SO-2609-006", "SO-2609-005", "SO-2609-003", "SO-2609-002"]);
    expect(new Set(zanotti.map((order) => order.category))).toEqual(new Set(["Living", "Dining"]));
    expect(selectOrders({ personId: "jia", category: "Living" })).toHaveLength(2);
    expect(selectOrders({ personId: "jia", brand: "Zanotti", category: "Dining" }).map((order) => order.number)).toEqual(["SO-2609-006", "SO-2609-003"]);
    expect(selectOrders({ personId: "jia", brand: "Bedroom" })).toEqual([]);
    expect(selectOrders({ personId: "jia", brand: "akemi" })).toEqual([]);
    for (const brand of [undefined, "", "all", "All"]) expect(selectOrders({ personId: "jia", brand })).toEqual(personal);
  });

  it("keeps brand selection intersected with member, period, fair, tier, KPI and search scope", () => {
    const filters = { personId: "jia", period: "last-week" as const, fairId: "mv-mle-sep04", brand: "Zanotti", tier: "tier1" as const, kpiQuantity: 2, query: "SO-2609-003" };
    expect(selectOrders(filters).map((order) => order.number)).toEqual(["SO-2609-003"]);
    expect(selectOrders({ ...filters, personId: "marcus" })).toEqual([]);
    expect(selectOrders({ ...filters, fairId: "mv-bighome-sep11" })).toEqual([]);
    expect(selectOrders({ ...filters, brand: "Akemi" })).toEqual([]);
    expect(selectOrders({ ...filters, tier: "low" })).toEqual([]);
    expect(selectOrders({ personId: "jia", brand: "Akemi", fairId: "mv-bighome-sep11", period: "last-week" })).toEqual([]);
    expect(selectOrders({ personId: "jia", brand: "Zanotti", kpiOnly: true }).map((order) => order.number)).toEqual(["SO-2609-005", "SO-2609-003"]);
  });

  it("groups by actual brand and uses each brand's weighted order totals", () => {
    const selected = selectOrders({ personId: "jia" });
    const rows = summarizeBrandMargins(selected);
    expect(rows.map((row) => row.brand)).toEqual(["Akemi", "Zanotti"]);
    expect(rows[0]).toMatchObject({ brand: "Akemi", sales: 26000, profit: 11200, orderCount: 2, tier: "tier2", unknownMarginCount: 0 });
    expect(rows[0].margin).toBeCloseTo(11200 / 26000 * 100);
    expect(rows[0].margin).not.toBe(43); // Unequal order sales: not the mean of42% and44%.
    expect(rows[1]).toMatchObject({ brand: "Zanotti", sales: 24200, profit: 6540, orderCount: 4, tier: "unknown", unknownMarginCount: 1 });
    expect(rows[1].margin).toBeCloseTo(6540 / 21000 * 100);
    for (const row of rows) expect(row).toMatchObject(summarize(selectOrders({ personId: "jia", brand: row.brand })));
    expect(summarizeBrandMargins([...selected].reverse())).toEqual(rows);
  });

  it("does not award a brand tier from incomplete margins and uses inclusive demo boundaries", () => {
    const high: InsightOrder = { ...orders[0], sales: 100, margin: 45 };
    const pending: InsightOrder = { ...orders[0], id: "pending", sales: 900, margin: null, tier: "unknown" };
    expect(summarizeBrandMargins([high, pending])[0]).toMatchObject({ margin: 45, unknownMarginCount: 1, tier: "unknown" });
    expect(summarizeBrandMargins([pending])[0]).toMatchObject({ margin: null, unknownMarginCount: 1, tier: "unknown" });
    for (const [margin, tier] of [[43, "tier2"], [42.99, "tier1"], [36, "tier1"], [35.99, "standard"], [33, "standard"], [32.99, "low"], [0, "low"]] as const) {
      expect(summarizeBrandMargins([{ ...high, margin }])[0]).toMatchObject({ margin, tier, unknownMarginCount: 0 });
    }
    expect(summarizeBrandMargins([{ ...high, sales: 0 }])[0]).toMatchObject({ margin: null, tier: "unknown" });
    expect(summarizeBrandMargins([])).toEqual([]);
  });

  it("summarizes only the selected member and dated fair without adding absent brands", () => {
    const first = summarizeBrandMargins(selectOrders({ personId: "jia", period: "last-week", fairId: "mv-mle-sep04" }));
    expect(first[0]).toMatchObject({ brand: "Akemi", sales: 12000, margin: 42, tier: "tier1" });
    expect(first[1]).toMatchObject({ brand: "Zanotti", sales: 14000, tier: "standard", unknownMarginCount: 0 });
    expect(first[1].margin).toBeCloseTo(5000 / 14000 * 100);
    const marcus = summarizeBrandMargins(selectOrders({ personId: "marcus", period: "last-week", brand: "Zanotti" }));
    expect(marcus).toHaveLength(1);
    expect(marcus[0]).toMatchObject({ brand: "Zanotti", sales: 34000, profit: 8120, tier: "low" });
    expect(marcus[0].margin).toBeCloseTo(8120 / 34000 * 100);
    expect(summarizeBrandMargins(selectOrders({ personId: "jia", fairId: "mv-bighome-sep11", period: "last-week" }))).toEqual([]);
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
