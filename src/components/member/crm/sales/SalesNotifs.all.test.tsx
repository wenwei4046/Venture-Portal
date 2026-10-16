import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// Notifications have All · Unread · Read and open on All, so what was read can be found again (the owner, 2026-10-16:
// "Notification 要有一個 all，看過的要能看回去"). On the demo's data, as /member/preview draws a salesperson's CRM.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

async function tap(el: Element | null) {
  expect(el).not.toBeNull();
  fireEvent.click(el!);
  await act(async () => {});
}

describe("Mine's notifications: All", () => {
  it("opens on All, and All still lists them once every one is read", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=a1");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    await tap(screen.getByTitle("Notifications"));
    expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    for (const t of ["All", "Unread", "Read"]) expect(screen.getAllByText(t, { exact: true }).length).toBeGreaterThan(0);
    expect(screen.queryByText("You're all caught up.")).toBeNull();
    expect(screen.queryByText("No notifications yet.")).toBeNull();

    const mark = screen.queryByText("Mark all as read");
    if (mark) await tap(mark);
    await tap(screen.getAllByText("Unread", { exact: true })[0]);
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    await tap(screen.getAllByText("All", { exact: true })[0]);
    expect(screen.queryByText("You're all caught up.")).toBeNull();
    expect(screen.queryByText("No notifications yet.")).toBeNull();
  });
});
