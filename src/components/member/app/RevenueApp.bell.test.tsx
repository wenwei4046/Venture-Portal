import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberData, MemberMemo } from "@/lib/member/types";
import type { Notice, Notices } from "@/lib/push/notices";
import type { RevenueSource } from "./source";
import { LIVE_SETTLE_MS } from "./shell/useCrmUnread";
import RevenueApp from "./RevenueApp";

// The bell, live (2026-10-14 — the owner: "change to on live as well", after Today's CRM chat button): what the
// database tells the member's own channel moves the bell's figure at once — the notifications, a memo to acknowledge —
// and nothing else on the screen changes.
const realtime = vi.hoisted(() => ({ handlers: {} as Record<string, () => void> }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: (kind: string, filter: { event: string }, cb: () => void) => { if (kind === "broadcast") realtime.handlers[filter.event] = cb; return channel; },
      subscribe: () => channel,
    };
    return { realtime: { setAuth: async () => {} }, channel: () => channel, removeChannel: async () => "ok" };
  },
}));
const push = vi.hoisted(() => ({ readNotices: vi.fn(async () => ({ ok: true as const })) }));
vi.mock("@/lib/push/actions", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/push/actions")>()), readNotices: push.readNotices }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/member",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} }),
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
beforeEach(() => { realtime.handlers = {}; push.readNotices.mockClear(); vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const notice = (id: string, read = false): Notice => ({ id, kind: "rooms", title: `Meeting ${id}`, body: "Room A", refKind: "booking", refId: id, at: "2026-10-14T02:00:00Z", read });
const bell = (...items: Notice[]): Notices => ({ unread: items.filter(n => !n.read).length, items });
const memo: MemberMemo = { id: "m-1", title: "Fair dress code", body: "Please read.", sender: "People & Culture", publishedAt: "2026-10-14T02:00:00Z",
  effectiveAt: "2026-10-14", version: 1, requiresAck: true, readAt: null, acknowledgedAt: null, departments: [] };

const member = (): MemberData => ({ ...memberDemo(), demo: false, memos: [], requests: [], incomes: [] });

/** The phone header's bell (the desk aside draws one of its own), and its figure ("" when it has none). */
const bellButton = () => screen.getAllByRole("button", { name: "Notifications" }).find(b => /capsuleBell/.test(b.className))!;
const figure = () => bellButton().textContent ?? "";
const ping = async (event: string) => {
  await act(async () => { realtime.handlers[event]?.(); });
  await act(async () => { await new Promise(r => setTimeout(r, LIVE_SETTLE_MS + 60)); });
};

function source(answers: Notices[], snapshot: () => MemberData) {
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  const notices = vi.fn(async () => ({ ok: true as const, data: answers.length > 1 ? answers.shift()! : answers[0] }));
  const refresh = vi.fn(async () => ({ ok: true as const, data: snapshot() }));
  return {
    src: {
      refresh, notices,
      insight: none, kpi: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none, orderBook: none, arena: none,
      cancelRequest: none, income: none, departmentIncome: none, honours: none, claimRates: none, submitRequest: none, memoReceipts: none,
    } satisfies RevenueSource,
    notices, refresh,
  };
}

describe("the bell, live", () => {
  it("moves the moment the database says so, counts again after it was opened, and a memo arrives without anything else changing", async () => {
    const initial = bell(notice("a"));
    let next = member();
    const { src, notices, refresh } = source([bell(notice("b"), notice("a")), bell(notice("c"), notice("b", true), notice("a", true))], () => next);
    window.history.replaceState({}, "", "/member");
    render(<RevenueApp initialData={member()} initialSearch="" today="2026-10-14" source={src} notices={initial} />);
    await act(async () => {});
    const subName = member().memberships[0].name;
    expect(figure()).toBe("1");

    // A meeting booked for them: the bell reads its notifications again — nothing else.
    await ping("notice");
    expect(notices).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(figure()).toBe("2");

    // Opened: those two are read (by id) and leave the figure.
    fireEvent.click(bellButton());
    await act(async () => {});
    expect(push.readNotices).toHaveBeenCalledWith(["b", "a"]);
    expect(figure()).toBe("");

    // Another one after that counts again.
    await ping("notice");
    expect(figure()).toBe("1");

    // HR's memo to their sub-department: the snapshot is read again and only its memos and requests are taken —
    // its other figures (here a renamed sub-department) wait for a pull.
    next = { ...member(), memos: [memo], memberships: member().memberships.map(m => ({ ...m, name: "Renamed" })) };
    await ping("memo");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(figure()).toBe("2");
    expect(screen.getAllByRole("button", { name: "Switch sub-department" })[0]).toHaveTextContent(subName);
  });

  it("listens to nothing for the design preview", async () => {
    const { src, notices } = source([bell(notice("b"))], member);
    window.history.replaceState({}, "", "/member");
    render(<RevenueApp initialData={member()} initialSearch="" today="2026-10-14" source={src} notices={bell(notice("a"))} device="ios" />);
    await act(async () => {});
    expect(Object.keys(realtime.handlers)).toEqual([]);
    expect(notices).not.toHaveBeenCalled();
  });
});
