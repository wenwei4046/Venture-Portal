import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Notice, Notices } from "@/lib/push/notices";
import type { RevenueSource, TrackRead } from "../source";

// The bell, live (2026-10-14 — the owner: "change to on live as well"): the database tells the person's own private
// channel which of the bell's three moved, and the bell reads that alone again, silently.
const realtime = vi.hoisted(() => ({
  handlers: {} as Record<string, () => void>,
  joined: [] as { name: string; private: boolean }[],
  authed: 0,
  removed: 0,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    let name = "";
    let isPrivate = false;
    const channel = {
      on: (kind: string, filter: { event: string }, cb: () => void) => { if (kind === "broadcast") realtime.handlers[filter.event] = cb; return channel; },
      subscribe: () => { realtime.joined.push({ name, private: isPrivate }); return channel; },
    };
    return {
      realtime: { setAuth: async () => { realtime.authed++; } },
      channel: (n: string, opts: { config: { private: boolean } }) => { name = n; isPrivate = opts.config.private; return channel; },
      removeChannel: async () => { realtime.removed++; realtime.handlers = {}; return "ok"; },
    };
  },
}));
vi.mock("@/app/(member)/member/batch-actions", () => ({ readMemberBatch: vi.fn() }));
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/rooms-actions", () => ({}));
vi.mock("@/app/(member)/member/docs-actions", () => ({}));

const { useLiveBell, AWAY_MS } = await import("./useLiveBell");
const { LIVE_SETTLE_MS } = await import("./useCrmUnread");

const notice = (id: string, read = false): Notice => ({ id, kind: "rooms", title: `Meeting ${id}`, body: "", refKind: "booking", refId: id, at: "2026-10-14T02:00:00Z", read });
const bell = (...items: Notice[]): Notices => ({ unread: items.filter(n => !n.read).length, items });

function sourceWith(answers: Notices[]) {
  const notices = vi.fn(async () => ({ ok: true as const, data: answers.length > 1 ? answers.shift()! : answers[0] }));
  return { source: { notices } as unknown as RevenueSource, notices };
}
const tracked: TrackRead = vi.fn((_gen, read) => read);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const settle = () => act(async () => { vi.advanceTimersByTime(LIVE_SETTLE_MS); });
const ping = (event: string) => act(() => { realtime.handlers[event]?.(); });
const visibility = (state: "hidden" | "visible") => act(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
});

beforeEach(() => { realtime.handlers = {}; realtime.joined = []; realtime.authed = 0; realtime.removed = 0; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); });

describe("useLiveBell", () => {
  const base = { enabled: true, account: "u1", gen: 0, track: tracked };

  it("opens on the layout's notifications and listens to the person's own private channel, with their token", async () => {
    const { source, notices } = sourceWith([bell()]);
    const initial = bell(notice("a"));
    const { result } = renderHook(() => useLiveBell({ ...base, initial, source, onSnapshot: vi.fn() }));
    await flush();
    expect(result.current.items.map(n => n.id)).toEqual(["a"]);
    expect(realtime.authed).toBe(1);
    expect(realtime.joined).toEqual([{ name: "bell:u1", private: true }]);
    // The open reads nothing: the layout's are fresh.
    expect(notices).not.toHaveBeenCalled();
  });

  it("a notice: one silent read a moment after a burst", async () => {
    const { source, notices } = sourceWith([bell(notice("b"), notice("a"))]);
    const onSnapshot = vi.fn();
    const initial = bell(notice("a"));
    const { result } = renderHook(() => useLiveBell({ ...base, initial, source, onSnapshot }));
    await flush();
    ping("notice"); ping("notice"); ping("notice");
    expect(notices).not.toHaveBeenCalled();
    await settle();
    await flush();
    expect(notices).toHaveBeenCalledTimes(1);
    expect(result.current.items.map(n => n.id)).toEqual(["b", "a"]);
    expect(onSnapshot).not.toHaveBeenCalled();
    // Silent: the pull's tracker never saw it.
    expect(tracked).not.toHaveBeenCalled();
  });

  it("a memo or a request: the snapshot, once for both, and no notifications read", async () => {
    const { source, notices } = sourceWith([bell()]);
    const onSnapshot = vi.fn();
    const initial = bell();
    renderHook(() => useLiveBell({ ...base, initial, source, onSnapshot }));
    await flush();
    ping("memo"); ping("request");
    await settle();
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(notices).not.toHaveBeenCalled();
  });

  it("every pull reads the notifications with the rest, tracked", async () => {
    const { source, notices } = sourceWith([bell(notice("c"))]);
    const initial = bell();
    const { result, rerender } = renderHook((p: { gen: number }) => useLiveBell({ ...base, gen: p.gen, initial, source, onSnapshot: vi.fn() }),
      { initialProps: { gen: 0 } });
    await flush();
    rerender({ gen: 1 });
    await flush();
    expect(notices).toHaveBeenCalledTimes(1);
    expect(tracked).toHaveBeenCalledWith(1, expect.any(Promise));
    expect(result.current.items.map(n => n.id)).toEqual(["c"]);
  });

  it("back in the app: the notifications; after a minute away, the memos and requests too", async () => {
    const { source, notices } = sourceWith([bell()]);
    const onSnapshot = vi.fn();
    const initial = bell();
    renderHook(() => useLiveBell({ ...base, initial, source, onSnapshot }));
    await flush();
    visibility("hidden");
    visibility("visible");
    await settle();
    expect(notices).toHaveBeenCalledTimes(1);
    expect(onSnapshot).not.toHaveBeenCalled();
    visibility("hidden");
    await act(async () => { vi.advanceTimersByTime(AWAY_MS); });
    visibility("visible");
    await settle();
    expect(notices).toHaveBeenCalledTimes(2);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("an older answer landing late never puts back what a newer one said", async () => {
    let first: (v: { ok: true; data: Notices }) => void = () => {};
    const notices = vi.fn()
      .mockImplementationOnce(() => new Promise(r => { first = r; }))
      .mockImplementationOnce(async () => ({ ok: true as const, data: bell(notice("new")) }));
    const source = { notices } as unknown as RevenueSource;
    const initial = bell();
    const { result } = renderHook(() => useLiveBell({ ...base, initial, source, onSnapshot: vi.fn() }));
    await flush();
    ping("notice"); await settle();
    ping("notice"); await settle();
    await flush();
    expect(result.current.items.map(n => n.id)).toEqual(["new"]);
    first({ ok: true, data: bell(notice("old")) });
    await flush();
    expect(result.current.items.map(n => n.id)).toEqual(["new"]);
  });

  it("stops listening when it goes; listens to nothing for the preview, the demo or the Principal", async () => {
    const { source, notices } = sourceWith([bell()]);
    const initial = bell(notice("a"));
    const live = renderHook(() => useLiveBell({ ...base, initial, source, onSnapshot: vi.fn() }));
    await flush();
    live.unmount();
    expect(realtime.removed).toBe(1);
    realtime.joined = [];
    const off = renderHook(() => useLiveBell({ ...base, enabled: false, initial, source, onSnapshot: vi.fn() }));
    await flush();
    expect(off.result.current.items.map(n => n.id)).toEqual(["a"]);
    expect(realtime.joined).toEqual([]);
    expect(notices).not.toHaveBeenCalled();
  });
});
