import { describe, expect, it } from "vitest";
import { initialDeskUi } from "./vm/ctx";
import { placeOf, readPlace } from "./nav";

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
