import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// The phone's Ads performance (the owner, 2026-10-24): a period, "vs the period before", up to four metrics (× / +), a
// day-by-day chart and every ad with those figures — a simple version of the desktop's.
vi.mock("@/app/(member)/member/crm-actions", () => ({ fetchAdInsights: vi.fn(), fetchAdDaily: vi.fn() }));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
async function tap(el: Element) { fireEvent.click(el); await act(async () => {}); }

describe("Ads performance on the phone", () => {
  it("shows the period, four metrics, the chart and every ad; a metric comes off and goes back on", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    await tap(screen.getByRole("button", { name: "Ads performance" }));
    for (const l of ["Today", "This week", "This month"]) expect(screen.getByRole("button", { name: l })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Day by day" })).toBeInTheDocument();
    expect(screen.getByText("By ad")).toBeInTheDocument();
    expect(screen.getByText("Akemi Mattress · October Fair")).toBeInTheDocument();
    await tap(screen.getByRole("button", { name: "Remove Cost per lead" }));
    expect(screen.queryByRole("button", { name: "Remove Cost per lead" })).toBeNull();
    await tap(screen.getByRole("button", { name: /Metric/ }));
    const sheet = screen.getByRole("dialog", { name: "Add a metric" });
    await tap(within(sheet).getByText("Cost per lead"));
    expect(screen.getByRole("button", { name: "Remove Cost per lead" })).toBeInTheDocument();
  });

  it("filters by the ad's status, as the desktop's (the owner, 2026-11-08: \"没得选状态？\")", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    await tap(screen.getByRole("button", { name: "Ads performance" }));
    const row = document.querySelector("[data-ads-status]")!;
    const btn = (l: string) => within(row as HTMLElement).getByRole("button", { name: new RegExp(`^${l}`) });
    const n = (l: string) => Number(btn(l).textContent!.replace(/\D/g, ""));
    expect(btn("All ads")).toHaveAttribute("aria-pressed", "true");
    expect(n("Running") + n("Paused") + n("Pending")).toBe(n("All ads"));
    const none = ["Running", "Paused", "Pending"].find(l => n(l) === 0), some = ["Running", "Paused", "Pending"].find(l => n(l) > 0)!;
    await tap(btn(some));
    expect(btn(some)).toHaveAttribute("aria-pressed", "true");
    if (none) { await tap(btn(none)); expect(screen.getByText("No leads from an ad in this period.")).toBeInTheDocument(); }
    await tap(btn("All ads"));
    expect(screen.getByText("Akemi Mattress · October Fair")).toBeInTheDocument();
  });
});
