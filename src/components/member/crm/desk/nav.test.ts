import { describe, expect, it } from "vitest";
import { initialDeskUi } from "./vm/ctx";
import { placeOf, readPlace, retiredTab, withSavedPlace } from "./nav";
import { NAV_GROUPS } from "./vm/tokens";

// v4 notes/24 §1 (2026-11-10): the left nav's Team activity and Ads performance are gone — they are Insight's tabs, and a
// kept place, a Back step or a link that names one opens the Insight tab.
describe("Team activity and Ads performance are Insight's tabs", () => {
  it("the sidebar no longer lists them", () => {
    const all = NAV_GROUPS.flatMap(g => g[1]);
    expect(all).not.toContain("activity");
    expect(all).not.toContain("adsperf");
    expect(all).toContain("insight");
  });
  it("an old place or link opens the Insight tab", () => {
    expect(retiredTab({ tab: "adsperf" as const, chat: "c1" })).toEqual({ tab: "insight", insTab: "ads", pane: "closed", chat: "c1" });
    expect(retiredTab({ tab: "activity" as const })).toMatchObject({ tab: "insight", insTab: "activity", pane: "closed" });
    expect(retiredTab({ tab: "inbox" as const })).toEqual({ tab: "inbox" });
  });
  it("a refresh on a kept Team activity place lands on Insight › Team activity", () => {
    sessionStorage.setItem("crm-desk-place", JSON.stringify({ tab: "activity" }));
    expect(withSavedPlace(initialDeskUi())).toMatchObject({ tab: "insight", insTab: "activity" });
    sessionStorage.setItem("crm-desk-place", JSON.stringify({ tab: "adsperf" }));
    expect(withSavedPlace(initialDeskUi())).toMatchObject({ tab: "insight", insTab: "ads" });
    sessionStorage.removeItem("crm-desk-place");
  });
});

describe("the desktop CRM keeps its place", () => {
  it("a place is where one is — not toasts or drafts", () => {
    const ui = { ...initialDeskUi(), tab: "inbox" as const, chat: "c1", toast: "Saved", draft: { c1: "hi" } };
    const p = placeOf(ui) as Record<string, unknown>;
    expect(p.tab).toBe("inbox");
    expect(p.chat).toBe("c1");
    expect("toast" in p || "draft" in p).toBe(false);
  });
  it("reads back only a place's keys, and nothing from junk", () => {
    expect(readPlace(JSON.stringify({ tab: "calendar", chat: null, toast: "x", evil: 1 }))).toEqual({ tab: "calendar", chat: null });
    expect(readPlace("not json")).toBeNull();
    expect(readPlace(null)).toBeNull();
  });
});
