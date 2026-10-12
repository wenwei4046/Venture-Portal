import { describe, expect, it } from "vitest";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import type { ArenaBrandWeek } from "@/lib/member/arena-history";
import { brandMonthVM } from "./brand-weeks-model";

const week = (over: Partial<ArenaBrandWeek>): ArenaBrandWeek => ({
  staffId: "me", week: "2026-10-02", source: "erp", brand: "AKEMI", fairId: "f1", venue: "MID VALLEY", organizer: "BIGHOME",
  start: "2026-10-02", end: "2026-10-04", booths: 1, ...over,
});

/**
 * October 2026 as the member reads it on the 12th (2026-10-12): two weekends
 * from the ERP's Sales Attending (one with two booths), one auto-located by the
 * bills, one still to come and not listed yet, and the last one listed ahead.
 */
const oct = {
  period: "2026-10", selfId: "me",
  history: { events: [], weeks: [
    week({}),
    week({ week: "2026-10-09", brand: "ZANOTTI", venue: "IOIGECC", organizer: "HOMELOVE", start: "2026-10-09", end: "2026-10-11", booths: 2 }),
    week({ week: "2026-10-30", brand: "AKEMI", venue: "PENANG WATERFRONT CONVENTION CENTRE", organizer: "BIGHOME", start: "2026-10-30", end: "2026-11-01", fairId: null }),
    // Somebody else's — never shown as the member's.
    week({ staffId: "other", week: "2026-10-16", brand: "DUNLOP" }),
  ] },
} as unknown as MemberArenaSnapshot;

const sep = {
  period: "2026-09", selfId: "me",
  history: { events: [], weeks: [
    week({ week: "2026-09-04", source: "auto", brand: "AKEMI", venue: "SUNWAY PYRAMID CONVENTION CENTRE", organizer: "BIGHOME", start: "2026-09-04", end: "2026-09-06", booths: null }),
  ] },
} as unknown as MemberArenaSnapshot;

describe("brandMonthVM — where the ERP puts the member each fair weekend", () => {
  it("shows the ERP's booth, the auto-located one, and the weekends with none", () => {
    const vm = brandMonthVM(oct, "2026-10-12", "me");
    expect(vm).toMatchObject({ period: "2026-10", label: "October 2026", listed: 3 });
    expect(vm.weeks.map(w => [w.title, w.when, w.source, w.brandName, w.where, w.note])).toEqual([
      ["Week 1", "2–4 Oct", "erp", "Akemi", "MID VALLEY · BIGHOME", "From the ERP's Sales Attending"],
      ["Week 2", "9–11 Oct", "erp", "Zanotti", "IOIGECC · HOMELOVE",
        "From the ERP's Sales Attending · listed at 2 booths — the one with the most of your bills counts"],
      ["Week 3", "16–18 Oct", "none", null, null, "Not on the ERP's Sales Attending yet"],
      ["Week 4", "23–25 Oct", "none", null, null, "Not on the ERP's Sales Attending yet"],
      ["Week 5", "30 Oct – 1 Nov", "erp", "Akemi", "PENANG WATERFRONT CONVENTION CENTRE · BIGHOME", "From the ERP's Sales Attending"],
    ]);
  });

  it("says auto-located for a weekend the ERP lists them nowhere, and no fair for one gone by with none", () => {
    const vm = brandMonthVM(sep, "2026-10-12", "me");
    expect(vm.listed).toBe(0);
    expect(vm.weeks.map(w => [w.source, w.brand, w.note])).toEqual([
      ["auto", "AKEMI", "Auto-located · the ERP lists you at no booth, so the booth with the most of your bills counts"],
      ["none", null, "No fair this weekend"],
      ["none", null, "No fair this weekend"],
      ["none", null, "No fair this weekend"],
    ]);
  });

  it("says them / their when the Principal views a member", () => {
    expect(brandMonthVM(sep, "2026-10-12", "me", true).weeks[0].note)
      .toBe("Auto-located · the ERP lists them at no booth, so the booth with the most of their bills counts");
    expect(brandMonthVM(oct, "2026-10-12", "me", true).weeks[1].note)
      .toBe("From the ERP's Sales Attending · listed at 2 booths — the one with the most of their bills counts");
  });

  it("is only the person read's, and reads a snapshot without brand weeks as none", () => {
    expect(brandMonthVM(oct, "2026-10-12", "other").weeks.map(w => w.brand)).toEqual([null, null, "DUNLOP", null, null]);
    const bare = { period: "2026-10", selfId: "me" } as unknown as MemberArenaSnapshot;
    expect(brandMonthVM(bare, "2026-10-12", "me").weeks.every(w => w.source === "none")).toBe(true);
  });
});
