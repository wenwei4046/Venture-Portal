/**
 * The CRM's desktop frame draws the Revenue app's sidebar, its module menu too (2026-10-27 — the owner: every switcher
 * lists every view, as the Principal's does; in the Revenue app without View as a person…, its team member View as
 * being the way there): the same rows as the app's own menu.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Desk4aSide } from "./Desk4a";
import type { Frame4a } from "./vm/frame4a";

const side = (onPick: (id: string) => void) => ({
  f4: {
    revNav: [], crmNav: [], products: null,
    notif: { label: "Notifications", count: "", pick: () => {} },
    modules: { current: "revenue_member", onPick },
    account: { ini: "LW", name: "LOO WEN WEI", sub: "Principal" },
  } as unknown as Frame4a,
  showScope: false, scopeOpts: [], toggleSb: () => {}, returnApp: () => {},
  meMenuOpen: false, toggleMeMenu: () => {}, closeMeMenu: () => {}, signOutMe: () => {},
});

describe("the CRM's module menu", () => {
  it("lists every view, the Revenue team ticked, and switches to the one picked", () => {
    const pick = vi.fn();
    render(<Desk4aSide v={side(pick)} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch module" }));
    const menu = screen.getByRole("menu", { name: "Switch module" });
    const rows = within(menu).getAllByRole("menuitemradio");
    expect(rows.map(r => r.textContent)).toEqual(["Principal", "Finance", "HR", "Marketing", "Revenue team", "Lead View"]);
    expect(within(menu).getByRole("menuitemradio", { checked: true })).toHaveTextContent("Revenue team");
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Lead View" }));
    expect(pick).toHaveBeenCalledWith("lead");
  });
});
