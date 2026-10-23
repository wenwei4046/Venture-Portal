import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// v3 T04 / T04b: By team is a row a team with its share box and slider; a team opens to its member breakdown and Adjust
// split, a bottom sheet whose boxes take two decimals, the others re-balancing to 100. Cancel puts the team back as it was
// when the sheet opened; Apply keeps it in the ad's draft (saved with the ad's Save).
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
  await tap(screen.getAllByRole("button", { name: "Adjust split" })[0]);
  return screen.getByRole("dialog", { name: /^Adjust split/ });
}

describe("Adjust split", () => {
  it("takes 40.5, re-balances the others, and Cancel puts the team back", async () => {
    const sheet = await openSheet();
    const boxes = within(sheet).getAllByRole("textbox") as HTMLInputElement[];
    const before = boxes.map(b => b.value);
    fireEvent.change(boxes[0], { target: { value: "40.5" } });
    await act(async () => {});
    const after = (within(screen.getByRole("dialog", { name: /^Adjust split/ })).getAllByRole("textbox") as HTMLInputElement[]).map(b => b.value);
    expect(after[0]).toBe("40.5");
    expect(after.reduce((x, v) => x + Number(v), 0)).toBeCloseTo(100, 2);
    expect(within(screen.getByRole("dialog", { name: /^Adjust split/ })).getByText("100%")).toBeInTheDocument();
    await tap(within(screen.getByRole("dialog", { name: /^Adjust split/ })).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: /^Adjust split/ })).toBeNull();
    await tap(screen.getAllByRole("button", { name: "Adjust split" })[0]);
    expect((within(screen.getByRole("dialog", { name: /^Adjust split/ })).getAllByRole("textbox") as HTMLInputElement[]).map(b => b.value)).toEqual(before);
  });

  it("Apply keeps the new split in the team's breakdown", async () => {
    const sheet = await openSheet();
    fireEvent.change(within(sheet).getAllByRole("textbox")[0], { target: { value: "40.5" } });
    await act(async () => {});
    await tap(within(screen.getByRole("dialog", { name: /^Adjust split/ })).getByRole("button", { name: "Apply" }));
    expect(screen.queryByRole("dialog", { name: /^Adjust split/ })).toBeNull();
    expect(screen.getByText("40.5%")).toBeInTheDocument();
  });
});
