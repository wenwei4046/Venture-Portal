import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { NAV_MAX, navDepth, onlyClosed, useNavHistory, type NavFrame } from "./nav-history";

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

// notes/10 (2026-11-10, the owner: "android 点返回会回到首页，帮我检查返回是返回到上一个动作").
function useScreenWith(start: Screen, beforeBack?: () => boolean) {
  const [s, set] = useState(start);
  useNavHistory(frameOf(s), snap => set(snap), "tNav", beforeBack);
  return { s, set };
}

describe("§2 the cap: past it the oldest steps go, never the new ones", () => {
  it("40 moves, then 40 Backs: each Back steps once and only the last leaves", async () => {
    h = fakeHistory();
    const { result } = renderHook(() => useScreen({ tab: "inbox", chat: null, sheet: false }));
    for (let i = 1; i <= 40; i++) act(() => result.current.set({ tab: "inbox", chat: `c${i}`, sheet: false }));
    expect(h.depth).toBe(40);
    for (let i = 39; i >= 1; i--) { h.pressBack(); await settle(); expect(result.current.s.chat).toBe(`c${i}`); }
    h.pressBack(); await settle();
    expect(result.current.s.chat).toBeNull();
    expect(h.depth).toBe(0);
  });

  it(`past ${NAV_MAX} moves Back still steps (it stopped pushing at 30 and jumped far back)`, async () => {
    h = fakeHistory();
    const { result } = renderHook(() => useScreen({ tab: "inbox", chat: null, sheet: false }));
    for (let i = 1; i <= NAV_MAX + 20; i++) act(() => result.current.set({ tab: "inbox", chat: `c${i}`, sheet: false }));
    expect(navDepth("tNav")).toBe(NAV_MAX);
    h.pressBack(); await settle();
    expect(result.current.s.chat).toBe(`c${NAV_MAX + 19}`);
    h.pressBack(); await settle();
    expect(result.current.s.chat).toBe(`c${NAV_MAX + 18}`);
  });
});

describe("§3 a CrmApp mounted again keeps its steps", () => {
  it("unmounted and mounted again (the Revenue app's curtain, a key change): Back still steps back", async () => {
    h = fakeHistory();
    const first = renderHook(() => useScreen({ tab: "inbox", chat: null, sheet: false }));
    act(() => first.result.current.set({ tab: "calendar", chat: null, sheet: false }));
    act(() => first.result.current.set({ tab: "inbox", chat: "c1", sheet: false }));
    first.unmount();
    const again = renderHook(() => useScreen({ tab: "inbox", chat: null, sheet: false }));
    expect(navDepth("tNav")).toBe(2);
    h.pressBack(); await settle();
    expect(again.result.current.s).toEqual({ tab: "calendar", chat: null, sheet: false });
    h.pressBack(); await settle();
    expect(again.result.current.s).toEqual({ tab: "inbox", chat: null, sheet: false });
    expect(h.depth).toBe(0);
  });

  it("a Back taken while the CRM was away is matched on mounting: those steps are not put back again", async () => {
    h = fakeHistory();
    const first = renderHook(() => useScreen({ tab: "inbox", chat: null, sheet: false }));
    act(() => first.result.current.set({ tab: "calendar", chat: null, sheet: false }));
    act(() => first.result.current.set({ tab: "insight", chat: null, sheet: false }));
    first.unmount();
    h.pressBack(); await settle(); // nobody listening
    renderHook(() => useScreen({ tab: "inbox", chat: null, sheet: false }));
    expect(navDepth("tNav")).toBe(1);
  });

  it("after a reload (the steps forgotten) an entry of the page before is passed over, not a dead press", async () => {
    h = fakeHistory();
    history.pushState({ tNav1: 1 }, "");
    history.pushState({ tNav1: 1, tNav2: 1 }, "");
    renderHook(() => useScreen({ tab: "inbox", chat: null, sheet: false }));
    expect(navDepth("tNav")).toBe(0);
    h.pressBack(); await settle(); await settle();
    expect(h.depth).toBe(0);
  });
});

describe("§4 a screen may hold Back (the showroom's leave sheet, 4a·3)", () => {
  it("held: the screen stays and our step stands again; let go: Back steps", async () => {
    h = fakeHistory();
    let hold = true;
    const asked = vi.fn(() => hold);
    const { result } = renderHook(() => useScreenWith({ tab: "profile", chat: null, sheet: false }, asked));
    act(() => result.current.set({ tab: "profile", chat: null, sheet: true }));
    h.pressBack(); await settle();
    expect(asked).toHaveBeenCalledTimes(1);
    expect(result.current.s.sheet).toBe(true);
    expect(h.depth).toBe(1);
    hold = false;
    h.pressBack(); await settle();
    expect(result.current.s.sheet).toBe(false);
    expect(h.depth).toBe(0);
  });
});
