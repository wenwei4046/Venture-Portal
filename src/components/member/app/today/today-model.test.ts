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
  it("adds fixed salary to the month's commission so far", () => {
    const m = todayModel({ ...base, income: { period: "2026-10", status: "computed", total: 4342.5 } });
    expect(m.heroLabel).toBe("October · Estimated income");
    expect(m.heroAmount).toBe("RM 6,842.50");
    expect(m.heroSplit).toBe("Fixed salary RM 2,500.00 + commission RM 4,342.50");
  });
  it("calls a locked or applied month settled", () => {
    const m = todayModel({ ...base, income: { period: "2026-08", status: "locked", total: 100 } });
    expect(m.heroLabel).toBe("August · Settled income");
  });
  it("hides every amount when asked", () => {
    const m = todayModel({ ...base, hidden: true });
    expect(m.heroAmount).toBe("RM ••••••");
    expect(m.heroSplit).toBe("Amounts hidden");
  });
  // 2026-10-06 (user: "on live date, not showing last month"): Today is the
  // current month, worked out live — and never shows a salary-only figure
  // while that is still happening.
  it("names the current month while its commission is still being worked out", () => {
    const m = todayModel({ ...base, today: "2026-10-06", incomeStatus: "loading" });
    expect(m.heroLabel).toBe("October · Estimated income");
    expect(m.heroAmount).toBe("RM —");
    expect(m.heroSplit).toBe("Working out October's commission…");
    expect(todayModel({ ...base, today: "2026-10-06", incomeStatus: "loading", hidden: true }).heroAmount).toBe("RM ••••••");
  });
  it("says so when the month could not be worked out, rather than showing the salary alone", () => {
    const m = todayModel({ ...base, today: "2026-10-06", incomeStatus: "failed" });
    expect(m.heroAmount).toBe("RM —");
    expect(m.heroSplit).toBe("October's commission is unavailable right now");
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
  it("lists memos to acknowledge and returned requests — and no brand weeks to save (they come from the ERP, 2026-10-12)", () => {
    const m = todayModel({
      ...base,
      memos: [memo("a", "October brand weeks are open", null), memo("b", "Deposit rule reminder", null), memo("c", "Old", "2026-09-01")],
      requests: [request("2609-004", "needs_info"), request("x", "submitted")],
      arena: arena([], { weekLocks: [{ week: "2026-10-02", closesOn: "2026-10-11", locked: false }, { week: "2026-10-09", closesOn: "2026-10-18", locked: false }] }),
    });
    expect(m.todo.map(t => [t.title, t.sub])).toEqual([
      ["Acknowledge 2 memos", "October brand weeks are open · Deposit rule reminder"],
      ["Replacement needs info", "RQ-2609-004 · HR returned it"],
    ]);
  });
});

