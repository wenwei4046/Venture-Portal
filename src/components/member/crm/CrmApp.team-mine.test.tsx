import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "./CrmApp";
import { MINE_ICON, TEAM_ICON } from "./shared/team-mine";

// Team | Mine, the house and the bell — the three round buttons — sit on each side's FIRST page alone (2026-10-14, the
// owner: "这三个 icon 本身只需要出现在第一个界面 … member view 只需要存在于 Inbox … principal view … 只存在于 Insight 界面"),
// as the Revenue app keeps its header to Today. Team | Mine is one round button (the design "1a Single swap circle"): its
// icon is the side one is on, and one tap goes to the other side's first page — Mine's Inbox ⇄ Team's Insight. No line
// under a Team page's title. On the demo's data, as /member/preview draws the CRM.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

/** The CRM as `viewer` sees it (the demo's people: boss = the Principal, lkv = a team leader, a1 = a salesperson). */
async function open(viewer: string) {
  window.history.replaceState({}, "", `/member/preview?crmAs=${viewer}`);
  render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
  await act(async () => {});
}
const swapToMine = () => screen.queryByLabelText("Team · switch to Mine");
const swapToTeam = () => screen.queryByLabelText("Mine · switch to Team");
const house = () => screen.queryByLabelText("Back to Revenue app");
const bell = () => screen.queryByTitle("Notifications");
const iconOf = (el: Element) => el.querySelector("path")?.getAttribute("d");
async function tap(el: Element | null) {
  expect(el).not.toBeNull();
  fireEvent.click(el!);
  await act(async () => {});
}
/** A page of the bottom bar, by its label. */
const go = (label: string) => tap(screen.getAllByText(label, { exact: true }).find(e => e.closest("nav")) ?? null);
/** None of the three round buttons on the page. */
const noButtons = () => expect([swapToMine(), swapToTeam(), house(), bell()]).toEqual([null, null, null, null]);

describe("the CRM's three round buttons, on the first page alone", () => {
  it("the Principal: Team's Insight has them — two people, the house, the bell; a tap is Mine's Inbox, and back", async () => {
    await open("boss");
    expect(screen.getByRole("heading", { name: "Hello, Principal" })).toBeInTheDocument();
    const toMine = swapToMine()!;
    expect(iconOf(toMine)).toBe(TEAM_ICON);
    expect(house()!.previousElementSibling).toBe(toMine);
    expect(bell()).not.toBeNull();
    // The old text segment is gone.
    expect(screen.queryByText("Mine", { exact: true })).toBeNull();

    await tap(toMine);
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    const toTeam = swapToTeam()!;
    expect(iconOf(toTeam)).toBe(MINE_ICON);
    expect(house()!.previousElementSibling).toBe(toTeam);

    await tap(toTeam);
    expect(screen.getByRole("heading", { name: "Hello, Principal" })).toBeInTheDocument();
  });

  it("Team's other pages have none of them, and no line under their title", async () => {
    await open("boss");
    await go("Inbox");
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    noButtons();
    expect(screen.queryByText(/need attention/)).toBeNull();
    await go("Assignment");
    expect(screen.getByRole("heading", { name: "Assignment" })).toBeInTheDocument();
    noButtons();
    expect(screen.queryByText("Who gets each new enquiry")).toBeNull();
    await go("Calendar");
    expect(screen.getByRole("heading", { name: "Calendar" })).toBeInTheDocument();
    noButtons();
    expect(screen.queryByText(/visits · \d+ upcoming/)).toBeNull();
    await go("Profile");
    noButtons();
  });

  it("Mine's other pages have none of them either — Contacts, Calendar, Insight, Profile and its Notifications", async () => {
    await open("lkv");
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(swapToTeam()).not.toBeNull();
    for (const page of ["Contacts", "Calendar", "Insight", "Profile"]) {
      await go(page);
      noButtons();
    }
    await tap(screen.getByText("Notifications", { exact: true }));
    expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    noButtons();
  });

  it("a team leader: Mine's Inbox ⇄ Team's Insight", async () => {
    await open("lkv");
    await tap(swapToTeam());
    expect(screen.getByRole("heading", { name: "Hello, Kelvin" })).toBeInTheDocument();
    await tap(swapToMine());
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
  });

  it("whoever has nobody below them: the house and the bell on the Inbox, no Team | Mine", async () => {
    await open("a1");
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(swapToTeam()).toBeNull();
    expect(house()).not.toBeNull();
    expect(bell()).not.toBeNull();
    await go("Calendar");
    noButtons();
  });
});
