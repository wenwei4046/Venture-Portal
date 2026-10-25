import { describe, expect, it } from "vitest";
import type { ArenaPerson, ArenaScore, MemberArenaSnapshot } from "@/lib/member/arena";
import type { ArenaHistorySnapshot } from "@/lib/member/arena-history";
import { boardModel, chaseLine, fairTallies, hubModel, recordModel, type ArenaInput, type BoardRow } from "./arena-model";

const score = (s: Partial<ArenaScore> = {}): ArenaScore => ({ sales: 0, held: 0, orders: 0, kpiQty: 0, marginRevenue: 0, marginCost: 0, blindOrders: 0, ...s });
const person = (id: string, name: string, total: Partial<ArenaScore>, self = false, brands: Record<string, Partial<ArenaScore>> = {}): ArenaPerson => ({
  id, name, self, ...score(total), brands: Object.fromEntries(Object.entries(brands).map(([b, s]) => [b, score(s)])),
});
const snapshot = (people: ArenaPerson[], extra: Partial<MemberArenaSnapshot> = {}): MemberArenaSnapshot => ({
  membershipId: "fair", department: "Fair", selfId: "me", period: "2026-09", window: "monthly", from: "2026-09-01", through: "2026-09-30",
  asOf: "2026-10-04T14:13:00Z", live: false, people, brands: [{ code: "AKEMI", name: "Akemi" }, { code: "ZANOTTI", name: "Zanotti" }],
  brandWeeks: null, tiers: [], ...extra,
});
const history: ArenaHistorySnapshot = {
  asOf: "2026-10-04", provisional: true, unassignedOrders: 0, unassignedSales: 0, championship: { status: "pending", reason: "" },
  events: [
    { id: "a|AKEMI", venue: "MID VALLEY", start: "2026-09-04", end: "2026-09-06", periodMonth: "2026-09", week: "2026-09-04", brand: "AKEMI",
      people: [{ id: "me", name: "ME", sales: 900, held: 0, orders: 2, scoring: true }, { id: "x", name: "XAVIER LIM", sales: 500, held: 0, orders: 1, scoring: true }] },
    { id: "b|AKEMI", venue: "SPICE ARENA", start: "2026-09-11", end: "2026-09-13", periodMonth: "2026-09", week: "2026-09-11", brand: "AKEMI",
      people: [{ id: "me", name: "ME", sales: 300, held: 0, orders: 1, scoring: true }, { id: "x", name: "XAVIER LIM", sales: 800, held: 0, orders: 1, scoring: true },
        { id: "y", name: "YAP", sales: 2000, held: 0, orders: 1, scoring: false }] },
    { id: "c|AKEMI", venue: "OLD HALL", start: "2026-08-07", end: "2026-08-09", periodMonth: "2026-08", week: "2026-08-07", brand: "AKEMI",
      people: [{ id: "y", name: "YAP", sales: 3000, held: 0, orders: 1, scoring: true }] },
  ],
};
const period = { kind: "monthly" as const, from: "2026-09", through: "2026-09", label: "Sep 2026", short: "Sep" };
const people = [
  person("me", "ME", { sales: 500, marginRevenue: 500, marginCost: 300 }, true, { AKEMI: { sales: 500, marginRevenue: 500, marginCost: 300 } }),
  person("x", "XAVIER LIM", { sales: 800, marginRevenue: 800, marginCost: 400, blindOrders: 1 }, false, { AKEMI: { sales: 800, marginRevenue: 800, marginCost: 400, blindOrders: 1 } }),
  person("y", "YAP", { sales: 500 }, false, { ZANOTTI: { sales: 500 } }),
  person("z", "ZED", {}),
];
const input = (over: Partial<ArenaInput> = {}): ArenaInput => ({
  board: "sales", sub: "total", brand: "", period, snapshot: snapshot(people), history, standings: null, selfId: "me",
  subName: "Fair", kpiEnabled: true, final: false, openMonths: ["2026-09"], current: "2026-10", ...over,
});

