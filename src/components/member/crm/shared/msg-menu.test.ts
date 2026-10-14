import { describe, expect, it } from "vitest";
import { SWIPE_MAX, SWIPE_REPLY, swipeShift } from "./msg-menu";

describe("swipe a message right to reply (2026-10-14)", () => {
  it("waits for a plainly sideways, rightward drag", () => {
    expect(swipeShift(8, 0, false)).toBe(0);
    expect(swipeShift(30, 25, false)).toBe(0);
    expect(swipeShift(-40, 0, false)).toBe(0);
    expect(swipeShift(20, 4, false)).toBe(20);
  });
  it("follows the finger once dragging, up to the most, and replies past the mark", () => {
    expect(swipeShift(40, 30, true)).toBe(40);
    expect(swipeShift(-10, 0, true)).toBe(0);
    expect(swipeShift(200, 0, true)).toBe(SWIPE_MAX);
    expect(SWIPE_REPLY).toBeLessThan(SWIPE_MAX);
  });
});
