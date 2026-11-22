import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// The owner, 2026-11-22, a video ("crm quick reply 有问题"): a new quick reply, half typed, vanished — the database keeps
// only rows with a shortcut AND a message, and the CRM's re-read put its answer back over the screen, so the keyboard
// closed and the page jumped. The page now edits its own copy; the rest of the CRM sees only finished rows.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

async function tap(el: Element | null) {
  expect(el).not.toBeNull();
  fireEvent.click(el!);
  await act(async () => {});
}

describe("Profile › Quick replies", () => {
  it("keeps a new row while it is only half typed", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=a1");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    await tap(screen.getAllByText("Profile", { exact: true }).pop()!.closest("button, [role=button], a, div[style*=pointer]") ?? screen.getAllByText("Profile", { exact: true }).pop()!);
    await tap(screen.getByText("Quick replies", { exact: true }));
    const before = screen.getAllByPlaceholderText("e.g. Price").length;
    await tap(screen.getByText("Add quick reply"));
    const rows = screen.getAllByPlaceholderText("e.g. Price");
    expect(rows.length).toBe(before + 1);
    fireEvent.change(rows[rows.length - 1], { target: { value: "Warr" } });
    await act(async () => {});
    const after = screen.getAllByPlaceholderText("e.g. Price");
    expect(after.length).toBe(before + 1);
    expect((after[after.length - 1] as HTMLInputElement).value).toBe("Warr");
  });
});
