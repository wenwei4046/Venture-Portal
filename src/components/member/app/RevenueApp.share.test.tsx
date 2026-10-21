import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import { shareRequestFromRow, type ShareRequest } from "@/lib/member/share-requests";
import type { MemberData } from "@/lib/member/types";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// Share order in the Revenue app (2026-10-21 — the user: "先 notify 被 share 的那个人（例如 Anthony），Anthony 按
// Accept … Accept 之后，才会去到 HR"): a bill shared with them is a to-do on Today and NEEDS YOU in the bell, and its
// tapped notice opens the request over the first drawing.
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

// The demo's own member (`memberDemo()`: profile id "jia") is the colleague LUCAS named.
const ME = "jia";
const request = (over: Record<string, unknown> = {}): ShareRequest => shareRequestFromRow({
  id: "s1", status: "partner", orderId: "o1", orderNo: "HC-SO-2610-004", periodMonth: "2026-10", subDepartmentId: "fair",
  owner: { id: "lucas", name: "LUCAS" }, note: "Closed it together", createdAt: "2026-10-05T01:00:00Z", updatedAt: "2026-10-05T01:00:00Z",
  decidedAt: null, decidedByName: null, decisionNote: null, mine: "partner",
  bill: { date: "2026-10-04", customer: "Mdm Tan", venue: "MITEC", total: 4300, ownerId: "lucas", counts: true, periodMonth: "2026-10" },
  parts: [{ id: ME, name: "JIA EN", pct: 0.5, answer: "pending", answeredAt: null, note: null }],
  holders: [{ id: "lucas", name: "LUCAS", pct: 1, owner: true }],
  events: [{ step: "sent", name: "LUCAS", at: "2026-10-05T01:00:00Z", note: "Closed it together" }],
  ...over,
})!;

function memberData(): MemberData {
  return { ...memberDemo(), demo: false, memos: [], requests: [], incomes: [] };
}

function source() {
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data: memberData() })),
    insight: none, kpi: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none, orderBook: none, arena: none,
    cancelRequest: none, income: none, departmentIncome: none, honours: none, claimRates: none, submitRequest: none,
    memoReceipts: vi.fn(async () => ({ ok: true as const, data: [] })),
    shareRequests: vi.fn(async () => ({ ok: true as const, data: [request()] })),
    shareAnswer: vi.fn(async (_id: string, accept: boolean) => ({ ok: true as const, data: request({
      status: accept ? "hr" : "declined",
      parts: [{ id: ME, name: "JIA EN", pct: 0.5, answer: accept ? "accepted" : "declined", answeredAt: "2026-10-05T02:00:00Z", note: null }],
      events: [...request().events, { step: accept ? "accepted" : "declined", name: "JIA EN", at: "2026-10-05T02:00:00Z", note: null }],
    }) })),
    shareCancel: none, shareContext: none, shareSend: none,
  } satisfies RevenueSource;
}

beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function open(search: string) {
  window.history.replaceState({}, "", `/member${search}`);
  const live = source();
  render(<RevenueApp initialData={memberData()} initialSearch={search} today="2026-10-05" source={live} />);
  await act(async () => {});
  return live;
}

describe("share order", () => {
  it("opens the request a tapped notice names, over Today — and the colleague accepts it there", async () => {
    const live = await open("?share=s1");
    const sheet = await screen.findByRole("dialog", { name: "Share request HC-SO-2610-004" });
    await waitFor(() => expect(sheet).toHaveTextContent("Waiting for JIA EN"));
    expect(sheet).toHaveTextContent("SplitLUCAS 50% · JIA EN 50%");
    fireEvent.click(within(sheet).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(live.shareAnswer).toHaveBeenCalledWith("s1", true, null));
    await waitFor(() => expect(sheet).toHaveTextContent("With HR"));
    expect(within(sheet).queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("is a to-do on Today until it is answered", async () => {
    await open("");
    const todo = await screen.findByRole("button", { name: /Accept HC-SO-2610-004\?/ });
    expect(todo).toHaveTextContent("LUCAS shared it with you");
    fireEvent.click(todo);
    expect(await screen.findByRole("dialog", { name: "Share request HC-SO-2610-004" })).toBeInTheDocument();
  });
});
