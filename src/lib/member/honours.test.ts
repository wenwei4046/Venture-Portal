import { describe, expect, it } from "vitest";
import type { ArenaPerson, ArenaScore, ArenaTier, MemberArenaSnapshot } from "./arena";
import type { ArenaHistorySnapshot } from "./arena-history";
import { honourMonth, kpiCountedIn, monthFinishes } from "./honours";

const score = (s: Partial<ArenaScore> = {}): ArenaScore => ({ sales: 0, held: 0, orders: 0, kpiQty: 0, marginRevenue: 0, marginCost: 0, blindOrders: 0, ...s });
const person = (id: string, total: Partial<ArenaScore>, brands: Record<string, Partial<ArenaScore>> = {}): ArenaPerson => ({
  id, name: id.toUpperCase(), self: false, ...score(total), brands: Object.fromEntries(Object.entries(brands).map(([b, s]) => [b, score(s)])),
});
const tiers: ArenaTier[] = [
  { brand: "AKEMI", bandKey: "incentive_tier_1", label: "Incentive Tier 1", marginPct: 0.36, amount: 1000 },
  { brand: "AKEMI", bandKey: "incentive_tier_2", label: "Incentive Tier 2", marginPct: 0.43, amount: 1500 },
];
const people = [
  person("a", { sales: 300, orders: 2, marginRevenue: 300, marginCost: 150 }, { AKEMI: { sales: 300, orders: 2, marginRevenue: 300, marginCost: 150 } }),
  person("b", { sales: 200, orders: 1, marginRevenue: 200, marginCost: 130, blindOrders: 1 }, { AKEMI: { sales: 200, orders: 1, marginRevenue: 200, marginCost: 130, blindOrders: 1 } }),
  person("c", { sales: 100, orders: 1 }, { ZANOTTI: { sales: 100, orders: 1 } }),
  person("d", {}),
];
const snapshot = {
  membershipId: "m", department: "Fair", selfId: "a", period: "2026-09", window: "monthly", from: "2026-09-01", through: "2026-09-30",
  asOf: "2026-10-12T00:00:00Z", live: false, people, brands: [{ code: "AKEMI", name: "Akemi" }, { code: "ZANOTTI", name: "Zanotti" }],
  brandWeeks: null, tiers, final: true,
} as MemberArenaSnapshot;
const history: ArenaHistorySnapshot = {
  asOf: "2026-10-12", provisional: true, unassignedOrders: 0, unassignedSales: 0, championship: { status: "pending", reason: "" },
  events: [
    { id: "f1|AKEMI", venue: "HALL", start: "2026-09-04", end: "2026-09-06", periodMonth: "2026-09", week: "2026-09-04", brand: "AKEMI",
      people: [{ id: "a", name: "A", sales: 50, held: 0, orders: 1, scoring: true }, { id: "b", name: "B", sales: 80, held: 0, orders: 1, scoring: false }] },
    { id: "f2|ZANOTTI", venue: "HALL", start: "2026-09-11", end: "2026-09-13", periodMonth: "2026-09", week: "2026-09-11", brand: "ZANOTTI",
      people: [{ id: "c", name: "C", sales: 40, held: 0, orders: 1, scoring: true }] },
    { id: "f3|AKEMI", venue: "OLD", start: "2026-08-07", end: "2026-08-09", periodMonth: "2026-08", week: "2026-08-07", brand: "AKEMI",
      people: [{ id: "d", name: "D", sales: 900, held: 0, orders: 1, scoring: true }] },
  ],
};
const finishes = monthFinishes({ month: "2026-09", snapshot, history, kpi: { enabled: false, threshold: null } });
const of = (id: string, board?: string) => finishes.filter(f => f.staffId === id && (!board || f.board === board)).map(f => `${f.title} · ${f.sub} · ${f.place}`);

