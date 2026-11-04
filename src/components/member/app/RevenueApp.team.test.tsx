import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberKpiSummary } from "@/lib/member/kpi-summary";
import type { MemberBookOrder, MemberOrderBook } from "@/lib/member/order-book";
import type { MemberData, MemberInsightBlock, MemberMembership } from "@/lib/member/types";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// Insight › My team › a person (2026-11-03 — the user, circling *Team members* on STANLEY's My team beside a member's
// Personal tab and its *My sales orders*: "i need them can press their team member than can view their order as well
// like this"): a row of the team opens that person's own Insight — their sales, bills and a bill — read-only.
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

const STANLEY = "6c779320-2143-44ed-af3e-da566c5de07a";
const LUCAS = "29161184-da38-4c9a-b869-b2c7fba86aeb";
const JAMES = "b45ba010-06a8-41b1-9b92-649a84dd8c00";

const fair = (title: string, rank: string): MemberMembership => ({
  id: "fair", schemeId: "s-fair", name: "Fair", code: "FAIR", title, rank, rate: 0.08, calculator: true,
  effective: "2026-01-01", capacity: 28, occupied: 3,
  people: [
    { id: STANLEY, name: "STANLEY", title: "Team Leader", rank: "Rank B", parentId: null, self: title === "Team Leader" },
    { id: LUCAS, name: "LUCAS", title: "Senior Team Assistant", rank: "Rank C", parentId: STANLEY, self: false },
    { id: JAMES, name: "JAMES SEOW", title: "Revenue Specialist", rank: "Rank E", parentId: LUCAS, self: false },
  ],
});

function stanley(): MemberData {
  return { ...memberDemo(), demo: false, memos: [], requests: [], incomes: [],
    profile: { id: STANLEY, userId: "u-stanley", name: "STANLEY", email: "stanley@x", salary: 3000 },
    memberships: [fair("Team Leader", "Rank B")] };
}
function principal(): MemberData {
  return { ...memberDemo(), demo: false, principalView: true, memos: [], requests: [], incomes: [],
    profile: { id: "principal", userId: "u-principal", name: "Principal", email: "principal@x", salary: null },
    memberships: [fair("Principal", "All members")] };
}

const down = (staffId: string, name: string, title: string, depth: number, sales: number) => ({
  staffId, name, title, uplineId: null, depth, sales, held: 0, orders: 1, kpiQty: 0, marginRevenue: sales, marginCost: sales * 0.7, blindOrders: 0, lastOrder: null,
});
const block: MemberInsightBlock = {
  membershipId: "fair", schemeId: "s-fair", department: "Fair", title: "Team Leader", rank: "Rank B", rankSort: 40,
  me: { staffId: STANLEY, name: "STANLEY", sales: 13_700, held: 0, orders: 1, kpiQty: 0, marginRevenue: 13_700, marginCost: 9_000, blindOrders: 0, lastOrder: null },
  target: null, boards: [], orders: [],
  downline: [down(LUCAS, "LUCAS", "Senior Team Assistant", 1, 20_988), down(JAMES, "JAMES SEOW", "Revenue Specialist", 2, 36_400)],
};

const bill = (o: Partial<MemberBookOrder> & Pick<MemberBookOrder, "id" | "number" | "revenue">): MemberBookOrder => ({
  ref: null, customer: "Mr Tan", date: "2026-11-01", sourceMonth: "2026-11", recognitionMonth: "2026-11",
  brand: "AKEMI", booth: "AKEMI", venue: "PENANG WATERFRONT", fairStart: "2026-11-06", fairEnd: "2026-11-08", organiser: "MEGAHOME", week: "2026-11-06",
  margin: 29.5, kpiQty: 0, cleared: true, carried: false, manual: false, total: o.revenue, paid: o.revenue, depositNeeded: null,
  lines: [{ name: "AKEMI APEX (Q)", code: "AK-APEX-Q", qty: 1, amount: o.revenue, goods: true, kpiQty: 0 }], own: true, share: null, ...o,
});
const book = (from: string, through: string, orders: MemberBookOrder[]): MemberOrderBook =>
  ({ from, through, asOf: "2026-11-03T04:00:00Z", paysFrom: "2026-09", closedMonths: [], brandWeeks: {}, orders });
const kpiOff = (period: string): MemberKpiSummary =>
  ({ schemeId: "s-fair", period, asOf: "2026-11-03T04:00:00Z", enabled: false, items: [], total: 0, threshold: null, hit: null });

const STANLEY_BILL = bill({ id: "s1", number: "HC-SO-2611-001", revenue: 13_700 });
const JAMES_BILLS = [bill({ id: "j1", number: "HC-SO-2611-033", revenue: 36_400 })];

