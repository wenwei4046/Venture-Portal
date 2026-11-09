import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import CrmApp from "../CrmApp";

vi.mock("@/app/(member)/member/crm-actions", async importOriginal => ({ ...(await importOriginal<object>()), fetchCrmAssignedSince: vi.fn(async () => ({ ok: true, rows: [] })) }));

// The owner, 2026-11-09: "手机上的 assignment 也要加入 leave" — the phone's Assignment has Leave: each person and their time off.
describe("Assignment › Leave on the phone", () => {
  it("is a tab of Assignment and lists the people by team", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    const nav = [...document.querySelectorAll("nav button, nav [role=button], nav a, nav span")].find(b => b.textContent?.trim() === "Assignment")!;
    await act(async () => { fireEvent.click(nav); });
    const tab = [...document.querySelectorAll("span")].find(s => s.textContent === "Leave" && s.style.cursor === "pointer")!;
    expect(tab).toBeTruthy();
    await act(async () => { fireEvent.click(tab); });
    expect(screen.getByText("Kelvin Lee")).toBeInTheDocument();
    expect(document.body.textContent).toContain("Team Kelvin");
  });
});
