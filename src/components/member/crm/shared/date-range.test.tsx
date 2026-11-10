/**
 * The owner (2026-11-10): every "Custom" period opens a calendar where dates can actually be picked. The desktop's Insight
 * period, Team activity, Reports, Audit log, Leads by ad / Ad split and the phone's Team activity all open DateRangePicker;
 * the phone Insight's period sheet is panel/vm/common.ts › dateSheetVM. Each is clicked here day by day and the range read.
 * And the look is the CRM's one range-picker look (cal-look.ts).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateRangePicker } from "./date-range";
import { CAL } from "./cal-look";
import { dateSheetVM } from "../panel/vm/common";

const TODAY = new Date(2026, 10, 10, 12); // 10 Nov 2026
const day = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

describe("DateRangePicker — days can be picked", () => {
  for (const sheet of [false, true]) {
    it(`${sheet ? "the phone's sheet" : "the desktop's popover"}: a first day, a last day, Apply → that range`, () => {
      const onApply = vi.fn();
      render(<DateRangePicker sheet={sheet} value={null} today={TODAY} onApply={onApply} onCancel={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "2026-11-03" }));
      fireEvent.click(screen.getByRole("button", { name: "2026-11-08" }));
      expect(screen.getByText("3 – 8 Nov 2026")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(onApply).toHaveBeenCalledWith({ a: day(2026, 10, 3), b: new Date(2026, 10, 8, 23, 59, 59, 999).getTime() });
    });
  }

  it("an end before the start swaps them; an earlier month is reached with ‹", () => {
    const onApply = vi.fn();
    render(<DateRangePicker value={null} today={TODAY} onApply={onApply} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "2026-11-05" }));
    fireEvent.click(screen.getByLabelText("Previous month"));
    fireEvent.click(screen.getByRole("button", { name: "2026-10-20" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({ a: day(2026, 9, 20), b: new Date(2026, 10, 5, 23, 59, 59, 999).getTime() });
  });

  it("a future day cannot be picked (nothing exists there yet)", () => {
    render(<DateRangePicker value={null} today={TODAY} onApply={() => {}} onCancel={() => {}} />);
    expect((screen.getByRole("button", { name: "2026-11-12" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the CRM's range-picker look: ends rust, the band between, today a ring", () => {
    render(<DateRangePicker value={{ a: day(2026, 10, 3), b: new Date(2026, 10, 6, 23, 59).getTime() }} today={TODAY} onApply={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: "2026-11-03" }).style.background).toBe(CAL.pickBg);
    expect(screen.getByRole("button", { name: "2026-11-04" }).style.background).toBe(CAL.rangeBg);
    expect(screen.getByRole("button", { name: "2026-11-10" }).style.boxShadow).toContain("1.5px");
  });
});

describe("the phone Insight's period sheet (Custom) — days can be picked", () => {
  it("tap a first day and a last day, Show → the period is that range", () => {
    let ui: Record<string, unknown> = { period: "month", ovRange: null, cmp: null, ovSheet: null };
    const patch = (p: Record<string, unknown>) => { ui = { ...ui, ...p }; };
    const set = (f: (u: typeof ui) => typeof ui) => { ui = f(ui); };
    const vm = () => dateSheetVM({ ui, patch, set, now: TODAY, data: { customers: [] } } as never);
    vm().ovOpenPeriod();
    // The sheet opens on this month; tap 3 Nov then 8 Nov.
    const cells = () => vm().ovrCells;
    const first = cells().findIndex(c => c.n === 1);
    cells()[first + 2].pick!();
    cells()[first + 7].pick!();
    expect(vm().ovrApplyLabel).toMatch(/3.*8 Nov/);
    vm().ovrApply();
    expect(ui.period).toBe("custom");
    expect(ui.ovRange).toEqual({ a: day(2026, 10, 3), b: day(2026, 10, 8) });
  });
});
