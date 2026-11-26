import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import type { MemberOrderBook } from "@/lib/member/order-book";
import type { MemberData, MemberInsightBlock, MemberMembership } from "@/lib/member/types";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

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
vi.mock("@/app/(member)/member/not-mine-actions", () => ({}));
vi.mock("@/app/(member)/member/comm-ratio-actions", () => ({}));
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

// One sub-department, no switch (2026-11-24 — the owner: "如果一个人只有一个 department 的权限 … 他只有 IR，那他的 apps
// 就只有 IR，不需要切换 Fair, DC 等"): the headers name it and press nothing; two or more keep the switch.
function render1(data: MemberData) {
  window.history.replaceState({}, "", "/member");
  const live = { ...source(), refresh: vi.fn(async () => ({ ok: true as const, data })) };
  render(<RevenueApp initialData={data} initialSearch="" today="2026-10-14" source={live} />);
}
const kris = (): MemberData => ({ ...peter(), profile: { id: "kris", userId: "u-kris", name: "KRIS", email: "kris@x", salary: 3000 },
  memberships: [seat("fair", "Fair", "Rank SS", 0.12)] });

describe("the sub-department switch", () => {
  it("is not there for somebody with one sub-department — its name stays", async () => {
    render1(kris());
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Switch sub-department" })).not.toBeInTheDocument();
    const labels = Array.from(document.querySelectorAll("[data-sub-only]")).map(e => e.textContent);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every(t => t?.startsWith("Fair"))).toBe(true);
  });

  it("stays for somebody with two", async () => {
    render1(peter());
    await act(async () => {});
    expect(screen.getAllByRole("button", { name: "Switch sub-department" }).length).toBeGreaterThan(0);
    expect(document.querySelector("[data-sub-only]")).toBeNull();
  });
});