describe("chaseLine", () => {
  const row = (id: string, position: number | null, value: number | null, self = false): BoardRow => ({ id, name: id.toUpperCase(), self, position, value, pending: false, active: value !== null });
  it("names the next person above, not somebody level", () => {
    expect(chaseLine("sales", [row("a", 1, 900), row("b", 2, 500), row("me", 2, 500, true)]).line).toBe("RM 400 behind A (1st)");
  });
  it("leads by the gap to the next one down, or says level", () => {
    expect(chaseLine("sales", [row("me", 1, 900, true), row("b", 2, 500)]).line).toBe("You lead by RM 400");
    expect(chaseLine("sales", [row("me", 1, 900, true), row("b", 1, 900)]).line).toBe("Level with B at the top");
  });
  it("waits for cost on a pending margin", () => {
    expect(chaseLine("margin", [{ ...row("me", null, null, true), pending: true }]).line).toBe("Waiting for complete cost data");
  });
});

describe("boardModel", () => {
  it("ranks sales with ties sharing a place and nobody-yet last", () => {
    const vm = boardModel(input());
    expect(vm.rank!.rows.map(r => [r.name, r.pos, r.value])).toEqual([
      ["XAVIER LIM", "1", "RM 800"], ["ME", "2", "RM 500"], ["YAP", "2", "RM 500"], ["ZED", "—", "RM 0"],
    ]);
    expect(vm.rank!.hero).toMatchObject({ num: "2", suf: "nd", count: 4, value: "RM 500", chase: "RM 300 behind XAVIER LIM (1st)" });
    expect(vm.rank!.rows.find(r => r.name === "XAVIER LIM")!.tag).toBe("next");
  });

  // 2026-10-05 (user): the board says what counts, never how the cost is made up.
  it("keeps an uncosted margin pending and never names the cost basis", () => {
    const vm = boardModel(input({ board: "margin", final: true, openMonths: [] }));
    expect(vm.rank!.rows.find(r => r.id === "x")!.value).toBe("Cost pending");
    expect(vm.rank!.hero).toMatchObject({ num: "1", value: "40.0%" });
    expect(vm.basis).toBe("Margin uses commissionable goods revenue. Anyone with an uncosted bill stays pending until it is costed.");
    expect(vm.basis).not.toMatch(/÷|team cost|0\.7/);
  });

  it("says the month is still moving until everybody is closed", () => {
    expect(boardModel(input()).basis).toMatch(/September is still being closed, so places can still move\.$/);
    expect(boardModel(input({ final: true, openMonths: [] })).basis).not.toMatch(/still/);
    const q = { kind: "quarterly" as const, from: "2026-10", through: "2026-10", label: "Q4 2026", short: "Q4" };
    expect(boardModel(input({ period: q, openMonths: ["2026-10"] })).basis).toMatch(/October is still running, so places can still move\.$/);
  });

  it("shows KPI as not counted when the sub-department has it off", () => {
    const vm = boardModel(input({ board: "kpi", kpiEnabled: false }));
    expect(vm.rank!.hero.value).toBe("Not counted");
    expect(vm.rank!.rows.every(r => r.value === "—" && r.pos === "—")).toBe(true);
    expect(hubModel(input({ kpiEnabled: false })).cards.find(c => c.board === "kpi")!.value).toBe("Not counted");
  });

  it("titles a brand board and keeps Fair results off the margin board", () => {
    expect(boardModel(input({ sub: "brand", brand: "ZANOTTI" })).title).toBe("Sales · Zanotti");
    expect(boardModel(input({ board: "margin", sub: "fair" })).sub).toBe("total");
  });
});

