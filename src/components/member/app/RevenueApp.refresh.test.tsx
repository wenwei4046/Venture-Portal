import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { ArenaWeekPicks, MemberArenaSnapshot } from "@/lib/member/arena";
import type { MemberOrderBook } from "@/lib/member/order-book";
import type { MemberData, MemberReadContext } from "@/lib/member/types";
import type { RevenueSource } from "./source";
import { reloader } from "./shell/pull-refresh";
import RevenueApp from "./RevenueApp";

// The live source's server actions are never reached: the app is handed a source of its own.
// RevenueApp reads its path (the Product List is a page of its own, 2026-10-08) and steps there with the router.
const nav = vi.hoisted(() => ({ router: { push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/member",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => nav.router,
}));
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/arena-actions", () => ({}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({}));
vi.mock("@/app/(member)/member/batch-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }

const VIEW_AS = "?page=account&view=brandWeeks&department=fair&staff=anthony";
const MEMBER = "?page=account&view=brandWeeks&department=fair";

/** The Principal viewing ANTHONY — a refresh hands back everybody's snapshot, as `loadMemberData` does. */
function principalData(): MemberData {
  const demo = memberDemo();
  return {
    ...demo, demo: false, principalView: true,
    profile: { id: "principal", userId: "principal", name: "Principal", email: "principal@example.invalid", salary: null },
    memberships: demo.memberships.map(m => ({ ...m, title: "Principal", rank: "All access",
      people: [{ id: "anthony", name: "ANTHONY", title: "Team Leader", rank: "Rank A", parentId: null, self: false }] })),
    memos: [], requests: [], incomes: [],
  };
}

/** A member whose September has been paid: the bell reads September's Arena for its results. */
function memberData(): MemberData {
  const demo = memberDemo();
  return { ...demo, demo: false, memos: [], requests: [],
    incomes: [{ ...demo.incomes[0], schemeId: "fair-scheme", period: "2026-09", status: "applied" }] };
}

function book(from: string, through: string): MemberOrderBook {
  const value = { from, through, asOf: "2026-10-05T04:00:00Z", paysFrom: "2026-09", closedMonths: [], brandWeeks: {}, orders: [] };
  return value;
}

function arena(membershipId: string, period: string, context: MemberReadContext | undefined, picks: ArenaWeekPicks): MemberArenaSnapshot {
  return {
    principalView: !!context, viewedStaffId: context?.staffId, membershipId, department: "Fair", selfId: context ? "" : "jia",
    period, window: "monthly", from: `${period}-01`, through: `${period}-05`, asOf: "2026-10-05T04:00:00Z", live: true,
    people: [], brands: [], weekLocks: [], tiers: [],
    brandWeeks: { weeks: 5, counts: { AKEMI: 0, ERGOTEX: 0, ZANOTTI: 0, DUNLOP: 0 }, picks },
  };
}

/**
 * A source that answers at once until `hold()`, then keeps every answer until `release()` — so what the
 * page shows WHILE a refresh reads can be looked at. Answers are made at release: change `world` in between.
 */
function fakeSource(make: () => MemberData) {
  // offline: every request fails to arrive; stale: a newer release is live and refuses this page's actions.
  const world = { picks: {} as ArenaWeekPicks, failArena: false, offline: false, stale: false };
  const waiting: (() => void)[] = [];
  let holding = false;
  const answer = <T,>(value: () => T): Promise<T> => {
    const settle = (resolve: (v: T) => void, reject: (e: unknown) => void) => {
      if (world.offline) reject(new TypeError("Failed to fetch"));
      else if (world.stale) reject(Object.assign(new Error('Server Action "40ab" was not found on the server.'), { name: "UnrecognizedActionError" }));
      else resolve(value());
    };
    if (!holding) return new Promise<T>(settle);
    return new Promise<T>((resolve, reject) => { waiting.push(() => settle(resolve, reject)); });
  };
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  const api = {
    refresh: vi.fn(() => answer(() => ({ ok: true as const, data: make() }))),
    insight: vi.fn(async (_period: string | undefined, _context?: MemberReadContext) => ({ ok: false as const, error: "not in this test" })),
    kpi: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none,
    submitRequest: none, cancelRequest: none, claimRates: none, honours: none, saveBrandWeeks: none, departmentIncome: none,
    // Today's income: Comm Cal's engine for the live month (#195), asked for by ids.
    income: vi.fn(async () => ({ ok: false as const, error: "not in this test" })),
    memoReceipts: vi.fn(() => answer(() => ({ ok: true as const, data: [] }))),
    orderBook: vi.fn((_sub: string, from: string, until: string) => answer(() => ({ ok: true as const, data: book(from, until) }))),
    arena: vi.fn((membershipId: string, period: string, _window: string, context?: MemberReadContext) => answer(() => (world.failArena
      ? { ok: false as const, error: "Arena could not be loaded." }
      : { ok: true as const, data: arena(membershipId, period, context, world.picks) }))),
  } satisfies RevenueSource;
  return {
    api, world,
    hold() { holding = true; },
    async release() { holding = false; await act(async () => { while (waiting.length) waiting.shift()!(); }); },
  };
}

async function open(make: () => MemberData, search: string) {
  window.history.replaceState({}, "", `/member${search}`);
  const source = fakeSource(make);
  render(<RevenueApp initialData={make()} initialSearch={search} today="2026-10-05" source={source.api} />);
  expect(await screen.findByText("0 of 5 picked")).toBeInTheDocument();
  return source;
}

/** A finger dragged down `distance` px from near the top of the page, then lifted. */
function pull(distance: number) {
  const main = screen.getByRole("main");
  fireEvent.touchStart(main, { touches: [{ clientX: 120, clientY: 100 }] });
  fireEvent.touchMove(main, { touches: [{ clientX: 122, clientY: 100 + distance / 2 }] });
  fireEvent.touchMove(main, { touches: [{ clientX: 122, clientY: 100 + distance }] });
  fireEvent.touchEnd(main, { touches: [] });
}

function calls(fn: { mock: { calls: unknown[][] } }, period?: string) {
  return fn.mock.calls.filter(c => period === undefined || c[1] === period).length;
}

function visibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
}

let intervals: number[] = [];
let reload: Mock<() => void>;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResize);
  reload = vi.fn<() => void>();
  vi.spyOn(reloader, "reload").mockImplementation(reload);
  intervals = [];
  const real = window.setInterval.bind(window);
  vi.spyOn(window, "setInterval").mockImplementation(((fn: () => void, ms?: number) => {
    intervals.push(ms ?? 0);
    return real(fn, ms);
  }) as unknown as typeof window.setInterval);
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});

