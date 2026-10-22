import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

// The Revenue app's use reaches People's Last seen and Activity (2026-10-22): a page view when it opens, on every page it
// moves to, and back at the front after a while away.

const { logPageView } = vi.hoisted(() => ({ logPageView: vi.fn() }));
vi.mock("@/lib/page-view", () => ({ logPageView }));

import { useVisits, VISIT_AGAIN_MS } from "./useVisits";

const setVisibility = (state: "hidden" | "visible") => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  logPageView.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  setVisibility("visible");
  vi.useRealTimers();
});

describe("useVisits", () => {
  it("writes a visit when the app opens, and one for every page it moves to", () => {
    const { rerender } = renderHook(({ path }) => useVisits(path, true), { initialProps: { path: "/member" } });
    expect(logPageView).toHaveBeenCalledWith("/member");
    rerender({ path: "/member" });
    expect(logPageView).toHaveBeenCalledTimes(1);
    rerender({ path: "/member?page=quote" });
    expect(logPageView).toHaveBeenLastCalledWith("/member?page=quote");
    expect(logPageView).toHaveBeenCalledTimes(2);
    rerender({ path: "/member" });
    expect(logPageView).toHaveBeenCalledTimes(3);
  });

  it("writes the page once under React's development double-effect", () => {
    renderHook(() => useVisits("/member", true), { wrapper: StrictMode });
    expect(logPageView).toHaveBeenCalledTimes(1);
  });

  it("writes nothing while off — the preview's demo and fixtures", () => {
    renderHook(() => useVisits("/member", false));
    setVisibility("hidden");
    vi.advanceTimersByTime(VISIT_AGAIN_MS * 2);
    setVisibility("visible");
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    expect(logPageView).not.toHaveBeenCalled();
  });

  it("back at the front after five minutes away: the page on show is visited again — not after a moment away", () => {
    renderHook(() => useVisits("/member?page=account&view=memos", true));
    logPageView.mockClear();
    act(() => {
      setVisibility("hidden");
      vi.advanceTimersByTime(VISIT_AGAIN_MS - 1000);
      setVisibility("visible");
    });
    expect(logPageView).not.toHaveBeenCalled();
    act(() => {
      setVisibility("hidden");
      vi.advanceTimersByTime(VISIT_AGAIN_MS);
      setVisibility("visible");
    });
    expect(logPageView).toHaveBeenCalledWith("/member?page=account&view=memos");
    expect(logPageView).toHaveBeenCalledTimes(1);
  });

  it("back out of the browser's page cache: visited again", () => {
    renderHook(() => useVisits("/member?page=arena", true));
    logPageView.mockClear();
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
    expect(logPageView).not.toHaveBeenCalled();
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    expect(logPageView).toHaveBeenCalledWith("/member?page=arena");
  });

  it("stops listening once gone", () => {
    const { unmount } = renderHook(() => useVisits("/member", true));
    unmount();
    logPageView.mockClear();
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    expect(logPageView).not.toHaveBeenCalled();
  });
});
