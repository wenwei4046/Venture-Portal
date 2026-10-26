import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// The phone's Split leads: "Save and apply to all" opens a sheet (the owner, 2026-10-24: "可以在里面勾选广告，决定哪一个要、
// 哪一个不要 … 再选择是 standard 的 apply to all，还是全部总和起来算"): the ads ticked, then Standard or Count together.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

async function tap(el: Element) { fireEvent.click(el); await act(async () => {}); }

async function openSheet() {
  window.history.replaceState({}, "", "/member/preview?crmAs=boss");
  render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
  await act(async () => {});
  await tap(screen.getAllByText("Assignment", { exact: true }).find(e => e.closest("nav"))!);
  await tap(screen.getByText("Akemi Mattress · October Fair"));
  await tap(screen.getByText("By team", { exact: true }));
  expect(screen.queryByText(/^Save and apply to all \d+ ads$/)).toBeNull();
  await tap(screen.getByText("Save and apply to all", { exact: true }));
  return screen.getByRole("dialog", { name: "Save and apply to all" });
}

describe("Split leads › Save and apply to all", () => {
  it("opens a sheet of the ads, every one ticked, on Standard — Apply saves each on its own", async () => {
    const sheet = await openSheet();
    expect(within(sheet).getByRole("radio", { name: "Standard" })).toHaveAttribute("aria-checked", "true");
    const boxes = within(sheet).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.length).toBeGreaterThan(2);
    expect(boxes.every(b => b.checked)).toBe(true);
    // The ad being edited is always one of them.
    expect(boxes[0].disabled).toBe(true);
    await tap(within(sheet).getByRole("button", { name: `Apply to ${boxes.length} ads` }));
    await act(async () => {});
    expect(screen.getByText(`Applied to ${boxes.length} ads`)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Save and apply to all" })).toBeNull();
  });
  it("Count together with one ad unticked: the others are counted together", async () => {
    const sheet = await openSheet();
    await tap(within(sheet).getByRole("radio", { name: "Count together" }));
    const boxes = within(sheet).getAllByRole("checkbox") as HTMLInputElement[];
    await tap(boxes[1]);
    expect(boxes[1].checked).toBe(false);
    const n = boxes.length - 1;
    await tap(within(sheet).getByRole("button", { name: `Count ${n} ads together` }));
    await act(async () => {});
    expect(screen.getByText(`${n} ads counted together`)).toBeInTheDocument();
  });
});
