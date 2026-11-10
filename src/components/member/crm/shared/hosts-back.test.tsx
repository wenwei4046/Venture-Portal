import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionSheetHost, openActions } from "./action-sheet";
import { NotifSummaryHost, openSummary } from "./notif-summary";
import { AttachSheetHost, openAttach } from "./attach-sheet";

// notes/10 §1 (2026-11-10): the hosts CrmApp mounts in shell() that open as a bottom sheet hold their own Back step — the
// phone's Back closes the sheet, not the screen under it (it went past the sheet to an earlier screen, or out of the CRM).
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });
const back = () => { window.history.replaceState({}, ""); window.dispatchEvent(new PopStateEvent("popstate", { state: {} })); };

describe("a bottom sheet over the CRM is one Back step", () => {
  it("the action sheet: open pushes a step; Back closes it", async () => {
    render(<ActionSheetHost />);
    const before = history.length;
    act(() => openActions({ title: "Appointment", actions: [{ label: "Close", run: () => {} }] }));
    expect(history.length).toBe(before + 1);
    expect((history.state as Record<string, unknown>).crmActions).toBe(1);
    act(() => back());
    expect(screen.queryByRole("dialog", { name: "Appointment" })).toBeNull();
  });

  it("the notification summary: Back closes it; Open chat goes on only after its step is taken back", async () => {
    const goes = vi.fn();
    const backSpy = vi.spyOn(history, "back").mockImplementation(() => setTimeout(() => window.dispatchEvent(new PopStateEvent("popstate", { state: {} })), 0) as unknown as void);
    render(<NotifSummaryHost />);
    act(() => openSummary({ title: "New lead", when: "now", name: "A", ini: "A", chan: "WhatsApp", chanFg: "", facts: [], lines: [], visit: "", openChat: goes }));
    expect((history.state as Record<string, unknown>).crmSummary).toBe(1);
    fireEvent.click(screen.getByText("Open chat"));
    expect(goes).not.toHaveBeenCalled();
    expect(backSpy).toHaveBeenCalledTimes(1);
    await act(() => new Promise<void>(r => setTimeout(r, 5)));
    expect(goes).toHaveBeenCalledTimes(1);
    backSpy.mockRestore();
  });

  it("the + sheet: Back closes it", async () => {
    render(<AttachSheetHost />);
    act(() => openAttach({ quick: [], auto: [], pick: () => {} }));
    expect((history.state as Record<string, unknown>).crmAttach).toBe(1);
    act(() => back());
    expect(screen.queryByRole("dialog", { name: "Attach" })).toBeNull();
  });
});
