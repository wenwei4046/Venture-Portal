/**
 * The owner, 2026-11-17: "鼠标指向，出现在数据下方" — a figure's hover card (Overview's tiles, Ads Performance's strip) opens
 * directly under the figure from its tile's left edge, never to the side; the right-most one right-aligned so it stays on
 * screen.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeskFigureTip } from "./Desk4a";

const box = (last?: boolean) => (render(<DeskFigureTip sub={["Per lead = (ads spend + fee) ÷ total leads"]} at="8px" last={last} />).container.querySelector("[role=tooltip]") as HTMLElement).style;

describe("a figure's hover card", () => {
  it("opens under the figure, from the tile's left edge", () => {
    const s = box();
    expect(s.top).toBe("calc(100% + 8px)");
    expect(s.left).toBe("0px");
    expect(s.right).toBe("");
    expect(s.transform).toBe("");
  });
  it("the right-most tile's card is right-aligned, still under it", () => {
    const s = box(true);
    expect(s.top).toBe("calc(100% + 8px)");
    expect(s.right).toBe("0px");
    expect(s.left).toBe("");
  });
});
