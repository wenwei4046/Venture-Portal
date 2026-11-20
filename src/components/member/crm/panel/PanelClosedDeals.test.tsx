import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// Profile › Closed deals on the Team side (the owner, 2026-11-20: "principal 也能看到"), on the demo's data as
// /member/preview draws the Control panel for the Principal.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

async function tap(el: Element | null) { expect(el).not.toBeNull(); fireEvent.click(el!); await act(async () => {}); }

describe("the Principal's Profile › Closed deals", () => {
  it("opens from Profile's Sales group, shows the total, and goes back to Profile", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    await tap(screen.getAllByText("Profile", { exact: true }).find(e => e.closest("nav")) ?? null);
    await tap(screen.getByText("Closed deals", { exact: true }));
    expect(document.querySelector("[data-closed-deals]")).not.toBeNull();
    expect(screen.getByText("Total closed")).toBeTruthy();
    await tap(screen.getAllByText("Profile", { exact: true }).find(e => e.closest("[data-closed-deals]")) ?? null);
    expect(document.querySelector("[data-closed-deals]")).toBeNull();
    expect(screen.getByText("Closed deals", { exact: true })).toBeTruthy();
  });
});
