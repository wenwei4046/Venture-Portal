import { describe, expect, it } from "vitest";
import type { MemberInsightBlock, MemberMemo, MemberRequest } from "@/lib/member/types";
import type { MemberArenaSnapshot, ArenaPerson } from "@/lib/member/arena";
import { memberPay, salaryFromSchedule } from "@/lib/member/income-pay";
import { amountParts, reachedTier, shortTier, thousands, todayModel, weekFriday, type TodayInput } from "./today-model";
import { shareRequestFromRow } from "@/lib/member/share-requests";

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
    expect(m.heroAmount).toBe("RM ••••");
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
    expect(todayModel({ ...base, today: "2026-10-06", incomeStatus: "loading", hidden: true }).heroAmount).toBe("RM ••••");
  });
  it("says so when the month could not be worked out, rather than showing the salary alone", () => {
    const m = todayModel({ ...base, today: "2026-10-06", incomeStatus: "failed" });
    expect(m.heroAmount).toBe("RM —");
    expect(m.heroSplit).toBe("October's commission is unavailable right now");
  });

  // 2026-10-20 — the user, of CHEA HUAN's "RM 16,746.00 · Fixed salary RM 7,000.00 + commission RM 9,746.00":
  // "the basic is deduct from the commission … you can get it from hr code base"; HR's EPF / SOCSO / PCB count.
  // Then, of "RM 8,063.49 · Net basic RM 5,854.50 + balance commission RM 2,208.99": "i want his show gross
  // basic, not net" — asked, the user chose the hero RM 9,208.99 (basic + balance) over keeping RM 8,063.49.
  describe("the fixed salary comes out of the commission, as payroll pays it", () => {
    const salary = salaryFromSchedule(7000, { daysWorked: 31, daysInMonth: 31 },
      { epfEr: 840, epfEe: 770, socsoEr: 104.15, socsoEe: 29.75, eisEr: 11.9, eisEe: 11.9, pcb: 333.85 });
    const payOf = (commission: number) => memberPay({ commission, elsewhere: 0, payLines: [], salary, taxMode: "pcb", withholdingRate: 0.02 });
    const october = { ...base, today: "2026-10-19", salary: 7000, income: { period: "2026-10", status: "computed", total: 9746 } };

    it("names the basic as it stands, never net — the hero is basic + balance commission, never the salary on top", () => {
      const m = todayModel({ ...october, pay: payOf(9746) });
      expect(m.heroLabel).toBe("October · Estimated income");
      expect(m.heroAmount).toBe("RM 8,789.95");
      expect(m.heroSplit).toBe("Basic RM 7,000.00 + balance commission RM 1,789.95");
    });

    it("is HR's gross — the commission less the employer's EPF / SOCSO / EIS; the member's own and the PCB are not off it", () => {
      const pay = payOf(9746);
      expect(pay.employer).toBe(956.05);
      expect(todayModel({ ...october, pay }).heroAmount).toBe("RM 8,789.95"); // 9,746 − 956.05
      expect(pay.net).toBe(7644.45); // My income's Total: 8,789.95 − 770 − 29.75 − 11.90 − 333.85
      // A PCB HR types moves what reaches the bank, not the basic + balance.
      const typed = memberPay({ commission: 9746, elsewhere: 0, payLines: [], salary: { ...salary, pcb: 930 }, taxMode: "pcb", withholdingRate: 0.02 });
      expect(todayModel({ ...october, pay: typed }).heroAmount).toBe("RM 8,789.95");
    });

    it("a commission that does not cover the fixed salary yet reads its real negative in the balance", () => {
      const m = todayModel({ ...october, income: { ...october.income, total: 2000 }, pay: payOf(2000) });
      expect(m.heroAmount).toBe("RM 1,043.95");
      expect(m.heroSplit).toBe("Basic RM 7,000.00 + balance commission −RM 5,956.05");
    });

    it("draws the minus with the figure when the commission does not even cover the employer's EPF / SOCSO / EIS", () => {
      const m = todayModel({ ...october, income: { ...october.income, total: 500 }, pay: payOf(500) });
      expect(m.heroAmount).toBe("−RM 456.05");
      expect(m.heroSplit).toBe("Basic RM 7,000.00 + balance commission −RM 7,456.05");
      expect(amountParts(m.heroAmount)).toEqual({ cur: "RM", num: "−456.05" });
    });

    it("a basic for part of the month is the part paid", () => {
      const joined = salaryFromSchedule(7000, { daysWorked: 10, daysInMonth: 31 },
        { epfEr: 0, epfEe: 0, socsoEr: 0, socsoEe: 0, eisEr: 0, eisEe: 0, pcb: 0 });
      const pay = memberPay({ commission: 9746, elsewhere: 0, payLines: [], salary: joined, taxMode: "pcb", withholdingRate: 0.02 });
      const m = todayModel({ ...october, pay });
      // 7,000 × 0.322581 (10 ÷ 31 to six decimals, as the trigger keeps it)
      expect(m.heroSplit).toBe("Basic RM 2,258.07 + balance commission RM 7,487.93");
      expect(m.heroAmount).toBe("RM 9,746.00");
    });

    it("no fixed salary: the commission, after whatever payroll takes", () => {
      const none = salaryFromSchedule(0, { daysWorked: 31, daysInMonth: 31 }, { epfEr: 0, epfEe: 0, socsoEr: 0, socsoEe: 0, eisEr: 0, eisEe: 0, pcb: 0 });
      const m = todayModel({ ...october, salary: 0, pay: memberPay({ commission: 9746, elsewhere: 0, payLines: [], salary: none, taxMode: "withholding", withholdingRate: 0.02 }) });
      expect(m.heroAmount).toBe("RM 9,551.08");
      expect(m.heroSplit).toBe("Commission only");
    });

    it("still hides it when asked", () => {
      expect(todayModel({ ...october, pay: payOf(9746), hidden: true })).toMatchObject({ heroAmount: "RM ••••", heroSplit: "Amounts hidden" });
    });
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

  it("asks them to answer a bill a colleague shared with them (2026-10-21) — the request opens over Today", () => {
    const shared = shareRequestFromRow({
      id: "s1", status: "partner", orderId: "o1", orderNo: "HC-SO-2610-004", periodMonth: "2026-10", subDepartmentId: "sub",
      owner: { id: "lucas", name: "LUCAS" }, note: "", createdAt: "2026-10-03T01:00:00Z", updatedAt: "2026-10-03T01:00:00Z",
      decidedAt: null, decidedByName: null, decisionNote: null, mine: "partner", bill: null,
      parts: [{ id: "me", name: "ANTHONY", pct: 0.5, answer: "pending", answeredAt: null, note: null }], holders: [], events: [],
    })!;
    const m = todayModel({ ...base, shares: [shared] });
    expect(m.todo.map(t => [t.title, t.sub, t.target, t.shareId])).toEqual([
      ["Accept HC-SO-2610-004?", "LUCAS shared it with you", "share", "s1"],
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
  // 2026-10-25 — the user, over the first three the cards listed: "就放第一名是谁就好了不需要放第一、第二、第三"; of
  // Championship: "championship i want is show 1st in championship point"; and, 2026-10-26, of the figure: "除了 show 他的
  // 名字，也要 show 他的数字 … 跟 Arena 的 Hero Card 是一样的".
  it("the Arena's cards name who is first and their figure, as the Arena's cards — Championship the most points; a director is on no board", () => {
    const people = [
      score({ id: "anna", name: "ANNA TAN LI", sales: 600_000, marginRevenue: 500_000, marginCost: 300_000, kpiQty: 10 }),
      score({ id: "ben", name: "BEN", sales: 400_000, marginRevenue: 400_000, marginCost: 200_000, kpiQty: 12 }),
      score({ id: "cara", name: "CARA", sales: 300_000, marginRevenue: 300_000, marginCost: 200_000, kpiQty: 3 }),
      score({ id: "dan", name: "DAN", sales: 100_000, marginRevenue: 100_000, marginCost: 90_000, kpiQty: 1 }),
    ];
    // The month's standings, as RevenueApp reads them for the Championship.
    const standings = [
      { id: "cara", name: "CARA LIM WEI", total: 72.5, position: 1, months: 1, parts: {} as never },
      { id: "anna", name: "ANNA TAN LI", total: 60, position: 2, months: 1, parts: {} as never },
    ];
    const m = todayModel({ ...peter, arena: arena(people, { selfId: "peter" }) }, null, standings);
    const first = (id: string) => { const b = m.boards.find(x => x.id === id)!; return [b.value, b.leader]; };
    expect(m.boards.map(b => b.state)).toEqual(["lead", "lead", "lead", "lead"]);
    expect(first("sales")).toEqual(["RM 600,000", "ANNA TAN"]);
    // BEN 50.0%, ANNA 40.0%, CARA 33.3%, DAN 10%.
    expect(first("margin")).toEqual(["50.0%", "BEN"]);
    expect(first("kpi")).toEqual(["12 items", "BEN"]);
    expect(first("champ")).toEqual(["72.5 pts", "CARA LIM"]);
    // Nobody placed yet, no points yet: no name, no figure.
    const none = todayModel({ ...peter, arena: arena([], { selfId: "peter" }) }).boards;
    expect(none.map(b => [b.leader, b.value])).toEqual([[undefined, undefined], [undefined, undefined], [undefined, undefined], [undefined, undefined]]);
  });
  it("a tie for first names one of them, never a list", () => {
    const people = ["A", "B", "C"].map((n, i) => score({ id: n, name: n, sales: i < 2 ? 500 : 300 }));
    const m = todayModel({ ...peter, arena: arena(people, { selfId: "peter" }) });
    expect([m.boards[0].leader, m.boards[0].value]).toEqual(["A", "RM 500"]);
  });
  it("a member's cards carry no figure: their place is the card", () => {
    const m = todayModel({ ...base, arena: arena([score({ id: "me", self: true, sales: 500 })]) });
    expect(m.boards[0]).toMatchObject({ state: "ranked", rankNum: "1" });
    expect(m.boards.every(b => b.value === undefined && b.leader === undefined)).toBe(true);
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

  // 2026-10-25 — a salesperson's note the user passed on, over the Principal's Today standing as placeholders: "要看销售额
  // 的话，就是把全部的加起来 … 要不然一直这样漏单的话，其实很容易让人以为是出 bug".
  it("Sales / Margin / KPI are everybody's, added up; the boards name who leads; no week of their own", () => {
    const whole: MemberInsightBlock = {
      ...block({ staffId: "", name: "" }, null), whole: true, target: null, title: "", rank: "",
      team: { sales: 1_489_210, held: 43_987.01, orders: 267, kpiQty: 0, marginRevenue: 537_656, marginCost: 323_280.36, blindOrders: 144 },
    };
    const off = { schemeId: "s", period: "2026-10", asOf: "", enabled: false, items: [], total: 0, threshold: null, hit: null };
    const people = [score({ id: "lucas", name: "LUCAS", sales: 144_064 }), score({ id: "shawn", name: "SHAWN", sales: 128_308 })];
    const m = todayModel({ ...base, first: "WEN WEI", title: "Principal", rank: "All access", salary: null, department: "Fair", team: "Fair",
      income: { period: "2026-10", status: "computed", total: 206_283.82 }, insight: whole, kpi: off, arena: arena(people, { selfId: "" }) });
    expect(m.metrics.map(x => [x.label, x.value, x.tag])).toEqual([
      ["Sales", "RM 1.49M", "All of Fair"],
      // (537,656 − 323,280.36) ÷ 537,656
      ["Margin", "39.9%", "All of Fair"],
      // KPI has not started: it says so, and counts everybody's once it does.
      ["KPI", "—", "Not counted"],
    ]);
    expect(m.heroLabel).toBe("October · Fair commission");
    expect(m.boards.map(b => [b.id, b.state, b.leader, b.value])).toEqual([
      ["sales", "lead", "LUCAS", "RM 144,064"], ["margin", "lead", undefined, undefined], ["kpi", "off", undefined, undefined], ["champ", "lead", undefined, undefined],
    ]);
    expect(m.week).toBeNull();
    expect(todayModel({ ...base, team: "Fair", department: "Fair", insight: { ...whole, team: { ...whole.team!, kpiQty: 41 } },
      kpi: { ...off, enabled: true, total: 41, threshold: 30 } }).metrics[2]).toMatchObject({ value: "41", tag: "All of Fair" });
  });
  it("still loading: placeholders, never a zero", () => {
    const m = todayModel({ ...base, team: "Fair", department: "Fair", metricsLoading: true, arenaLoading: true });
    expect(m.metrics.every(x => x.loading)).toBe(true);
    expect(m.boards.map(b => b.state)).toEqual(["loading", "loading", "loading", "loading"]);
  });
});

// The income as a statement (2026-10-14, the refresh handoff §3): the currency in its own smaller grey, the figure big.
describe("amountParts", () => {
  it("draws RM apart from the figure — the figure hidden or still unknown too", () => {
    expect(amountParts("RM 6,842.50")).toEqual({ cur: "RM", num: "6,842.50" });
    expect(amountParts("RM ••••")).toEqual({ cur: "RM", num: "••••" });
    expect(amountParts("RM —")).toEqual({ cur: "RM", num: "—" });
    expect(amountParts("—")).toEqual({ cur: "", num: "—" });
  });
});
