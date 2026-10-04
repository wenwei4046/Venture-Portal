import { describe, expect, it } from "vitest";
import type { MemberBand } from "@/lib/member/types";
import type { MemberBookOrder, MemberOrderBook } from "@/lib/member/order-book";
import { billGroups, billsView, brandPage, insightMain, kpiView, marginStanding, orderSheet, type InsightInput } from "./insight-model";
import { monthPeriod } from "./period";

const band = (brand: string, key: string, kind: MemberBand["kind"], threshold: number, multiplier = 1, amount = 0): MemberBand =>
  ({ brand, key, kind, threshold, multiplier, amount });
const BANDS: MemberBand[] = ["AKEMI", "ZANOTTI"].flatMap(brand => [
  band(brand, "Below margin Tier 3", "penalty", 24, 0), band(brand, "Below margin Tier 2", "penalty", 25, 0.25), band(brand, "Below margin Tier 1", "penalty", 27, 0.5),
  ...(brand === "AKEMI"
    ? [band(brand, "Low margin", "reference", 30), band(brand, "Standard margin", "reference", 33), band(brand, "Incentive Tier 1", "incentive", 36, 1, 1000), band(brand, "Incentive Tier 2", "incentive", 43, 1, 1500)]
    : [band(brand, "Standard Margin", "reference", 30), band(brand, "Incentive Tier 1", "incentive", 33, 1, 1000), band(brand, "Incentive Tier 2", "incentive", 36, 1, 1500)]),
]);

const order = (o: Partial<MemberBookOrder> & Pick<MemberBookOrder, "id">): MemberBookOrder => ({
  number: `HC-SO-2609-${o.id}`, ref: null, customer: "Mdm Lee", date: "2026-09-12", sourceMonth: "2026-09", recognitionMonth: "2026-09",
  brand: "AKEMI", booth: "AKEMI", venue: "IOI CITY MALL", fairStart: "2026-09-11", fairEnd: "2026-09-13", organiser: "MEGAHOME",
  week: "2026-09-11", revenue: 1000, margin: 40, kpiQty: 0, cleared: true, carried: false, manual: false, total: 1000, paid: 1000,
  depositNeeded: 300, lines: [{ name: "AKEMI MATT (Q)", code: "AK-Q", qty: 1, amount: 1000, goods: true, kpiQty: 0 }], ...o,
});
const book = (orders: MemberBookOrder[]): MemberOrderBook => ({
  from: "2026-09", through: "2026-09", asOf: "2026-10-04T00:00:00Z", paysFrom: "2026-09", closedMonths: [], costDivisor: 0.7, brandWeeks: {}, orders,
});
const ORDERS = [
  order({ id: "1", revenue: 1000, margin: 40 }),
  order({ id: "2", revenue: 500, margin: null }),
  order({ id: "3", brand: "ZANOTTI", booth: "ZANOTTI", revenue: 2000, margin: 35, week: "2026-09-18", fairStart: "2026-09-18", fairEnd: "2026-09-20", venue: "MVEC", organiser: "BIGHOME" }),
  order({ id: "4", brand: "AKEMI", revenue: 800, total: 800, margin: 41, cleared: false, paid: 100, depositNeeded: 240 }),
  order({ id: "5", sourceMonth: "2026-08", carried: true, week: "2026-08-28", revenue: 600, margin: 45 }),
];
const input = (over: Partial<InsightInput> = {}): InsightInput => ({
  period: monthPeriod("2026-09", "2026-10"), book: book(ORDERS), me: null, downline: [], target: { rank: "F", personal: 5000, months: 1, group: null, streak: null },
  kpi: { schemeId: "s", period: "2026-09", asOf: "2026-10-04T00:00:00Z", enabled: false, items: [], total: 0, threshold: null, hit: null },
  bands: BANDS, name: "ETHAN", title: "Revenue Specialist", ...over,
});

