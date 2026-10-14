import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrossFade, { CROSS_FADE_MS } from "./CrossFade";

// A period switch cross-fades the rank and the value, 160ms, never a count (2026-10-14, the refresh handoff's motion).
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

const cells = (root: HTMLElement) => [...root.querySelectorAll("[class*=xfCell]")].map(el => ({
  text: el.textContent, going: /xfOut/.test(el.className), coming: /xfIn/.test(el.className), hidden: el.getAttribute("aria-hidden") === "true",
}));

describe("CrossFade", () => {
  it("is the figure alone while it stands still", () => {
    const { container, rerender } = render(<CrossFade k="4th"><span>4th</span></CrossFade>);
    expect(cells(container)).toEqual([{ text: "4th", going: false, coming: false, hidden: false }]);
    rerender(<CrossFade k="4th"><span>4th</span></CrossFade>);
    expect(cells(container)).toHaveLength(1);
  });

  it("a new figure fades in over the old one fading out, then the old one goes", () => {
    const { container, rerender } = render(<CrossFade k="4th"><span>4th</span></CrossFade>);
    rerender(<CrossFade k="2nd"><span>2nd</span></CrossFade>);
    expect(cells(container)).toEqual([
      { text: "2nd", going: false, coming: true, hidden: false },
      { text: "4th", going: true, coming: false, hidden: true },
    ]);
    act(() => { vi.advanceTimersByTime(CROSS_FADE_MS); });
    expect(cells(container)).toEqual([{ text: "2nd", going: false, coming: false, hidden: false }]);
  });

  it("keeps a line's own box: a block wrapper for a figure on its own line", () => {
    const { container } = render(<CrossFade k="RM 57,930" block><span>RM 57,930</span></CrossFade>);
    expect((container.firstChild as HTMLElement).className).toMatch(/xfBlock/);
  });
});
