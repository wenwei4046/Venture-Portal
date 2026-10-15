import { afterEach, describe, expect, it, vi } from "vitest";
import { heldLeft, holdForUndo, isHeld, undoHeld, UNDO_MS } from "./undo-send";

afterEach(() => { vi.useRealTimers(); });

describe("unsend from the message's menu (2026-10-15)", () => {
  it("holds a send 10 s, counting down, then lets it go", async () => {
    vi.useFakeTimers();
    let went: boolean | undefined;
    void holdForUndo("m1", '"Hello"').then(v => { went = v; });
    expect(isHeld("m1")).toBe(true);
    expect(heldLeft("m1")).toBe(10);
    vi.advanceTimersByTime(4000);
    expect(heldLeft("m1")).toBe(6);
    vi.advanceTimersByTime(UNDO_MS);
    await Promise.resolve();
    expect(went).toBe(true);
    expect(isHeld("m1")).toBe(false);
  });

  it("Unsend takes that one back — it never goes; one already gone cannot be", async () => {
    vi.useFakeTimers();
    let a: boolean | undefined, b: boolean | undefined;
    void holdForUndo("a", "Photo").then(v => { a = v; });
    void holdForUndo("b", '"Hi"').then(v => { b = v; });
    expect(undoHeld("a")).toBe(true);
    await Promise.resolve();
    expect(a).toBe(false);
    expect(isHeld("b")).toBe(true);
    vi.advanceTimersByTime(UNDO_MS);
    await Promise.resolve();
    expect(b).toBe(true);
    expect(undoHeld("b")).toBe(false);
  });
});
