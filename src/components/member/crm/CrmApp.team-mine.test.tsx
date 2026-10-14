import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "./CrmApp";
import { MINE_ICON, TEAM_ICON } from "./shared/team-mine";

// Team | Mine is one round button left of the house (2026-10-14, the owner, with the design "Team · Mine toggle — 1a
// Single swap circle"): its icon is the side one is on, one tap goes to the other side on the same page, and the text
// segment that had a row of its own at the top is gone. On the demo's data, as /member/preview draws the CRM.
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
const house = () => screen.getByLabelText("Back to Revenue app");
const iconOf = (el: Element) => el.querySelector("path")?.getAttribute("d");
async function tap(el: Element | null) {
  expect(el).not.toBeNull();
  fireEvent.click(el!);
  await act(async () => {});
}
/** The old segment: a "Team" and a "Mine" written out side by side. */
const segment = () => screen.queryByText("Mine", { exact: true });

describe("Team | Mine, one round button beside the house", () => {
  it("the Principal: Team's Overview shows the two people, left of the house; a tap is Mine's Insight, and back", async () => {
    await open("boss");
    expect(screen.getByRole("heading", { name: "Hello, Principal" })).toBeInTheDocument();
    const toMine = swapToMine()!;
    expect(iconOf(toMine)).toBe(TEAM_ICON);
    // swap · house · bell, in that order, in the title row — no row of its own above it.
    expect(house().previousElementSibling).toBe(toMine);
    expect(segment()).toBeNull();

    await tap(toMine);
    expect(screen.getByRole("heading", { name: "Insight" })).toBeInTheDocument();
    expect(swapToMine()).toBeNull();
    const toTeam = swapToTeam()!;
    expect(iconOf(toTeam)).toBe(MINE_ICON);
    expect(segment()).toBeNull();

    await tap(toTeam);
    expect(screen.getByRole("heading", { name: "Hello, Principal" })).toBeInTheDocument();
  });

  it("a team leader opens on Mine's Inbox; the button goes to Team's Inbox and back — the same page", async () => {
    await open("lkv");
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    const toTeam = swapToTeam()!;
    expect(house().parentElement?.firstElementChild).toBe(toTeam);
    await tap(toTeam);
    // Team's Inbox (the board with its Contacts button), still the Inbox.
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByText("Contacts")).toBeInTheDocument();
    expect(swapToMine()).not.toBeNull();
    await tap(swapToMine());
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(swapToTeam()).not.toBeNull();
  });

  it("whoever has nobody below them gets no button — the house and the bell as before", async () => {
    await open("a1");
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(swapToTeam()).toBeNull();
    expect(swapToMine()).toBeNull();
    expect(house()).toBeInTheDocument();
    expect(segment()).toBeNull();
  });
});
