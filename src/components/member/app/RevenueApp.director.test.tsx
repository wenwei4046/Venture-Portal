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
// sub-department's, the Arena's cards name who leads.
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
    // Sales (ANNA's RM 120k) and Margin (BEN's 44.4%); a director is on no board.
    expect(screen.getAllByText("ANNA leads").length).toBeGreaterThan(0);
    expect(screen.getByText("BEN leads")).toBeInTheDocument();
    expect(screen.queryByText("Not ranked yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "This week" })).not.toBeInTheDocument();
  });
});
