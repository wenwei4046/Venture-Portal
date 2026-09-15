import { describe, expect, it } from "vitest";
import { arenaExample, awardRanking, ARENA_COHORT, BRANDS, EXCLUDED_DIRECTOR_IDS, fixedSlot, historicalRecords, KPI_INCENTIVE_POINTS, MARGIN_TIER_POINTS, MONTHLY_POINTS_MAX, monthlyKpiBonus, monthlyMarginBonus, periodInfo, pointsAt, POINT_SCALE, scheduledWeeks, SLOTS, type Candidate, type FairEvent } from "./arena-model";
import type { BrandWeeksByMonth, MonthlyBrandWeeks } from "./arena-brand-weeks";

describe("Arena additive proposal rules", () => {
  it("uses a shallow top-ten ladder and a gradual eleven-to-twenty tail", () => {
    expect(Array.from({ length: 10 }, (_, index) => pointsAt(index + 1))).toEqual([25, 22.5, 20.5, 18.75, 17.25, 16, 15, 14, 13.25, 12.5]);
    expect([pointsAt(11), pointsAt(20), pointsAt(21), pointsAt(0)]).toEqual([12, 7.5, 6.25, 0]);
  });
  it("keeps the earlier six scaled contributions unchanged when adding the record award", () => {
    const formerLadder = [100, 90, 82, 75, 69, 64, 60, 56, 53, 50, 48, 46, 44, 42, 40, 38, 36, 34, 32, 30, 25, 25, 25, 25, 25, 25];
    formerLadder.forEach((points, index) => expect(pointsAt(index + 1)).toBeCloseTo(points * POINT_SCALE));
    expect(MARGIN_TIER_POINTS).toEqual({ 1: 20 * POINT_SCALE, 2: 50 * POINT_SCALE });
    expect(KPI_INCENTIVE_POINTS).toBe(20 * POINT_SCALE);
    expect(MONTHLY_POINTS_MAX).toBe(205);
    const data = arenaExample("monthly", "9", "fair", "AKEMI");
    // Earlier proposal's frozen September awards: one complete six-slot fixture,
    // including both Margin incentives, KPI incentive and brand/venue averages.
    const formerSarah = {
      salesBrand: [95.5, 0], salesVenue: [90.5, 0], salesTotal: [82, 0],
      marginBrand: [78, 50], marginTotal: [100, 50], kpi: [100, 20],
    };
    const sarah = data.overall.find(person => person.id === "sarah")!;
    for (const slot of SLOTS) {
      if (slot === "fairRecord") continue;
      const [base, incentive] = formerSarah[slot];
      expect(sarah.components[slot].base).toBe(Math.round(base * POINT_SCALE * 100) / 100);
      expect(sarah.components[slot].incentive).toBe(Math.round(incentive * POINT_SCALE * 100) / 100);
    }
    // The monthly ledger adds the rounded contributions, including two .005 round-ups.
    expect(sarah.components.fairRecord).toEqual({ base: 22.5, incentive: 0, total: 22.5 });
    expect(sarah.value).toBe(189.01);
  });
  it("splits occupied point slots for ties without duplicating awards", () => {
    const rows = awardRanking([
      { id: "a", name: "A", value: 10, eligible: true },
      { id: "b", name: "B", value: 10, eligible: true },
      { id: "c", name: "C", value: 8, eligible: true },
    ]);
    expect(rows.map(row => [row.position, row.points])).toEqual([[1, 23.75], [1, 23.75], [3, 20.5]]);
  });
  it("keeps assigned zero activity ranked with zero points and excludes unassigned records", () => {
    const rows = awardRanking([
      { id: "a", name: "Active", value: 1, eligible: true },
      { id: "z", name: "Zero", value: 0, eligible: true },
      { id: "u", name: "Unassigned", value: 0, eligible: false },
      { id: "m", name: "Missing", value: Number.NaN, eligible: true },
    ]);
    expect(rows.find(row => row.id === "z")).toMatchObject({ position: 2, points: 0 });
    expect(rows.find(row => row.id === "u")).toMatchObject({ position: null, points: 0 });
    expect(rows.find(row => row.id === "m")).toMatchObject({ position: null, points: 0 });
  });
  it("replaces a share of brand points instead of adding a second full award", () => {
    const third = pointsAt(3);
    const eighth = pointsAt(8);
    expect(fixedSlot([{ weight: 9, base: third }, { weight: 3, base: eighth }]).base).toBe(18.88);
    expect(fixedSlot([{ weight: 12, base: third }]).base).toBe(20.5);
    expect(fixedSlot([{ weight: 9, base: third }, { weight: 3, base: third }]).base).toBe(20.5);
    expect(fixedSlot(BRANDS.map(() => ({ weight: 3, base: third }))).base).toBe(20.5);
    expect(fixedSlot([{ weight: 9, base: third }, { weight: 3, base: 0 }]).base).toBe(15.38);
  });
  it("keeps brand and venue slots capped rather than awarding extra slots per assignment", () => {
    expect(fixedSlot([{ weight: 9, base: 25, incentive: 12.5 }, { weight: 3, base: 20, incentive: 5 }])).toEqual({ base: 23.75, incentive: 10.63, total: 34.38 });
    expect(fixedSlot(Array.from({ length: 5 }, () => ({ weight: 1, base: 25 })))).toEqual({ base: 25, incentive: 0, total: 25 });
    expect(fixedSlot([{ weight: 0, base: 25 }]).total).toBe(0);
  });
  it("maps highest margin tiers to points, without copying incremental cash stacking", () => {
    const margin = (brandCode: string, marginPct: number | null) => ({ brandCode, revenue: 1000, cost: marginPct === null ? 0 : 1000 * (1 - marginPct), marginPct });
    expect(monthlyMarginBonus([margin("AKEMI", .36)])).toBe(5);
    expect(monthlyMarginBonus([margin("AKEMI", .35999)])).toBe(0);
    expect(monthlyMarginBonus([margin("AKEMI", .43)])).toBe(12.5);
    expect(monthlyMarginBonus([margin("AKEMI", .45), margin("ZANOTTI", .37)])).toBe(5);
    expect(monthlyMarginBonus([margin("AKEMI", .45), margin("ZANOTTI", .30)])).toBe(0);
    expect(() => monthlyMarginBonus([margin("AKEMI", null)])).toThrow("Pending margin incentive");
    expect(() => monthlyMarginBonus([margin("UNKNOWN", .5)])).toThrow("Pending margin incentive");
  });
  it("awards the KPI monthly threshold once at the configured boundary", () => {
    expect([9, 10, 100].map(monthlyKpiBonus)).toEqual([0, 5, 5]);
  });
  it("adds all seven slot contributions without an overall percentage weighting", () => {
    const data = arenaExample("monthly", "9", "fair", "AKEMI");
    expect(data.self.value).toBeCloseTo(SLOTS.reduce((sum, slot) => sum + data.self.components[slot].total, 0));
    expect(data.self.value).toBeGreaterThan(pointsAt(1));
    for (const person of data.overall) expect(person.value).toBeLessThanOrEqual(MONTHLY_POINTS_MAX);
    expect(data.overall.find(person => person.id === "nadia")).toMatchObject({ value: 0, points: 0 });
    expect(data.overall.find(person => person.id === "daniel")!.components.marginTotal.incentive).toBe(5);
    expect(data.overall.find(person => person.id === "sarah")!.components.marginTotal.incentive).toBe(12.5);
    expect(data.self.components.marginTotal.incentive).toBe(0);
    expect(data.self.components.marginBrand.incentive).toBeGreaterThan(0);
    expect(arenaExample("monthly", "9", "ir", "AKEMI").self.components.salesVenue.total).toBe(0);
    expect(arenaExample("monthly", "9", "ir", "AKEMI").self.components.fairRecord.total).toBe(0);
  });
  it("sums monthly ledgers for quarters and years without re-triggering period bonuses", () => {
    const quarter = arenaExample("quarterly", "3", "fair", "AKEMI");
    const months = [7, 8, 9].map(month => arenaExample("monthly", String(month), "fair", "AKEMI"));
    expect(quarter.self.value).toBeCloseTo(months.reduce((sum, month) => sum + month.self.value, 0));
    for (const slot of SLOTS) {
      expect(quarter.self.components[slot].incentive).toBeCloseTo(months.reduce((sum, month) => sum + month.self.components[slot].incentive, 0));
    }
    const year = arenaExample("annual", "2026", "fair", "AKEMI");
    expect(year.monthlyLedger).toHaveLength(9);
    expect(year.self.value).toBeCloseTo(year.monthlyLedger.reduce((sum, month) => sum + month.total, 0));
    expect(quarter.boards.salesTotal[0].scoringPosition).toBeNull();
  });
  it("does not let the viewed brand alter the consolidated score", () => {
    const scores = BRANDS.map(brand => arenaExample("monthly", "9", "fair", brand.code).self.value);
    expect(new Set(scores).size).toBe(1);
    const unassigned = arenaExample("monthly", "9", "fair", "DUNLOP").boards.salesBrand.find(row => row.id === "daniel")!;
    expect(unassigned.position).toBeNull();
    expect(unassigned.points).toBe(0);
  });
  it("keeps four brand totals equal to revenue and computes blended margin from profit", () => {
    for (const person of arenaExample("quarterly", "3", "fair", "AKEMI").facts) {
      expect(Object.values(person.brands).reduce((sum, brand) => sum + brand.sales, 0)).toBe(person.sales);
      if (person.sales > 0) expect(person.margin).toBeCloseTo(person.profit / person.sales * 100, 1);
    }
  });
  it("keeps historical record amounts from earlier months and years while awarding the monthly rank", () => {
    const january = arenaExample("monthly", "1", "fair", "AKEMI");
    const august = arenaExample("monthly", "8", "fair", "AKEMI");
    expect(january.records[0]).toMatchObject({ id: "daniel", value: 100000, points: 25 });
    expect(august.records[0]).toMatchObject({ id: "daniel", value: 100000, points: 25 });
    expect(august.records[0].note).toContain("2026-01");
    expect(august.records.find(row => row.id === "sarah")!.note).toContain("2025-12");
    expect(august.records.find(row => row.id === "sarah")).toMatchObject({ value: 80000, position: 2, points: 22.5 });
    expect(august.records).toHaveLength(ARENA_COHORT.eligibleStaff);
    expect(august.records.find(row => row.id === "nadia")).toMatchObject({ position: null, value: 0, points: 0 });
    expect(august.events.every(event => event.end.startsWith("2026-08"))).toBe(true);
    expect(periodInfo("monthly", "1").cutoff).toBe("2026-01-31");
  });
  it("awards points from the actual displayed ranking without target attainment", () => {
    for (const brand of BRANDS) {
      const data = arenaExample("monthly", "9", "fair", brand.code);
      for (const rows of Object.values(data.boards)) {
        const awards = awardRanking(rows);
        for (const row of rows) {
          const award = awards.find(candidate => candidate.id === row.id)!;
          expect(row.scoringPosition).toBe(row.position);
          expect(row.scoringValue).toBe(row.value);
          expect(row.basePoints).toBe(Math.round((award.basePoints + Number.EPSILON) * 100) / 100);
        }
      }
    }
  });
  it("shows the actual assigned-day contribution on each monthly brand board", () => {
    for (const brand of BRANDS) {
      const data = arenaExample("monthly", "9", "fair", brand.code);
      for (const metric of ["salesBrand", "marginBrand"] as const) {
        for (const row of data.boards[metric]) {
          const fact = data.facts.find(person => person.id === row.id)!;
          const share = fact.brands[brand.code].days / Object.values(fact.brands).reduce((sum, item) => sum + item.days, 0);
          expect(row.brandShare).toBe(share);
          expect(Math.abs(row.contributionBase! - row.basePoints * share)).toBeLessThan(.01 + Number.EPSILON);
          expect(Math.abs(row.contributionIncentive! - row.incentivePoints * share)).toBeLessThan(.01 + Number.EPSILON);
          expect(row.contributionPoints).toBeCloseTo(row.contributionBase! + row.contributionIncentive!, 2);
        }
      }
    }
  });
  it("reconciles four equal Tier 2 shares to one exact budget with stable posted cents", () => {
    const views = BRANDS.map(brand => arenaExample("monthly", "9", "fair", brand.code));
    const rows = views.map(view => view.boards.marginBrand.find(row => row.id === "sarah")!);
    expect(rows.map(row => row.brandShare)).toEqual([.25, .25, .25, .25]);
    expect(rows.map(row => row.incentivePoints)).toEqual([12.5, 12.5, 12.5, 12.5]);
    expect(rows.map(row => row.contributionIncentive)).toEqual([3.13, 3.13, 3.12, 3.12]);
    expect(rows.reduce((sum, row) => sum + row.contributionIncentive!, 0)).toBe(12.5);
    const first = views[0].overall.find(person => person.id === "sarah")!;
    for (const view of views) expect(view.overall.find(person => person.id === "sarah")!.components).toEqual(first.components);
    for (const metric of ["salesBrand", "marginBrand"] as const) {
      for (const person of views[0].overall) {
        const contributions = views.map(view => view.boards[metric].find(row => row.id === person.id)!);
        expect(contributions.reduce((sum, row) => sum + row.contributionPoints!, 0)).toBeCloseTo(person.components[metric].total, 2);
        expect(person.components[metric].base).toBeLessThanOrEqual(pointsAt(1));
        expect(person.components[metric].incentive).toBeLessThanOrEqual(MARGIN_TIER_POINTS[2]);
      }
    }
  });
  it("sums monthly brand contributions for quarters and reconciles all brands to the fixed slot", () => {
    const quarters = BRANDS.map(brand => arenaExample("quarterly", "3", "fair", brand.code));
    for (let index = 0; index < BRANDS.length; index++) {
      const quarter = quarters[index];
      const months = [7, 8, 9].map(month => arenaExample("monthly", String(month), "fair", BRANDS[index].code));
      for (const metric of ["salesBrand", "marginBrand"] as const) {
        for (const row of quarter.boards[metric]) {
          expect(row.brandShare).toBeNull();
          for (const field of ["contributionBase", "contributionIncentive", "contributionPoints"] as const) {
            expect(row[field]).toBeCloseTo(months.reduce((sum, month) => sum + month.boards[metric].find(person => person.id === row.id)![field]!, 0), 2);
          }
        }
      }
    }
    for (const person of quarters[0].overall) {
      for (const metric of ["salesBrand", "marginBrand"] as const) {
        expect(quarters.reduce((sum, quarter) => sum + quarter.boards[metric].find(row => row.id === person.id)!.contributionPoints!, 0)).toBeCloseTo(person.components[metric].total, 2);
      }
    }
  });
  it("excludes two Revenue Directors from the 28-person company cohort", () => {
    const data = arenaExample("monthly", "9", "fair", "AKEMI");
    expect(ARENA_COHORT).toEqual({ totalStaff: 28, excludedRevenueDirectors: 2, eligibleStaff: 26 });
    expect(data.overall).toHaveLength(26);
    expect(data.facts).toHaveLength(26);
    for (const id of EXCLUDED_DIRECTOR_IDS) {
      expect(data.overall.some(row => row.id === id)).toBe(false);
      expect(data.records.some(row => row.id === id)).toBe(false);
      expect(data.events.some(event => event.rows.some(row => row.id === id))).toBe(false);
    }
  });
  it("assigns each of 26 people to exactly one of five concurrent venues per week", () => {
    for (const month of ["8", "9"]) {
      const data = arenaExample("monthly", month, "fair", "AKEMI");
      const expectedWeeks = month === "8" ? 5 : 4;
      expect(data.info.weeks).toBe(expectedWeeks);
      expect(data.events).toHaveLength(expectedWeeks * 5);
      for (let week = 1; week <= expectedWeeks; week++) {
        const events = data.events.filter(event => event.week === week);
        expect(events.map(event => event.rows.length).sort()).toEqual([5, 5, 5, 5, 6]);
        expect(events.flatMap(event => event.rows)).toHaveLength(26);
        expect(new Set(events.flatMap(event => event.rows.map(row => row.id))).size).toBe(26);
      }
      for (const person of data.facts) {
        expect(data.assignmentCounts[person.id]).toBe(expectedWeeks);
        expect(Object.values(person.brands).reduce((sum, brand) => sum + brand.days, 0)).toBe(expectedWeeks * 3);
      }
      expect(data.events.every(event => Number(event.end.slice(8)) <= 31)).toBe(true);
    }
  });
  it("averages venue points over only that seller's four or five assigned fairs", () => {
    for (const month of ["8", "9"]) {
      const data = arenaExample("monthly", month, "fair", "AKEMI");
      for (const person of data.overall) {
        const assigned = data.events.flatMap(event => event.rows.filter(row => row.id === person.id));
        const expectedAverage = Math.round(assigned.reduce((sum, row) => sum + row.basePoints, 0) / assigned.length * 100) / 100;
        expect(person.components.salesVenue.base).toBeCloseTo(expectedAverage);
        expect(data.facts.find(row => row.id === person.id)!.sales).toBe(assigned.reduce((sum, row) => sum + row.value, 0));
      }
    }
    const september = arenaExample("monthly", "9", "fair", "AKEMI");
    const jia = september.facts.find(person => person.id === "jia")!;
    const daniel = september.facts.find(person => person.id === "daniel")!;
    expect([jia.brands.AKEMI.days, jia.brands.ZANOTTI.days, daniel.brands.AKEMI.days]).toEqual([9, 3, 12]);
  });
  it("uses real Friday–Sunday dates without double-booking a cross-month calendar week", () => {
    const quarter = arenaExample("quarterly", "3", "fair", "AKEMI");
    const personWeeks = new Map<string, Set<string>>();
    for (const event of quarter.events) {
      expect(new Date(event.start + "T00:00:00Z").getUTCDay()).toBe(5);
      expect(new Date(event.end + "T00:00:00Z").getUTCDay()).toBe(0);
      expect(Date.parse(event.end) - Date.parse(event.start)).toBe(2 * 24 * 60 * 60 * 1000);
      expect(event.weekId).toBe(event.end);
      for (const person of event.rows) {
        const seen = personWeeks.get(person.id) ?? new Set<string>();
        expect(seen.has(event.weekId!)).toBe(false);
        seen.add(event.weekId!);
        personWeeks.set(person.id, seen);
      }
    }
    expect([...personWeeks.values()].every(weeks => weeks.size === 13)).toBe(true);
    const august = arenaExample("monthly", "8", "fair", "AKEMI");
    expect(august.events[0]).toMatchObject({ start: "2026-07-31", end: "2026-08-02" });
    expect(august.events[0].label).toContain("31 Jul–2 Aug");
    expect([scheduledWeeks(3), scheduledWeeks(5), scheduledWeeks(8), scheduledWeeks(9)]).toEqual([5, 5, 5, 4]);
  });
});

