import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";
import { visitShort, waitOf } from "./vm/inbox";

// v4 · Mine's Inbox = frame 10b (docs/design_handoff_crm_redesign_v4, notes/16): search is an icon that opens the field in
// place of the chip row (Cancel clears it and closes it); All ads leads the chip row; every row the same height — the wait
// in the time's place, a fixed 22 px message line holding the unread badge; no urgency / 1st visit / Cold lead lines.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
async function tap(el: Element | null | undefined) { fireEvent.click(el!); await act(async () => {}); }
async function mine() {
  window.history.replaceState({}, "", "/member/preview?crmAs=a1");
  render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
  await act(async () => {});
}

describe("Mine's Inbox (10b)", () => {
  it("the search icon opens the field in place of the chips; Cancel clears it and brings the chips back", async () => {
    await mine();
    expect(screen.getByRole("button", { name: /All ads/ })).toBeTruthy();
    expect(screen.queryByLabelText("Search chats")).toBeNull();
    const rows = document.querySelectorAll("[data-inbox-row]").length;
    expect(rows).toBeGreaterThan(0);
    await tap(screen.getByRole("button", { name: "Search" }));
    expect(screen.queryByRole("button", { name: /All ads/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Search chats"), { target: { value: "zzzz-nobody" } });
    await act(async () => {});
    expect(document.querySelectorAll("[data-inbox-row]").length).toBe(0);
    expect(screen.getByText("No chat matches")).toBeTruthy();
    await tap(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Search chats")).toBeNull();
    expect(screen.getByRole("button", { name: /All ads/ })).toBeTruthy();
    expect(document.querySelectorAll("[data-inbox-row]").length).toBe(rows);
  });

  it("every row: a 22 px first line, a 16 px ad line and a 22 px message line; the old note lines are gone", async () => {
    await mine();
    const rows = [...document.querySelectorAll<HTMLElement>("[data-inbox-row]")];
    for (const r of rows) {
      const lines = r.querySelector<HTMLElement>("[data-inbox-row] > div > span:last-child")!.children;
      expect([...lines].map(l => (l as HTMLElement).style.height)).toEqual(["22px", "16px", "22px"]);
    }
    expect(screen.queryByText(/^Cold lead$/)).toBeNull();
    expect(screen.queryByText(/^1st visit/)).toBeNull();
    expect(screen.queryByText(/^(Overdue|Urgent|Reply soon) · \d+ h$/)).toBeNull();
  });

  it("the chips: All first and picked (ink), All ads ahead of a divider", async () => {
    await mine();
    const all = screen.getAllByRole("button").find(b => /^All\d+$/.test(b.textContent ?? ""))!;
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(all.style.background).toBe("var(--crm-ink)");
    const attention = screen.getAllByRole("button").find(b => /^Attention\d+$/.test(b.textContent ?? ""))!;
    await tap(attention);
    expect(attention).toHaveAttribute("aria-pressed", "true");
  });
});

describe("the wait and the visit (10b / 2d)", () => {
  it("the wait replaces the time: triangle for Overdue, clock otherwise; Reply soon in the amber text, the rest oxblood", () => {
    expect(waitOf({ level: "overdue", waitingMinutes: 9 * 60 + 20 }, true)).toEqual({ waitShow: true, waitIc: "triangle-alert", waitTxt: "9 h", waitC: "var(--crm-oxblood)" });
    expect(waitOf({ level: "urgent", waitingMinutes: 6 * 60 }, true)).toMatchObject({ waitIc: "clock", waitTxt: "6 h", waitC: "var(--crm-oxblood)" });
    expect(waitOf({ level: "soon", waitingMinutes: 200 }, true)).toMatchObject({ waitIc: "clock", waitTxt: "3 h", waitC: "var(--crm-text-appt)" });
    expect(waitOf({ level: "none", waitingMinutes: 0 }, true).waitShow).toBe(false);
    expect(waitOf({ level: "overdue", waitingMinutes: 900 }, false).waitShow).toBe(false); // a cold or blocked chat: the time
  });
  it("the next booked visit, short", () => {
    const now = new Date(2026, 10, 10, 9, 0); // Tue 10 Nov
    const v = (start: Date, state = "booked") => ({ customerId: "c", state, start: start.toISOString() });
    expect(visitShort([v(new Date(2026, 10, 14, 11, 0))], "c", now)).toBe("Sat 11 am");
    expect(visitShort([v(new Date(2026, 10, 14, 14, 30)), v(new Date(2026, 10, 12, 11, 0), "attended")], "c", now)).toBe("Sat 2:30 pm");
    expect(visitShort([v(new Date(2026, 10, 24, 10, 0))], "c", now)).toBe("24 Nov, 10 am");
    expect(visitShort([], "c", now)).toBe("");
  });
});
