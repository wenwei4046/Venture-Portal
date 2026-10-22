/**
 * The desktop sidebar's CRM row (the owner, 2026-10-16: "把 crm 的入口拉出來，加到 Revenue app, arena 的下面"): right
 * under Arena, its unread count beside it, opening the CRM; before Profile when their ticks close Arena; absent for an
 * account the CRM is not open to.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DeskAside } from "./Chrome";

const rows = () => screen.getAllByRole("button").map(b => b.textContent?.replace(/\d+/g, "").trim()).filter(t => t && t !== "HOUZS VENTURERevenue");
const base = { active: "today" as const, count: 0, notifOpen: false, onGo: () => {}, onQuote: () => {}, onNotif: () => {}, onProfile: () => {} };

describe("the CRM in the desktop sidebar", () => {
  it("sits right under Arena with its unread messages, and opens the CRM", () => {
    const open = vi.fn();
    render(<DeskAside {...base} crm={{ unread: 7, onOpen: open }} />);
    expect(rows().slice(0, 6)).toEqual(["Today", "Insight", "Quote", "Arena", "CRM", "Profile"]);
    const crm = screen.getByRole("button", { name: /CRM/ });
    expect(crm.textContent).toContain("7");
    fireEvent.click(crm);
    expect(open).toHaveBeenCalledOnce();
  });
  it("goes before Profile when their ticks close Arena", () => {
    render(<DeskAside {...base} hidden={["arena"]} crm={{ unread: 0, onOpen: () => {} }} />);
    expect(rows().slice(0, 5)).toEqual(["Today", "Insight", "Quote", "CRM", "Profile"]);
  });
  it("is not there for an account the CRM is not open to", () => {
    render(<DeskAside {...base} crm={null} />);
    expect(rows()).not.toContain("CRM");
  });
});
