import { describe, expect, it } from "vitest";
import { orders, people, selectOrders, summarize } from "./insight-model";
import type { InsightOrder } from "./insight-model";
import { buildQuickInsight, personQuickInsight, quickInsightBaselineOrders, quickInsightWindow, teamQuickInsight } from "./quick-insight-model";

const jia = people.find((person) => person.id === "jia")!;
const example: InsightOrder = { ...orders[0], id: "current-example", sales: 1000, margin: 40, kpi: 1, date: "2026-09-13", tier: "tier1" };
const priorExample: InsightOrder = { ...example, id: "previous-example", date: "2026-08-13" };

describe("Monthly quick insight", () => {
  it("uses all of a person's monthly orders and the whole monthly target", () => {
    const report = personQuickInsight("jia");
    expect(report.current).toEqual({ sales: 50200, margin: 17740 / 47000 * 100, kpi: 12, orders: 6, unknownMarginCount: 1 });
    expect(report.previous).toMatchObject({ sales: 42000, kpi: 10, orders: 3, unknownMarginCount: 0 });
    expect(report.salesChangePercent).toBeCloseTo(8200 / 42000 * 100);
    expect(report.target).toBe(80000);
    expect(report.targetPercent).toBeCloseTo(62.75);
    expect(report.coverage).toBeCloseTo(4 / 6 * 100);
    expect(report.periodLabel).toContain("All venues");
    expect(report.current.sales).toBeGreaterThan(summarize(selectOrders({ personId: "jia", period: "last-week", fairId: "mv-mle-sep04" })).sales);
  });

  it("compares matching 1–13 windows and excludes later or out-of-month facts", () => {
    const report = buildQuickInsight({
      subject: jia.name, people: [jia],
      currentOrders: [example, { ...example, id: "future", date: "2026-09-14" }, { ...example, id: "prior-month", date: "2026-08-31" }],
      previousOrders: [priorExample, { ...priorExample, id: "later-aug", date: "2026-08-14" }, { ...priorExample, id: "july", date: "2026-07-31" }],
    });
    expect(report.current.sales).toBe(1000);
    expect(report.previous?.sales).toBe(1000);
    expect(report.current.orders).toBe(1);
    expect(report.previous?.orders).toBe(1);
    expect(report.salesChangePercent).toBe(0);
    expect(report.periodLabel).toBe("1–13 September 2026 · All venues");
    expect(report.comparisonLabel).toBe("vs 1–13 August 2026");
    expect(quickInsightBaselineOrders.every((order) => order.date >= quickInsightWindow.previousStart && order.date <= quickInsightWindow.previousEnd)).toBe(true);
  });

  it("aggregates the direct team using sales-weighted margins and excludes lead and venue peers", () => {
    const report = teamQuickInsight();
    expect(report.current).toMatchObject({ sales: 145000, kpi: 51, orders: 13, unknownMarginCount: 1 });
    expect(report.current.margin).toBeCloseTo(47370 / 137000 * 100);
    expect(report.previous).toMatchObject({ sales: 116000, kpi: 32, orders: 7, unknownMarginCount: 1 });
    expect(report.previous?.margin).toBeCloseTo(40800 / 108000 * 100);
    expect(report.salesChangePercent).toBe(25);
    expect(report.target).toBe(200000);
    expect(report.members?.map((person) => person.personId)).toEqual(["marcus", "aisyah", "wei"]);
    const downlineIds = new Set(["marcus", "aisyah", "wei"]);
    expect(report.lowOrders.every((entry) => downlineIds.has(entry.order.staffId))).toBe(true);
    expect(report.current.margin).not.toBeCloseTo((personQuickInsight("marcus").current.margin! + personQuickInsight("aisyah").current.margin! + personQuickInsight("wei").current.margin!) / 3);
  });

  it("bases the short team conclusion on real comparative signals", () => {
    const report = teamQuickInsight();
    expect(report.highlights.find((entry) => entry.title === "Strongest sales progress")).toMatchObject({ personId: "aisyah", tone: "positive" });
    expect(report.highlights.find((entry) => entry.title === "Margin to review")).toMatchObject({ personId: "marcus", tone: "attention" });
    expect(report.members?.find((person) => person.personId === "aisyah")?.salesChangePercent).toBeCloseTo(62.5);
    expect(report.members?.find((person) => person.personId === "marcus")?.salesChangePercent).toBeCloseTo(22);
    expect(report.members?.find((person) => person.personId === "marcus")?.marginChangePoints).toBeLessThan(-9);
    expect(report.members?.find((person) => person.personId === "wei")?.salesChangePercent).toBeLessThan(0);
    expect(report.summary).toContain("Aisyah Ahmad");
    expect(report.summary).toContain("Marcus Lee");
    expect(report.title).toBe("Sales up, margin lower");
  });

  it("excludes unknown costing from both period margins without hiding its sales or KPI items", () => {
    const report = personQuickInsight("wei");
    expect(report.current).toMatchObject({ sales: 32000, kpi: 11, unknownMarginCount: 1 });
    expect(report.current.margin).toBeCloseTo(8420 / 24000 * 100);
    expect(report.previous).toMatchObject({ sales: 34000, kpi: 10, unknownMarginCount: 1 });
    expect(report.previous?.margin).toBeCloseTo(9600 / 26000 * 100);
    expect(report.highlights.find((entry) => entry.title === "Costing coverage")?.body).toContain("1 current and 1 previous-period");
    const unknownHistory = buildQuickInsight({ subject: jia.name, people: [jia], currentOrders: [example], previousOrders: [{ ...priorExample, margin: null, tier: "unknown" }] });
    expect(unknownHistory.previous?.margin).toBeNull();
    expect(unknownHistory.marginChangePoints).toBeNull();
    expect(unknownHistory.salesChangePercent).toBe(0);
  });

  it("keeps missing history distinct from a known zero baseline and never invents growth percentages", () => {
    const missing = buildQuickInsight({ subject: jia.name, people: [jia], currentOrders: [example], previousOrders: null });
    expect(missing.previous).toBeNull();
    expect(missing.salesChangePercent).toBeNull();
    expect(missing.marginChangePoints).toBeNull();
    expect(missing.kpiChange).toBeNull();
    expect(missing.summary).toContain("unavailable");
    const zero = buildQuickInsight({ subject: jia.name, people: [jia], currentOrders: [example], previousOrders: [] });
    expect(zero.previous).toEqual({ sales: 0, margin: null, kpi: 0, orders: 0, unknownMarginCount: 0 });
    expect(zero.salesChangePercent).toBeNull();
    expect(zero.kpiChange).toBe(1);
    expect(zero.summary).toContain("percentage growth is unavailable");
  });

  it("does not present empty denominators as zero margin or KPI coverage", () => {
    const empty = buildQuickInsight({ subject: jia.name, people: [{ ...jia, target: 0 }], currentOrders: [], previousOrders: [] });
    expect(empty.current).toEqual({ sales: 0, margin: null, kpi: 0, orders: 0, unknownMarginCount: 0 });
    expect(empty.coverage).toBeNull();
    expect(empty.targetPercent).toBeNull();
    expect(empty.lowOrders).toEqual([]);
    expect(empty.highlights).toEqual([]);
    expect(empty.summary).toBe("No sales were recorded in either comparison window.");
    expect(empty.title).toBe("No sales recorded yet");
    expect(personQuickInsight("daniel").current.orders).toBe(0);
    expect(personQuickInsight("missing").target).toBeNull();
  });

  it("links only current scoped low orders and puts the greatest margin effect first", () => {
    const report = personQuickInsight("marcus");
    const first = report.lowOrders[0];
    expect(first.order.number).toBe("SO-2609-014");
    expect(first.personName).toBe("Marcus Lee");
    expect(first.sharePercent).toBeCloseTo(24000 / 61000 * 100);
    expect(first.withoutMargin).toBeCloseTo(13850 / 37000 * 100);
    expect(first.delta).toBeCloseTo(first.withoutMargin! - report.current.margin!);
    expect(report.lowOrders.every((entry) => entry.order.staffId === "marcus" && entry.order.tier === "low" && entry.order.date.startsWith("2026-09"))).toBe(true);
    const team = teamQuickInsight();
    expect(team.lowOrders[0].order.number).toBe("SO-2609-014");
    for (const entry of team.lowOrders) {
      const remaining = selectOrders().filter((order) => ["marcus", "aisyah", "wei"].includes(order.staffId) && order.id !== entry.order.id);
      expect(entry.withoutMargin).toBe(summarize(remaining).margin);
    }
  });

  it("does not invent warnings or recommendations when the observed performance is steady", () => {
    const report = buildQuickInsight({ subject: jia.name, people: [jia], currentOrders: [example], previousOrders: [priorExample] });
    expect(report.summary).toBe("Sales match the same dates last month.");
    expect(report.highlights).toEqual([]);
    expect(report.lowOrders).toEqual([]);
    const positive = personQuickInsight("aisyah");
    expect(positive.title).toBe("Growing sales and margin");
    expect(positive.lowOrders).toEqual([]);
    expect(positive.highlights.every((entry) => entry.tone !== "attention")).toBe(true);
  });
});
