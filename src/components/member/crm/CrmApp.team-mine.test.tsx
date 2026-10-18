import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "./CrmApp";
import { MINE_ICON, TEAM_ICON } from "./shared/team-mine";

// Since 2026-10-16 (the owner, circling them on Team's Insight: "換到 Inbox 那頁") they sit on each side's INBOX — Team's moved
// from Insight — and Team | Mine goes Inbox ⇄ Inbox. Before that:
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
async function tap(el: Element | null) {
  expect(el).not.toBeNull();
  fireEvent.click(el!);
  await act(async () => {});
}
/** A page of the bottom bar, by its label. */
const go = (label: string) => tap(screen.getAllByText(label, { exact: true }).find(e => e.closest("nav")) ?? null);
/** Team's Insight, the page Team opens on, has the house alone (2026-10-16, the owner: the way back to the Revenue app there). */
const onlyHouse = () => expect([!!swapToMine(), !!swapToTeam(), !!house(), !!bell()]).toEqual([false, false, true, false]);
/** None of the three round buttons on the page. */
const noButtons = () => expect([swapToMine(), swapToTeam(), house(), bell()]).toEqual([null, null, null, null]);

describe("the CRM's three round buttons, on the first page alone", () => {
  it("the Principal: Team's Inbox has two people, the bell, then Contacts — no house; a tap is Mine's Inbox, and back", async () => {
    await open("boss");
    // 4a (T01): the greeting goes by the time of day.
    expect(screen.getByRole("heading", { name: /^Good (morning|afternoon|evening), Principal$/ })).toBeInTheDocument();
    onlyHouse();
    await go("Inbox");
    const toMine = swapToMine()!;
    // 4a (M01 / T02): the side one is on, as a pill with its name.
    expect(toMine.textContent?.trim()).toBe("Team");
    // 2026-10-16 (the owner: "人像，鈴鐺，contacts（小房子不需要）"): no house on Team's Inbox; the bell beside Team | Mine.
    expect(house()).toBeNull();
    expect(bell()!.previousElementSibling).toBe(toMine);
    // The old text segment is gone.
    expect(screen.queryByText("Mine", { exact: true })).toBeNull();

    await tap(toMine);
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    const toTeam = swapToTeam()!;
    expect(toTeam.textContent?.trim()).toBe("Mine");
    expect(house()!.previousElementSibling).toBe(toTeam);

    await tap(toTeam);
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(swapToMine()).not.toBeNull();
  });

  it("Team's other pages have none of them, and no line under their title", async () => {
    await open("boss");
    onlyHouse();
    await go("Inbox");
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
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

  it("a team leader: Mine's Inbox ⇄ Team's Inbox", async () => {
    await open("lkv");
    await tap(swapToTeam());
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByLabelText("Contacts")).toBeInTheDocument(); // 4a (T02): a round button
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
