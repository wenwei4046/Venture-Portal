import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import type { DepartmentInsight, MemberBookOrder, MemberOrderBook } from "@/lib/member/order-book";
import type { MemberData, MemberMembership } from "@/lib/member/types";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// The Principal's own app, viewing nobody (2026-10-25 — a salesperson's note the user passed on, over Today, Insight and
// the Arena standing as placeholders: "要看销售额的话，就是把全部的加起来 … Arena 那边 … 显示 Top 3 是谁 … 直接 show
// 全部人的单 … 要不然一直这样漏单的话，其实很容易让人以为是出 bug"): every read is the WHOLE sub-department's.
const nav = vi.hoisted(() => ({ router: { push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/member",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => nav.router,
}));
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/rooms-actions", () => ({}));
vi.mock("@/app/(member)/member/docs-actions", () => ({}));
vi.mock("@/app/(member)/member/it-actions", () => ({}));
vi.mock("@/app/(member)/member/share-actions", () => ({}));
vi.mock("@/app/(member)/member/arena-actions", () => ({}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }

function principalData(): MemberData {
  const fair: MemberMembership = {
    id: "fair", schemeId: "s-fair", name: "Fair", code: "FAIR", title: "Principal", rank: "All members", rate: 0, calculator: true,
    effective: "2026-01-01", capacity: 28, occupied: 3,
    people: [
      { id: "lucas", name: "LUCAS", title: "Senior Team Assistant", rank: "Rank C", parentId: null, self: false },
      { id: "shawn", name: "SHAWN", title: "Team Leader", rank: "Rank A", parentId: null, self: false },
      { id: "yuny", name: "YUNY", title: "Team Assistant", rank: "Rank C", parentId: "shawn", self: false },
    ],
  };
  return { ...memberDemo(), demo: false, principalView: true, memos: [], requests: [], incomes: [],
    profile: { id: "principal", userId: "u-principal", name: "LOO WEN WEI", firstName: "WEN WEI", email: "p@x", salary: null },
    memberships: [fair] };
}

const score = (sales: number, brands: Record<string, number>) => ({
  sales, held: 0, orders: 3, kpiQty: 0, marginRevenue: sales, marginCost: sales * 0.6, blindOrders: 0,
  brands: Object.fromEntries(Object.entries(brands).map(([b, s]) => [b, { sales: s, held: 0, orders: 1, kpiQty: 0, marginRevenue: s, marginCost: s * 0.6, blindOrders: 0 }])),
});

function arena(period: string): MemberArenaSnapshot {
  return {
    principalView: true, membershipId: "fair", department: "Fair", selfId: "",
    period, window: "monthly", from: `${period}-01`, through: `${period}-25`, asOf: "2026-10-25T14:00:00Z", live: true,
    people: [
      { id: "lucas", name: "LUCAS", self: false, ...score(144_064, { AKEMI: 120_000, ZANOTTI: 24_064 }) },
      { id: "shawn", name: "SHAWN", self: false, ...score(128_308, { AKEMI: 128_308 }) },
      { id: "yuny", name: "YUNY", self: false, ...score(126_503, { ZANOTTI: 96_503, DUNLOP: 30_000 }) },
    ],
    brands: [{ code: "AKEMI", name: "Akemi" }, { code: "DUNLOP", name: "Dunlopillo" }, { code: "ZANOTTI", name: "Zanotti" }],
    brandWeeks: null, weekLocks: [], tiers: [], openMonths: ["2026-10"], final: false,
    history: { asOf: "2026-10-25T14:00:00Z", provisional: true, events: [], unassignedOrders: 0, unassignedSales: 0, championship: { status: "pending", reason: "" } },
  };
}

const row = (staffId: string, name: string, sales: number) => ({
  staffId, name, title: "Team Leader", uplineId: null, depth: 1, sales, held: 0, orders: 3, kpiQty: 0, marginRevenue: sales, marginCost: sales * 0.6, blindOrders: 0, lastOrder: null,
});
function insight(from: string, until: string): DepartmentInsight {
  return {
    membershipId: "fair", schemeId: "s-fair", department: "Fair", from, through: until, asOf: "2026-10-25T14:00:00Z", live: true,
    team: { sales: 1_489_210, held: 43_987.01, orders: 267, kpiQty: 0, marginRevenue: 537_656, marginCost: 323_280.36, blindOrders: 144 },
    people: [row("lucas", "LUCAS", 144_064), row("shawn", "SHAWN", 128_308), row("kris", "KRIS", 23_348)],
    kpi: { enabled: false, threshold: null },
  };
}

const bill = (id: string, seller: string, revenue: number): MemberBookOrder => ({
  id, number: `HC-SO-2610-${id}`, ref: null, customer: "Mdm Lee", date: "2026-10-03", sourceMonth: "2026-10", recognitionMonth: "2026-10",
  brand: "AKEMI", booth: "AKEMI", venue: "SETIA SPICE", fairStart: "2026-10-02", fairEnd: "2026-10-04", organiser: "MEGAHOME", week: "2026-10-02",
  revenue, margin: 40, kpiQty: 0, cleared: true, carried: false, manual: false, total: revenue, paid: revenue, depositNeeded: null,
  lines: [{ name: "AKEMI MATT (Q)", code: "AK-Q", qty: 1, amount: revenue, goods: true, kpiQty: 0 }], own: false, share: null,
  seller: { id: seller.toLowerCase(), name: seller },
});
function book(from: string, until: string): MemberOrderBook {
  return { from, through: until, asOf: "2026-10-25T14:00:00Z", paysFrom: "2026-09", closedMonths: [], brandWeeks: {},
    orders: [bill("001", "LUCAS", 5388), bill("002", "SHAWN", 3999)] };
}

function source() {
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data: principalData() })),
    // A member's reads: only once the Principal views somebody.
    insight: none, kpi: none, orgMap: none, insightRange: none, orderBook: none, arena: none,
    quote: none, memo: none, requestHistory: none, cancelRequest: none, income: none, honours: none, claimRates: none,
    memoReceipts: vi.fn(async () => ({ ok: true as const, data: [] })),
    departmentIncome: vi.fn(async (_sub: string, period: string) => ({ ok: true as const, data: { period, state: "live" as const, commission: 206_283.82, countedSales: 1_489_210 } })),
    departmentInsight: vi.fn(async (_sub: string, from: string, until: string) => ({ ok: true as const, data: insight(from, until) })),
    departmentBook: vi.fn(async (_sub: string, from: string, until: string) => ({ ok: true as const, data: book(from, until) })),
    departmentArena: vi.fn(async (_sub: string, period: string) => ({ ok: true as const, data: arena(period) })),
    submitRequest: vi.fn(async (form: FormData) => { void form; return { ok: false as const, error: "not in this test" }; }),
  } satisfies RevenueSource;
}

beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function open(search = "") {
  window.history.replaceState({}, "", `/member${search}`);
  const live = source();
  render(<RevenueApp initialData={principalData()} initialSearch={search} today="2026-10-25" source={live} />);
  await act(async () => {});
  return live;
}

describe("the Principal's own app, viewing nobody", () => {
  it("Today: everybody's Sales / Margin / KPI added up, who is first on every board — nothing left loading", async () => {
    const live = await open();
    expect(screen.getByText("October · Fair commission")).toBeInTheDocument();
    expect(screen.getAllByText("All of Fair")).toHaveLength(2);
    expect(screen.getByText("RM 1.49M")).toBeInTheDocument();
    expect(screen.getByText("39.9%")).toBeInTheDocument();
    // KPI has not started: it says so.
    expect(screen.getAllByText("Not counted").length).toBeGreaterThan(0);
    // The cards (2026-10-25, the user: "就放第一名是谁就好了不需要放第一、第二、第三"): who is first — Championship the most
    // points ("championship i want is show 1st in championship point"): LUCAS, 93.92 pts — with their figure over the name,
    // as the Arena's cards (2026-10-26: "跟 Arena 的 Hero Card 是一样的").
    const arenaCards = screen.getByRole("heading", { name: "Your Arena" }).closest("section")!;
    const cards = within(arenaCards).getAllByRole("button").map(b => b.textContent).filter(t => t !== "All boards");
    expect(cards).toEqual(["SalesRM 144,064LUCAS", expect.stringMatching(/^Margin40\.0%/), "KPINot counted", "Championship93.92 ptsLUCAS"]);
    expect(arenaCards.querySelector("ol")).toBeNull();
    expect(document.querySelector("[aria-busy='true']")).toBeNull();
    expect(screen.queryByText("Not ranked yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "This week" })).not.toBeInTheDocument();
    // The whole sub-department's reads — never a member's, and not its every bill until Insight shows them.
    expect(live.departmentInsight).toHaveBeenCalledWith("fair", "2026-10", "2026-10");
    expect(live.departmentArena).toHaveBeenCalledWith("fair", "2026-10", "monthly", undefined);
    expect(live.departmentBook).not.toHaveBeenCalled();
    expect(live.insight).not.toHaveBeenCalled();
    expect(live.arena).not.toHaveBeenCalled();
  });

  it("Insight: every bill with its salesperson, everybody on the team — a tap on one views them", async () => {
    const live = await open("?page=insight");
    expect(live.departmentBook).toHaveBeenCalledWith("fair", "2026-10", "2026-10");
    expect(screen.getByRole("button", { name: "All of Fair" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Fair sales")).toBeInTheDocument();
    expect(screen.getByText("RM 9,387")).toBeInTheDocument();
    expect(screen.queryByText(/Loading (your|Fair’s) sales/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Members" }));
    const members = screen.getAllByRole("button", { name: /^View / }).map(b => b.getAttribute("aria-label"));
    // KRIS wrote bills but View as does not list him in Fair here: his row opens nothing.
    expect(members).toEqual(["View LUCAS", "View SHAWN"]);
    expect(screen.getByText("KRIS")).toBeInTheDocument();
    expect(screen.queryByText(/\(you\)/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View LUCAS" }));
    await act(async () => {});
    expect(window.location.search).toContain("staff=lucas");
    expect(live.insight).toHaveBeenCalledWith("2026-10", { staffId: "lucas", subDepartmentId: "fair" });
    expect(screen.getByRole("button", { name: "Personal" })).toHaveAttribute("aria-pressed", "true");
  });

  // Its chart is drawn round one person: viewing nobody it read "Loading your team…" for ever — it says so, as My income does.
  it("Team & capacity asks for somebody to view, never loads for ever", async () => {
    await open("?page=account&view=team");
    expect(screen.getByText("Team & capacity is a member's own. Pick somebody in Revenue to see theirs, exactly as they do.")).toBeInTheDocument();
    expect(screen.queryByText("Loading your team…")).not.toBeInTheDocument();
  });

  it("the bills name whose they are", async () => {
    await open("?page=insight&view=bills");
    expect(screen.getByRole("heading", { name: "Fair sales orders" })).toBeInTheDocument();
    expect(screen.getByText("LUCAS · Mdm Lee · 1 line")).toBeInTheDocument();
    expect(screen.getByText("SHAWN · Mdm Lee · 1 line")).toBeInTheDocument();
  });

  // The cards as Today's (2026-10-25, the user: "can same"): who is first, their figure as the card's head — Championship
  // the most points, the Championship's own standings.
  it("the Arena: who leads every board — who is first, their figure as the head", async () => {
    const live = await open("?page=arena");
    expect(screen.getByText(/Who leads every board/)).toBeInTheDocument();
    const card = (label: string) => screen.getAllByRole("button").find(b => b.textContent?.startsWith(label))?.textContent;
    expect(card("Sales")).toBe("SalesRM 144,064LUCAS");
    expect(card("Championship")).toBe("Championship93.92 ptsLUCAS");
    expect(screen.queryByText("Not ranked yet")).not.toBeInTheDocument();
    expect(live.arena).not.toHaveBeenCalled();
  });
});
