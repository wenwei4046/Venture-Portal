import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { AppClosed } from "@/lib/member/app-pages";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import type { MemberOrderBook } from "@/lib/member/order-book";
import type { MemberData, MemberRequest } from "@/lib/member/types";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// The app follows its holder's ticks (2026-10-11, the user: "勾掉 Arena，手机 app 就不显示").
const nav = vi.hoisted(() => ({ router: { push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/member",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => nav.router,
}));
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/rooms-actions", () => ({}));
vi.mock("@/app/(member)/member/docs-actions", () => ({}));
vi.mock("@/app/(member)/member/arena-actions", () => ({}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }

const RETURNED: MemberRequest = {
  id: "c1", kind: "claim", title: "Outstation claim", status: "needs_info", createdAt: "2026-10-04T04:00:00Z",
  submittedAt: "2026-10-04T04:00:00Z", requestNo: "RQ-2610-002", staffId: "jia", detail: { claimType: "outstation", amount: 200 },
};

function memberData(requests: MemberRequest[] = []): MemberData {
  return { ...memberDemo(), demo: false, memos: [], requests, incomes: [] };
}

function book(from: string, through: string): MemberOrderBook {
  return { from, through, asOf: "2026-10-05T04:00:00Z", paysFrom: "2026-09", closedMonths: [], costDivisor: 0.7, brandWeeks: {}, orders: [] };
}

function arena(membershipId: string, period: string): MemberArenaSnapshot {
  return {
    principalView: false, membershipId, department: "Fair", selfId: "jia",
    period, window: "monthly", from: `${period}-01`, through: `${period}-05`, asOf: "2026-10-05T04:00:00Z", live: true,
    people: [], brands: [], brandWeeks: null, weekLocks: [], tiers: [],
    history: { asOf: "2026-10-05T04:00:00Z", provisional: true, events: [], unassignedOrders: 0, unassignedSales: 0, championship: { status: "pending", reason: "" } },
  };
}

function source(make: () => MemberData) {
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data: make() })),
    insight: none, kpi: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none,
    cancelRequest: none, income: none, departmentIncome: none, honours: none, saveBrandWeeks: none, claimRates: none,
    memoReceipts: vi.fn(async () => ({ ok: true as const, data: [] })),
    orderBook: vi.fn(async (_sub: string, from: string, until: string) => ({ ok: true as const, data: book(from, until) })),
    arena: vi.fn(async (membershipId: string, period: string) => ({ ok: true as const, data: arena(membershipId, period) })),
    submitRequest: vi.fn(async (form: FormData) => { void form; return { ok: false as const, error: "not in this test" }; }),
  } satisfies RevenueSource;
}

beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function open(search: string, closed?: AppClosed, make: () => MemberData = memberData) {
  window.history.replaceState({}, "", `/member${search}`);
  const live = source(make);
  render(<RevenueApp initialData={make()} initialSearch={search} today="2026-10-05" source={live} closed={closed} />);
  await act(async () => {});
  return live;
}

const navButtons = (name: string) => screen.queryAllByRole("button", { name });

describe("a page their ticks close is neither shown nor reachable", () => {
  it("nothing closed: the bar and the sidebar have every page, Today its Arena", async () => {
    await open("?department=fair");
    expect(navButtons("Arena").length).toBeGreaterThan(0);
    expect(navButtons("Insight").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Your Arena" })).toBeInTheDocument();
    // Sales twice: Today's figure, and the Arena's board.
    expect(screen.getAllByRole("button", { name: /^Sales/ })).toHaveLength(2);
  });

  it("the Arena closed: out of the bar and the sidebar, off Today, and its address lands on Today", async () => {
    await open("?page=arena&view=board&board=margin&department=fair", { pages: ["arena"], sends: [] });
    expect(navButtons("Arena")).toEqual([]);
    expect(screen.queryByRole("heading", { name: "Your Arena" })).not.toBeInTheDocument();
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("page")).toBeNull());
    expect(new URLSearchParams(window.location.search).get("department")).toBe("fair");
    // The bar keeps the rest, the Quote raised in the middle of four.
    expect(navButtons("Quote").length).toBeGreaterThan(0);
  });

  it("Insight closed: Today's figures stay but open nothing", async () => {
    await open("?department=fair", { pages: ["insight"], sends: [] });
    expect(navButtons("Insight")).toEqual([]);
    // Sales once — the Arena's board; Today's figure is still there, opening nothing.
    expect(screen.getAllByRole("button", { name: /^Sales/ })).toHaveLength(1);
    expect(screen.getAllByText("Sales")).toHaveLength(2);
  });

  it("Today closed: the app opens on Insight instead, which carries the phone's header", async () => {
    await open("?page=insight&department=fair");
    // Nothing closed: Insight has no phone header — only the desk header switches sub-department.
    expect(navButtons("Switch sub-department")).toHaveLength(1);
    cleanup();
    await open("?department=fair", { pages: ["today"], sends: [] });
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("page")).toBe("insight"));
    expect(navButtons("Today")).toEqual([]);
    // The bell and the sub-department switch live in the phone's header, Today's until now.
    expect(navButtons("Switch sub-department")).toHaveLength(2);
  });

  it("Profile lists only the workspace pages left open", async () => {
    await open("?page=account&department=fair", { pages: ["income", "team"], sends: [] });
    expect(screen.queryByRole("button", { name: /My income/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Team & capacity/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Requests/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /My honours/ })).toBeInTheDocument();
  });

  it("a returned claim with Requests closed is not on Today’s to-dos, nor in the bell", async () => {
    const withReturned = () => memberData([RETURNED]);
    await open("?department=fair", undefined, withReturned);
    expect(screen.getByText("Claim needs info")).toBeInTheDocument();
    cleanup();
    await open("?department=fair", { pages: ["requests"], sends: ["requests"] }, withReturned);
    expect(screen.queryByText("Claim needs info")).not.toBeInTheDocument();
  });
});

describe("a page whose Create their ticks close sends nothing", () => {
  it("Requests offers a claim only when Waiting list & replacements’ Create is closed", async () => {
    await open("?page=account&view=requests&department=fair", { pages: [], sends: ["track"] });
    expect(screen.getByRole("button", { name: /Submit claim/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Submit replacement/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Submit waiting list/ })).not.toBeInTheDocument();
  });

  it("and no claim when its own Create is", async () => {
    await open("?page=account&view=requests&department=fair", { pages: [], sends: ["requests"] });
    expect(screen.queryByRole("button", { name: /Submit claim/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Submit waiting list/ })).toBeInTheDocument();
  });

  it("Waiting list & replacements: no new one when its Create is closed; with Requests closed, the form opens at once", async () => {
    await open("?page=account&view=track&department=fair", { pages: [], sends: ["track"] });
    expect(screen.queryByRole("button", { name: /Submit a new request/ })).not.toBeInTheDocument();
    cleanup();
    await open("?page=account&view=track&department=fair", { pages: ["requests"], sends: ["requests"] });
    fireEvent.click(screen.getByRole("button", { name: /Submit a new request/ }));
    expect(screen.getByRole("dialog", { name: "Submit waiting list" })).toBeInTheDocument();
  });
});
