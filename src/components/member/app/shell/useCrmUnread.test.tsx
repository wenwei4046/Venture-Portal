import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RevenueSource, TrackRead } from "../source";

// Today's CRM chat button, its figure (2026-10-14 — the user: it moves the moment a customer's message comes in, like a
// notification, and nothing else on the screen reads again).
const realtime = vi.hoisted(() => ({
  handler: null as null | (() => void),
  channels: 0,
  removed: 0,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: (_kind: string, filter: { table: string }, cb: () => void) => { if (filter.table === "crm_contacts") realtime.handler = cb; return channel; },
      subscribe: () => { realtime.channels++; return channel; },
    };
    return { channel: () => channel, removeChannel: async () => { realtime.removed++; realtime.handler = null; return "ok"; } };
  },
}));
vi.mock("@/app/(member)/member/batch-actions", () => ({ readMemberBatch: vi.fn() }));
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/rooms-actions", () => ({}));
vi.mock("@/app/(member)/member/docs-actions", () => ({}));

const { useCrmUnread, LIVE_SETTLE_MS } = await import("./useCrmUnread");

function sourceWith(answers: number[], kept?: number) {
  const crmUnread = vi.fn(async () => ({ ok: true as const, data: answers.length > 1 ? answers.shift()! : answers[0] }));
  const source = { crmUnread, peek: vi.fn(() => kept) } as unknown as RevenueSource;
  return { source, crmUnread };
}
const tracked: TrackRead = vi.fn((_gen, read) => read);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => { realtime.handler = null; realtime.channels = 0; realtime.removed = 0; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("useCrmUnread", () => {
  const base = { enabled: true, live: true, ready: true, gen: 0, track: tracked, account: "u1", onCrm: false };

  it("opens on the phone's kept figure, then the read's, tracked with the open", async () => {
    const { source, crmUnread } = sourceWith([7], 3);
    const { result } = renderHook(() => useCrmUnread({ ...base, source }));
    expect(result.current).toBe(3);
    await flush();
    expect(result.current).toBe(7);
    expect(crmUnread).toHaveBeenCalledTimes(1);
    expect(tracked).toHaveBeenCalledWith(0, expect.any(Promise));
  });

  it("moves on its own when a customer's row changes — one silent read a moment after a burst", async () => {
    const { source, crmUnread } = sourceWith([2, 5]);
    const { result } = renderHook(() => useCrmUnread({ ...base, source }));
    await flush();
    expect(result.current).toBe(2);
    expect(realtime.channels).toBe(1);
    act(() => { realtime.handler?.(); realtime.handler?.(); realtime.handler?.(); });
    expect(crmUnread).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(LIVE_SETTLE_MS); });
    await flush();
    expect(crmUnread).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(5);
    // Silent: the pull's tracker saw only the open.
    expect(tracked).toHaveBeenCalledTimes(1);
  });

  it("reads again on leaving the CRM, and stops listening when it goes", async () => {
    const { source, crmUnread } = sourceWith([4, 0]);
    const { result, rerender, unmount } = renderHook((p: { onCrm: boolean }) => useCrmUnread({ ...base, source, onCrm: p.onCrm }), { initialProps: { onCrm: true } });
    await flush();
    expect(result.current).toBe(4);
    rerender({ onCrm: false });
    await flush();
    expect(crmUnread).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(0);
    unmount();
    expect(realtime.removed).toBe(1);
  });

  it("reads and listens to nothing without the CRM, on a desktop, or on the preview's figure", async () => {
    const { source, crmUnread } = sourceWith([9]);
    const off = renderHook(() => useCrmUnread({ ...base, enabled: false, source }));
    await flush();
    expect(off.result.current).toBeNull();
    const preview = renderHook(() => useCrmUnread({ ...base, live: false, source, fixture: 4 }));
    await flush();
    expect(preview.result.current).toBe(4);
    expect(crmUnread).not.toHaveBeenCalled();
    expect(realtime.channels).toBe(0);
  });
});
