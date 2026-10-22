import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import type { MemberOrderBook } from "@/lib/member/order-book";
import type { DepartmentIncome } from "@/lib/member/income";
import type { MemberData, MemberReadContext } from "@/lib/member/types";
import { ask, type MemberRead, type RevenueSource } from "./source";
import { readKey } from "./read-memory";
import RevenueApp from "./RevenueApp";

// 2026-10-08, user: 每次进来好像都在 loading … 进去的时候先看旧的数据，等它 refresh 之后才是新的数据.
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
vi.mock("@/app/(member)/member/batch-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }

/** The Principal, viewing nobody: Today's hero is the department's commission. */
function principalData(): MemberData {
  const demo = memberDemo();
  return {
    ...demo, demo: false, principalView: true,
    profile: { id: "principal", userId: "principal", name: "Principal", email: "principal@example.invalid", salary: null },
    memberships: demo.memberships.map(m => ({ ...m, title: "Principal", rank: "All access", people: [] })),
    memos: [], requests: [], incomes: [],
  };
}
function memberData(): MemberData {
  const demo = memberDemo();
  return { ...demo, demo: false, memos: [], requests: [], incomes: [] };
}
const book = (from: string, through: string): MemberOrderBook =>
  ({ from, through, asOf: "2026-10-05T04:00:00Z", paysFrom: "2026-09", closedMonths: [], brandWeeks: {}, orders: [] });
const arena = (membershipId: string, period: string, context?: MemberReadContext): MemberArenaSnapshot => ({
  principalView: !!context, viewedStaffId: context?.staffId, membershipId, department: "Fair", selfId: context ? "" : "jia",
  period, window: "monthly", from: `${period}-01`, through: `${period}-05`, asOf: "2026-10-05T04:00:00Z", live: true,
  people: [], brands: [], weekLocks: [], tiers: [], brandWeeks: { weeks: 5, counts: { AKEMI: 0, ERGOTEX: 0, ZANOTTI: 0, DUNLOP: 0 }, picks: {} },
});
const dept = (commission: number): DepartmentIncome => ({ period: "2026-10", state: "live", commission, countedSales: 50_000 });

/** Every read waits until `release()`; the phone kept what `kept` says. */
function heldSource(kept: [MemberRead, unknown][], answers: { dept: () => DepartmentIncome }) {
  const waiting: (() => void)[] = [];
  const asked: string[] = [];
  const hold = <T,>(label: string, value: () => T): Promise<T> => {
    asked.push(label);
    return new Promise<T>(resolve => { waiting.push(() => resolve(value())); });
  };
  const memory = new Map(kept.map(([read, value]) => [readKey(read), value]));
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  const api: RevenueSource = {
    refresh: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none, submitRequest: none, cancelRequest: none,
    claimRates: none, honours: none, memoReceipts: none,
    income: () => hold("income", () => ({ ok: false as const, error: "not in this test" })),
    departmentIncome: () => hold("departmentIncome", () => ({ ok: true as const, data: answers.dept() })),
    insight: (period?: string) => hold(`insight:${period}`, () => ({ ok: false as const, error: "not in this test" })),
    kpi: (_scheme: string, _context?: MemberReadContext, period?: string) => hold(`kpi:${period}`, () => ({ ok: false as const, error: "not in this test" })),
    orderBook: (_sub: string, from: string, until: string) => hold(`orderBook:${from}..${until}`, () => ({ ok: true as const, data: book(from, until) })),
    arena: (membershipId: string, period: string, _window: string, context?: MemberReadContext) =>
      hold(`arena:${period}`, () => ({ ok: true as const, data: arena(membershipId, period, context) })),
    peek: <T,>(read: MemberRead) => memory.get(readKey(read)) as T | undefined,
    ready: Promise.resolve(),
    kept: () => memory.size,
  };
  return { api, asked, async release() { await act(async () => { while (waiting.length) waiting.shift()!(); }); } };
}

beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("the Revenue app opens on what the phone kept (2026-10-08)", () => {
  it("shows the last figure at once, spins while it reads again, then swaps the new one in", async () => {
    window.history.replaceState({}, "", "/member?department=fair");
    let fresh = 2000;
    const source = heldSource([[ask.departmentIncome("fair", "2026-10"), dept(1234.5)]], { dept: () => dept(fresh) });
    render(<RevenueApp initialData={principalData()} initialSearch="?department=fair" today="2026-10-05" source={source.api} />);

    // The kept figure, while the department's read is still out — no "Working out…".
    expect(await screen.findByText("1,234.50")).toBeInTheDocument();
    expect(screen.queryByText(/Working out/)).not.toBeInTheDocument();
    await vi.waitFor(() => expect(source.asked).toContain("departmentIncome"));
    expect(screen.getByText("Refreshing…")).toBeInTheDocument();
    expect(screen.getByText("1,234.50")).toBeInTheDocument();

    fresh = 2500;
    await source.release();
    expect(await screen.findByText("2,500.00")).toBeInTheDocument();
    expect(screen.queryByText("1,234.50")).not.toBeInTheDocument();
    expect(screen.queryByText("Refreshing…")).not.toBeInTheDocument();
  });

  it("with nothing kept, opens as before: a placeholder where the figure goes, no spinner over nothing", async () => {
    window.history.replaceState({}, "", "/member?department=fair");
    const source = heldSource([], { dept: () => dept(2000) });
    render(<RevenueApp initialData={principalData()} initialSearch="?department=fair" today="2026-10-05" source={source.api} />);
    expect(await screen.findByText(/Working out October/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Working out your income" })).toBeInTheDocument();
    await vi.waitFor(() => expect(source.asked).toContain("departmentIncome"));
    expect(screen.queryByText("Refreshing…")).not.toBeInTheDocument();
    await source.release();
    expect(await screen.findByText("2,000.00")).toBeInTheDocument();
  });

  it("Today's reads all leave before any answer — this month's figures no longer wait for the two-month book", async () => {
    window.history.replaceState({}, "", "/member?department=fair");
    const source = heldSource([], { dept: () => dept(0) });
    render(<RevenueApp initialData={memberData()} initialSearch="?department=fair" today="2026-10-05" source={source.api} />);
    await vi.waitFor(() => expect(source.asked).toContain("arena:2026-10"));
    // Nothing has answered yet, and every read Today shows is already out.
    expect(source.asked).toEqual(expect.arrayContaining(["income", "orderBook:2026-09..2026-10", "insight:2026-10", "kpi:2026-10", "arena:2026-10"]));
    // Last month's Arena is read by the pages that show it, not by Today.
    expect(source.asked).not.toContain("arena:2026-09");
    await source.release();
  });
});
