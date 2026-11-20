import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DeskDeals } from "./DeskDeals";
import { allClosedDeals, dealsView } from "../sales/vm/deals";
import { NAV_GROUPS, PANEL_TABS } from "./vm/tokens";
import type { CrmData } from "@/lib/member/crm-data";

// The owner, 2026-11-20: "电脑版也做 closed deals".
const C = (id: string, assignedTo: string, wonAmount: number) => ({ id, name: id.toUpperCase() + " Tan", status: "won", assignedTo, wonAmount });
const data = {
  customers: [C("a", "me", 12000), C("b", "other", 30000)],
  visits: [{ id: "v1", customerId: "a", start: "2026-11-18T06:00:00Z", outcome: "won", showroomId: "kl", wonFiles: { quote: { path: "a/q.pdf", name: "Q" }, slip: { path: "a/s.jpg", name: "S" } } }],
  events: [{ id: 1, kind: "status", customerId: "b", actor: "other", owner: "other", data: { to: "won" }, at: "2026-10-03T02:00:00Z" }],
} as unknown as CrmData;

describe("Closed deals on the desktop", () => {
  it("is a sidebar page under REPORTS", () => {
    expect(PANEL_TABS.find(t => t[0] === "deals")?.[1]).toBe("Closed deals");
    expect(NAV_GROUPS.find(g => g[0] === "REPORTS")?.[1]).toContain("deals");
  });

  it("draws the tiles, a month a table with who sold it, and a row opens the chat", () => {
    const open = vi.fn(), setWho = vi.fn();
    const v = dealsView({ deals: allClosedDeals(data), per: "all", setPer: () => {}, now: new Date("2026-11-20T04:00:00Z"), roomName: () => "Kuala Lumpur",
      fileUrl: async () => null, openChat: id => (id === "a" ? open : null), back: () => {}, nameOf: id => (id === "me" ? "JIA HUI" : "KELVIN"), who: null, setWho });
    render(<DeskDeals v={{ ...v, alertsN: "", openAlerts: () => {} }} />);
    expect(screen.getByText("Closed deals")).toBeTruthy();
    expect(document.querySelector('[data-deals-tile="Total closed"]')!.textContent).toBe("RM 42,000");
    expect(document.querySelectorAll("[data-deals-month]").length).toBe(2);
    const rows = document.querySelectorAll("[data-deal]");
    expect(within(rows[0] as HTMLElement).getByText("JIA HUI")).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText("Kuala Lumpur")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("KELVIN")).toBeTruthy();
    fireEvent.click(rows[0]);
    expect(open).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Sold by: Everyone/ }));
    fireEvent.click(screen.getByText("KELVIN", { selector: "button *, button" }));
    expect(setWho).toHaveBeenCalledWith("other");
  });
});
