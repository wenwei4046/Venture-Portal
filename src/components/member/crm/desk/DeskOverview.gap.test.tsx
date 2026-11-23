import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeskOverview } from "./DeskOverview";
import type { DeskOverview as OV } from "./vm/overview";

// The owner, 2026-11-24 (Insight › Overview, the cream figures under the tabs): "这个空间是有一点 gap，不是直接连上去上面那个
// bar" — the figures start right under the tab bar, as Team performance's do.
const col = { cols: [], options: [], open: false, toggle: () => {}, close: () => {} };
const o = { money: false, ready: true, vs: "vs Oct", tiles: [], brands: [], ads: [], adsMore: null, teams: [], adCol: col, teamCol: col, goAds: () => {}, goTeam: () => {} } as unknown as OV;
const top = (el: HTMLElement) => (el.querySelector("[data-insight-overview]") as HTMLElement).style.paddingTop;

describe("Insight › Overview under the tab bar", () => {
  it("starts right under it in a Revenue app view (no Brand row)", () => {
    expect(top(render(<DeskOverview o={o} />).container)).toBe("0px");
  });

  it("keeps its 4px over the Brand row, shown with no view", () => {
    expect(top(render(<DeskOverview o={o} src={[{ label: "All", on: true, pick: () => {} }]} />).container)).toBe("4px");
  });
});
