import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// Showrooms on the phone's Control panel, v4 frames 3a / 4a / 4a·2 / 4a·3 (docs/design_handoff_crm_redesign_v4): one page,
// a tab a showroom (it was ‹ 1 / 2 ›, 2026-10-16), + at the title's right, changes a draft until Publish, and Back with
// unsaved changes asks Save draft / Discard changes / Keep editing. On the demo's data (two showrooms), as
// /member/preview draws the Control panel for the Principal.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

async function tap(el: Element | null) {
  expect(el).not.toBeNull();
  fireEvent.click(el!);
  await act(async () => {});
}
async function openShowrooms() {
  window.history.replaceState({}, "", "/member/preview?crmAs=boss");
  render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
  await act(async () => {});
  await tap(screen.getAllByText("Profile", { exact: true }).find(e => e.closest("nav")) ?? null);
  await tap(screen.getByText("Showrooms", { exact: true }));
  return document.querySelector("[data-showrooms4]") as HTMLElement;
}
const tabs = (page: HTMLElement) => [...page.querySelectorAll("button[aria-pressed]")].map(b => b.textContent);

describe("Showrooms, one page with a tab a showroom (3a)", () => {
  it("draws a tab per showroom, the one on screen pressed; + adds one more; no pager, no Add showroom row", async () => {
    const page = await openShowrooms();
    expect(page).not.toBeNull();
    expect(within(page).getByRole("heading", { name: "Showrooms" })).toBeInTheDocument();
    expect(tabs(page)).toEqual(["Kuala Lumpur Showroom", "Penang Showroom"]);
    expect(within(page).getByRole("button", { name: "Kuala Lumpur Showroom" })).toHaveAttribute("aria-pressed", "true");
    expect(within(page).getByLabelText("Name")).toHaveValue("Kuala Lumpur Showroom");
    expect(screen.queryByText("1 / 2")).toBeNull();
    expect(screen.queryByText("Add showroom")).toBeNull();
    // One row a weekday, Details / Opening hours / Bookings / Closures / Remarks, Delete at the foot; no bar until a change.
    for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) expect(within(page).getByText(d)).toBeInTheDocument();
    for (const h of ["Details", "Opening hours", "Bookings", "Closures", "Remarks"]) expect(within(page).getByText(h)).toBeInTheDocument();
    expect(within(page).getByText("Delete this showroom")).toBeInTheDocument();
    expect(page.querySelector("[data-room-bar]")).toBeNull();

    await tap(within(page).getByRole("button", { name: "Penang Showroom" }));
    expect(within(page).getByLabelText("Name")).toHaveValue("Penang Showroom");
    await tap(within(page).getByLabelText("Add showroom"));
    expect(tabs(page)).toEqual(["Kuala Lumpur Showroom", "Penang Showroom", "New showroom"]);
    expect(within(page).getByLabelText("Name")).toHaveValue("");
  });

  it("a change brings the bar; Save draft keeps it under the saver's name (tag, banner); Publish makes it live (4a, 4a·2)", async () => {
    const page = await openShowrooms();
    fireEvent.change(within(page).getByLabelText("Name"), { target: { value: "KL Flagship" } });
    await act(async () => {});
    fireEvent.click(within(page).getByLabelText("More"));
    await act(async () => {});
    const bar = page.querySelector("[data-room-bar]") as HTMLElement;
    expect(bar).toHaveTextContent("2 unsaved changes");
    expect(bar).toHaveTextContent("Sales see the published version");

    await tap(within(bar).getByText("Save draft"));
    const after = page.querySelector("[data-room-bar]") as HTMLElement;
    expect(after).toHaveTextContent("Draft saved");
    expect(after).toHaveTextContent("2 changes not live");
    expect(within(after).getByText("Discard")).toBeInTheDocument();
    // The draft stays on screen and its tab carries the saver's initials; the banner says who, when and what changed.
    expect(within(page).getByLabelText("Name")).toHaveValue("KL Flagship");
    expect(page.querySelector("button[aria-pressed='true']")?.textContent).toMatch(/draft$/);
    const banner = page.querySelector("[data-room-draft]") as HTMLElement;
    expect(banner).toHaveTextContent(/’s draft · saved \d\d:\d\d/);
    expect(banner).toHaveTextContent(/Name, Visits per slot \d+ → \d+\. Sales still see the published version\./);

    await tap(within(after).getByText("Publish"));
    expect(page.querySelector("[data-room-bar]")).toBeNull();
    expect(page.querySelector("[data-room-draft]")).toBeNull();
    expect(tabs(page)[0]).toBe("KL Flagship");
  });

  it("Back with unsaved changes opens the leave sheet and stays; Keep editing keeps them; Discard changes leaves (4a·3)", async () => {
    const page = await openShowrooms();
    fireEvent.change(within(page).getByLabelText("Name"), { target: { value: "KL Flagship" } });
    await act(async () => {});
    await tap(within(page).getByLabelText("Back to Profile"));
    const sheet = screen.getByRole("dialog", { name: "Leave without publishing?" });
    expect(sheet).toHaveTextContent("1 change to KL Flagship. A draft keeps them under your name; sales won’t see them.");
    expect(within(page).getByLabelText("Name")).toHaveValue("KL Flagship");

    await tap(within(sheet).getByText("Keep editing"));
    expect(screen.queryByRole("dialog", { name: "Leave without publishing?" })).toBeNull();
    expect(within(page).getByLabelText("Name")).toHaveValue("KL Flagship");

    await tap(within(page).getByLabelText("Back to Profile"));
    await tap(within(screen.getByRole("dialog", { name: "Leave without publishing?" })).getByText("Discard changes"));
    expect(document.querySelector("[data-showrooms4]")).toBeNull();
    // Nothing was saved: opened again, the showroom is as it was.
    await tap(screen.getByText("Showrooms", { exact: true }));
    expect(within(document.querySelector("[data-showrooms4]") as HTMLElement).getByLabelText("Name")).toHaveValue("Kuala Lumpur Showroom");
  });

  it("another tab with unsaved changes asks first, then goes there", async () => {
    const page = await openShowrooms();
    fireEvent.change(within(page).getByLabelText("Name"), { target: { value: "KL Flagship" } });
    await act(async () => {});
    await tap(within(page).getByRole("button", { name: "Penang Showroom" }));
    await tap(within(screen.getByRole("dialog", { name: "Leave without publishing?" })).getByText("Save draft"));
    expect(within(page).getByLabelText("Name")).toHaveValue("Penang Showroom");
    expect(tabs(page)[0]).toMatch(/^Kuala Lumpur Showroom.*draft$/);
  });
});