describe("RevenueApp refreshes only when pulled (2026-10-06)", () => {
  it("changes nothing on its own: no minute timer, and nothing read after the first load", async () => {
    const { api } = await open(principalData, VIEW_AS);
    const reads = { arena: calls(api.arena), book: calls(api.orderBook), income: calls(api.income) };
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(intervals).not.toContain(60_000);
    expect(api.refresh).not.toHaveBeenCalled();
    expect(calls(api.arena)).toBe(reads.arena);
    expect(calls(api.orderBook)).toBe(reads.book);
    expect(calls(api.income)).toBe(reads.income);
  });

  it("a pull keeps the page up while it reads, then swaps the new data in", async () => {
    const source = await open(principalData, VIEW_AS);
    const { api } = source;
    // Today's income is the live month's, asked for by ids (#195).
    expect(api.income).toHaveBeenCalledWith("fair", "2026-10", { staffId: "anthony", subDepartmentId: "fair" });
    const reads = { arena: calls(api.arena), book: calls(api.orderBook), income: calls(api.income) };
    source.hold();
    source.world.picks = { "2026-10-02": "AKEMI" };

    pull(300);

    expect(screen.getByText("Refreshing…")).toBeInTheDocument();
    expect(screen.queryByText("Loading your fair weekends…")).not.toBeInTheDocument();
    expect(screen.getByText("0 of 5 picked")).toBeInTheDocument();
    expect(calls(api.arena)).toBe(reads.arena + 1);
    expect(calls(api.orderBook)).toBe(reads.book + 1);
    expect(calls(api.income)).toBe(reads.income + 1);
    expect(api.refresh).toHaveBeenCalledTimes(1);

    await source.release();
    expect(await screen.findByText("1 of 5 picked")).toBeInTheDocument();
    expect(screen.queryByText("Refreshing…")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a short drag, or one that starts with the page scrolled down, is not a pull", async () => {
    const { api } = await open(principalData, VIEW_AS);
    pull(60);
    expect(api.refresh).not.toHaveBeenCalled();

    Object.defineProperty(screen.getByRole("main"), "scrollTop", { configurable: true, value: 140 });
    pull(300);
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it("offline, a pull keeps what was on screen and says so — no reload onto an offline page", async () => {
    const source = await open(principalData, VIEW_AS);
    source.hold();
    source.world.offline = true;
    source.world.picks = { "2026-10-02": "AKEMI" };
    pull(300);
    await source.release();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't refresh. Pull down to try again.");
    expect(screen.getByText("0 of 5 picked")).toBeInTheDocument();
    expect(screen.queryByText("Loading your fair weekends…")).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it("after a new release, a pull loads the new app — this page's actions are gone", async () => {
    const source = await open(principalData, VIEW_AS);
    source.hold();
    source.world.stale = true;
    pull(300);
    await source.release();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("…but never over brand weeks picked and not saved: it says so instead", async () => {
    const source = await open(principalData, VIEW_AS);
    fireEvent.click(screen.getAllByRole("button", { name: "Akemi" })[0]);
    expect(screen.getByText("1 of 5 picked")).toBeInTheDocument();
    source.hold();
    source.world.stale = true;
    pull(300);
    await source.release();
    expect(reload).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't refresh");
    expect(screen.getByText("1 of 5 picked")).toBeInTheDocument();
  });

  it("a read answering \"not available\" (KPI off, no payroll row) is not a failed pull", async () => {
    const source = await open(principalData, VIEW_AS);
    source.hold();
    source.world.failArena = true;
    pull(300);
    await source.release();
    expect(screen.queryByText("Refreshing…")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("0 of 5 picked")).toBeInTheDocument();
  });

  it("back after ten minutes away it reads everything again once; after two, nothing", async () => {
    const { api } = await open(principalData, VIEW_AS);
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);
    visibility("hidden");
    now.mockReturnValue(1_000_000 + 2 * 60_000);
    visibility("visible");
    expect(api.refresh).not.toHaveBeenCalled();

    visibility("hidden");
    now.mockReturnValue(1_000_000 + 13 * 60_000);
    visibility("visible");
    await act(async () => {});
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it("a member's paid month is read once for the pull, not again when the new data lands", async () => {
    const source = await open(memberData, MEMBER);
    const { api } = source;
    expect(calls(api.arena, "2026-09")).toBe(1);
    source.hold();
    pull(300);
    await source.release();
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(calls(api.arena, "2026-09")).toBe(2);
    expect(screen.getByText("0 of 5 picked")).toBeInTheDocument();
  });
});

// 2026-10-06, measured on prod (#206): Server Actions run one at a time, and before the
// month being worked was known Insight read the current month's bills, block and
// KPI — three reads queued in front of Today's own, only to be read again.
describe("Today's first load", () => {
  it("reads this month's Insight block once, and no bills beyond the two-month book", async () => {
    window.history.replaceState({}, "", "/member?department=fair");
    const { api } = fakeSource(memberData);
    render(<RevenueApp initialData={memberData()} initialSearch="?department=fair" today="2026-10-05" source={api} />);
    await vi.waitFor(() => expect(api.arena).toHaveBeenCalledWith("fair", "2026-10", "monthly", undefined));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(api.insight.mock.calls.filter(([period]) => period === "2026-10")).toHaveLength(1);
    expect(api.orderBook.mock.calls.map(([, from, until]) => `${from}..${until}`)).toEqual(["2026-09..2026-10"]);
  });
});
