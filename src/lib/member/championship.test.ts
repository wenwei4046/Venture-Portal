import { describe, expect, it } from "vitest";
import type { ArenaPerson, ArenaScore, ArenaTier } from "./arena";
import type { ArenaHistorySnapshot } from "./arena-history";
import { boardPoints, championshipMonth, championshipStandings, mainBrand, placePoints, tiedPoints } from "./championship";

const score = (s: Partial<ArenaScore> = {}): ArenaScore => ({ sales: 0, held: 0, orders: 0, kpiQty: 0, marginRevenue: 0, marginCost: 0, blindOrders: 0, ...s });
const person = (id: string, total: Partial<ArenaScore>, brands: Record<string, Partial<ArenaScore>> = {}): ArenaPerson => ({
  id, name: id.toUpperCase(), self: false, ...score(total), brands: Object.fromEntries(Object.entries(brands).map(([b, s]) => [b, score(s)])),
});
const tiers: ArenaTier[] = [
  { brand: "AKEMI", bandKey: "incentive_tier_1", label: "Incentive Tier 1", marginPct: 0.36, amount: 1000 },
  { brand: "AKEMI", bandKey: "incentive_tier_2", label: "Incentive Tier 2", marginPct: 0.43, amount: 1500 },
];

describe("placePoints", () => {
  it("follows the table: top ten, half a point less to 20th, 6.25 after", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(placePoints)).toEqual([25, 22.5, 20.5, 18.75, 17.25, 16, 15, 14, 13.25, 12.5]);
    expect(placePoints(11)).toBe(12);
    expect(placePoints(20)).toBe(7.5);
    expect(placePoints(21)).toBe(6.25);
    expect(placePoints(40)).toBe(6.25);
    expect(placePoints(0)).toBe(0);
  });

  it("averages a tie over the places it fills", () => {
    expect(tiedPoints(2, 2)).toBe(21.5); // (22.5 + 20.5) / 2
    expect(tiedPoints(10, 3)).toBe(12); // (12.5 + 12 + 11.5) / 3
    expect(tiedPoints(1, 1)).toBe(25);
  });

  it("counts each tie on the board itself", () => {
    const points = boardPoints([{ id: "a", position: 1 }, { id: "b", position: 2 }, { id: "c", position: 2 }, { id: "d", position: 4 }, { id: "e", position: null }]);
    expect(points.get("a")).toEqual({ position: 1, of: 4, points: 25 });
    expect(points.get("b")?.points).toBe(21.5);
    expect(points.get("c")?.points).toBe(21.5);
    expect(points.get("d")?.points).toBe(18.75);
    expect(points.get("e")).toEqual({ position: null, of: 4, points: 0 });
  });
});

describe("mainBrand", () => {
  it("is the brand sold most, among the brands with a board", () => {
    const p = person("a", { sales: 100 }, { AKEMI: { sales: 30 }, ZANOTTI: { sales: 50 }, UNCLASSIFIED: { sales: 90 } });
    expect(mainBrand(p, ["AKEMI", "ZANOTTI"])).toBe("ZANOTTI");
    expect(mainBrand(person("b", { sales: 5 }, { UNCLASSIFIED: { sales: 5 } }), ["AKEMI"])).toBeNull();
  });
});

describe("championshipMonth", () => {
  const people = [
    person("a", { sales: 300, marginRevenue: 300, marginCost: 150 }, { AKEMI: { sales: 300, marginRevenue: 300, marginCost: 150 } }),
    person("b", { sales: 200, marginRevenue: 200, marginCost: 130, blindOrders: 1 }, { AKEMI: { sales: 200, marginRevenue: 200, marginCost: 130, blindOrders: 1 } }),
    person("c", { sales: 100 }, { ZANOTTI: { sales: 100 } }),
    person("d", {}),
  ];
  const history: ArenaHistorySnapshot = {
    asOf: "2026-10-04", provisional: true, unassignedOrders: 0, unassignedSales: 0,
    championship: { status: "pending", reason: "" },
    events: [
      { id: "f1|AKEMI", venue: "HALL", start: "2026-09-04", end: "2026-09-06", periodMonth: "2026-09", week: "2026-09-04", brand: "AKEMI",
        people: [{ id: "a", name: "A", sales: 50, held: 0, orders: 1, scoring: true }, { id: "b", name: "B", sales: 80, held: 0, orders: 1, scoring: false }] },
      { id: "f2|ZANOTTI", venue: "HALL", start: "2026-09-11", end: "2026-09-13", periodMonth: "2026-09", week: "2026-09-11", brand: "ZANOTTI",
        people: [{ id: "c", name: "C", sales: 40, held: 0, orders: 1, scoring: true }] },
      { id: "f3|AKEMI", venue: "OLD", start: "2026-08-07", end: "2026-08-09", periodMonth: "2026-08", week: "2026-08-07", brand: "AKEMI",
        people: [{ id: "d", name: "D", sales: 900, held: 0, orders: 1, scoring: true }] },
    ],
  };
  const rows = championshipMonth({ month: "2026-09", people, brands: ["AKEMI", "ZANOTTI"], tiers, history, kpi: { enabled: false, threshold: null } });
  const row = (id: string) => rows.find(r => r.id === id)!;

  it("places everybody with sales on the sales boards", () => {
    expect(row("a").parts.totalSales).toMatchObject({ position: 1, of: 3, points: 25 });
    expect(row("c").parts.totalSales).toMatchObject({ position: 3, points: 20.5 });
    expect(row("c").parts.salesByBrand).toMatchObject({ position: 1, of: 1, points: 25, note: "Zanotti" });
  });

  it("adds the tier to a margin place, and a bill without cost leaves the margin pending", () => {
    expect(row("a").parts.marginByBrand).toMatchObject({ position: 1, place: 25, bonus: 12.5, points: 37.5 });
    expect(row("a").parts.totalMargin).toMatchObject({ position: 1, bonus: 12.5, points: 37.5 });
    expect(row("b").parts.totalMargin).toMatchObject({ position: null, points: 0, pending: true });
  });

  it("scores only the booth of the brand week, at the place it holds among everybody there", () => {
    // A sold 50 behind B's 80: second on the board, though B's place there earns B nothing.
    expect(row("a").parts.fairResults.points).toBe(22.5);
    expect(row("b").parts.fairResults.points).toBe(0);
    expect(row("c").parts.fairResults.weeks).toEqual([{ week: "2026-09-11", booth: "Zanotti · HALL", position: 1, of: 1, points: 25 }]);
  });

  it("gives nothing to a month with no sales, the record included", () => {
    expect(row("d").active).toBe(false);
    expect(row("d").total).toBe(0);
  });

  it("ranks the record as the month closes", () => {
    // D's 900 in August is the record; A's 50 and C's 40 follow.
    expect(row("a").parts.record).toMatchObject({ position: 2, points: 22.5 });
    expect(row("c").parts.record).toMatchObject({ position: 3, points: 20.5 });
  });

  it("adds months together and places the totals", () => {
    const standings = championshipStandings([rows, rows]);
    const a = standings.find(s => s.id === "a")!;
    expect(a.total).toBe(row("a").total * 2);
    expect(a.position).toBe(1);
    expect(standings.find(s => s.id === "d")!.position).toBeNull();
  });
});
