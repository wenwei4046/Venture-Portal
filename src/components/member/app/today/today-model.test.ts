import { describe, expect, it } from "vitest";
import type { MemberInsightBlock, MemberMemo, MemberRequest } from "@/lib/member/types";
import type { MemberArenaSnapshot, ArenaPerson } from "@/lib/member/arena";
import { reachedTier, shortTier, thousands, todayModel, weekFriday, type TodayInput } from "./today-model";

const score = (over: Partial<ArenaPerson> = {}): ArenaPerson => ({
  id: "p", name: "P", self: false, sales: 0, held: 0, orders: 0, kpiQty: 0, marginRevenue: 0, marginCost: 0, blindOrders: 0, brands: {}, ...over,
});
const brand = (marginRevenue: number, marginCost: number, blindOrders = 0) => ({ sales: marginRevenue, held: 0, orders: 1, kpiQty: 0, marginRevenue, marginCost, blindOrders });
// Fair's real ladders: AKEMI 36/43, DUNLOP 33/36.
const tiers = [
  { brand: "AKEMI", bandKey: "incentive_tier_1", label: "Incentive Tier 1", marginPct: 0.36, amount: 1000 },
  { brand: "AKEMI", bandKey: "incentive_tier_2", label: "Incentive Tier 2", marginPct: 0.43, amount: 1500 },
  { brand: "DUNLOP", bandKey: "incentive_tier_1", label: "Incentive Tier 1", marginPct: 0.33, amount: 1000 },
  { brand: "DUNLOP", bandKey: "incentive_tier_2", label: "Incentive Tier 2", marginPct: 0.36, amount: 1500 },
];
function arena(people: ArenaPerson[], over: Partial<MemberArenaSnapshot> = {}): MemberArenaSnapshot {
  return { membershipId: "fair", department: "Fair", selfId: "me", period: "2026-10", window: "monthly", from: "2026-10-01", through: "2026-10-03",
    asOf: "2026-10-03T06:40:00Z", live: true, people, brands: [], brandWeeks: null, tiers, ...over };
}
function block(me: Partial<MemberInsightBlock["me"]>, personal: number | null): MemberInsightBlock {
  return { membershipId: "fair", schemeId: "s", department: "Fair", title: "Senior Executive", rank: "Rank B", rankSort: 1,
    me: { staffId: "me", name: "Jia Hui Tan", sales: 0, held: 0, orders: 0, kpiQty: 0, marginRevenue: 0, marginCost: 0, blindOrders: 0, lastOrder: null, ...me },
    target: { rank: "Rank A", personal, months: 1, group: null, streak: null }, boards: [], downline: [], orders: [] };
}
const base: TodayInput = {
  today: "2026-10-03", first: "Jia Hui", title: "Senior Executive", rank: "Rank B", salary: 2500, hidden: false,
  memos: [], requests: [], requestCode: r => `RQ-${r.id}`,
};

describe("small spellings", () => {
  it("writes targets the way the hero does", () => {
    expect(thousands(70000)).toBe("70k");
    expect(thousands(75500)).toBe("75.5k");
    expect(shortTier("Incentive Tier 1")).toBe("Tier 1");
  });
  it("finds the fair weekend a day belongs to (Mon–Sun weeks, named by Friday)", () => {
    expect(weekFriday("2026-10-03")).toBe("2026-10-02"); // Sat
    expect(weekFriday("2026-10-04")).toBe("2026-10-02"); // Sun
    expect(weekFriday("2026-10-05")).toBe("2026-10-09"); // Mon
    expect(weekFriday("2026-10-09")).toBe("2026-10-09"); // Fri
  });
});

describe("the income hero", () => {
  it("adds fixed salary to an unsettled month's commission", () => {
    const m = todayModel({ ...base, income: { schemeId: "s", period: "2026-09", status: "computed", personal: 0, override: 0, kpi: 0, openBill: 0, incentive: 0, group: 0, total: 4342.5, sales: 0, groupSales: 0, deferred: 0, rank: "", rate: 0, kpis: [], brands: [] } });
    expect(m.heroLabel).toBe("September · Estimated income");
    expect(m.heroAmount).toBe("RM 6,842.50");
    expect(m.heroSplit).toBe("Fixed salary RM 2,500.00 + commission RM 4,342.50");
  });
  it("calls a locked or applied month settled", () => {
    const m = todayModel({ ...base, income: { schemeId: "s", period: "2026-08", status: "locked", personal: 0, override: 0, kpi: 0, openBill: 0, incentive: 0, group: 0, total: 100, sales: 0, groupSales: 0, deferred: 0, rank: "", rate: 0, kpis: [], brands: [] } });
    expect(m.heroLabel).toBe("August · Settled income");
  });
  it("hides every amount when asked", () => {
    const m = todayModel({ ...base, hidden: true });
    expect(m.heroAmount).toBe("RM ••••••");
    expect(m.heroSplit).toBe("Amounts hidden");
  });
});

