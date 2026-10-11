import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberData, MemberMemo } from "@/lib/member/types";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// A memo or letter addressed to PEOPLE (People › Documentation, 2026-10-11) is the member's own:
// the Principal's View as shows it only for one of its recipients.
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

const memo = (id: string, title: string, departments: string[], recipients?: string[]): MemberMemo => ({
  id, title, body: "Please read.", sender: "People & Culture", publishedAt: "2026-10-05T02:00:00Z", effectiveAt: "2026-10-05T02:00:00Z",
  version: 1, requiresAck: true, readAt: null, acknowledgedAt: null, departments, ...(recipients ? { recipients } : {}),
});

function principalData(): MemberData {
  const demo = memberDemo();
  return {
    ...demo, demo: false, principalView: true,
    profile: { id: "principal", userId: "principal", name: "Principal", email: "principal@example.invalid", salary: null },
    memberships: demo.memberships.map(m => ({ ...m, title: "Principal", rank: "All access",
      people: [
        { id: "anthony", name: "ANTHONY", title: "Team Leader", rank: "Rank A", parentId: null, self: false },
        { id: "yuny", name: "YUNY", title: "Revenue Specialist", rank: "Rank E", parentId: "anthony", self: false },
      ] })),
    memos: [
      memo("m-fair", "October brand weeks", [demo.memberships[0].name]),
      memo("m-anthony", "Offer letter", [], ["anthony"]),
      memo("m-yuny", "Warning letter", [], ["yuny"]),
    ],
    requests: [], incomes: [],
  };
}

function source(make: () => MemberData) {
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data: make() })),
    insight: none, kpi: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none, orderBook: none, arena: none,
    cancelRequest: none, income: none, departmentIncome: none, honours: none, saveBrandWeeks: none, claimRates: none, submitRequest: none,
    memoReceipts: vi.fn(async () => ({ ok: true as const, data: [] })),
  } satisfies RevenueSource;
}

beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function open(search: string, make: () => MemberData) {
  window.history.replaceState({}, "", `/member${search}`);
  render(<RevenueApp initialData={make()} initialSearch={search} today="2026-10-05" source={source(make)} />);
  await act(async () => {});
}

describe("memos addressed to people, in View as", () => {
  it("viewing a member: their sub-department's memos and what was addressed to them — not somebody else's letter", async () => {
    await open("?page=account&view=memos&staff=anthony", principalData);
    expect((await screen.findAllByText("October brand weeks")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Offer letter").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Warning letter")).toHaveLength(0);
  });

  it("viewing nobody: only what went to a sub-department", async () => {
    await open("?page=account&view=memos", principalData);
    expect((await screen.findAllByText("October brand weeks")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Offer letter")).toHaveLength(0);
    expect(screen.queryAllByText("Warning letter")).toHaveLength(0);
  });

  it("a member's own snapshot holds only theirs, and shows it", async () => {
    const own = (): MemberData => ({ ...memberDemo(), demo: false, requests: [], incomes: [], memos: [memo("m-own", "Increment letter", [])] });
    await open("?page=account&view=memos", own);
    expect((await screen.findAllByText("Increment letter")).length).toBeGreaterThan(0);
  });
});
