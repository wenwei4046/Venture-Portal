import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBackCloses } from "./back";

/** Back pops our step: the browser lands on the entry under it (state without our key) and tells popstate. */
const pressBack = (state: unknown) => { history.replaceState(state, ""); window.dispatchEvent(new PopStateEvent("popstate", { state })); };

describe("the phone's Back closes an open chat (2026-10-15)", () => {
  it("adds one step while open; Back closes it and does not leave the page", () => {
    const close = vi.fn();
    const before = history.length;
    const { rerender } = renderHook(({ open }) => useBackCloses(open, close, "crmChat"), { initialProps: { open: true } });
    expect(history.length).toBe(before + 1);
    expect((history.state as Record<string, unknown>).crmChat).toBe(1);
    pressBack({});
    expect(close).toHaveBeenCalledTimes(1);
    rerender({ open: false });
  });

  it("a step stacked on it (the photo viewer) popping leaves the chat open", () => {
    const close = vi.fn();
    renderHook(() => useBackCloses(true, close, "crmChat"));
    pressBack({ crmChat: 1 });
    expect(close).not.toHaveBeenCalled();
  });

  it("closed on screen (its ‹), its step is taken back", () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    const { rerender } = renderHook(({ open }) => useBackCloses(open, () => {}, "crmLead"), { initialProps: { open: true } });
    rerender({ open: false });
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });
});

/**
 * The browser's history as a list of entries, and Next's router rewriting the one it is on (2026-10-17): whenever a
 * Server Action brings the page back — one that set a cookie, as the session's hourly refresh does — Next replaces the
 * entry's state with its own alone. Back and history.back() land on the entry under and tell popstate a moment later.
 */
function fakeHistory() {
  const list: unknown[] = [{ __NA: true }];
  let at = 0;
  const spies = [
    vi.spyOn(history, "pushState").mockImplementation(s => { list.splice(at + 1); list.push(s); at++; }),
    vi.spyOn(history, "replaceState").mockImplementation(s => { list[at] = s; }),
    vi.spyOn(history, "back").mockImplementation(() => { if (at > 0) { at--; const s = list[at]; setTimeout(() => window.dispatchEvent(new PopStateEvent("popstate", { state: s })), 0); } }),
  ];
  Object.defineProperty(history, "state", { configurable: true, get: () => list[at] ?? null });
  return {
    nextRewrites: () => { list[at] = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["", {}] }; },
    pressBack: () => history.back(),
    get depth() { return at; },
    restore: () => { spies.forEach(s => s.mockRestore()); delete (history as unknown as { state?: unknown }).state; },
  };
}
const settle = () => act(() => new Promise<void>(r => setTimeout(r, 5)));

describe("a step stacked on the chat, after Next rewrote the chat's entry (2026-10-17)", () => {
  it("the camera closing on screen (its video handed over) leaves the chat open", async () => {
    const h = fakeHistory();
    const closeChat = vi.fn(), closeCamera = vi.fn();
    const chat = renderHook(() => useBackCloses(true, closeChat, "crmChat"));
    // An iPhone back from the background: the first read refreshes the session and Next rewrites the chat's entry.
    h.nextRewrites();
    const camera = renderHook(({ open }) => useBackCloses(open, closeCamera, "crmCamera"), { initialProps: { open: true } });
    expect(h.depth).toBe(2);
    camera.rerender({ open: false });
    await settle();
    expect(h.depth).toBe(1);
    expect(closeChat).not.toHaveBeenCalled();
    chat.unmount(); camera.unmount();
    await settle();
    h.restore();
  });

  it("the phone's Back with the camera open closes the camera alone; again, the chat", async () => {
    const h = fakeHistory();
    const closeChat = vi.fn(), closeCamera = vi.fn();
    const chat = renderHook(() => useBackCloses(true, closeChat, "crmChat"));
    h.nextRewrites();
    const camera = renderHook(() => useBackCloses(true, closeCamera, "crmCamera"));
    // Next rewrites the camera's own entry too, while it is open.
    h.nextRewrites();
    h.pressBack();
    await settle();
    expect(closeCamera).toHaveBeenCalledTimes(1);
    expect(closeChat).not.toHaveBeenCalled();
    h.pressBack();
    await settle();
    expect(closeChat).toHaveBeenCalledTimes(1);
    chat.unmount(); camera.unmount();
    await settle();
    h.restore();
  });
});
