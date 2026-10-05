import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import type { MemberOrderBook } from "@/lib/member/order-book";
import type { MemberData, MemberReadContext } from "@/lib/member/types";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// The live source's server actions are never reached: the app is handed a source of its own.
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/arena-actions", () => ({}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }

const never = <T,>() => new Promise<T>(() => {});

/** The Principal viewing ANTHONY — the refresh hands back everybody's snapshot, as `loadMemberData` does. */
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

function arena(membershipId: string, period: string, context?: MemberReadContext): MemberArenaSnapshot {
  return {
    principalView: !!context, viewedStaffId: context?.staffId, membershipId, department: "Fair", selfId: context ? "" : "jia",
    period, window: "monthly", from: `${period}-01`, through: `${period}-05`, asOf: "2026-10-05T04:00:00Z", live: true,
    people: [], brands: [], brandWeeks: null, weekLocks: [], tiers: [],
  };
}

/** Reads answer until `hold` is set, and never after — so a read repeated after the first load shows. */
function source(make: () => MemberData, hold: { on: boolean }) {
  const later = <T,>(value: T) => (hold.on ? never<T>() : Promise.resolve(value));
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data: make() })),
    insight: vi.fn(async (_period: string | undefined, _context?: MemberReadContext) => ({ ok: false as const, error: "not in this test" })),
    kpi: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none,
    submitRequest: none, cancelRequest: none, claimRates: none, honours: none, saveBrandWeeks: none,
    // Today's month, worked out by the engine: mocks of their own, so their reads can be counted.
    income: vi.fn(async (_sub: string, _period: string, _context?: MemberReadContext) => ({ ok: false as const, error: "not in this test" })),
    departmentIncome: vi.fn(async (_sub: string, _period: string) => ({ ok: false as const, error: "not in this test" })),
    memoReceipts: vi.fn(async () => ({ ok: true as const, data: [] })),
    orderBook: vi.fn((_sub: string, from: string, until: string) => later({ ok: true as const, data: book(from, until) })),
    arena: vi.fn((membershipId: string, period: string, _window: string, context?: MemberReadContext) =>
      later({ ok: true as const, data: arena(membershipId, period, context) })),
  } satisfies RevenueSource;
}

let minute: (() => void) | null = null;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResize);
  // The app's minute refresh, run by hand; every other timer stays real.
  const real = window.setInterval.bind(window);
  vi.spyOn(window, "setInterval").mockImplementation(((fn: () => void, ms?: number) => {
    if (ms === 60_000) { minute = fn; return 0; }
    return real(fn, ms);
  }) as unknown as typeof window.setInterval);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); minute = null; });

/** Open Brand weeks, wait for it, then run the minute's refresh with every further read held. */
async function refreshOnBrandWeeks(make: () => MemberData, search: string) {
  window.history.replaceState({}, "", `/member${search}`);
  const hold = { on: false };
  const live = source(make, hold);
  render(<RevenueApp initialData={make()} initialSearch={search} today="2026-10-05" source={live} />);
  expect(await screen.findByText("0 of 5 picked")).toBeInTheDocument();
  const reads = { arena: live.arena.mock.calls.length, book: live.orderBook.mock.calls.length, income: live.income.mock.calls.length };
  hold.on = true;
  expect(minute).toBeTypeOf("function");
  await act(async () => { minute!(); });
  expect(live.refresh).toHaveBeenCalledTimes(1);
  return { live, reads };
}

describe("RevenueApp's minute refresh", () => {
  it("View as: Brand weeks stays on screen and nothing is read again", async () => {
    const { live, reads } = await refreshOnBrandWeeks(principalData, "?page=account&view=brandWeeks&department=fair&staff=anthony");
    expect(screen.queryByText("Loading your fair weekends…")).not.toBeInTheDocument();
    expect(screen.getByText("0 of 5 picked")).toBeInTheDocument();
    expect(live.arena).toHaveBeenCalledTimes(reads.arena);
    expect(live.orderBook).toHaveBeenCalledTimes(reads.book);
    // Today is the live month (2026-10-06): the viewed person's October, asked for by ids, once.
    expect(live.income).toHaveBeenCalledWith("fair", "2026-10", { staffId: "anthony", subDepartmentId: "fair" });
    expect(live.income).toHaveBeenCalledTimes(reads.income);
  });

  it("a member: the paid month's results are not read again", async () => {
    const { live, reads } = await refreshOnBrandWeeks(memberData, "?page=account&view=brandWeeks&department=fair");
    expect(live.arena).toHaveBeenCalledWith("fair", "2026-09", "monthly", undefined);
    expect(screen.getByText("0 of 5 picked")).toBeInTheDocument();
    expect(live.arena).toHaveBeenCalledTimes(reads.arena);
    expect(live.orderBook).toHaveBeenCalledTimes(reads.book);
    expect(live.income).toHaveBeenCalledWith("fair", "2026-10", undefined);
    expect(live.income).toHaveBeenCalledTimes(reads.income);
  });
});

// 2026-10-06, measured on prod: Server Actions run one at a time, and before the
// month being worked was known Insight read the current month's bills, block and
// KPI — three reads queued in front of Today's own, only to be read again.
describe("Today's first load", () => {
  it("reads this month's Insight block once, and no bills beyond the two-month book", async () => {
    window.history.replaceState({}, "", "/member?department=fair");
    const live = source(memberData, { on: false });
    render(<RevenueApp initialData={memberData()} initialSearch="?department=fair" today="2026-10-05" source={live} />);
    await vi.waitFor(() => expect(live.arena).toHaveBeenCalledWith("fair", "2026-10", "monthly", undefined));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(live.insight.mock.calls.filter(([period]) => period === "2026-10")).toHaveLength(1);
    expect(live.orderBook.mock.calls.map(([, from, until]) => `${from}..${until}`)).toEqual(["2026-09..2026-10"]);
  });
});
