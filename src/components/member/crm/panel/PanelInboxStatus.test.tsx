import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// The Team inbox's status is one dropdown (the owner, 2026-11-08: "做成下拉式选择状态吧" — eight tabs ran onto three lines).
vi.mock("@/app/(member)/member/crm-actions", () => ({ fetchAdInsights: vi.fn(), fetchAdDaily: vi.fn() }));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
async function tap(el: Element | null | undefined) { fireEvent.click(el!); await act(async () => {}); }

describe("the Team inbox's status dropdown", () => {
  it("shows the status picked; a tap lists every status, a pick shows it, a tap outside closes", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    await tap(screen.getAllByText("Inbox", { exact: true }).find(e => e.closest("nav")));
    const pick = () => screen.getByRole("button", { name: /^Status:/ });
    // All first and where it opens (the owner, 2026-11-09: "All 要能看完全部的咨询").
    expect(pick()).toHaveAttribute("aria-label", "Status: All");
    expect(screen.queryByRole("listbox")).toBeNull();
    await tap(pick());
    expect(screen.getAllByRole("option").map(o => o.textContent?.replace(/\d+$/, ""))).toEqual(["All", "New", "Attention", "Follow up", "Appointment", "Won", "Lost", "Cold leads", "Blocked"]);
    await tap(screen.getAllByRole("option")[3]);
    expect(pick()).toHaveAttribute("aria-label", "Status: Follow up");
    expect(screen.queryByRole("listbox")).toBeNull();
    await tap(pick());
    await act(async () => { document.body.click(); });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(pick()).toHaveAttribute("aria-label", "Status: Follow up");
  });
});
