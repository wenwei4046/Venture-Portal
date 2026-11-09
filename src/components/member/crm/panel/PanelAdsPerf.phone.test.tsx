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
    // v4 8c: the period is the first of one row of three dropdowns.
    await tap(screen.getByRole("button", { name: /^Period: / }));
    for (const l of ["Today", "This week", "This month", "Custom…"]) expect(screen.getByRole("option", { name: l })).toBeInTheDocument();
    await tap(screen.getByRole("option", { name: "This week" }));
    expect(screen.getByRole("button", { name: "Period: This week" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Source: / })).toBeInTheDocument();
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
    // v4 8c: the status is the third of one row of dropdowns — "● Running 6 ▾".
    const pill = () => screen.getByRole("button", { name: /^Status: / });
    const open = async () => { await tap(pill()); return (l: string) => screen.getByRole("option", { name: new RegExp(`^${l}`) }); };
    // Running first (the owner, 2026-11-09: "ads performance 默认开 running").
    expect(pill()).toHaveAccessibleName("Status: Running");
    let opt = await open();
    const n = (l: string) => Number(opt(l).textContent!.replace(/\D/g, ""));
    expect(opt("Running")).toHaveAttribute("aria-selected", "true");
    expect(n("Running") + n("Paused")).toBe(n("All ads"));
    expect(screen.queryByRole("option", { name: /^Pending/ })).toBeNull();
    const none = ["Running", "Paused"].find(l => n(l) === 0), some = ["Running", "Paused"].find(l => n(l) > 0)!;
    await tap(opt(some));
    expect(pill()).toHaveAccessibleName(`Status: ${some}`);
    if (none) { opt = await open(); await tap(opt(none)); expect(screen.getByText("No leads from an ad in this period.")).toBeInTheDocument(); }
    opt = await open();
    await tap(opt("All ads"));
    expect(screen.getByText("Akemi Mattress · October Fair")).toBeInTheDocument();
  });
});
