import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeskOverview } from "./DeskOverview";
import type { DeskOverview as OV } from "./vm/overview";
import { frame4aVM } from "./vm/frame4a";
import type { DeskCtx } from "./vm/ctx";

// The owner, 2026-11-27, with Insight › Overview (its cream figures touching the tab bar) beside Closed deals (its box
// standing clear of the period row): "我要第一个图也是这样子，它跟那个框之间是要有空间感的". Supersedes 2026-11-24's
// "right under the tab bar" (this file's first version, which held the figures at 0 px).
const bodyPad = (insTab?: string) => frame4aVM(
  { ui: { tab: "insight", insTab, bookQ: "" }, data: { customers: [], can: {} }, app: {}, me: { id: "p", role: "boss", name: "Principal" },
    now: new Date(2026, 10, 27, 9), directors: [], teams: [], patch: () => {} } as unknown as DeskCtx,
  { crmGroups: [], appTop: [], me: { ini: "P", name: "Principal", sub: "" }, pageTitle: "Insight", alertsN: "", openAlerts: () => {} },
  {},
).pad;

const col = { cols: [], options: [], open: false, toggle: () => {}, close: () => {} };
const o = { money: false, ready: true, vs: "vs Oct", tiles: [], brands: [], ads: [], adsMore: null, teams: [], adCol: col, teamCol: col, goAds: () => {}, goTeam: () => {} } as unknown as OV;
const top = (el: HTMLElement) => parseFloat((el.querySelector("[data-insight-overview]") as HTMLElement).style.paddingTop) || 0;

describe("Insight's body under the tab bar", () => {
  it("Overview and Team performance stand 20 px under it, as Ads performance's filter row does", () => {
    expect(bodyPad()).toBe("20px 32px 32px"); // Overview, where Insight opens
    expect(bodyPad("overview")).toBe("20px 32px 32px");
    expect(bodyPad("team")).toBe("20px 32px 32px");
    expect(bodyPad("ads")).toBe("0 32px 32px"); // its filter row carries its own 20 px (DeskApp, `apStrip`)
    expect(bodyPad("upnext")).toBe("24px 32px 32px"); // unchanged
  });

  it("the Overview adds no space of its own, with the Brand row or without", () => {
    expect(top(render(<DeskOverview o={o} />).container)).toBe(0);
    expect(top(render(<DeskOverview o={o} src={[{ label: "All", on: true, pick: () => {} }]} />).container)).toBe(0);
  });
});