function source(person: { ok: boolean } = { ok: true }) {
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data: stanley() })),
    insight: vi.fn(async () => ({ ok: true as const, data: { period: "2026-11", asOf: "2026-11-03T04:00:00Z", live: true, blocks: [block] } })),
    kpi: vi.fn(async (_scheme: string, _context?: unknown, period?: string) => ({ ok: true as const, data: kpiOff(period ?? "2026-11") })),
    // The reader's own two months — and, the Principal viewing somebody, the person's through View as's context.
    orderBook: vi.fn(async (_sub: string, from: string, until: string, context?: { staffId: string }) =>
      ({ ok: true as const, data: book(from, until, context?.staffId === JAMES ? JAMES_BILLS : [STANLEY_BILL]) })),
    teamBook: vi.fn(async (_sub: string, _staff: string, from: string, until: string) =>
      (person.ok ? { ok: true as const, data: book(from, until, JAMES_BILLS) } : { ok: false as const, error: "This person is not in your team" })),
    teamKpi: vi.fn(async (_scheme: string, _staff: string, period?: string) => ({ ok: true as const, data: kpiOff(period ?? "2026-11") })),
    orgMap: none, insightRange: none, arena: none, quote: none, memo: none, requestHistory: none, cancelRequest: none,
    income: none, departmentIncome: none, honours: none, claimRates: none,
    memoReceipts: vi.fn(async () => ({ ok: true as const, data: [] })),
    submitRequest: vi.fn(async (form: FormData) => { void form; return { ok: false as const, error: "not in this test" }; }),
  } satisfies RevenueSource;
}

beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function open(search: string, data: MemberData, live: ReturnType<typeof source>) {
  window.history.replaceState({}, "", `/member${search}`);
  render(<RevenueApp initialData={data} initialSearch={search} today="2026-11-03" source={live} />);
  await act(async () => {});
  return live;
}

const myTeam = () => fireEvent.click(screen.getByRole("button", { name: "My team" }));

describe("Insight › My team › a person", () => {
  it("a leader taps a member: their own sales and bills, under their name — read-only — and back to My team", async () => {
    const live = await open("?page=insight&department=fair", stanley(), source());
    myTeam();
    // Everybody My team lists opens; the member's own row does not.
    expect(screen.getByRole("button", { name: "View LUCAS" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View STANLEY (you)" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View JAMES SEOW" }));
    await act(async () => {});

    // Their own reads, under the member's session — never the reader's book, never View as.
    expect(live.teamBook).toHaveBeenCalledWith("fair", JAMES, "2026-11", "2026-11");
    expect(live.teamKpi).toHaveBeenCalledWith("s-fair", JAMES, "2026-11");
    expect(live.orderBook.mock.calls.every(c => c[3] === undefined)).toBe(true);
    expect(new URLSearchParams(window.location.search).get("of")).toBe(JAMES);

    expect(screen.getByRole("heading", { name: "JAMES SEOW" })).toBeInTheDocument();
    expect(screen.getByText("Revenue Specialist")).toBeInTheDocument();
    const sales = screen.getByRole("button", { name: /All bills/ });
    expect(sales).toHaveTextContent("Sales");
    expect(sales).not.toHaveTextContent("My sales");
    expect(sales).toHaveTextContent("RM 36,400");
    expect(screen.getByText("Margin by brand")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Personal" })).not.toBeInTheDocument();

    // All bills: their sales orders, and a bill of theirs with nothing to share.
    fireEvent.click(sales);
    await act(async () => {});
    expect(screen.getByRole("heading", { name: "JAMES SEOW’s sales orders" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /HC-SO-2611-033/ }));
    const sheet = screen.getByRole("dialog", { name: "Sales order" });
    expect(within(sheet).getByText("HC-SO-2611-033")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));

    // ‹ JAMES SEOW → their page; ‹ My team → the team again.
    fireEvent.click(screen.getByRole("button", { name: "JAMES SEOW" }));
    expect(screen.getByRole("heading", { name: "JAMES SEOW" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "My team" }));
    expect(screen.getByRole("heading", { name: "Team members" })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("of")).toBeNull();
  });

  it("a person the database will not open says so", async () => {
    await open(`?page=insight&department=fair&of=${JAMES}`, stanley(), source({ ok: false }));
    expect(screen.getByRole("heading", { name: "JAMES SEOW" })).toBeInTheDocument();
    expect(screen.getByText("These bills are not available.")).toBeInTheDocument();
  });

  it("somebody My team does not list opens nothing, and nothing of theirs is read — for the Principal viewing a leader too", async () => {
    const ANTHONY = "79516ca3-333e-420d-988a-bef4228a178a";
    const own = await open(`?page=insight&department=fair&of=${ANTHONY}`, stanley(), source());
    expect(screen.getByText("These bills are not available.")).toBeInTheDocument();
    expect(own.teamBook).not.toHaveBeenCalled();
    cleanup();
    const live = source();
    live.refresh.mockResolvedValue({ ok: true, data: principal() });
    await open(`?page=insight&department=fair&staff=${STANLEY}&of=${ANTHONY}`, principal(), live);
    expect(screen.getByText("These bills are not available.")).toBeInTheDocument();
    expect(live.orderBook.mock.calls.some(c => c[3]?.staffId === ANTHONY)).toBe(false);
  });

  it("the Principal viewing a leader opens their member through View as's own context", async () => {
    const live = source();
    live.refresh.mockResolvedValue({ ok: true, data: principal() });
    await open(`?page=insight&department=fair&staff=${STANLEY}`, principal(), live);
    myTeam();
    fireEvent.click(screen.getByRole("button", { name: "View JAMES SEOW" }));
    await act(async () => {});
    expect(live.orderBook).toHaveBeenCalledWith("fair", "2026-11", "2026-11", { staffId: JAMES, subDepartmentId: "fair" });
    expect(live.kpi).toHaveBeenCalledWith("s-fair", { staffId: JAMES, subDepartmentId: "fair" }, "2026-11");
    expect(live.teamBook).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /All bills/ })).toHaveTextContent("RM 36,400");
  });
});