describe("Insight › Personal", () => {
  it("counts cleared bills only, against the target", () => {
    const vm = insightMain(input());
    expect(vm.personal.sales).toMatchObject({ amount: "RM 4,100", right: "82% of target", sub: "RM 900 to your RM 5,000 target", bar: 82 });
    expect(vm.personal.orders).toMatchObject({ value: "4", sub: "1 waiting for deposit", subAmber: true });
  });
  it("reads each brand on its own ladder and holds the incentive while a bill has no cost", () => {
    const vm = insightMain(input());
    expect(vm.personal.brands.map(b => [b.name, b.pct, b.pill])).toEqual([
      ["Akemi", "41.9%", "Cost pending"], // 1000@40 + 600@45, the 500 uncosted held out
      ["Zanotti", "35.0%", "Incentive Tier 1"], // 35 clears Zanotti's 33, not Akemi's 36
    ]);
    expect(vm.personal.notice?.body).toBe("Akemi has 1 bill without cost. Every brand must clear a tier, so Incentive Tier 1 pays once that bill is costed.");
    expect(vm.personal.kpi).toMatchObject({ value: "—", pill: "Not counted" });
  });
  it("gives Today the same reading", () => {
    const st = marginStanding(book(ORDERS), BANDS);
    expect(st.tier?.label).toBe("Incentive Tier 1");
    expect(st.held).toBe(true);
    expect(st.margin?.toFixed(1)).toBe("38.1");
  });
});

describe("Insight › My sales orders", () => {
  it("names each fair weekend by the month's Fridays, carried bills behind Earlier", () => {
    expect(billGroups(input()).map(g => [g.key, g.title, g.orders.length])).toEqual([["earlier", "Earlier", 1], ["2026-09-11", "Week 2", 3], ["2026-09-18", "Week 3", 1]]);
  });
  it("reads the deposit still to collect, and the team-cost ratio from the scheme", () => {
    const vm = billsView(input());
    expect(vm.waiting).toEqual({ amount: "RM 800", sub: "1 order · not counted yet" });
    expect(vm.waitBills[0]).toMatchObject({ pill: "Due RM 140", amtMuted: true });
    expect(vm.weeks["2026-09-11"]).toMatchObject({ brandWeek: "Akemi week", total: "RM 1,500", place: "IOI CITY MALL · MEGAHOME", dates: "11–13 Sep", stats: "2 orders · 1 waiting" });
    expect(vm.footnote).toContain("cost ÷ 0.7");
  });
  it("lets a stored brand-week pick name the week", () => {
    const vm = billsView(input({ book: { ...book(ORDERS), brandWeeks: { "2026-09-11": "ZANOTTI" } } }));
    expect(vm.tabs.find(t => t.key === "2026-09-11")?.brand).toBe("Zanotti");
  });
});

describe("Insight › KPI, brand, the order sheet", () => {
  it("says KPI is off when the scheme does not pay it", () => {
    const vm = kpiView(input(), "Fair");
    expect(vm).toMatchObject({ enabled: false, total: "—", pill: "Not counted", need: "KPI pay is off for Fair this month", orders: [] });
  });
  it("counts KPI items line by line when it pays", () => {
    const withKpi = ORDERS.map(o => o.id === "1" ? { ...o, kpiQty: 3, lines: [...o.lines, { name: "PILLOW", code: "P", qty: 3, amount: 0, goods: true, kpiQty: 3 }] } : o);
    const vm = kpiView(input({ book: book(withKpi), kpi: { schemeId: "s", period: "2026-09", asOf: "x", enabled: true, items: [], total: 3, threshold: 10, hit: false } }), "Fair");
    expect(vm).toMatchObject({ total: "3", pill: "7 to go", need: "10 needed for the threshold", above: "7 to go", orderCount: "1 order" });
    expect(vm.orders[0].items).toBe("PILLOW × 3");
  });
  it("puts the brand page's next tier on the brand's own thresholds", () => {
    const zanotti = brandPage(input(), "ZANOTTI")!;
    expect(zanotti).toMatchObject({ pct: "35.0%", tier: "Incentive Tier 1", nextTitle: "1.0% more to reach Incentive Tier 2", ladderCount: "All 6 margin tiers" });
    expect(zanotti.trio?.map(t => t.name)).toEqual(["Standard Margin", "Tier 1", "Tier 2"]);
    expect(brandPage(input(), "AKEMI")!.nextTitle).toBe("Waiting for supplier cost");
  });
  it("opens one bill line by line, without a cost", () => {
    const vm = orderSheet(input(), "4")!;
    expect(vm).toMatchObject({ status: "Deposit due RM 140", statusTone: "warn", amt: "RM 800", margin: "41.0%", tier: "Incentive Tier 1", kpi: "—" });
    expect(Object.keys(vm.lines[0])).toEqual(["name", "qty", "amt", "kpi", "isKpi"]);
  });
});