describe("Arena monthly all-time fair-record awards", () => {
  const event = (end: string, candidates: Candidate[]): FairEvent => ({
    id: end, label: "Example fair", venue: "Mid Valley", end,
    start: new Date(Date.parse(end + "T00:00:00Z") - 2 * 86400000).toISOString().slice(0, 10),
    rows: awardRanking(candidates),
  });
  const candidate = (id: string, value: number, eligible = true): Candidate => ({ id, name: id, value, eligible });

  it("awards an unbeaten record once in each month and sums only those monthly snapshots", () => {
    const months = Array.from({ length: 9 }, (_, index) => arenaExample("monthly", String(index + 1), "fair", "AKEMI"));
    for (const month of months) {
      const daniel = month.overall.find(person => person.id === "daniel")!;
      expect(daniel.components.fairRecord).toEqual({ base: 25, incentive: 0, total: 25 });
      for (const person of month.overall) expect(person.value).toBeLessThanOrEqual(205);
    }
    const quarter = arenaExample("quarterly", "3", "fair", "AKEMI");
    const annual = arenaExample("annual", "2026", "fair", "AKEMI");
    expect(quarter.overall.find(person => person.id === "daniel")!.components.fairRecord.total).toBe(75);
    expect(annual.overall.find(person => person.id === "daniel")!.components.fairRecord.total).toBe(225);
    for (const person of quarter.overall) {
      expect(person.components.fairRecord.total).toBeCloseTo(months.slice(6).reduce((sum, month) => sum + month.overall.find(row => row.id === person.id)!.components.fairRecord.total, 0), 2);
      expect(person.value).toBeLessThanOrEqual(615);
    }
    for (const person of annual.overall) {
      expect(person.components.fairRecord.total).toBeCloseTo(months.reduce((sum, month) => sum + month.overall.find(row => row.id === person.id)!.components.fairRecord.total, 0), 2);
      expect(person.value).toBeLessThanOrEqual(205 * 9);
    }
    expect(quarter.records[0]).toMatchObject({ id: "daniel", value: 100000, points: 25 });
  });

  it("takes a single completed-event maximum and awards the new holder only from the overtaking snapshot", () => {
    const participants = [candidate("a", 0), candidate("b", 0)];
    const history = [
      event("2026-01-04", [candidate("a", 100000), candidate("b", 35000)]),
      event("2026-02-01", [candidate("a", 80000), candidate("b", 60000)]),
      event("2026-03-01", [candidate("b", 110000)]),
      event("2026-05-03", [candidate("a", 200000)]),
    ];
    const january = historicalRecords(history, "2026-01-31", participants);
    const february = historicalRecords(history, "2026-02-28", participants);
    const march = historicalRecords(history, "2026-03-31", participants);
    const april = historicalRecords(history, "2026-04-30", participants);
    expect(january.map(row => [row.id, row.value, row.points])).toEqual([["a", 100000, 25], ["b", 35000, 22.5]]);
    expect(february.map(row => [row.id, row.value, row.points])).toEqual([["a", 100000, 25], ["b", 60000, 22.5]]);
    expect(march.map(row => [row.id, row.value, row.points])).toEqual([["b", 110000, 25], ["a", 100000, 22.5]]);
    expect(april).toEqual(march); // No new April sale is needed to retain an eligible record award.
    expect(january[0].points + february[0].points + march.find(row => row.id === "a")!.points).toBe(72.5);
    expect(historicalRecords(history, "2026-01-31", participants)).toEqual(january);
  });

  it("splits tied record rank slots without granting two full first-place awards", () => {
    const records = historicalRecords([event("2026-01-04", [candidate("a", 100000), candidate("b", 100000), candidate("c", 50000)])], "2026-01-31");
    expect(records.map(row => [row.position, row.basePoints, row.incentivePoints, row.points])).toEqual([
      [1, 23.75, 0, 23.75], [1, 23.75, 0, 23.75], [3, 20.5, 0, 20.5],
    ]);
  });

  it("shows the eligible roster without awarding zero, invalid, incomplete, or excluded records", () => {
    const participants = ["valid", "zero", "negative", "nan", "infinite", "unassigned", "future", "missing", EXCLUDED_DIRECTOR_IDS[0]]
      .map(id => ({ id, name: id }));
    const history = [
      event("2026-01-04", [candidate("valid", 35000), candidate("zero", 0), candidate("negative", -10),
        candidate("nan", Number.NaN), candidate("infinite", Number.POSITIVE_INFINITY), candidate("unassigned", 90000, false),
        candidate(EXCLUDED_DIRECTOR_IDS[0], 999999), candidate("outsider", 900000)]),
      event("2026-02-01", [candidate("future", 100000)]),
    ];
    const records = historicalRecords(history, "2026-01-31", participants);
    expect(records).toHaveLength(8);
    expect(records[0]).toMatchObject({ id: "valid", value: 35000, position: 1, points: 25 });
    for (const row of records.slice(1)) expect(row).toMatchObject({ value: 0, position: null, basePoints: 0, incentivePoints: 0, points: 0 });
    expect(records.some(row => row.id === EXCLUDED_DIRECTOR_IDS[0] || row.id === "outsider")).toBe(false);
    expect(historicalRecords(history, "2026-01-31").some(row => row.id === EXCLUDED_DIRECTOR_IDS[0])).toBe(false);
    expect(historicalRecords(history, "2026-01-31", [])).toEqual([]);
  });
});

