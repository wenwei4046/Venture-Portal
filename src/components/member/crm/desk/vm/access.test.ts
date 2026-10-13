import { describe, expect, it } from "vitest";
import { accessArgs, levelOf } from "./access";

// Revenue Team's CRM row: View own, Edit own, no Manage.
const rs = { tpl: { view: "own", edit: "own" }, own: {} as Record<string, string> };

describe("Settings › Permissions (mig 20261014010000)", () => {
  it("a person holds their own cell over their title's; neither gives none", () => {
    expect([levelOf(rs, "view"), levelOf(rs, "manage")]).toEqual(["own", "none"]);
    expect(levelOf({ ...rs, own: { view: "all", edit: "none" } }, "view")).toBe("all");
    expect(levelOf({ ...rs, own: { view: "all", edit: "none" } }, "edit")).toBe("none");
  });
  it("a choice is sent with the other two as they stand; the title's own choice is sent as 'title'", () => {
    expect(accessArgs(rs, "view", "all")).toEqual({ view: "all", edit: "title", manage: "title" });
    expect(accessArgs({ ...rs, own: { view: "all" } }, "manage", "all")).toEqual({ view: "all", edit: "title", manage: "all" });
    // Back to what the title gives: no own cell left for it.
    expect(accessArgs({ ...rs, own: { view: "all" } }, "view", "own")).toEqual({ view: "title", edit: "title", manage: "title" });
    expect(accessArgs(rs, "edit", "none")).toEqual({ view: "title", edit: "none", manage: "title" });
  });
});
