import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { onlyClosed, useNavHistory, type NavFrame } from "./nav-history";

// The phone's Back steps back through the CRM (2026-10-20; the owner: "从 calendar -> open chat，点back 应该要回到 calendar").
type Screen = { tab: string; chat: string | null; sheet: boolean };
const frameOf = (s: Screen): NavFrame<Screen> => ({ shape: { tab: s.tab, chat: s.chat, sheet: s.sheet }, snap: s });

function fakeHistory() {
  const list: unknown[] = [{}];
  let at = 0;
  const spies = [
    vi.spyOn(history, "pushState").mockImplementation(s => { list.splice(at + 1); list.push(s); at++; }),
    vi.spyOn(history, "replaceState").mockImplementation(s => { list[at] = s; }),
    vi.spyOn(history, "back").mockImplementation(() => { if (at > 0) { at--; const s = list[at]; setTimeout(() => window.dispatchEvent(new PopStateEvent("popstate", { state: s })), 0); } }),
  ];
  Object.defineProperty(history, "state", { configurable: true, get: () => list[at] ?? null });
  return {
    pressBack: () => history.back(),
    get depth() { return at; },
    restore: () => { spies.forEach(s => s.mockRestore()); delete (history as unknown as { state?: unknown }).state; },
  };
}
const settle = () => act(() => new Promise<void>(r => setTimeout(r, 5)));

function useScreen(start: Screen) {
  const [s, set] = useState(start);
  useNavHistory(frameOf(s), snap => set(snap), "tNav");
  return { s, set };
}

let h: ReturnType<typeof fakeHistory>;
afterEach(() => h?.restore());

describe("Back steps back through the CRM", () => {
  it("Calendar → open a chat (which switches to the Inbox tab) → Back = the Calendar, not the Revenue app", async () => {
    h = fakeHistory();
    const { result } = renderHook(() => useScreen({ tab: "inbox", chat: null, sheet: false }));
    act(() => result.current.set({ tab: "calendar", chat: null, sheet: false }));
    act(() => result.current.set({ tab: "inbox", chat: "c1", sheet: false }));
    expect(h.depth).toBe(2);
    h.pressBack(); await settle();
    expect(result.current.s).toEqual({ tab: "calendar", chat: null, sheet: false });
    h.pressBack(); await settle();
    expect(result.current.s).toEqual({ tab: "inbox", chat: null, sheet: false });
    expect(h.depth).toBe(0); // the next Back is the page's own: out of the CRM
  });

  it("the chat's own ‹ goes back the same way and takes our step off", async () => {
    h = fakeHistory();
    const { result } = renderHook(() => useScreen({ tab: "calendar", chat: null, sheet: false }));
    act(() => result.current.set({ tab: "inbox", chat: "c1", sheet: false }));
    act(() => result.current.set({ tab: "inbox", chat: null, sheet: false })); // ‹ closes the chat only
    await settle();
    expect(result.current.s).toEqual({ tab: "calendar", chat: null, sheet: false });
    expect(h.depth).toBe(0);
  });

  it("a sheet over a chat: Back closes the sheet first, then the chat", async () => {
    h = fakeHistory();
    const { result } = renderHook(() => useScreen({ tab: "inbox", chat: null, sheet: false }));
    act(() => result.current.set({ tab: "inbox", chat: "c1", sheet: false }));
    act(() => result.current.set({ tab: "inbox", chat: "c1", sheet: true }));
    h.pressBack(); await settle();
    expect(result.current.s).toEqual({ tab: "inbox", chat: "c1", sheet: false });
    h.pressBack(); await settle();
    expect(result.current.s.chat).toBeNull();
  });

  it("a step stacked on ours (the camera, the viewer) closing leaves the screen as it is", async () => {
    h = fakeHistory();
    const { result } = renderHook(() => useScreen({ tab: "inbox", chat: null, sheet: false }));
    act(() => result.current.set({ tab: "inbox", chat: "c1", sheet: false }));
    history.pushState({ ...(history.state as object), crmCamera: 1 }, "");
    h.pressBack(); await settle();
    expect(result.current.s.chat).toBe("c1");
  });

  it("knows a close from an open", () => {
    expect(onlyClosed({ tab: "inbox", chat: "c1" }, { tab: "inbox", chat: null })).toBe(true);
    expect(onlyClosed({ tab: "inbox", chat: null }, { tab: "calendar", chat: null })).toBe(false);
    expect(onlyClosed({ tab: "inbox", chat: "c1", sheet: false }, { tab: "inbox", chat: null, sheet: true })).toBe(false);
  });
});

describe("a tab tapped from a sub-page is a step forward", () => {
  it("Profile › Cold lead templates, then the Inbox tab: the Inbox (Back then returns to the templates)", async () => {
    h = fakeHistory();
    const { result } = renderHook(() => useScreen({ tab: "profile", chat: null, sheet: false }));
    act(() => result.current.set({ tab: "profile", chat: null, sheet: true }));
    act(() => result.current.set({ tab: "inbox", chat: null, sheet: false }));
    await settle();
    expect(result.current.s).toEqual({ tab: "inbox", chat: null, sheet: false });
    h.pressBack(); await settle();
    expect(result.current.s).toEqual({ tab: "profile", chat: null, sheet: true });
  });
});
