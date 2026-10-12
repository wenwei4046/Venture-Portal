import { describe, expect, it } from "vitest";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import type { ArenaBrandWeek } from "@/lib/member/arena-history";
import { brandWeeksVM } from "./brand-weeks-model";

const week = (over: Partial<ArenaBrandWeek>): ArenaBrandWeek => ({
  staffId: "me", week: "2026-10-02", source: "erp", brand: "AKEMI", fairId: "f1", venue: "MID VALLEY", organizer: "BIGHOME",
  start: "2026-10-02", end: "2026-10-04", booths: 1, ...over,
});

/**
 * What the read carries on Monday 12 Oct 2026: this month and the two before.
 * October: two weekends from the ERP's Sales Attending (one with two booths)
 * and the last one already listed ahead; September: one auto-located by the
 * bills; somebody else's week too — never shown as the member's.
 */
const snap = {
  period: "2026-10", selfId: "me",
  history: { events: [], weeks: [
    week({ week: "2026-09-04", source: "auto", brand: "AKEMI", venue: "SUNWAY PYRAMID CONVENTION CENTRE", organizer: "BIGHOME", start: "2026-09-04", end: "2026-09-06", booths: null }),
    week({}),
    week({ week: "2026-10-09", brand: "ZANOTTI", venue: "IOIGECC", organizer: "HOMELOVE", start: "2026-10-09", end: "2026-10-11", booths: 2 }),
    week({ staffId: "other", week: "2026-10-16", brand: "DUNLOP", venue: "MID VALLEY", organizer: "HOMELOVE", start: "2026-10-15", end: "2026-10-18" }),
    week({ week: "2026-10-30", brand: "AKEMI", venue: "PENANG WATERFRONT CONVENTION CENTRE", organizer: "BIGHOME", start: "2026-10-30", end: "2026-11-01", fairId: null }),
  ] },
} as unknown as MemberArenaSnapshot;

const facts = (vm: ReturnType<typeof brandWeeksVM>[number]) =>
  vm.weeks.map(w => [w.n, w.when, w.brandName, w.venue, w.organizer, w.empty]);

describe("brandWeeksVM — where the member worked, month by month (2026-10-12)", () => {
  it("shows this month first and the two before, each weekend's brand, venue and organizer", () => {
    const vm = brandWeeksVM(snap, "2026-10-12", "me");
    expect(vm.map(m => [m.period, m.label, m.summary])).toEqual([
      ["2026-10", "October 2026", "2 fairs"],
      ["2026-09", "September 2026", "1 fair"],
      ["2026-08", "August 2026", "No fair"],
    ]);
    expect(facts(vm[0])).toEqual([
      ["W1", "2–4 Oct", "Akemi", "MID VALLEY", "BIGHOME", null],
      ["W2", "9–11 Oct", "Zanotti", "IOIGECC", "HOMELOVE", null],
      ["W3", "16–18 Oct", null, null, null, "Not assigned yet"],
    ]);
    expect(vm[0].weeks.map(w => w.current)).toEqual([false, false, true]);
    // Auto-located reads the same three facts as the ERP's booth.
    expect(facts(vm[1])).toEqual([
      ["W1", "4–6 Sep", "Akemi", "SUNWAY PYRAMID CONVENTION CENTRE", "BIGHOME", null],
      ["W2", "11–13 Sep", null, null, null, "No fair"],
      ["W3", "18–20 Sep", null, null, null, "No fair"],
      ["W4", "25–27 Sep", null, null, null, "No fair"],
    ]);
    expect(vm[1].weeks[0].source).toBe("auto");
    expect(vm[2].weeks.map(w => w.empty)).toEqual(["No fair", "No fair", "No fair", "No fair"]);
  });

  it("never shows a weekend after this week's, even one the ERP already lists (user: not future)", () => {
    const monday = brandWeeksVM(snap, "2026-10-12", "me")[0];
    expect(monday.weeks.map(w => w.key)).toEqual(["2026-10-02", "2026-10-09", "2026-10-16"]);
    // Sunday is still that week; the Monday after moves it on by one.
    expect(brandWeeksVM(snap, "2026-10-18", "me")[0].weeks).toHaveLength(3);
    expect(brandWeeksVM(snap, "2026-10-19", "me")[0].weeks.map(w => w.empty)).toEqual([null, null, "No fair", "Not assigned yet"]);
    // The week it falls in, the ERP's booth shows.
    const last = brandWeeksVM(snap, "2026-10-26", "me")[0].weeks.at(-1)!;
    expect([last.n, last.when, last.brandName, last.venue, last.current]).toEqual(["W5", "30 Oct – 1 Nov", "Akemi", "PENANG WATERFRONT CONVENTION CENTRE", true]);
  });

  it("leaves out a month with no weekend yet — a Sunday the 1st is still the month before's", () => {
    const vm = brandWeeksVM(snap, "2026-11-01", "me");
    expect(vm.map(m => m.period)).toEqual(["2026-10", "2026-09"]);
    expect(vm[0].weeks.at(-1)).toMatchObject({ key: "2026-10-30", current: true, brandName: "Akemi" });
  });

  it("gives each weekend its brand's colours, and the quiet pair to none", () => {
    const [oct] = brandWeeksVM(snap, "2026-10-12", "me");
    expect(oct.weeks.map(w => [w.color, w.tint])).toEqual([
      ["var(--rv-accent)", "var(--rv-peach-bg)"],
      ["var(--rv-amber)", "var(--rv-gold-tint)"],
      ["var(--rv-sub)", "var(--rv-sand)"],
    ]);
  });

  it("is only the person read's, and reads a snapshot without brand weeks as none", () => {
    const other = brandWeeksVM(snap, "2026-10-12", "other")[0];
    expect(other.weeks.map(w => w.brandName)).toEqual([null, null, "Dunlopillo"]);
    expect(other.weeks[2]).toMatchObject({ when: "15–18 Oct", venue: "MID VALLEY", organizer: "HOMELOVE", empty: null });
    const bare = { period: "2026-10", selfId: "me" } as unknown as MemberArenaSnapshot;
    const vm = brandWeeksVM(bare, "2026-10-12", "me");
    expect(vm.flatMap(m => m.weeks).every(w => w.source === "none")).toBe(true);
    expect(vm.map(m => m.summary)).toEqual(["No fair", "No fair", "No fair"]);
  });
});
