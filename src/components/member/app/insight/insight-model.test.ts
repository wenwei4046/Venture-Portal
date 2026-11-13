import { describe, expect, it } from "vitest";
import type { MemberBand, MemberDownlineRow } from "@/lib/member/types";
import type { MemberBookOrder, MemberOrderBook } from "@/lib/member/order-book";
import { billGroups, billsView, brandPage, insightMain, kpiView, marginStanding, noMarginTag, orderSheet, ownOnlyScore, type InsightInput } from "./insight-model";
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
  depositNeeded: 300, lines: [{ name: "AKEMI MATT (Q)", code: "AK-Q", qty: 1, amount: 1000, goods: true, kpiQty: 0 }], own: true, share: null, ...o,
});
const book = (orders: MemberBookOrder[]): MemberOrderBook => ({
  from: "2026-09", through: "2026-09", asOf: "2026-10-04T00:00:00Z", paysFrom: "2026-09", closedMonths: [], brandWeeks: {}, orders,
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
  it("reads the deposit still to collect, and never says how the cost is made up", () => {
    const vm = billsView(input());
    expect(vm.waiting).toEqual({ amount: "RM 800", sub: "1 order · not counted yet" });
    expect(vm.waitBills[0]).toMatchObject({ pill: "Due RM 140", amtMuted: true });
    expect(vm.weeks["2026-09-11"]).toMatchObject({ brandWeek: "Akemi week", total: "RM 1,500", place: "IOI CITY MALL · MEGAHOME", dates: "11–13 Sep", stats: "2 orders · 1 waiting" });
    // 2026-10-05 (user): the footnote said "team cost (cost ÷ 0.7)" — gone.
    expect(vm.footnote).toBe("Sales count once the deposit clears, in the bill's commission month. A bill without cost stays pending.");
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
  // 2026-11-12 — a brand on its own commission scheme (2990s) has KPI items of its own: counted whatever the
  // sub-department's KPI switch says, named by the item (the unit sits on the sofa's line), no part of its ladder.
  describe("a brand's own items", () => {
    const sofa = { name: "TELLUC-2A(LHF)", code: "TELLUC-2A(LHF)", qty: 1, amount: 1495, goods: true, kpiQty: 1 };
    const bills = [order({ id: "1", brand: "2990S", booth: "2990S", revenue: 2990, margin: null, ownScheme: true, kpiQty: 1, lines: [sofa] })];
    const fabric = { productCode: "2990S · Sofa Full Fabric", label: "Upgrade fabric", quantity: 1, brand: "2990S" };
    const latex = { productCode: "2990S · Latex Seat", label: "Upgrade latex seat", quantity: 0, brand: "2990S" };
    const off = { schemeId: "s", period: "2026-09", asOf: "x", enabled: true, items: [fabric, latex], total: 1, ladderTotal: 0, threshold: null, hit: null };

    it("counts them while the sub-department's KPI is off, with no threshold to reach", () => {
      const vm = kpiView(input({ book: book(bills), kpi: off }), "Fair");
      expect(vm).toMatchObject({ enabled: true, total: "1", pill: "No threshold", need: "No threshold this month", above: "", hit: false, orderCount: "1 order" });
      // Named by the item, not by the sofa that carries it.
      expect(vm.how?.items.map(i => [i.name, i.n])).toEqual([["Upgrade fabric", 1]]);
      expect(insightMain(input({ book: book(bills), kpi: off })).personal.kpi).toMatchObject({ value: "1", pill: "No threshold", sub: "Upgrade fabric 1" });
    });

    it("reads the sub-department's threshold against its own units alone", () => {
      const pillow = { productCode: "PIL", label: "PILLOW", quantity: 3 };
      // 4 units in all, three of them its own: a threshold of four is one short.
      const on = { ...off, items: [pillow, fabric, latex], total: 4, ladderTotal: 3, threshold: 4, hit: false };
      const vm = kpiView(input({ book: book(bills), kpi: on }), "Fair");
      expect(vm).toMatchObject({ total: "4", pill: "1 to go", above: "1 to go", hit: false });
      expect(insightMain(input({ book: book(bills), kpi: on })).personal.kpi).toMatchObject({ value: "4", pill: "1 to go · 4 needed" });
      const reached = { ...on, threshold: 3, hit: true };
      expect(kpiView(input({ book: book(bills), kpi: reached }), "Fair")).toMatchObject({ pill: "Threshold hit", above: "0 above", hit: true });
      expect(insightMain(input({ book: book(bills), kpi: reached })).personal.kpi).toMatchObject({ pill: "Hit · 3 needed" });
    });
  });
  it("puts the brand page's next tier on the brand's own thresholds", () => {
    const zanotti = brandPage(input(), "ZANOTTI")!;
    expect(zanotti).toMatchObject({ pct: "35.0%", tier: "Incentive Tier 1", nextTitle: "1.0% more to reach Incentive Tier 2", ladderCount: "All 6 margin tiers" });
    expect(zanotti.trio?.map(t => t.name)).toEqual(["Standard Margin", "Tier 1", "Tier 2"]);
    expect(brandPage(input(), "AKEMI")!.nextTitle).toBe("Waiting for supplier cost");
    expect(zanotti.footnote).toBe("Brand margin uses commissionable goods. Bed frames and accessories follow their mattress brand. Delivery and disposal are excluded.");
  });
  it("opens one bill line by line, without a cost", () => {
    const vm = orderSheet(input(), "4")!;
    expect(vm).toMatchObject({ status: "Deposit due RM 140", statusTone: "warn", amt: "RM 800", margin: "41.0%", tier: "Incentive Tier 1", kpi: "—" });
    expect(Object.keys(vm.lines[0])).toEqual(["name", "qty", "amt", "kpi", "isKpi"]);
    expect(vm).toMatchObject({ own: true, share: null });
  });
  it("says who holds a shared bill, and — somebody else's — whose it is and what of it counts for the reader (2026-10-21)", () => {
    const holders = [{ id: "lucas", name: "LUCAS", pct: 0.5, owner: true }, { id: "anthony", name: "ANTHONY", pct: 0.5, owner: false }];
    const mine = order({ id: "7", total: 4300, revenue: 2150, share: { part: 0.5, holders } });
    const theirs = order({ id: "8", total: 4300, revenue: 2150, own: false, share: { part: 0.5, holders } });
    const shared = input({ book: book([mine, theirs]) });
    expect(orderSheet(shared, "7")).toMatchObject({ amt: "RM 4,300", own: true, share: { line: "LUCAS 50% · ANTHONY 50%", sub: "Your part 50% · RM 2,150 in your sales" } });
    expect(orderSheet(shared, "8")).toMatchObject({ own: false, share: { line: "LUCAS 50% · ANTHONY 50%", sub: "LUCAS’s bill · your part 50% · RM 2,150 in your sales" } });
  });
});

// 2026-10-30 — the user, on October's RM 0 gift bills reading "No cost · Cost pending": "show, no sales. but consider
// margin negative as well. make sure in the calculation of monthly". The server works the margins out, the gift's cost
// in them; no bill carries a cost.
describe("Insight › a bill with no sales", () => {
  const gift = (o: Partial<MemberBookOrder> & Pick<MemberBookOrder, "id">) => order({
    revenue: 0, total: 0, paid: 0, depositNeeded: 0, margin: null, noSales: true,
    lines: [{ name: "PILLOW", code: "P", qty: 1, amount: 0, goods: true, kpiQty: 0 }], ...o,
  });
  const zanotti = { brand: "ZANOTTI", booth: "ZANOTTI" };
  const sold = order({ id: "1", ...zanotti, revenue: 2000, margin: 40 });
  // The server's margins: Zanotti's pillow brings 40% down to 35%.
  const withGift = { ...book([sold, gift({ id: "2", ...zanotti }), gift({ id: "3", ...zanotti, noSales: false })]),
    margins: { overall: 35, brands: { ZANOTTI: 35 } } };

  it("reads the month's margin from the server, the gift's cost in it", () => {
    const vm = insightMain(input({ book: { ...withGift, orders: withGift.orders.slice(0, 2) } }));
    expect(vm.personal.brands.map(b => [b.name, b.pct, b.pill])).toEqual([["Zanotti", "35.0%", "Incentive Tier 1"]]);
    expect(vm.personal.overall).toBe("35.0% overall");
    expect(marginStanding({ ...withGift, orders: withGift.orders.slice(0, 2) }, BANDS)).toMatchObject({ margin: 35, held: false, blind: 0 });
  });
  it("calls the gift No sales — never Cost pending — and a gift still uncosted Cost pending", () => {
    const vm = billsView(input({ book: withGift }));
    const pills = Object.fromEntries(vm.weeks["2026-09-11"].bills.map(b => [b.id, b.pill]));
    expect(pills).toEqual({ "1": "40.0%", "2": "No sales", "3": "Cost pending" });
    expect(orderSheet(input({ book: withGift }), "2")).toMatchObject({ margin: "—", tier: "No sales" });
  });
  it("puts a gift at the foot of its brand's ladder, below every bill that sold", () => {
    const page = brandPage(input({ book: { ...withGift, orders: withGift.orders.slice(0, 2) } }), "ZANOTTI")!;
    // The page lists the lowest first.
    expect(page.orders.map(o => [o.id, o.pct, o.tier])).toEqual([["2", "No sales", "Below margin Tier 3"], ["1", "40.0%", "Incentive Tier 2"]]);
  });
  // HC-SO-2610-096: Zanotti sold, an Akemi item given away on its own — the run's rule: every brand must clear a tier.
  it("reaches no tier while a brand was given away and never sold", () => {
    const akemiGift = gift({ id: "4" });
    const st = marginStanding({ ...book([sold, akemiGift]), margins: { overall: 32, brands: { ZANOTTI: 40, AKEMI: null } } }, BANDS);
    expect([st.margin, st.tier, st.held]).toEqual([32, null, false]);
    const vm = insightMain(input({ book: { ...book([sold, akemiGift]), margins: { overall: 32, brands: { ZANOTTI: 40, AKEMI: null } } } }));
    expect(vm.personal.brands.map(b => [b.name, b.pct, b.pill, b.tone])).toEqual([
      ["Zanotti", "40.0%", "Incentive Tier 2", "good"], ["Akemi", "—", "No sales", "bad"],
    ]);
  });
  it("a gift that cost nothing names no brand among the margins, and holds back no tier", () => {
    const st = marginStanding({ ...book([sold, gift({ id: "5" })]), margins: { overall: 40, brands: { ZANOTTI: 40 } } }, BANDS);
    expect(st.tier?.label).toBe("Incentive Tier 2");
  });
  it("an answer from before the server said which bills have no sales reads as it always did", () => {
    const old = order({ id: "6", ...zanotti, revenue: 0, total: 0, margin: null });
    expect(billsView(input({ book: book([sold, old]) })).weeks["2026-09-11"].bills.map(b => b.pill)).toEqual(["40.0%", "Cost pending"]);
  });
});

// The Principal viewing nobody (2026-10-25 — a salesperson's note the user passed on: "直接 show 全部人的单 … 或者点按过去看
// 全部人的"): everybody's bills, each naming its salesperson; everybody on the team, a tap viewing them.
describe("Insight › the whole sub-department", () => {
  const seller = (id: string, name: string) => ({ own: false, seller: { id, name } });
  const ALL = [
    order({ id: "1", revenue: 1000, margin: 40, ...seller("lucas", "LUCAS TAN") }),
    order({ id: "2", revenue: 500, margin: null, customer: "", ...seller("shawn", "SHAWN") }),
    order({ id: "3", brand: "ZANOTTI", booth: "ZANOTTI", revenue: 2000, margin: 35, venue: "IOI CITY MALL", ...seller("yuny", "YUNY") }),
    order({ id: "4", revenue: 800, total: 800, margin: 41, cleared: false, paid: 100, depositNeeded: 240, venue: "MVEC", own: false, seller: null }),
  ];
  const row = (staffId: string, name: string, sales: number, kpiQty = 0) =>
    ({ staffId, name, title: "Team Leader", uplineId: null, depth: 1, sales, held: 0, orders: 1, kpiQty, marginRevenue: sales, marginCost: sales * 0.6, blindOrders: 0, lastOrder: null });
  const whole = (over: Partial<InsightInput> = {}) => input({
    book: book(ALL), whole: "Fair", target: null, canView: new Set(["lucas", "yuny"]),
    me: { staffId: "", sales: 0, held: 0, orders: 0, kpiQty: 0, marginRevenue: 0, marginCost: 0, blindOrders: 0, lastOrder: null },
    downline: [row("yuny", "YUNY", 2000, 4), row("lucas", "LUCAS TAN", 1000, 1), row("kris", "KRIS", 500)],
    ...over,
  });

  it("the first tab is every bill added up, nothing held against a person's tier", () => {
    const vm = insightMain(whole());
    expect(vm.personal.sales).toMatchObject({ amount: "RM 3,500", right: "Counted sales", bar: null, sub: "3 orders · RM 800 waiting for deposit" });
    expect(vm.personal.notice).toBeNull();
    expect(vm.personal.brands.map(b => b.name)).toEqual(["Zanotti", "Akemi"]);
  });
  it("the team is everybody, with no \"you\" — a tap views those View as can open", () => {
    const vm = insightMain(whole());
    expect(vm.team.rows.map(r => [r.name, r.sales, r.open ?? false])).toEqual([["YUNY", "RM 2,000", true], ["LUCAS TAN", "RM 1,000", true], ["KRIS", "RM 500", false]]);
    expect(vm.team.members).toEqual({ value: "3", sub: "Everybody in Fair" });
    expect(vm.team.sales.amount).toBe("RM 3,500");
  });
  it("counts everybody's KPI items, never against a person's threshold", () => {
    const kpi = { schemeId: "s", period: "2026-09", asOf: "x", enabled: true, items: [], total: 5, threshold: 30, hit: null };
    expect(insightMain(whole({ kpi })).personal.kpi).toMatchObject({ value: "5", pill: "All of Fair", pillTone: "neutral" });
    expect(kpiView(whole({ kpi }), "Fair")).toMatchObject({ total: "5", pill: "All of Fair", hit: false, marker: null, need: "Every KPI item sold in Fair", above: "" });
    // …while the team says who hit their own.
    expect(insightMain(whole({ kpi })).team.kpiHit).toEqual({ value: "0 of 3", sub: "3 still pending" });
  });
  it("each bill names its salesperson; a week is every booth's", () => {
    const vm = billsView(whole());
    expect(vm.weeks["2026-09-11"].bills.map(b => b.sub)).toEqual([
      "LUCAS TAN · Mdm Lee · 1 line", "SHAWN · Walk-in · 1 line", "YUNY · Mdm Lee · 1 line", "No salesperson · Mdm Lee · 1 line",
    ]);
    expect(vm.waitBills[0].sub).toBe("No salesperson · Mdm Lee · Week 2 · MVEC");
    // Akemi and Zanotti at IOI City Mall, Akemi at MVEC.
    expect(vm.tabs.find(t => t.key === "2026-09-11")).toMatchObject({ brand: "3 booths" });
    expect(vm.weeks["2026-09-11"]).toMatchObject({ brandWeek: "All of Fair", place: "3 booths · IOI CITY MALL · MVEC" });
    expect(orderSheet(whole(), "1")).toMatchObject({ cust: "LUCAS TAN · Mdm Lee" });
  });
});

// Insight › My team › a person (2026-11-03 — the user, over STANLEY's Team members: "i need them can press their team
// member than can view their order as well like this").
describe("Insight › My team › a person", () => {
  const row = (staffId: string, name: string, sales: number, depth = 1) =>
    ({ staffId, name, title: "Revenue Specialist", uplineId: null, depth, sales, held: 0, orders: 1, kpiQty: 0, marginRevenue: sales, marginCost: sales * 0.6, blindOrders: 0, lastOrder: null });
  const me = { staffId: "stanley", sales: 900, held: 0, orders: 1, kpiQty: 0, marginRevenue: 900, marginCost: 600, blindOrders: 0, lastOrder: null };

  // 2026-11-14 — one figure for two ladders: My team's KPI hit reads the sub-department's threshold against each
  // person's own units — a brand's own (2990s') taken out, from the same month's Arena; the reader's from their summary.
  it("reads My team's KPI hit against the sub-department's own units", () => {
    const kpiRow = (staffId: string, name: string, kpiQty: number) => ({ ...row(staffId, name, 1000), kpiQty });
    const pillow = { productCode: "PIL", label: "PILLOW", quantity: 6 };
    const fabric = { productCode: "2990S · Sofa Full Fabric", label: "Upgrade fabric", quantity: 5, brand: "2990S" };
    const kpi = { schemeId: "s", period: "2026-09", asOf: "x", enabled: true, items: [pillow, fabric], total: 11, ladderTotal: 6, threshold: 10, hit: false };
    const at = (ownSchemeKpi?: Map<string, number>) => insightMain(input({ me: { ...me, kpiQty: 11 }, name: "STANLEY", kpi,
      downline: [kpiRow("lucas", "LUCAS", 12), kpiRow("ethan", "ETHAN", 11)], ...(ownSchemeKpi ? { ownSchemeKpi } : {}) })).team;
    const vm = at(new Map([["ethan", 5], ["lucas", 0]]));
    expect(vm.rows.map(r => [r.name, r.meta.endsWith("KPI hit")])).toEqual([["ETHAN", false], ["LUCAS", true], ["STANLEY (you)", false]]);
    expect(vm.kpiHit).toEqual({ value: "1 of 3", sub: "2 still pending" });
    // Without the Arena's per-brand units: every unit for the team, as before; the reader's own still from their summary.
    expect(at().rows.map(r => [r.name, r.meta.endsWith("KPI hit")])).toEqual([["ETHAN", true], ["LUCAS", true], ["STANLEY (you)", false]]);
  });

  it("a member's My team opens everybody it lists — never the member's own row", () => {
    const vm = insightMain(input({ me, name: "STANLEY", downline: [row("lucas", "LUCAS", 2000), row("james", "JAMES SEOW", 1500, 2)],
      canView: new Set(["lucas", "james"]) }));
    expect(vm.team.rows.map(r => [r.name, r.open ?? false])).toEqual([["LUCAS", true], ["JAMES SEOW", true], ["STANLEY (you)", false]]);
    // Without the set (the preview, or before a tap can open anybody) nobody opens.
    expect(insightMain(input({ me, downline: [row("lucas", "LUCAS", 2000)] })).team.rows.some(r => r.open)).toBe(false);
  });

  it("their book reads as theirs: KPI, the brand's next tier and a shared bill name them, never \"you\"", () => {
    const withKpi = ORDERS.map(o => o.id === "1" ? { ...o, kpiQty: 3, lines: [...o.lines, { name: "PILLOW", code: "P", qty: 3, amount: 0, goods: true, kpiQty: 3 }] } : o);
    const kpi = { schemeId: "s", period: "2026-09", asOf: "x", enabled: true, items: [], total: 3, threshold: 10, hit: false };
    expect(kpiView(input({ book: book(withKpi), kpi, of: "JAMES" }), "Fair").how?.title).toBe("How JAMES reached 3");
    expect(kpiView(input({ book: book(withKpi), kpi }), "Fair").how?.title).toBe("How you reached 3");

    const top = brandPage(input({ book: book([order({ id: "9", brand: "ZANOTTI", booth: "ZANOTTI", revenue: 2000, margin: 37 })]), of: "JAMES" }), "ZANOTTI")!;
    expect(top.nextSub).toBe("JAMES is 1.0% above Incentive Tier 2. Keep new orders at 36% or more to hold it.");

    const holders = [{ id: "lucas", name: "LUCAS", pct: 0.5, owner: true }, { id: "james", name: "JAMES SEOW", pct: 0.5, owner: false }];
    const shared = input({ of: "JAMES", book: book([
      order({ id: "7", total: 4300, revenue: 2150, share: { part: 0.5, holders } }),
      order({ id: "8", total: 4300, revenue: 2150, own: false, share: { part: 0.5, holders } }),
    ]) });
    expect(orderSheet(shared, "7")?.share?.sub).toBe("JAMES’s part 50% · RM 2,150 in JAMES’s sales");
    expect(orderSheet(shared, "8")?.share?.sub).toBe("LUCAS’s bill · JAMES’s part 50% · RM 2,150 in JAMES’s sales");
  });
});

// 2026-11-07, the user, of an old bill topped up: "i want can view, then mention no count in sales target (arena)".
describe("Insight › an old bill topped up", () => {
  // As the server sends it: in the month its top-up came in (its sourceMonth and recognitionMonth), not carried, dated
  // and weeked by its own fair months before.
  const old = order({ id: "9", number: "ZNT4813", week: "2026-03-13", date: "2026-03-10", fairStart: "2026-03-13", fairEnd: "2026-03-15",
    revenue: 6000, total: 6000, margin: 10, kpiQty: 3, commissionOnly: true, soldBy: "JUNIE TAN" });
  const withOld = input({ book: book([...ORDERS, old]) });

  it("counts in none of the member's sales, orders, brands or margin", () => {
    expect(insightMain(withOld).personal).toEqual(insightMain(input()).personal);
    expect(marginStanding(book([...ORDERS, old]), BANDS)).toEqual(marginStanding(book(ORDERS), BANDS));
  });

  it("is listed with the carried-in bills, muted, and says it counts in nothing but commission", () => {
    const vm = billsView(withOld);
    // No week of its own (its March fair's): with the bills from earlier months.
    expect(vm.tabs.map(t => t.key)).toEqual(billsView(input()).tabs.map(t => t.key));
    expect(vm.counted).toEqual(billsView(input()).counted);
    expect(vm.waiting).toEqual(billsView(input()).waiting);
    const row = vm.weeks.earlier.bills.find(b => b.no === "ZNT4813");
    expect(row).toMatchObject({ pill: "Commission only", amtMuted: true, kpiText: null, sub: "Mdm Lee · Not in sales · target · Arena" });
    expect(vm.weeks.earlier.stats).toMatch(/ · 1 old bill$/);
  });

  it("opens on whose bill it was, that it pays commission only, and its margin — which cuts that commission as any bill's", () => {
    expect(orderSheet(withOld, "9")).toMatchObject({
      status: "Commission only", statusTone: "neutral", margin: "10.0%", tier: "Below margin Tier 3", kpi: "—",
      oldBill: { line: "JUNIE TAN’s bill · Mar 2026", sub: "Pays you commission only. Not counted in your sales, your target or the Arena." },
    });
    expect(orderSheet(input({ book: book([old]), of: "SHAWN" }), "9")?.oldBill?.sub)
      .toBe("Pays SHAWN commission only. Not counted in SHAWN’s sales, SHAWN’s target or the Arena.");
    expect(orderSheet(withOld, "1")?.oldBill).toBeNull();
  });

  it("is no KPI order", () => {
    const on = { kpi: { ...input().kpi!, enabled: true } };
    expect(kpiView(input({ ...on, book: book([...ORDERS, old]) }), "Fair").orders.map(o => o.no)).not.toContain("ZNT4813");
  });
});

// 2026-11-07, the user: "Sales Order 那边会显示完整 full figure，但会多一个 remark 特别显示出来，注明算他的 amount 是 5,000 块
// （类似 'Calculated in Arena' 这样的标签）" — for a shared bill, and for one whose margin cuts its commission.
describe("Insight › the whole bill, and what of it counts", () => {
  it("lists a shared bill at its whole, with what counts for the reader beside it", () => {
    const shared = order({ id: "7", revenue: 5000, total: 10000, fullRevenue: 10000, share: { part: 0.5, holders: [] } });
    const row = billsView(input({ book: book([shared]) })).weeks["2026-09-11"].bills[0];
    expect(row).toMatchObject({ amt: "RM 10,000", arena: "Arena RM 5,000" });
  });

  it("says so for a bill its margin cuts, on its row and its sheet", () => {
    const cut = order({ id: "8", revenue: 2500, total: 10000, fullRevenue: 10000, weight: 0.25, margin: 24.5 });
    const vm = input({ book: book([cut]) });
    expect(billsView(vm).weeks["2026-09-11"].bills[0]).toMatchObject({ amt: "RM 10,000", arena: "Arena RM 2,500" });
    expect(orderSheet(vm, "8")?.arena).toEqual({ line: "RM 2,500 counted", sub: "Margin cut · 25% of its commission and its sales" });
  });

  it("says nothing of a bill that counts whole, or of an answer from before the server knew", () => {
    const whole = order({ id: "9", revenue: 1000, fullRevenue: 1000 });
    const before = order({ id: "10", revenue: 1000 });
    for (const o of [whole, before]) {
      expect(billsView(input({ book: book([o]) })).weeks["2026-09-11"].bills[0]).toMatchObject({ amt: "RM 1,000", arena: null });
      expect(orderSheet(input({ book: book([o]) }), o.id)?.arena).toBeNull();
    }
  });
});

// 2026-11-12 — 2990s follows its own commission scheme (the user: "依然算作 Fair 的 revenue … 唯一不同的是看不到 margin";
// "他唯一不会出现的，只是所谓的 margin arena，但他会出现到 sales arena、brand arena"). The server flags such a bill
// `ownScheme`: its margin is null for good and its brand is among no margins.
describe("Insight › a bill of a brand on its own scheme", () => {
  const own = (o: Partial<MemberBookOrder> & Pick<MemberBookOrder, "id">) => order({
    number: `2990-SO-2609-${o.id}`, brand: "2990S", booth: "2990S", margin: null, noSales: false, ownScheme: true,
    lines: [{ name: "2990 SOFA", code: "2990-SF-01", qty: 1, amount: o.revenue ?? 1000, goods: true, kpiQty: 0 }], ...o,
  });
  const akemi = order({ id: "1", revenue: 2000, margin: 40 });
  const mixed = { ...book([akemi, own({ id: "2", revenue: 3990, total: 4240 }), own({ id: "3", revenue: 3240, total: 3240, cleared: false, paid: 500, depositNeeded: 972 })]),
    margins: { overall: 40, brands: { AKEMI: 40 } } };

  it("counts it in the sales and the orders — and in no margin, nor among the bills waiting for a cost", () => {
    const vm = insightMain(input({ book: mixed }));
    expect(vm.personal.sales.amount).toBe("RM 5,990");
    expect(vm.personal.orders).toMatchObject({ value: "2", sub: "1 waiting for deposit" });
    // Margin by brand lists the brands a margin is read on: 2990s is no row of it.
    expect(vm.personal.brands.map(b => [b.name, b.pct, b.pill])).toEqual([["Akemi", "40.0%", "Incentive Tier 1"]]);
    expect(vm.personal.overall).toBe("40.0% overall");
    expect(vm.personal.notice).toBeNull();
    expect(marginStanding(mixed, BANDS)).toMatchObject({ margin: 40, held: false, blind: 0 });
    expect(marginStanding(mixed, BANDS).tier?.label).toBe("Incentive Tier 1");
  });
  it("says Own scheme where its margin would be — never Cost pending — and its deposit as any bill's", () => {
    const vm = billsView(input({ book: mixed }));
    const pills = Object.fromEntries(vm.weeks["2026-09-11"].bills.map(b => [b.id, b.pill]));
    expect(pills).toEqual({ "1": "40.0%", "2": "Own scheme", "3": "Due RM 472" });
    expect(orderSheet(input({ book: mixed }), "2")).toMatchObject({ amt: "RM 4,240", margin: "—", tier: "Own scheme", status: "Deposit cleared" });
  });
  // Found on production the day it went live: ETHAN's November — six 2990s bills, RM 21,200 — read "No sales yet" where
  // its margin would be, on Today and on Insight, beside the sales themselves.
  it("with nothing else sold, the month says Own scheme where its margin would be — never No sales yet — and nothing is held", () => {
    const only = { ...book([own({ id: "2", revenue: 3990 })]), margins: { overall: null, brands: {} } };
    const vm = insightMain(input({ book: only }));
    expect([vm.personal.sales.amount, vm.personal.brands, vm.personal.overall, vm.personal.notice]).toEqual(["RM 3,990", [], "Own scheme", null]);
    expect(vm.personal.ownOnly).toBe(true);
    expect(marginStanding(only, BANDS)).toMatchObject({ margin: null, tier: null, held: false, blind: 0, ownOnly: true });
    // No brand page is its: the page opens on a brand a margin is read on, or on none.
    expect(brandPage(input({ book: only }), "2990S")).toBeNull();
  });
  it("still says No sales yet of a month with no bill, and Cost pending while another bill waits for its cost", () => {
    const none = insightMain(input({ book: { ...book([]), margins: { overall: null, brands: {} } } }));
    expect([none.personal.overall, none.personal.ownOnly]).toEqual(["No sales yet", false]);
    const waits = { ...book([order({ id: "1", revenue: 2000, margin: null, noSales: false }), own({ id: "2", revenue: 3990 })]), margins: { overall: null, brands: {} } };
    const vm = insightMain(input({ book: waits }));
    expect([vm.personal.overall, vm.personal.ownOnly]).toEqual(["Cost pending", false]);
    expect(marginStanding(waits, BANDS)).toMatchObject({ blind: 1, ownOnly: false });
    // The sums a board carries say the same of a person: sold, in no margin, nothing waited for.
    expect(noMarginTag(false, ownOnlyScore({ sales: 21200, marginRevenue: 0, marginCost: 0, blindOrders: 0 }))).toBe("Own scheme");
    expect(noMarginTag(false, ownOnlyScore({ sales: 0, marginRevenue: 0, marginCost: 0, blindOrders: 0 }))).toBe("No sales yet");
    // A gift that cost something is a cost against the month, not a scheme of its own.
    expect(noMarginTag(false, ownOnlyScore({ sales: 300, marginRevenue: 0, marginCost: 120, blindOrders: 0 }))).toBe("No sales yet");
    expect(noMarginTag(true, ownOnlyScore({ sales: 300, marginRevenue: 0, marginCost: 0, blindOrders: 1 }))).toBe("Cost pending");
  });
  it("names it on My team's row of somebody whose month is all the brand's", () => {
    const row = (name: string, score: Partial<MemberDownlineRow> = {}): MemberDownlineRow => ({
      staffId: name, name, title: "Revenue Specialist", uplineId: null, depth: 1,
      sales: 0, held: 0, orders: 0, kpiQty: 0, marginRevenue: 0, marginCost: 0, blindOrders: 0, lastOrder: null, ...score,
    });
    const vm = insightMain(input({ book: mixed, downline: [row("ETHAN", { sales: 21200, orders: 6 }), row("ESTHER"), row("SHELDON", { sales: 9480, marginRevenue: 2000, marginCost: 1200 })] }));
    expect(Object.fromEntries(vm.team.rows.filter(r => !r.mine).map(r => [r.name, r.meta.split(" · ")[0]]))).toEqual({ ETHAN: "Own scheme", ESTHER: "No sales yet", SHELDON: "40.0%" });
  });
});
