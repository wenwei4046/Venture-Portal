import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";
// Renders the whole CrmApp: slow under the full suite's parallel load (passes alone in ~1 s).
vi.setConfig({ testTimeout: 20_000 });

// v4 (docs/design_handoff_crm_redesign_v4, notes/17 — frame 2d with frame 2c's filters): the Team inbox's Status is one
// button with the 2c·2 sheet — several statuses at once, each a removable tag; "N chats of M"; a card shows its status
// only while more than one status is in view. (It was one dropdown, one status at a time — 2026-11-08 / 11-09.)
vi.mock("@/app/(member)/member/crm-actions", () => ({ fetchAdInsights: vi.fn(), fetchAdDaily: vi.fn() }));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
async function tap(el: Element | null | undefined) { fireEvent.click(el!); await act(async () => {}); }
async function teamInbox() {
  window.history.replaceState({}, "", "/member/preview?crmAs=boss");
  render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
  await act(async () => {});
  await tap(screen.getAllByText("Inbox", { exact: true }).find(e => e.closest("nav")));
}
const countLine = () => screen.getByText(/^\d+ chats?$/);
const sheet = () => screen.queryByRole("dialog", { name: "Filter chats" });
const opt = (label: string) => within(sheet()!).getAllByRole("button").find(b => b.textContent?.replace(/\d+$/, "") === label)!;

describe("the Team inbox's Status (2c / 2c·2)", () => {
  it("opens on every status; the sheet picks several, Show N chats applies them as tags", async () => {
    await teamInbox();
    const total = Number(countLine().textContent!.replace(/\D/g, ""));
    expect(screen.getByText(`of ${total}`)).toBeTruthy();
    await tap(screen.getByRole("button", { name: "Status" }));
    expect(sheet()).not.toBeNull();
    const statuses = within(sheet()!).getAllByRole("button", { pressed: false }).map(b => b.textContent?.replace(/\d+$/, ""));
    for (const s of ["New", "Attention", "Follow up", "Appointment", "Won", "Lost", "Cold leads", "Blocked"]) expect(statuses).toContain(s);
    const n = (label: string) => Number(opt(label).textContent!.match(/(\d+)$/)![1]);
    const want = n("Follow up") + n("Won");
    await tap(opt("Follow up"));
    await tap(opt("Won"));
    expect(opt("Follow up")).toHaveAttribute("aria-pressed", "true");
    const apply = within(sheet()!).getByRole("button", { name: new RegExp(`^Show ${want} chats?$`) });
    await tap(apply);
    expect(sheet()).toBeNull();
    expect(screen.getByRole("button", { name: "Status · 2 picked" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Follow up" })).toBeTruthy();
    expect(countLine().textContent).toBe(`${want} chat${want === 1 ? "" : "s"}`);
    // Two statuses in view: each card says its own. One left: the cards say nothing (only the tag reads "Follow up").
    const fup = (n0: number) => screen.getAllByText("Follow up", { exact: true }).length - n0;
    expect(fup(1)).toBeGreaterThan(0);
    await tap(screen.getByRole("button", { name: "Remove Won" }));
    expect(screen.getByRole("button", { name: "Status · 1 picked" })).toBeTruthy();
    expect(fup(1)).toBe(0);
    await tap(screen.getByText("Clear all", { exact: true }));
    expect(screen.getByRole("button", { name: "Status" })).toBeTruthy();
    expect(countLine().textContent).toBe(`${total} chats`);
  });

  it("Cancel leaves the filters as they were", async () => {
    await teamInbox();
    const before = countLine().textContent;
    await tap(screen.getByRole("button", { name: "Status" }));
    await tap(opt("Won"));
    await tap(within(sheet()!).getByRole("button", { name: "Cancel" }));
    expect(sheet()).toBeNull();
    expect(countLine().textContent).toBe(before);
    expect(screen.getByRole("button", { name: "Status" })).toBeTruthy();
  });

  it("search opens in place of the buttons; Cancel clears it and closes", async () => {
    await teamInbox();
    const before = countLine().textContent;
    await tap(screen.getByRole("button", { name: "Search" }));
    expect(screen.queryByRole("button", { name: "Status" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Search chats"), { target: { value: "zzzz-nobody" } });
    await act(async () => {});
    expect(countLine().textContent).toBe("0 chats");
    await tap(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Search chats")).toBeNull();
    expect(countLine().textContent).toBe(before);
  });
});
