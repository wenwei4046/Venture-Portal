import { describe, expect, it } from "vitest";
import { PULL_ARM, PULL_MAX, PULL_SLOP, isStaleAppError, pullDistance, pullStart } from "./pull-refresh";

describe("isStaleAppError", () => {
  it("knows Next's refusal of an action a newer release renamed", () => {
    const err = new Error('Server Action "40ab" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action');
    err.name = "UnrecognizedActionError";
    expect(isStaleAppError(err)).toBe(true);
    expect(isStaleAppError(new Error("Failed to find Server Action. This request might be from an older or newer deployment."))).toBe(true);
  });
  it("is not offline, a broken request, or anything that is not an error", () => {
    expect(isStaleAppError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isStaleAppError(new Error("An unexpected response was received from the server."))).toBe(false);
    expect(isStaleAppError("was not found on the server")).toBe(false);
    expect(isStaleAppError(null)).toBe(false);
  });
});

describe("pullDistance", () => {
  it("is nothing for no drag or a drag up", () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-30)).toBe(0);
    expect(pullDistance(Number.NaN)).toBe(0);
  });
  it("travels half the finger's distance up to the arming point", () => {
    expect(pullDistance(40)).toBe(20);
    expect(pullDistance(PULL_ARM * 2)).toBe(PULL_ARM);
  });
  it("slows past the arming point and stops at the maximum", () => {
    expect(pullDistance(PULL_ARM * 2 + 40)).toBe(PULL_ARM + 10);
    expect(pullDistance(2000)).toBe(PULL_MAX);
  });
  it("arms only after a real drag", () => {
    expect(pullDistance(PULL_ARM * 2 - 2)).toBeLessThan(PULL_ARM);
    expect(pullDistance(PULL_ARM * 2)).toBeGreaterThanOrEqual(PULL_ARM);
  });
});

describe("pullStart", () => {
  it("waits until the finger has moved past the slop", () => {
    expect(pullStart(PULL_SLOP - 1, 0)).toBe("wait");
    expect(pullStart(PULL_SLOP, 0)).toBe("pull");
  });
  it("gives a sideways swipe back to the page", () => {
    expect(pullStart(10, 30)).toBe("none");
    expect(pullStart(30, 10)).toBe("pull");
  });
  it("gives a scroll up back to the page", () => {
    expect(pullStart(-10, 0)).toBe("none");
  });
});