describe("monthFinishes — a final month's places, from the Arena's own boards", () => {
  it("names the month in three letters", () => {
    expect(honourMonth("2026-09")).toBe("Sep 2026");
    expect(honourMonth("2027-01")).toBe("Jan 2027");
  });

  it("places everybody who sold on the sales boards, total and by brand", () => {
    expect(of("a", "Sales")).toEqual(["Total sales · Sep 2026 · 1", "Sales · Akemi · Sep 2026 · 1"]);
    expect(of("b", "Sales")).toEqual(["Total sales · Sep 2026 · 2", "Sales · Akemi · Sep 2026 · 2"]);
    expect(of("c", "Sales")).toEqual(["Total sales · Sep 2026 · 3", "Sales · Zanotti · Sep 2026 · 1"]);
    expect(of("d")).toEqual([]);
  });

  it("leaves a margin with an uncosted bill unplaced, and KPI out while the scheme does not pay it", () => {
    expect(of("a", "Margin")).toEqual(["Total margin · Sep 2026 · 1", "Margin · Akemi · Sep 2026 · 1"]);
    expect(of("b", "Margin")).toEqual([]);
    expect(finishes.some(f => f.board === "KPI")).toBe(false);
  });

  it("ranks the Championship from the same month's points", () => {
    expect(of("a", "Championship")).toEqual(["Championship · Sep 2026 · 1"]);
    expect(finishes.filter(f => f.board === "Championship").map(f => f.staffId).sort()).toEqual(["a", "b", "c"]);
  });

  it("gives a fair finish only at the booth of the member's brand week, and keeps the place everybody there makes", () => {
    // b sold more at the Akemi booth but scores elsewhere that week: a is still 2nd there.
    expect(of("a", "Fair")).toEqual(["Fair · HALL · Week 1 · Akemi · Sep 2026 · 2"]);
    expect(of("b", "Fair")).toEqual([]);
    expect(of("c", "Fair")).toEqual(["Fair · HALL · Week 2 · Zanotti · Sep 2026 · 1"]);
    // August's fair is August's.
    expect(finishes.some(f => f.title === "Fair · OLD")).toBe(false);
  });

  it("shares a tied place on a fair board", () => {
    const tied: ArenaHistorySnapshot = { ...history, events: [{
      id: "f9|AKEMI", venue: "MVEC", start: "2026-09-18", end: "2026-09-20", periodMonth: "2026-09", week: "2026-09-18", brand: "AKEMI",
      people: [
        { id: "a", name: "A", sales: 100, held: 0, orders: 1, scoring: true },
        { id: "b", name: "B", sales: 100, held: 0, orders: 1, scoring: true },
        { id: "c", name: "C", sales: 50, held: 0, orders: 1, scoring: true },
      ],
    }] };
    const fair = monthFinishes({ month: "2026-09", snapshot, history: tied, kpi: { enabled: false, threshold: null } }).filter(f => f.board === "Fair");
    expect(fair.map(f => [f.staffId, f.place, f.sub])).toEqual([["a", 1, "Week 3 · Akemi · Sep 2026"], ["b", 1, "Week 3 · Akemi · Sep 2026"], ["c", 3, "Week 3 · Akemi · Sep 2026"]]);
  });

  it("puts KPI on the boards when the scheme pays it", () => {
    const kpiPeople = people.map(p => (p.id === "c" ? { ...p, kpiQty: 4 } : p));
    const withKpi = monthFinishes({ month: "2026-09", snapshot: { ...snapshot, people: kpiPeople }, history: null, kpi: { enabled: true, threshold: 3 } });
    expect(withKpi.filter(f => f.board === "KPI").map(f => [f.staffId, f.title, f.place])).toEqual([["c", "KPI items", 1]]);
  });

  // 2026-11-12 — 2990s follows its own commission scheme: a finish on its Sales board, and no Margin board of its own
  // ("他唯一不会出现的，只是所谓的 margin arena，但他会出现到 sales arena、brand arena").
  it("keeps a Sales finish for a brand on its own scheme, and no Margin board", () => {
    const folk = [
      person("a", { sales: 4300, marginRevenue: 300, marginCost: 150 }, { "2990S": { sales: 4000 }, AKEMI: { sales: 300, marginRevenue: 300, marginCost: 150 } }),
      person("b", { sales: 3000 }, { "2990S": { sales: 3000 } }),
    ];
    const own = monthFinishes({ month: "2026-11", history: null, kpi: { enabled: false, threshold: null },
      snapshot: { ...snapshot, people: folk, brands: [{ code: "AKEMI", name: "Akemi", ownScheme: false }, { code: "2990S", name: "2990s", ownScheme: true }] } });
    const titles = (id: string, board: string) => own.filter(f => f.staffId === id && f.board === board).map(f => `${f.title} · ${f.place}`);
    expect(titles("a", "Sales")).toEqual(["Total sales · 1", "Sales · Akemi · 1", "Sales · 2990s · 1"]);
    expect(titles("b", "Sales")).toEqual(["Total sales · 2", "Sales · 2990s · 2"]);
    expect(titles("a", "Margin")).toEqual(["Total margin · 1", "Margin · Akemi · 1"]);
    expect(own.some(f => f.title === "Margin · 2990s")).toBe(false);
  });
});

// 2026-11-12 — 2990s' own KPI items are counted whatever the sub-department's KPI switch says: a month one was in
// force keeps its KPI finishes, as the Arena showed them.
describe("kpiCountedIn — whether a month's KPI board counted", () => {
  const upgrades = [{ effective_from: "2026-11-01", effective_to: null }];
  it("counts every month while the sub-department's own switch is on", () => {
    expect(kpiCountedIn("2026-09", true, [])).toBe(true);
  });
  it("with the switch off, counts the months a brand's own item is in force on their last day", () => {
    expect(kpiCountedIn("2026-11", false, upgrades)).toBe(true);
    expect(kpiCountedIn("2027-02", false, upgrades)).toBe(true);
    // October: before the items.
    expect(kpiCountedIn("2026-10", false, upgrades)).toBe(false);
    expect(kpiCountedIn("2026-11", false, [])).toBe(false);
  });
  it("reads an item ended inside a month by that month's last day", () => {
    const ended = [{ effective_from: "2026-11-01", effective_to: "2026-12-15" }];
    expect(kpiCountedIn("2026-11", false, ended)).toBe(true);
    expect(kpiCountedIn("2026-12", false, ended)).toBe(false);
    // February's last day in a leap year.
    expect(kpiCountedIn("2028-02", false, [{ effective_from: "2028-02-29", effective_to: null }])).toBe(true);
    expect(kpiCountedIn("2027-02", false, [{ effective_from: "2027-03-01", effective_to: null }])).toBe(false);
  });
  it("counts nothing for a month it cannot read", () => {
    expect(kpiCountedIn("soon", false, upgrades)).toBe(false);
  });
});