// 2026-10-08: the board being read and a board with nobody on it looked the same (a giant dash, "No counted
// sales yet"). Loading is a placeholder now, and no place is said in words.
describe("loading versus no place", () => {
  it("a board still being read is a placeholder, not \"No counted sales yet\"", () => {
    const vm = boardModel(input({ snapshot: null }));
    expect(vm.rank!.hero).toMatchObject({ state: "loading", num: "", value: "", chase: "Loading the board…" });
    expect(hubModel(input({ snapshot: null })).cards.every(c => c.state === "loading" || c.board === "champ")).toBe(true);
  });

  it("a read that failed is not shown as loading forever", () => {
    expect(boardModel(input({ snapshot: null, failed: true })).rank!.hero.state).toBe("unranked");
  });

  it("somebody with nothing on the board is unranked; somebody placed is ranked", () => {
    const zed = boardModel(input({ selfId: "z", snapshot: snapshot(people.map(p => ({ ...p, self: p.id === "z" }))) }));
    expect(zed.rank!.hero).toMatchObject({ state: "unranked", chase: "No counted sales yet" });
    expect(boardModel(input()).rank!.hero.state).toBe("ranked");
  });
});

describe("a Revenue Director reads the boards (2026-10-14: on none of them)", () => {
  // The director is on no board: nobody in the snapshot is them.
  const theirs = people.map(p => ({ ...p, self: false }));
  const director = (over: Partial<ArenaInput> = {}) => input({ snapshot: snapshot(theirs, { selfId: "peter" }), selfId: "peter", director: true, ...over });

  it("each hero names who leads, their figure, and the gap to the next", () => {
    const hero = boardModel(director()).rank!.hero;
    expect([hero.state, hero.leader, hero.value, hero.chase, hero.num]).toEqual(["lead", "XAVIER LIM", "RM 800", "RM 300 ahead of ME", ""]);
    const margin = boardModel(director({ board: "margin" })).rank!.hero;
    expect([margin.state, margin.leader]).toEqual(["lead", "ME"]);
  });
  it("a board nobody is on yet says so; KPI not counted stays off, with no leader", () => {
    const empty = boardModel(director({ snapshot: snapshot(theirs.map(p => ({ ...p, sales: 0, marginRevenue: 0, marginCost: 0 })), { selfId: "peter" }) })).rank!.hero;
    expect([empty.state, empty.leader, empty.chase]).toEqual(["lead", undefined, "No counted sales yet"]);
    const off = boardModel(director({ board: "kpi", kpiEnabled: false })).rank!.hero;
    expect([off.state, off.leader, off.num]).toEqual(["off", undefined, "—"]);
    // The hub's KPI card counts no place of theirs (2026-10-25: it read "— of 23"); a member's still does.
    expect(hubModel(director({ kpiEnabled: false })).cards.find(c => c.board === "kpi")).toMatchObject({ state: "off", value: "Not counted", of: "" });
    expect(hubModel(input({ kpiEnabled: false })).cards.find(c => c.board === "kpi")!.of).toBe(`of ${people.length}`);
  });
  // 2026-10-25 — the first version listed the first three; the user, of Today's cards: "就放第一名是谁就好了不需要放第一、
  // 第二、第三", of these: "can same", and of Championship: "championship i want is show 1st in championship point".
  it("the hub's cards name who is first, their figure as the head — Championship the most points; its head says who leads", () => {
    const standings = [
      { id: "y", name: "YAP", total: 72, position: 1, months: 1, parts: {} as never },
      { id: "x", name: "XAVIER LIM", total: 60, position: 2, months: 1, parts: {} as never },
    ];
    const hub = hubModel(director({ standings }));
    expect(hub.director).toBe(true);
    const card = (board: string) => hub.cards.find(c => c.board === board)!;
    expect(card("sales")).toMatchObject({ state: "lead", leader: "XAVIER LIM", value: "RM 800", of: "" });
    // XAVIER's margin waits for a cost: ME alone is placed.
    expect(card("margin")).toMatchObject({ state: "lead", leader: "ME", value: "40.0%" });
    expect(card("champ")).toMatchObject({ state: "lead", leader: "YAP", value: "72 pts" });
    // The points still on their way: a placeholder, never somebody else's name.
    expect(hubModel(director()).cards.find(c => c.board === "champ")).toMatchObject({ state: "loading", value: "" });
    expect(hubModel(input()).director).toBeUndefined();
    expect(hubModel(input()).cards.every(c => c.leader === undefined)).toBe(true);
  });
  it("a hub card with nobody placed says so, its head a dash", () => {
    const empty = snapshot(theirs.map(p => ({ ...p, sales: 0, marginRevenue: 0, marginCost: 0 })), { selfId: "peter" });
    const card = hubModel(director({ snapshot: empty })).cards.find(c => c.board === "sales")!;
    expect([card.state, card.value, card.leader]).toEqual(["lead", "—", undefined]);
  });
  it("Championship's board adds up nobody's own points", () => {
    const standings = [{ id: "x", name: "XAVIER LIM", total: 60, position: 1, months: 1, parts: {} as never }];
    expect(boardModel(director({ board: "champ", standings })).rank!.champ).toBeNull();
    expect(boardModel(input({ board: "champ", standings })).rank!.champ).not.toBeNull();
  });
  it("nothing is the reader's own: no margin incentive, no fairs of theirs, no best record", () => {
    expect(boardModel(director({ board: "margin" })).foot).toBeNull();
    expect(boardModel(director({ sub: "fair" })).fair!.lead).toBe(true);
    const record = recordModel(history, "peter", true);
    expect([record.lead, record.cardLine, record.podium.map(p => p.name)]).toEqual([true, "YAP holds it · RM 3,000", ["ME", "YAP", "XAVIER LIM"]]);
    expect(recordModel(null, "", true).cardLine).toBe("");
  });
  it("Fair results: the leader's medals, none of the director's own", () => {
    const fair = boardModel(director({ sub: "fair" })).fair!;
    expect([fair.hero.state, fair.hero.leader, fair.hero.chase]).toEqual(["lead", "ME", "ME has the most fair wins"]);
    expect([fair.chips, fair.sheet.other]).toEqual([[], ""]);
  });
  it("a member's boards are unchanged", () => {
    const hero = boardModel(input()).rank!.hero;
    expect([hero.state, hero.leader]).toEqual(["ranked", undefined]);
    expect(boardModel(input({ board: "margin" })).foot).not.toBeNull();
    expect(boardModel(input({ sub: "fair" })).fair!.lead).toBeUndefined();
  });
});

