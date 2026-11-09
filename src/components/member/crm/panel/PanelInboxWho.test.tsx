import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import CrmApp from "../CrmApp";

vi.mock("@/app/(member)/member/crm-actions", async importOriginal => ({ ...(await importOriginal<object>()), fetchCrmAssignedSince: vi.fn(async () => ({ ok: true, rows: [] })) }));

// The owner, 2026-11-09: "inbox 中的人员，做筛选" — one dropdown: All, each team and its people.
describe("Team inbox › whose chats", () => {
  it("picks a person from the dropdown, and the board shows only theirs", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    const nav = [...document.querySelectorAll("nav button, nav [role=button], nav a, nav span")].find(b => b.textContent?.trim() === "Inbox")!;
    await act(async () => { fireEvent.click(nav); });
    const pick = screen.getByRole("button", { name: /^Showing: All/ });
    await act(async () => { fireEvent.click(pick); });
    const opts = screen.getAllByRole("option").map(o => o.textContent);
    expect(opts[0]).toMatch(/^All\d+$/);
    const person = screen.getAllByRole("option").find(o => /^Kelvin Lee\d+$/.test(o.textContent ?? ""))!;
    const n = Number(person.textContent!.replace(/\D/g, ""));
    await act(async () => { fireEvent.click(person); });
    expect(screen.getByRole("button", { name: "Showing: Kelvin Lee" }).textContent).toContain(String(n));
  });
});
