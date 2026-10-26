import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import type { MemberOrderBook } from "@/lib/member/order-book";
import type { MemberData, MemberInsightBlock, MemberMembership } from "@/lib/member/types";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// A Revenue Director in the app (2026-10-14 — the user, on PETER's login: "why as revenue director log in, peter,
// cant switch to fair view"): the switcher lists the sub-departments they direct; Today's figures are the whole
// sub-department's, the Arena's cards name who leads (the first three since 2026-10-25).
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

const seat = (id: string, name: string, rank: string, rate: number): MemberMembership => ({
  id, schemeId: `s-${id}`, name, code: name.toUpperCase(), title: "Revenue Director", rank, rate, calculator: id === "fair",
  effective: "2026-01-01", capacity: id === "fair" ? 28 : null, occupied: 25, director: true,
  people: [{ id: "anna", name: "ANNA", title: "Team Leader", rank: "Rank A", parentId: null, self: false }],
});

function peter(): MemberData {
  return { ...memberDemo(), demo: false, memos: [], requests: [], incomes: [],
    profile: { id: "peter", userId: "u-peter", name: "PETER", email: "peter@x", salary: 3000 },
    memberships: [seat("fair", "Fair", "Rank SS", 0.12), seat("ir", "IR", "", 0)] };
}

const block: MemberInsightBlock = {
  membershipId: "fair", schemeId: "s-fair", department: "Fair", title: "Revenue Director", rank: "Rank SS", rankSort: 70, director: true,
  me: { staffId: "peter", name: "PETER", sales: 0, held: 0, orders: 0, kpiQty: 0, marginRevenue: 0, marginCost: 0, blindOrders: 0, lastOrder: null },
  team: { sales: 930_294, held: 0, orders: 170, kpiQty: 0, marginRevenue: 900_000, marginCost: 560_000, blindOrders: 0 },
  target: null, boards: [], downline: [], orders: [],
};

function book(from: string, through: string): MemberOrderBook {
  return { from, through, asOf: "2026-10-14T04:00:00Z", paysFrom: "2026-09", closedMonths: [], brandWeeks: {}, orders: [] };
}

function arena(membershipId: string, period: string): MemberArenaSnapshot {
  const score = { held: 0, orders: 3, kpiQty: 0, blindOrders: 0, brands: {} };
  return {
    principalView: false, membershipId, department: "Fair", selfId: "peter",
    period, window: "monthly", from: `${period}-01`, through: `${period}-14`, asOf: "2026-10-14T04:00:00Z", live: true,
    people: [{ id: "anna", name: "ANNA", self: false, sales: 120_000, marginRevenue: 100_000, marginCost: 60_000, ...score },
      { id: "ben", name: "BEN", self: false, sales: 90_000, marginRevenue: 90_000, marginCost: 50_000, ...score }],
    brands: [], brandWeeks: null, weekLocks: [], tiers: [],
    history: { asOf: "2026-10-14T04:00:00Z", provisional: true, events: [], unassignedOrders: 0, unassignedSales: 0, championship: { status: "pending", reason: "" } },
  };
}

function source() {
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data: peter() })),
    insight: vi.fn(async () => ({ ok: true as const, data: { period: "2026-10", asOf: "2026-10-14T04:00:00Z", live: true, blocks: [block] } })),
    kpi: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none,
    cancelRequest: none, income: none, departmentIncome: none, honours: none, claimRates: none,
    memoReceipts: vi.fn(async () => ({ ok: true as const, data: [] })),
    orderBook: vi.fn(async (_sub: string, from: string, until: string) => ({ ok: true as const, data: book(from, until) })),
    arena: vi.fn(async (membershipId: string, period: string) => ({ ok: true as const, data: arena(membershipId, period) })),
    submitRequest: vi.fn(async (form: FormData) => { void form; return { ok: false as const, error: "not in this test" }; }),
  } satisfies RevenueSource;
}

// Today's Sales and Margin cards as they read (2026-10-25/26, the user: "就放第一名是谁就好了"; "跟 Arena 的 Hero Card 是一样的")
// — who is first, their figure over the name.
const firsts = () => within(screen.getByRole("heading", { name: "Your Arena" }).closest("section")!)
  .getAllByRole("button").map(b => b.textContent).filter(t => t !== "All boards").slice(0, 2);

beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function open(search = "") {
  window.history.replaceState({}, "", `/member${search}`);
  const live = source();
  render(<RevenueApp initialData={peter()} initialSearch={search} today="2026-10-14" source={live} />);
  await act(async () => {});
  return live;
}

