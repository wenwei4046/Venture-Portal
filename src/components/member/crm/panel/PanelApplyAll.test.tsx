import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// The phone's Split leads: "Save and apply to all" means calculate together (the owner, 2026-10-24: "它的意思就是 calculate
// together"): its words carry no count, and one save puts every ad on this setting, counted together.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

async function tap(el: Element) { fireEvent.click(el); await act(async () => {}); }

describe("Split leads › Save and apply to all", () => {
  it("reads Save and apply to all, and saves every ad counted together", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    await tap(screen.getAllByText("Assignment", { exact: true }).find(e => e.closest("nav"))!);
    await tap(screen.getByText("Akemi Mattress · October Fair"));
    await tap(screen.getByText("By team", { exact: true }));
    expect(screen.queryByText(/^Save and apply to all \d+ ads$/)).toBeNull();
    await tap(screen.getByText("Save and apply to all", { exact: true }));
    expect(screen.getByText(/^Applied to all \d+ ads · counted together$/)).toBeInTheDocument();
  });
});
