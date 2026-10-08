import { describe, expect, it } from "vitest";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import { brandMonthVM, picksToSave } from "./brand-weeks-model";

const sep = {
  period: "2026-09", selfId: "me",
  brandWeeks: { weeks: 4, counts: { AKEMI: 1, ERGOTEX: 0, ZANOTTI: 0, DUNLOP: 0 }, picks: { "2026-09-04": "AKEMI" } },
  weekLocks: [
    { week: "2026-09-04", closesOn: "2026-09-13", locked: true },
    { week: "2026-09-11", closesOn: "2026-09-20", locked: true },
    { week: "2026-09-18", closesOn: "2026-09-27", locked: false },
  ],
  history: { events: [
    { id: "f1|AKEMI", venue: "IOI CITY MALL", organizer: "MEGA HOME FAIR", start: "2026-09-04", end: "2026-09-06", periodMonth: "2026-09", week: "2026-09-04", brand: "AKEMI",
      people: [{ id: "me", name: "ME", sales: 100, held: 0, orders: 1, scoring: true }] },
    { id: "f2|ZANOTTI", venue: "MVEC", organizer: null, start: "2026-09-11", end: "2026-09-13", periodMonth: "2026-09", week: "2026-09-11", brand: "ZANOTTI",
      people: [{ id: "me", name: "ME", sales: 80, held: 0, orders: 2, scoring: true }] },
  ] },
} as unknown as MemberArenaSnapshot;

describe("brandMonthVM — a month's fair weekends", () => {
  it("names each weekend, its booth and whether it is still open", () => {
    const vm = brandMonthVM(sep, undefined, false);
    expect(vm).toMatchObject({ period: "2026-09", label: "September 2026", picked: 1, dirty: false });
    expect(vm.weeks.map(w => [w.title, w.when, w.pick, w.locked, w.note])).toEqual([
      ["Week 1", "4–6 Sep", "AKEMI", true, "Closed 13 Sep · IOI CITY MALL · MEGA HOME FAIR"],
      ["Week 2", "11–13 Sep", null, true, "Closed 20 Sep · auto-located: Zanotti · MVEC"],
      ["Week 3", "18–20 Sep", null, false, "Open until 27 Sep"],
      ["Week 4", "25–27 Sep", null, false, "Open"],
    ]);
  });

  it("lets the back office change a closed week", () => {
    expect(brandMonthVM(sep, undefined, true).weeks.map(w => w.locked)).toEqual([false, false, false, false]);
  });

  it("lays the edits over what is saved, and knows when nothing changed", () => {
    const edits = { "2026-09-18": "DUNLOP" as const, "2026-09-04": undefined };
    const vm = brandMonthVM(sep, edits, true);
    expect(vm.weeks.map(w => w.pick)).toEqual([null, null, "DUNLOP", null]);
    expect(vm.dirty).toBe(true);
    expect(picksToSave(sep, edits)).toEqual({ "2026-09-18": "DUNLOP" });
    expect(brandMonthVM(sep, { "2026-09-04": "AKEMI" }, false).dirty).toBe(false);
  });
});