describe("a Revenue Director's app", () => {
  it("switches between the sub-departments they direct", async () => {
    await open();
    fireEvent.click(screen.getAllByRole("button", { name: "Switch sub-department" })[0]);
    const sheet = screen.getByRole("dialog", { name: "Switch sub-department" });
    const rows = within(sheet).getAllByRole("button", { pressed: false }).concat(within(sheet).getAllByRole("button", { pressed: true }));
    expect(rows.map(r => r.textContent).sort()).toEqual(["FAFairRevenue Director · Rank SS", "IRIRRevenue Director"].sort());
    expect(within(sheet).getByRole("button", { pressed: true })).toHaveTextContent("Fair");
  });

  it("Today: the whole Fair's figures, the Arena's leaders, no week of their own", async () => {
    await open("?department=fair");
    // Sales, Margin and KPI.
    expect(screen.getAllByText("All of Fair")).toHaveLength(3);
    expect(screen.getByText("RM 930.3k")).toBeInTheDocument();
    // Sales (ANNA RM 120k, BEN RM 90k) and Margin (BEN 44.4%, ANNA 40.0%): who is first; a director is on no board.
    expect(firsts()).toEqual(["SalesRM 120,000ANNA", "Margin44.4%BEN"]);
    expect(screen.queryByText("Not ranked yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "This week" })).not.toBeInTheDocument();
  });
});

// The Principal's View as finds the Revenue Director (2026-10-23 — the user: "找不到我的 revenue director 了。By right
// 它应该是能够找得到的"): the snapshot lists each sub-department's directors after its seats, and viewing one reads
// exactly what their own app does.
function principalData(): MemberData {
  const director = (id: string, name: string, rank: string) => ({ id, name, title: "Revenue Director", rank, parentId: null, self: false, director: true });
  const sub = (id: string, name: string, people: MemberMembership["people"]): MemberMembership => ({
    id, schemeId: `s-${id}`, name, code: name.toUpperCase(), title: "Principal", rank: "All members", rate: 0, calculator: id === "fair",
    effective: "2026-01-01", capacity: null, occupied: 2, people,
  });
  return { ...memberDemo(), demo: false, principalView: true, memos: [], requests: [], incomes: [],
    profile: { id: "principal", userId: "u-principal", name: "Principal", email: "principal@x", salary: null },
    memberships: [
      sub("fair", "Fair", [
        { id: "anna", name: "ANNA", title: "Team Leader", rank: "Rank A", parentId: null, self: false },
        { id: "ben", name: "BEN", title: "Revenue Specialist", rank: "Rank E", parentId: "anna", self: false },
        director("kris", "KRIS", "Rank SS"), director("peter", "PETER", "Rank SS"),
      ]),
      sub("ir", "IR", [
        { id: "carl", name: "CARL", title: "Team Leader", rank: "Rank A", parentId: null, self: false },
        director("peter", "PETER", ""),
      ]),
    ] };
}

async function openAsPrincipal(search: string) {
  window.history.replaceState({}, "", `/member${search}`);
  const live = { ...source(), refresh: vi.fn(async () => ({ ok: true as const, data: principalData() })) };
  render(<RevenueApp initialData={principalData()} initialSearch={search} today="2026-10-14" source={live} />);
  await act(async () => {});
  return live;
}

describe("the Principal's View as of a Revenue Director", () => {
  it("lists each sub-department's directors first, then the top of each tree, then everybody below", async () => {
    await openAsPrincipal("?page=account");
    fireEvent.click(screen.getByRole("button", { name: /View as a team member/ }));
    const page = screen.getByRole("dialog", { name: "View as" });
    const group = (title: string) => {
      const section = within(page).getByText(title).closest("section")!;
      return within(section).getAllByRole("button").map(b => b.textContent);
    };
    expect(group("FAIR · 4")).toEqual([
      "KRKRISRevenue Director · Leads FairView", "PEPETERRevenue Director · Leads FairView",
      "ANANNATeam Leader · Rank AView", "BEBENRevenue Specialist · Rank EView",
    ]);
    expect(group("IR · 2")).toEqual(["PEPETERRevenue Director · Leads IRView", "CACARLTeam Leader · Rank AView"]);
    fireEvent.change(within(page).getByRole("textbox", { name: "Search name or title" }), { target: { value: "director" } });
    expect(within(page).getAllByRole("button").filter(b => b.textContent?.endsWith("View")).map(b => b.textContent))
      .toEqual(["KRKRISRevenue Director · Leads FairView", "PEPETERRevenue Director · Leads FairView", "PEPETERRevenue Director · Leads IRView"]);
  });

  it("viewing PETER in Fair reads as his own app: the whole Fair's figures, the Arena's leaders, no week of his own", async () => {
    const live = await openAsPrincipal("?department=fair&staff=peter");
    expect(live.insight).toHaveBeenCalledWith("2026-10", { staffId: "peter", subDepartmentId: "fair" });
    expect(screen.getAllByText("All of Fair")).toHaveLength(3);
    expect(screen.getByText("RM 930.3k")).toBeInTheDocument();
    expect(firsts()).toEqual(["SalesRM 120,000ANNA", "Margin44.4%BEN"]);
    expect(screen.queryByText("Not ranked yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "This week" })).not.toBeInTheDocument();
  });
});
