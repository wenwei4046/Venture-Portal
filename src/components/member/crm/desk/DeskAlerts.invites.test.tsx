import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeskAlerts } from "./DeskExtras";

// CRM alerts open on the invitations waiting on oneself (2026-10-23 — a Move is a request on the computer too): the
// phone's words, Decline | Accept.
afterEach(cleanup);

const base = { rows: [], tab: "all", tabs: [{ label: "All 1", on: true, pick: () => {} }], markAll: null, empty: "No alerts yet" };

describe("CRM alerts' Invitations", () => {
  it("draws each invitation with Decline and Accept, and answers it", () => {
    const accept = vi.fn(), decline = vi.fn();
    render(<DeskAlerts v={{ ...base, invites: [{ key: "i1", kind: "Move", color: "var(--crm-ink-soft)", time: "11:02 am",
      title: "PETER wants to move a lead to you", sub: "Feng Binxia · WhatsApp", accept, decline }] } as never} />);
    expect(screen.getByText("INVITATIONS")).toBeInTheDocument();
    const row = screen.getByText("PETER wants to move a lead to you").closest("div")!;
    expect(within(row).getByText("Feng Binxia · WhatsApp")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Accept" }));
    fireEvent.click(within(row).getByRole("button", { name: "Decline" }));
    expect([accept.mock.calls.length, decline.mock.calls.length]).toEqual([1, 1]);
    expect(screen.queryByText("No alerts yet")).not.toBeInTheDocument();
  });

  it("with no invitation and no alert, says so", () => {
    render(<DeskAlerts v={{ ...base, invites: [] } as never} />);
    expect(screen.queryByText("INVITATIONS")).not.toBeInTheDocument();
    expect(screen.getByText("No alerts yet")).toBeInTheDocument();
  });
});
