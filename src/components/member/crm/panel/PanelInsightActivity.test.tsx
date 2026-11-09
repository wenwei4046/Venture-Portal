import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import CrmApp from "../CrmApp";

vi.mock("@/app/(member)/member/crm-actions", async importOriginal => ({ ...(await importOriginal<object>()), fetchCrmAssignedSince: vi.fn(async () => ({ ok: true, rows: [] })) }));

// The owner, 2026-11-09: the phone's bottom bar has Assignment again, and Team activity is a side of Insight's switch —
// Team · Ads · Up next · Activity (the order since 2026-11-09).
describe("Team activity on the phone's Insight", () => {
  it("Assignment is back in the bottom bar; Activity sits beside Team and opens Team activity", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    const nav = [...document.querySelectorAll("nav")].map(n => n.textContent ?? "").join(" ");
    expect(nav).toContain("Assignment");
    expect(nav).not.toContain("Activity");
    const sw = screen.getByRole("button", { name: "Team activity" }).parentElement!;
    expect([...sw.children].map(b => b.textContent)).toEqual(["Team", "Ads", "Up next", "Activity"]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Team activity" })); });
    expect(screen.getByRole("heading", { name: "Team activity" })).toBeInTheDocument();
  });
});
