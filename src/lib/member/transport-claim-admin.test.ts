import { describe, expect, it } from "vitest";
import {
  readTransportClaimAdmin,
  toggleTransportTitle,
  transportChanged,
  transportTally,
  transportTicks,
  transportToSave,
  validTransportTitles,
  type TransportClaimAdmin,
} from "./transport-claim-admin";

// Member services › Transport claim's ⋯ (2026-10-20 — the user: "选择什么 title 的人可以 claim 这个 transport。它跟
// food claim 一样"): the titles ticked, read and saved as `member_admin_transport_claim` / `_save_` hand them.

const T = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin: TransportClaimAdmin = {
  titleIds: [T(3), T(1)],
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
      titleIds: [T(1), 7], updatedAt: "2026-10-20T10:00:00Z", updatedBy: "HR Manager",
      titles: [{ id: T(1), name: "Team Leader", level: "Senior Manager", people: "5", active: true }, { id: 3 }, { id: T(2), name: "Old", people: -2, active: false }],
    })).toEqual({
      titleIds: [T(1)], updatedAt: "2026-10-20T10:00:00Z", updatedBy: "HR Manager",
      titles: [
        { id: T(1), name: "Team Leader", level: "Senior Manager", people: 5, active: true },
        { id: T(2), name: "Old", level: null, people: 0, active: false },
      ],
    });
    expect(readTransportClaimAdmin(null)).toBeNull();
    expect(readTransportClaimAdmin({ titleIds: [] })).toBeNull();
  });

  it("opens on the ticks in the list's order, and toggles keeping it", () => {
    expect(transportTicks(admin)).toEqual([T(1), T(3)]);
    expect(toggleTransportTitle(admin, [T(1), T(3)], T(2))).toEqual([T(1), T(2), T(3)]);
    expect(toggleTransportTitle(admin, [T(1), T(3)], T(1))).toEqual([T(3)]);
  });

  it("knows a change, and saves each title once", () => {
    expect(transportChanged(admin, [T(3), T(1)])).toBe(false);
    expect(transportChanged(admin, [T(1)])).toBe(true);
    expect(transportToSave([T(3), T(1), T(3)])).toEqual([T(1), T(3)]);
  });

  it("counts them for the ⋯ and the window", () => {
    expect(transportTally(admin)).toBe("2 of 3 titles");
    expect(transportTally(admin, [])).toBe("0 of 3 titles");
    expect(transportTally({ ...admin, titles: admin.titles.slice(0, 1) }, [T(1)])).toBe("1 of 1 title");
  });

  it("lets through only a list of title ids, sixty at most", () => {
    expect(validTransportTitles([T(1), T(2)])).toBe(true);
    expect(validTransportTitles([])).toBe(true);
    expect(validTransportTitles(["not-an-id"])).toBe(false);
    expect(validTransportTitles("x")).toBe(false);
    expect(validTransportTitles(Array.from({ length: 61 }, (_, i) => T(i)))).toBe(false);
  });
});
