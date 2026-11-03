/**
 * The module menu at the foot of the desktop sidebar (2026-10-27 — the user, its four rows beside the Principal's menu:
 * "我要全部是跟 principal 那种的，它能够显示出来全部的东西 … 在别的 App 上面，它照这样子的风格没问题"): every view, in the
 * Principal's order, in the menu's own look — but View as a person…, as the user then said: "no need in revenue app add
 * on … cause revenue app can use view as team member".
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DeskAside } from "./Chrome";

const base = { active: "today" as const, count: 0, notifOpen: false, onGo: () => {}, onQuote: () => {}, onNotif: () => {}, onProfile: () => {} };

const open = () => {
  fireEvent.click(screen.getByRole("button", { name: "Switch module" }));
  return screen.getByRole("menu", { name: "Switch module" });
};

describe("the sidebar's module menu", () => {
  it("lists every view, this one ticked — no View as a person…", () => {
    render(<DeskAside {...base} modules={{ current: "revenue_member", onPick: () => {} }} />);
    expect(screen.getByRole("button", { name: "Switch module" })).toHaveTextContent("MODULERevenue team");
    const rows = within(open()).getAllByRole("menuitemradio");
    expect(rows.map(r => r.textContent)).toEqual(["Principal", "Finance", "HR", "Marketing", "Revenue team", "Lead View"]);
    expect(rows.filter(r => r.getAttribute("aria-checked") === "true").map(r => r.textContent)).toEqual(["Revenue team"]);
    expect(screen.queryByText(/View as a person/)).toBeNull();
  });

  it("switches to Marketing and to Lead View; this one goes nowhere", () => {
    const pick = vi.fn();
    render(<DeskAside {...base} modules={{ current: "revenue_member", onPick: pick }} />);
    fireEvent.click(within(open()).getByRole("menuitemradio", { name: "Marketing" }));
    fireEvent.click(within(open()).getByRole("menuitemradio", { name: "Lead View" }));
    fireEvent.click(within(open()).getByRole("menuitemradio", { name: "Revenue team" }));
    expect(pick.mock.calls).toEqual([["marketing"], ["lead"]]);
  });

  it("is not there for anybody who may not switch", () => {
    render(<DeskAside {...base} modules={null} />);
    expect(screen.queryByRole("button", { name: "Switch module" })).toBeNull();
  });
});
