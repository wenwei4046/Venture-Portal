import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// The owner, 2026-10-23: on Team Insight a member opens the Team inbox filtered to them, still as the Principal — not
// their own CRM as them (that is Profile's View as). And no Won on the team rows for now.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

async function tap(el: Element) { fireEvent.click(el); await act(async () => {}); }

describe("a member on Team Insight", () => {
  it("opens the Team inbox filtered to them, as oneself", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    expect(screen.queryByText(/^Won/)).toBeNull();
    await tap(screen.getByText("Team Kelvin"));
    await tap(screen.getByText("Farah Aziz"));
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    // Still the Team side (Team | Mine shows Team), not Farah's own CRM.
    expect(screen.getByLabelText("Team · switch to Mine")).toBeInTheDocument();
    expect(screen.queryByText(/Viewing .*CRM/)).toBeNull();
  });
});

describe("Insight's Leads", () => {
  it("opens the period's leads (the owner, 2026-10-24: 點20，可以看到list)", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    expect(screen.queryByText("Tap a team for its people")).toBeNull();
    await tap(screen.getByRole("button", { name: /^Leads/ }));
    expect(screen.getByText(/^Leads · /)).toBeInTheDocument();
    expect(screen.getByText(/\d+ leads?$/)).toBeInTheDocument();
  });
});
