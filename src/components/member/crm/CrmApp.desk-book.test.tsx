import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "./CrmApp";
import type { DeskApp } from "./desk/vm/ctx";
import { askInvite } from "./shared/won-files";

// Found 2026-11-27 with the desktop Calendar's one + (the owner: "按的时候可以选 … 看是要 book appointment 还是 add leave"):
// CrmApp mounted the customer picker and Book visit's "Send invitation?" (2026-11-19) in the phone's shell alone, so on a
// computer Book appt opened nothing and every booking sent the invitation unasked. The desktop mounts both now.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

const deskApp: DeskApp = {
  greeting: "Good morning", subName: "IR", dateLine: "Fri 27 Nov 2026", bellUnread: false, notifCount: 0,
  go: () => {}, openNotifications: () => {}, openBell: () => {}, openSubDept: () => {}, signOut: () => {}, hidden: [], crmUnread: 0, products: null, modules: null,
} as unknown as DeskApp;

async function openDesk() {
  window.history.replaceState({}, "", "/member/preview?crmAs=boss");
  render(<CrmApp live={false} salesperson="You" onExit={() => {}} desk deskApp={deskApp} />);
  await act(async () => {});
}

describe("the desktop CRM books from the Calendar", () => {
  it("Calendar › + › Book appointment opens the customer picker", async () => {
    await openDesk();
    await act(async () => { screen.getAllByText("Calendar", { exact: true })[0].closest("button")!.click(); });
    const plus = document.querySelector<HTMLElement>("[data-cal-plus]")!;
    expect(plus).toBeTruthy();
    await act(async () => { fireEvent.click(plus); });
    const menu = screen.queryByRole("menu");
    if (menu) await act(async () => { fireEvent.click(within(menu).getByText("Book appointment")); });
    expect(document.querySelector("[data-customer-pick]")).toBeTruthy();
  });

  it("a booking asks whether the customer is sent the invitation", async () => {
    await openDesk();
    let answer: boolean | null | undefined;
    await act(async () => { void askInvite("Kim Lee").then(v => { answer = v; }); });
    const ask = document.querySelector<HTMLElement>("[data-invite-ask]")!;
    expect(ask).toBeTruthy();
    await act(async () => { fireEvent.click(within(ask).getByText("Book without sending")); });
    expect(answer).toBe(false);
  });
});