describe("Sales / Margin / KPI", () => {
  it("measures sales against the next rank's personal gate", () => {
    const m = todayModel({ ...base, insight: block({ sales: 57930 }, 70000) });
    expect(m.metrics[0]).toMatchObject({ value: "83%", tag: "of RM 70k" });
  });
  it("shows the sales themselves when the rank has no personal gate", () => {
    const m = todayModel({ ...base, insight: block({ sales: 57930 }, null) });
    expect(m.metrics[0]).toMatchObject({ value: "RM 57.9k", tag: "Counted sales" });
  });
  it("keeps the blended margin when a bill has no cost, and names the tier the costed brands reach", () => {
    const me = score({ id: "me", self: true, brands: { AKEMI: brand(10000, 6000), DUNLOP: brand(0, 0, 1) } });
    const m = todayModel({ ...base, insight: block({ marginRevenue: 10000, marginCost: 6140, blindOrders: 1 }, null), arena: arena([me]) });
    expect(m.metrics[1]).toMatchObject({ value: "38.6%", tag: "Tier 1" });
  });
  it("judges every brand on its own ladder and pays only what all of them clear", () => {
    // AKEMI 44% clears both of its tiers; DUNLOP 34% clears only its Tier 1 (33%).
    const me = score({ id: "me", self: true, brands: { AKEMI: brand(10000, 5600), DUNLOP: brand(10000, 6600) } });
    expect(reachedTier({ ...base, arena: arena([me]) })).toBe("Incentive Tier 1");
  });
  it("says Standard when no incentive tier is reached", () => {
    const me = score({ id: "me", self: true, brands: { AKEMI: brand(10000, 7000) } });
    const m = todayModel({ ...base, insight: block({ marginRevenue: 10000, marginCost: 7000 }, null), arena: arena([me]) });
    expect(m.metrics[1]).toMatchObject({ value: "30.0%", tag: "Standard" });
  });
  it("reads KPI from the KPI summary, and says so when the scheme does not count KPI", () => {
    const on = todayModel({ ...base, kpi: { schemeId: "s", period: "2026-10", asOf: "", enabled: true, items: [], total: 27, threshold: 10, hit: true } });
    expect(on.metrics[2]).toMatchObject({ value: "27", tag: "Threshold hit" });
    const off = todayModel({ ...base, kpi: { schemeId: "s", period: "2026-10", asOf: "", enabled: false, items: [], total: 0, threshold: null, hit: null } });
    expect(off.metrics[2]).toMatchObject({ value: "—", tag: "Not counted" });
  });
});

describe("Needs your action", () => {
  const memo = (id: string, title: string, ack: string | null): MemberMemo => ({ id, title, body: "", sender: "HR", publishedAt: "2026-10-02T01:00:00Z", effectiveAt: "2026-10-02", version: 1, requiresAck: true, readAt: null, acknowledgedAt: ack, departments: [] });
  const request = (id: string, status: string): MemberRequest => ({ id, kind: "replacement", title: "Replacement · Marcus Lim", status, createdAt: "2026-09-02T08:30:00Z", detail: {} });
  it("lists memos to acknowledge, returned requests and open brand weeks", () => {
    const m = todayModel({
      ...base,
      memos: [memo("a", "October brand weeks are open", null), memo("b", "Deposit rule reminder", null), memo("c", "Old", "2026-09-01")],
      requests: [request("2609-004", "needs_info"), request("x", "submitted")],
      arena: arena([], { weekLocks: [{ week: "2026-10-02", closesOn: "2026-10-11", locked: false }, { week: "2026-10-09", closesOn: "2026-10-18", locked: false }], brandWeeks: { weeks: 5, counts: { AKEMI: 1, ERGOTEX: 0, ZANOTTI: 0, DUNLOP: 0 }, picks: { "2026-10-02": "AKEMI" } } }),
    });
    expect(m.todo.map(t => [t.title, t.sub])).toEqual([
      ["Acknowledge 2 memos", "October brand weeks are open · Deposit rule reminder"],
      ["Replacement needs info", "RQ-2609-004 · HR returned it"],
      ["Save October brand weeks", "Due 18 Oct"],
    ]);
  });
});

describe("This week and Your Arena", () => {
  it("names this week's brand week and the booth it is at", () => {
    const m = todayModel({ ...base, arena: arena([], {
      brandWeeks: { weeks: 5, counts: { AKEMI: 0, ERGOTEX: 1, ZANOTTI: 0, DUNLOP: 0 }, picks: { "2026-10-02": "ERGOTEX" } },
      history: { asOf: "", provisional: true, events: [{ id: "f|ERGOTEX", fairId: "f", brand: "ERGOTEX", venue: "IOI City Mall", start: "2026-10-02", end: "2026-10-04", week: "2026-10-02", periodMonth: "2026-10", people: [], organizer: "Mega Home Fair" }] } as unknown as MemberArenaSnapshot["history"],
    }) });
    expect(m.week).toEqual({ title: "Week 1 · Ergotex week", dates: "2–4 Oct", venue: "IOI City Mall", org: "Mega Home Fair" });
  });
  it("says when this week's brand is not picked yet", () => {
    const m = todayModel({ ...base, arena: arena([]) });
    expect(m.week).toEqual({ title: "Week 1 · Brand week not picked", dates: "2–4 Oct", venue: "Pick your brand in My brand weeks", org: null });
  });
  it("ranks the person on Sales, Margin and KPI; Championship waits for its points", () => {
    const people = [
      score({ id: "a", sales: 900, kpiQty: 5, marginRevenue: 900, marginCost: 500 }),
      score({ id: "me", self: true, sales: 500, kpiQty: 9, marginRevenue: 500, marginCost: 250 }),
      score({ id: "c", sales: 100, kpiQty: 1, marginRevenue: 100, marginCost: 90 }),
    ];
    const m = todayModel({ ...base, arena: arena(people) });
    expect(m.boards.map(b => b.rankNum + b.rankSuf)).toEqual(["2nd", "1st", "1st", "—"]);
  });
});