describe("This week and Your Arena", () => {
  // The week's booth (2026-10-12): where the ERP's Sales Attending lists the member — this weekend's too,
  // while its fair is still on.
  it("names this week's brand week and the booth the ERP lists them at", () => {
    const weeks = [
      { staffId: "me", week: "2026-10-02", source: "erp", brand: "ERGOTEX", fairId: "f", venue: "IOI City Mall", organizer: "Mega Home Fair", start: "2026-10-02", end: "2026-10-04", booths: 1 },
      { staffId: "other", week: "2026-10-02", source: "erp", brand: "AKEMI", fairId: "g", venue: "MID VALLEY", organizer: "BIGHOME", start: "2026-10-02", end: "2026-10-04", booths: 1 },
    ];
    const m = todayModel({ ...base, arena: arena([], {
      history: { asOf: "", provisional: true, events: [], weeks } as unknown as MemberArenaSnapshot["history"],
    }) });
    expect(m.week).toEqual({ title: "Week 1 · Ergotex week", dates: "2–4 Oct", venue: "IOI City Mall", org: "Mega Home Fair" });
  });
  it("says when this week has no brand week yet — nothing to pick, no pointer to a page", () => {
    const m = todayModel({ ...base, arena: arena([]) });
    expect(m.week).toEqual({ title: "Week 1 · No brand week yet", dates: "2–4 Oct", venue: null, org: null });
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

// 2026-10-08 (screenshot, side agent): "RM 0k · No sales yet" and a dash while loading looked exactly like a
// month with no sales, so the app seemed to never finish loading — and a real "no sales" looked like loading.
describe("loading is never mistaken for no sales", () => {
  it("while this month's figures are on their way, Sales / Margin / KPI are placeholders, not zeros", () => {
    const m = todayModel({ ...base, metricsLoading: true });
    expect(m.metrics.map(x => [x.label, x.loading, x.value, x.tag])).toEqual([["Sales", true, "", ""], ["Margin", true, "", ""], ["KPI", true, "", ""]]);
    // Once they land — even as zero sales — they say so.
    const loaded = todayModel({ ...base, metricsLoading: false, insight: block({ sales: 0 }, null) });
    expect(loaded.metrics.map(x => [x.value, x.tag])).toEqual([["RM 0k", "Counted sales"], ["—", "No sales yet"], ["0", "Below threshold"]]);
    expect(loaded.metrics.every(x => !x.loading)).toBe(true);
  });

  it("figures kept from an earlier open show while they are read again — no placeholder over them", () => {
    const m = todayModel({ ...base, metricsLoading: true, insight: block({ sales: 70_000 }, null) });
    expect(m.metrics[0].value).toBe("RM 70k");
    expect(m.metrics[0].loading).toBeFalsy();
  });

  it("the Arena boards: a placeholder while loading, \"Not ranked yet\" when there is no place", () => {
    expect(todayModel({ ...base, arenaLoading: true }).boards.map(b => b.state)).toEqual(["loading", "loading", "loading", "loading"]);
    const people = [score({ id: "a", sales: 900, marginRevenue: 900, marginCost: 500 }), score({ id: "me", self: true })];
    const m = todayModel({ ...base, arenaLoading: false, arena: arena(people) });
    expect(m.boards.map(b => b.state)).toEqual(["unranked", "unranked", "unranked", "unranked"]);
  });

  it("the income hero is a placeholder while it is worked out, never a dash", () => {
    expect(todayModel({ ...base, incomeStatus: "loading" }).heroLoading).toBe(true);
    expect(todayModel({ ...base, incomeStatus: "loading", hidden: true }).heroLoading).toBe(false);
    expect(todayModel({ ...base, income: { period: "2026-10", status: "computed", total: 10 } }).heroLoading).toBe(false);
  });
});

describe("todayModel — a Revenue Director (2026-10-14: the top of the sub-departments they direct)", () => {
  const row = (staffId: string, depth: number, over: Partial<MemberInsightBlock["me"]> = {}) => ({
    staffId, name: staffId.toUpperCase(), title: "Revenue Specialist", uplineId: depth === 1 ? "peter" : "anna", depth,
    sales: 0, held: 0, orders: 0, kpiQty: 0, marginRevenue: 0, marginCost: 0, blindOrders: 0, lastOrder: null, ...over,
  });
  const directed: MemberInsightBlock = {
    ...block({ staffId: "peter", name: "PETER", sales: 1_000, marginRevenue: 1_000, marginCost: 600, kpiQty: 1 }, null),
    title: "Revenue Director", rank: "Rank SS", director: true, target: null,
    downline: [row("anna", 1, { sales: 600_000, marginRevenue: 500_000, marginCost: 300_000, kpiQty: 10 }),
      row("ben", 2, { sales: 400_000, marginRevenue: 400_000, marginCost: 260_000, kpiQty: 5, blindOrders: 1 })],
  };
  const peter: TodayInput = { ...base, first: "PETER", title: "Revenue Director", rank: "Rank SS", team: "Fair", insight: directed };

  const team = (over: Partial<NonNullable<MemberInsightBlock["team"]>> = {}) => ({
    sales: 0, held: 0, orders: 0, kpiQty: 0, marginRevenue: 0, marginCost: 0, blindOrders: 0, ...over,
  });
  const kpiOn = { schemeId: "s", period: "2026-10", asOf: "", enabled: true, items: [], total: 1, threshold: 30, hit: false };

  it("Sales / Margin / KPI are the whole sub-department's: every bill of the month, the other director's too", () => {
    // Fair, October 2026: 170 bills, RM 930,294 — RM 23,348 of it KRIS's own, which nobody's downline holds.
    const all = { ...directed, team: team({ sales: 930_294, marginRevenue: 900_000, marginCost: 560_000, kpiQty: 37 }) };
    const m = todayModel({ ...peter, insight: all, kpi: kpiOn });
    expect(m.metrics.map(x => [x.label, x.value, x.tag])).toEqual([
      ["Sales", "RM 930.3k", "All of Fair"],
      ["Margin", "37.8%", "All of Fair"],
      ["KPI", "37", "All of Fair"],
    ]);
  });
  it("without the block's total: their own and everybody under them; a million in millions", () => {
    const m = todayModel({ ...peter, kpi: kpiOn });
    expect(m.metrics.map(x => [x.label, x.value, x.tag])).toEqual([
      ["Sales", "RM 1.00M", "All of Fair"],
      // (1,000 + 500,000 + 400,000) margin revenue, (600 + 300,000 + 260,000) cost
      ["Margin", "37.8%", "All of Fair"],
      ["KPI", "16", "All of Fair"],
    ]);
  });
  it("KPI off says so; no costed sales says why", () => {
    const m = todayModel({ ...peter, insight: { ...directed, team: team({ sales: 906_946, blindOrders: 2 }) },
      kpi: { schemeId: "s", period: "2026-10", asOf: "", enabled: false, items: [], total: 0, threshold: null, hit: null } });
    expect(m.metrics.map(x => [x.value, x.tag])).toEqual([["RM 906.9k", "All of Fair"], ["—", "Cost pending"], ["—", "Not counted"]]);
    expect(todayModel({ ...peter, insight: { ...directed, team: team() } }).metrics[1]).toMatchObject({ value: "—", tag: "No sales yet" });
  });
  it("the Arena's cards name who leads — a director is on no board", () => {
    const people = [score({ id: "anna", name: "ANNA TAN", sales: 600_000, marginRevenue: 500_000, marginCost: 300_000, kpiQty: 10 }),
      score({ id: "ben", name: "BEN", sales: 400_000, marginRevenue: 400_000, marginCost: 200_000, kpiQty: 12 })];
    const m = todayModel({ ...peter, arena: arena(people, { selfId: "peter" }) }, null, "BEN LIM");
    expect(m.boards.map(b => [b.id, b.state, b.leader])).toEqual([
      ["sales", "lead", "ANNA TAN"], ["margin", "lead", "BEN"], ["kpi", "lead", "BEN"], ["champ", "lead", "BEN LIM"],
    ]);
    expect(todayModel({ ...peter, arena: arena([], { selfId: "peter" }) }).boards.map(b => b.leader)).toEqual([undefined, undefined, undefined, undefined]);
  });
  it("no week card: a director works no booth of their own; the income stays their own", () => {
    const m = todayModel({ ...peter, arena: arena([], { selfId: "peter" }), salary: 3_000, income: { period: "2026-10", status: "computed", total: 35_000 } });
    expect(m.week).toBeNull();
    expect([m.heroLabel, m.heroAmount]).toEqual(["October · Estimated income", "RM 38,000.00"]);
    expect(m.helloSub).toContain("Revenue Director · Rank SS");
  });
  it("a member's Today is unchanged", () => {
    const m = todayModel({ ...base, insight: block({ sales: 35_000 }, 70_000) });
    expect(m.metrics[0]).toMatchObject({ value: "50%", tag: "of RM 70k" });
  });
});

describe("todayModel — a Principal viewing nobody", () => {
  it("names the department's commission as the department's, not as somebody's income", () => {
    const income = { period: "2026-10", status: "computed", total: 89460.99 };
    const m = todayModel({ ...base, first: "Principal", salary: 0, income, department: "Fair" });
    expect(m.heroLabel).toBe("October · Fair commission");
    expect(m.heroAmount).toBe("RM 89,460.99");
    expect(m.heroSplit).toBe("Everybody in Fair, before salaries · View as a member for their own");
    expect(todayModel({ ...base, income }).heroLabel).toBe("October · Estimated income");
  });
});
