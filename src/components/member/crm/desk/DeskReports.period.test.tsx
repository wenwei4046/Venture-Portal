// v4 D6a (notes/25): Reports' period is Today · This week · This month · Custom; Custom opens a calendar where dates are
// actually picked (Last month and All time among its presets) and Apply sets them.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { RpPeriods } from "./DeskReports";

function Harness({ apply }: { apply: (r: { a: number; b: number }) => void }) {
  const [open, setOpen] = useState(false);
  const periods = ["Today", "This week", "This month", "Custom"].map(label => ({ label, on: label === "This month", pick: () => { if (label === "Custom") setOpen(true); } }));
  const picker = open ? { value: null as unknown as { a: number; b: number }, allFrom: new Date(2025, 0, 1).getTime(), apply: (r: { a: number; b: number }) => { apply(r); setOpen(false); }, cancel: () => setOpen(false) } : null;
  return <RpPeriods r={{ periods, picker, rangeText: "1–10 Nov" }} />;
}

describe("Reports' Custom period", () => {
  it("opens a calendar; two days picked and Apply give that range", () => {
    const apply = vi.fn();
    render(<Harness apply={apply} />);
    expect(screen.getByText("1–10 Nov")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    const dlg = screen.getByRole("dialog", { name: "Pick dates" });
    // Custom's presets: Last month and All time.
    expect(within(dlg).getByRole("button", { name: "Last month" })).toBeTruthy();
    expect(within(dlg).getByRole("button", { name: "All time" })).toBeTruthy();
    // Last month: every day there is in the past, so it can be picked.
    fireEvent.click(within(dlg).getByRole("button", { name: "Previous month" }));
    const days = within(dlg).getAllByRole("button").filter(b => /^\d+$/.test(b.textContent ?? "") && !(b as HTMLButtonElement).disabled);
    const d3 = days.find(b => b.textContent === "3")!, d12 = days.find(b => b.textContent === "12")!;
    fireEvent.click(d3); fireEvent.click(d12);
    fireEvent.click(within(dlg).getByRole("button", { name: "Apply" }));
    expect(apply).toHaveBeenCalledTimes(1);
    const { a, b } = apply.mock.calls[0][0];
    const t = new Date(), lm = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    expect(new Date(a)).toEqual(new Date(lm.getFullYear(), lm.getMonth(), 3));
    expect(new Date(b).getDate()).toBe(12);
    expect(screen.queryByRole("dialog", { name: "Pick dates" })).toBeNull();
  }, 20_000);
  it("All time picks from the first lead to today", () => {
    const apply = vi.fn();
    render(<Harness apply={apply} />);
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    const dlg = screen.getByRole("dialog", { name: "Pick dates" });
    fireEvent.click(within(dlg).getByRole("button", { name: "All time" }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Apply" }));
    expect(new Date(apply.mock.calls[0][0].a)).toEqual(new Date(2025, 0, 1));
  }, 20_000);
});
