import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
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