describe("fairTallies", () => {
  it("counts only the brand week's booth, at the place held among everybody there", () => {
    const rows = fairTallies(people, history, "2026-09", "2026-09");
    const me = rows.find(r => r.id === "me")!;
    // 1st of 2 at Mid Valley; 3rd of 3 at Spice Arena, behind YAP who scored nothing there.
    expect([me.g, me.s, me.b]).toEqual([1, 0, 1]);
    expect(rows.find(r => r.id === "y")!.fairs).toHaveLength(0);
    // Firsts decide before seconds: ME (one 1st) above XAVIER (two 2nds).
    expect(rows.find(r => r.id === "me")!.position).toBe(1);
    expect(rows.find(r => r.id === "x")!.position).toBe(2);
  });
  it("puts the fair view's chase on the next one above", () => {
    expect(boardModel(input({ sub: "fair" })).fair!.hero).toMatchObject({ num: "1", chase: "Most fair wins this period" });
    const vm = boardModel(input({ sub: "fair", selfId: "x", snapshot: snapshot(people.map(p => ({ ...p, self: p.id === "x" }))) }));
    expect(vm.fair!.hero).toMatchObject({ num: "2", chase: "1 more 1st place to catch ME" });
    expect(vm.fair!.rows.find(r => r.id === "z")!.sub).toBe("No fairs");
  });
});

describe("recordModel", () => {
  it("is the best single scoring booth, all time", () => {
    const vm = recordModel(history, "me");
    expect(vm.podium.map(p => p.name)).toEqual(["You", "YAP", "XAVIER LIM"]);
    expect(vm.myPos).toBe("2nd of 3");
    expect(vm.cardLine).toBe("Yours: RM 900 · 2nd of 3");
  });
});