describe("Arena self-reported brand contribution", () => {
  const reversed: MonthlyBrandWeeks = { weeks: 4, counts: { AKEMI: 1, ERGOTEX: 0, ZANOTTI: 3, DUNLOP: 0 } };
  const plans: BrandWeeksByMonth = { "2026-09": reversed };

  it("uses declared one-Akemi/three-Zanotti shares for both brand ranking and tier contributions", () => {
    for (const [brand, share] of [["AKEMI", .25], ["ZANOTTI", .75]] as const) {
      const data = arenaExample("monthly", "9", "fair", brand, plans);
      for (const metric of ["salesBrand", "marginBrand"] as const) {
        const row = data.boards[metric].find(person => person.id === "jia")!;
        expect(row.brandShare).toBe(share);
        expect(row.contributionBase).toBeCloseTo(row.basePoints * share, 2);
        expect(row.contributionIncentive).toBeCloseTo(row.incentivePoints * share, 2);
        expect(row.note).toContain("self-reported weeks");
      }
    }
    const result = arenaExample("monthly", "9", "fair", "AKEMI", plans);
    expect(result.self.components.marginBrand.incentive).toBe(3.13);
  });

  it("changes only the reporting person's two brand components, preserving all factual ranks and other awards", () => {
    const before = arenaExample("monthly", "9", "fair", "AKEMI");
    const after = arenaExample("monthly", "9", "fair", "AKEMI", plans);
    expect(after.facts).toEqual(before.facts);
    expect(after.events).toEqual(before.events);
    expect(after.records).toEqual(before.records);
    for (const metric of ["salesTotal", "marginTotal", "kpi"] as const) expect(after.boards[metric]).toEqual(before.boards[metric]);
    for (const metric of ["salesBrand", "marginBrand"] as const) {
      expect(after.boards[metric].map(({ id, value, position, basePoints, incentivePoints, eligible }) => ({ id, value, position, basePoints, incentivePoints, eligible })))
        .toEqual(before.boards[metric].map(({ id, value, position, basePoints, incentivePoints, eligible }) => ({ id, value, position, basePoints, incentivePoints, eligible })));
    }
    for (const row of after.overall.filter(person => person.id !== "jia")) {
      const original = before.overall.find(person => person.id === row.id)!;
      expect(row.components).toEqual(original.components);
      expect(row.value).toBe(original.value);
    }
    for (const slot of ["salesTotal", "salesVenue", "marginTotal", "kpi", "fairRecord"] as const) expect(after.self.components[slot]).toEqual(before.self.components[slot]);
    expect(after.self.components.salesBrand).not.toEqual(before.self.components.salesBrand);
    expect(after.self.components.marginBrand).not.toEqual(before.self.components.marginBrand);
  });

  it("accepts a manual five-week budget in a four-event month without deriving it from the calendar", () => {
    const five: BrandWeeksByMonth = { "2026-09": { weeks: 5, counts: { ...reversed.counts, ZANOTTI: 4 } } };
    const data = arenaExample("monthly", "9", "fair", "AKEMI", five);
    expect(data.boards.salesBrand.find(row => row.id === "jia")!.brandShare).toBe(.2);
    expect(data.assignmentCounts.jia).toBe(4);
    expect(data.info.weeks).toBe(4);
    const august = arenaExample("monthly", "8", "fair", "AKEMI", { "2026-08": reversed });
    expect(august.boards.salesBrand.find(row => row.id === "jia")!.brandShare).toBe(.25);
    expect(august.assignmentCounts.jia).toBe(5);
  });

  it("keeps declared no-activity shares at zero points without redistributing them to actual sales", () => {
    const noActivity: BrandWeeksByMonth = { "2026-09": { weeks: 4, counts: { AKEMI: 0, ERGOTEX: 0, ZANOTTI: 0, DUNLOP: 4 } } };
    const data = arenaExample("monthly", "9", "fair", "DUNLOP", noActivity);
    for (const metric of ["salesBrand", "marginBrand"] as const) {
      expect(data.boards[metric].find(row => row.id === "jia")).toMatchObject({ brandShare: 1, eligible: false, position: null, value: 0, contributionPoints: 0 });
      expect(data.self.components[metric].total).toBe(0);
    }
    const actual = arenaExample("monthly", "9", "fair", "AKEMI", noActivity).boards.salesBrand.find(row => row.id === "jia")!;
    expect(actual.value).toBeGreaterThan(0);
    expect(actual.basePoints).toBeGreaterThan(0);
    expect(actual.brandShare).toBe(0);
    expect(actual.contributionPoints).toBe(0);
  });

  it("sums month-specific declarations for quarters and keeps every displayed brand contribution reconcilable", () => {
    const quarterPlans: BrandWeeksByMonth = { ...plans, "2026-08": { weeks: 5, counts: { AKEMI: 4, ERGOTEX: 0, ZANOTTI: 1, DUNLOP: 0 } } };
    const quarters = BRANDS.map(brand => arenaExample("quarterly", "3", "fair", brand.code, quarterPlans));
    const months = [7, 8, 9].map(month => arenaExample("monthly", String(month), "fair", "AKEMI", quarterPlans));
    expect(quarters[0].self.value).toBeCloseTo(months.reduce((sum, month) => sum + month.self.value, 0), 2);
    for (const metric of ["salesBrand", "marginBrand"] as const) {
      expect(quarters.reduce((sum, quarter) => sum + quarter.boards[metric].find(row => row.id === "jia")!.contributionPoints!, 0)).toBeCloseTo(quarters[0].self.components[metric].total, 2);
      for (const brand of BRANDS) {
        const quarterRow = arenaExample("quarterly", "3", "fair", brand.code, quarterPlans).boards[metric].find(row => row.id === "jia")!;
        expect(quarterRow.brandShare).toBeNull();
        const monthlyContribution = [7, 8, 9].reduce((sum, month) => sum + arenaExample("monthly", String(month), "fair", brand.code, quarterPlans).boards[metric].find(row => row.id === "jia")!.contributionPoints!, 0);
        expect(quarterRow.contributionPoints).toBeCloseTo(monthlyContribution, 2);
      }
    }
  });

  it("ignores invalid or differently keyed monthly plans instead of changing valid default scores", () => {
    const before = arenaExample("monthly", "9", "fair", "AKEMI");
    const invalid = { "2026-09": { ...reversed, counts: { ...reversed.counts, AKEMI: 4 } } };
    expect(arenaExample("monthly", "9", "fair", "AKEMI", invalid)).toEqual(before);
    expect(arenaExample("monthly", "9", "fair", "AKEMI", { "2026-08": reversed })).toEqual(before);
  });
});
