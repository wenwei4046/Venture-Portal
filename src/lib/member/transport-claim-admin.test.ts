import { describe, expect, it } from "vitest";
import {
  readTransportClaimAdmin,
  toggleTransportTitle,
  transportChanged,
  transportChanges,
  transportTally,
  transportTicks,
  validTransportChanges,
  type TransportClaimAdmin,
} from "./transport-claim-admin";

// Member services › Transport claim's ⋯ (2026-10-20 — the user: "选择什么 title 的人可以 claim 这个 transport。它跟
// food claim 一样"): the titles ticked, read and saved as `member_admin_transport_claim` / `_save_` hand them. Two ticks
// a title since 2026-10-31 (the user: "我要加多一个 Air ticket claim 的 column"): the transport claim's and the air
// ticket's, and a save sends only the boxes changed.

const T = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin: TransportClaimAdmin = {
  titleIds: [T(3), T(1)],
  airTicketTitleIds: [T(3)],
  titles: [
    { id: T(1), name: "Team Leader", level: "Senior Manager", people: 5, active: true },
    { id: T(2), name: "Team Assistant", level: "Assistant Manager", people: 9, active: true },
    { id: T(3), name: "Revenue Specialist", level: "Executive", people: 22, active: true },
  ],
  updatedAt: null,
  updatedBy: null,
};

describe("the transport claim's titles", () => {
  it("reads the database's answer, defensively", () => {
    expect(readTransportClaimAdmin({
      titleIds: [T(1), 7], airTicketTitleIds: [T(2), null], updatedAt: "2026-10-20T10:00:00Z", updatedBy: "HR Manager",
      titles: [{ id: T(1), name: "Team Leader", level: "Senior Manager", people: "5", active: true }, { id: 3 }, { id: T(2), name: "Old", people: -2, active: false }],
    })).toEqual({
      titleIds: [T(1)], airTicketTitleIds: [T(2)], updatedAt: "2026-10-20T10:00:00Z", updatedBy: "HR Manager",
      titles: [
        { id: T(1), name: "Team Leader", level: "Senior Manager", people: 5, active: true },
        { id: T(2), name: "Old", level: null, people: 0, active: false },
      ],
    });
    expect(readTransportClaimAdmin(null)).toBeNull();
    expect(readTransportClaimAdmin({ titleIds: [] })).toBeNull();
  });

  it("reads an answer from before the air ticket's own tick as the transport titles claiming it too", () => {
    expect(readTransportClaimAdmin({ titleIds: [T(1)], titles: [] })?.airTicketTitleIds).toEqual([T(1)]);
    expect(readTransportClaimAdmin({ titleIds: [T(1)], airTicketTitleIds: [], titles: [] })?.airTicketTitleIds).toEqual([]);
  });

  it("opens on each column's ticks in the list's order, and toggles one column keeping it", () => {
    const ticks = transportTicks(admin);
    expect(ticks).toEqual({ transport: [T(1), T(3)], airTicket: [T(3)] });
    expect(toggleTransportTitle(admin, ticks, "transport", T(2))).toEqual({ transport: [T(1), T(2), T(3)], airTicket: [T(3)] });
    expect(toggleTransportTitle(admin, ticks, "transport", T(1))).toEqual({ transport: [T(3)], airTicket: [T(3)] });
    expect(toggleTransportTitle(admin, ticks, "airTicket", T(1))).toEqual({ transport: [T(1), T(3)], airTicket: [T(1), T(3)] });
  });

  it("sends only the boxes changed, a title at a time", () => {
    const ticks = transportTicks(admin);
    expect(transportChanges(admin, ticks)).toEqual([]);
    expect(transportChanged(admin, ticks)).toBe(false);
    // The user's case: the Team Leader may claim the air ticket and not the rest; the Team Assistant the air ticket.
    let next = toggleTransportTitle(admin, ticks, "transport", T(1));
    next = toggleTransportTitle(admin, next, "airTicket", T(1));
    next = toggleTransportTitle(admin, next, "airTicket", T(2));
    expect(transportChanges(admin, next)).toEqual([
      { titleId: T(1), transport: false, airTicket: true },
      { titleId: T(2), airTicket: true },
    ]);
    expect(transportChanged(admin, next)).toBe(true);
    // Ticked and unticked again is no change.
    expect(transportChanged(admin, toggleTransportTitle(admin, toggleTransportTitle(admin, ticks, "airTicket", T(2)), "airTicket", T(2)))).toBe(false);
  });

  it("counts them for the ⋯, the window and the toast", () => {
    expect(transportTally(admin)).toBe("3 titles · 2 transport · 1 air ticket");
    expect(transportTally(admin, { transport: [], airTicket: [T(1), T(2)] })).toBe("3 titles · 0 transport · 2 air ticket");
    expect(transportTally({ ...admin, titles: admin.titles.slice(0, 1) }, { transport: [T(1)], airTicket: [] })).toBe("1 title · 1 transport · 0 air ticket");
  });

  it("lets through only a title's ticks on or off, each title once", () => {
    expect(validTransportChanges([{ titleId: T(1), transport: false, airTicket: true }, { titleId: T(2), airTicket: true }])).toBe(true);
    expect(validTransportChanges([])).toBe(true);
    expect(validTransportChanges([{ titleId: T(1) }])).toBe(false);
    expect(validTransportChanges([{ titleId: "not-an-id", airTicket: true }])).toBe(false);
    expect(validTransportChanges([{ titleId: T(1), airTicket: "yes" }])).toBe(false);
    expect(validTransportChanges([{ titleId: T(1), food: true }])).toBe(false);
    expect(validTransportChanges([{ titleId: T(1), airTicket: true }, { titleId: T(1), transport: true }])).toBe(false);
    expect(validTransportChanges("x")).toBe(false);
    expect(validTransportChanges(Array.from({ length: 121 }, (_, i) => ({ titleId: T(i), airTicket: true })))).toBe(false);
  });
});
