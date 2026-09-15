/** Proposed Arena arithmetic and fictional fixtures. Never used for live pay or awards. */
import { kpiThresholdPct, marginIncentiveAcrossBrands } from "@/lib/commission/engine";
import type { BrandMargin, MarginBand } from "@/lib/commission/types";
import { isValidBrandWeeks, type BrandWeeksByMonth, type MonthlyBrandWeeks } from "./arena-brand-weeks";

/** Uniformly scales the earlier proposal; relative rank and incentive gaps stay unchanged. */
export const POINT_SCALE = 1 / 4;
export const RANK_POINTS = [25, 22.5, 20.5, 18.75, 17.25, 16, 15, 14, 13.25, 12.5] as const;
export const PARTICIPATION_POINTS = 6.25;
export const MARGIN_TIER_POINTS = { 1: 5, 2: 12.5 } as const;
export const KPI_INCENTIVE_POINTS = 5;
export type Period = "monthly" | "quarterly" | "annual";
export type Metric = "salesTotal" | "salesBrand" | "marginTotal" | "marginBrand" | "kpi";
export type Slot = Metric | "salesVenue" | "fairRecord";
export const SLOTS: Slot[] = ["salesBrand", "salesVenue", "salesTotal", "marginBrand", "marginTotal", "kpi", "fairRecord"];
export const MONTHLY_POINTS_MAX = RANK_POINTS[0] * SLOTS.length + MARGIN_TIER_POINTS[2] * 2 + KPI_INCENTIVE_POINTS;
export const BRANDS = [
  { code: "AKEMI", label: "Akemi" },
  { code: "ERGOTEX", label: "Ergotex" },
  { code: "ZANOTTI", label: "Zanotti" },
  { code: "DUNLOP", label: "Dunlopillo" },
] as const;
export type BrandCode = typeof BRANDS[number]["code"];
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function pointsAt(position: number): number {
  if (!Number.isInteger(position) || position < 1) return 0;
  return position <= 10 ? RANK_POINTS[position - 1] : position <= 20 ? round(12.5 - (position - 10) * .5) : PARTICIPATION_POINTS;
}
export interface Candidate { id: string; name: string; value: number; eligible: boolean; active?: boolean; note?: string }
export interface Standing extends Candidate {
  position: number | null; scoringPosition: number | null; scoringValue: number;
  basePoints: number; incentivePoints: number; points: number;
  /** Brand shares apply monthly; longer periods sum the monthly contributions. */
  brandShare?: number | null;
  contributionBase?: number; contributionIncentive?: number; contributionPoints?: number;
}
/** Known, assigned zero activity stays visible in last place but receives zero points. */
export function awardRanking(candidates: Candidate[]): Standing[] {
  const ranked = candidates.filter(row => row.eligible && Number.isFinite(row.value))
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const result: Standing[] = [];
  for (let i = 0; i < ranked.length;) {
    let end = i + 1;
    while (end < ranked.length && ranked[end].value === ranked[i].value) end++;
    const award = Array.from({ length: end - i }, (_, offset) => pointsAt(i + offset + 1))
      .reduce((sum, value) => sum + value, 0) / (end - i);
    for (let j = i; j < end; j++) {
      const row = ranked[j];
      const points = (row.active ?? row.value > 0) ? award : 0;
      result.push({ ...row, position: i + 1, scoringPosition: i + 1, scoringValue: row.value, basePoints: points, incentivePoints: 0, points });
    }
    i = end;
  }
  return [...result, ...candidates.filter(row => !row.eligible || !Number.isFinite(row.value)).map(row => ({
    ...row, position: null, scoringPosition: null, scoringValue: 0, basePoints: 0, incentivePoints: 0, points: 0,
  }))];
}
export interface Component { base: number; incentive: number; total: number }
export type Components = Record<Slot, Component>;
export interface OverallStanding extends Standing { components: Components }
export interface LedgerEntry { month: number; components: Components; total: number }
export function fixedSlot(items: { weight: number; base: number; incentive?: number }[]): Component {
  const usable = items.filter(item => item.weight > 0);
  const denominator = usable.reduce((sum, item) => sum + item.weight, 0);
  if (!denominator) return { base: 0, incentive: 0, total: 0 };
  const base = round(usable.reduce((sum, item) => sum + item.base * item.weight, 0) / denominator);
  const incentive = round(usable.reduce((sum, item) => sum + (item.incentive ?? 0) * item.weight, 0) / denominator);
  return { base, incentive, total: round(base + incentive) };
}
const emptyComponents = (): Components => Object.fromEntries(SLOTS.map(slot => [slot, { base: 0, incentive: 0, total: 0 }])) as Components;
export function sumLedger(ledger: LedgerEntry[]): { components: Components; total: number } {
  const components = emptyComponents();
  for (const slot of SLOTS) {
    components[slot] = {
      base: round(ledger.reduce((sum, month) => sum + month.components[slot].base, 0)),
      incentive: round(ledger.reduce((sum, month) => sum + month.components[slot].incentive, 0)),
      total: round(ledger.reduce((sum, month) => sum + month.components[slot].total, 0)),
    };
  }
  return { components, total: round(SLOTS.reduce((sum, slot) => sum + components[slot].total, 0)) };
}
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September"];
/** Fair ownership follows the Sunday end date; Friday may belong to the prior month. */
export function scheduledSundays(month: number): string[] {
  const lastDay = new Date(Date.UTC(2026, month, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, index) => new Date(Date.UTC(2026, month - 1, index + 1)))
    .filter(date => date.getUTCDay() === 0).map(date => date.toISOString().slice(0, 10));
}
export const scheduledWeeks = (month: number): number => scheduledSundays(month).length;
export const ARENA_COHORT = { totalStaff: 28, excludedRevenueDirectors: 2, eligibleStaff: 26 } as const;
export const EXCLUDED_DIRECTOR_IDS = ["revenue-director-1", "revenue-director-2"] as const;
export function periodInfo(period: Period, selection: string) {
  const months = period === "annual" ? [1, 2, 3, 4, 5, 6, 7, 8, 9]
    : period === "quarterly" ? (() => {
      const q = [1, 2, 3].includes(Number(selection)) ? Number(selection) : 3;
      return [q * 3 - 2, q * 3 - 1, q * 3];
    })() : [[1, 2, 3, 4, 5, 6, 7, 8, 9].includes(Number(selection)) ? Number(selection) : 9];
  const end = months[months.length - 1];
  const lastDay = new Date(Date.UTC(2026, end, 0)).getUTCDate();
  return { months, weeks: months.reduce((sum, month) => sum + scheduledWeeks(month), 0), label: period === "annual" ? "2026 · Jan–Sep" : period === "quarterly" ? "Q" + Math.ceil(end / 3) + " 2026" : monthNames[end - 1] + " 2026",
    cutoff: "2026-" + String(end).padStart(2, "0") + "-" + lastDay, status: period === "annual" ? "Year to date" : "Fictional period" };
}
const INCENTIVE_BANDS: MarginBand[] = BRANDS.flatMap(brand => [
  { brandCode: brand.code, bandKey: "incentive_tier_1", label: "Tier 1", kind: "incentive" as const, marginPct: .36, commissionMultiplier: 1, monthlyIncentive: 1000 },
  { brandCode: brand.code, bandKey: "incentive_tier_2", label: "Tier 2", kind: "incentive" as const, marginPct: .43, commissionMultiplier: 1, monthlyIncentive: 1500 },
]);
/** Reuses tier qualification only. Cash amounts are never converted to Arena points. */
export function monthlyMarginBonus(brands: BrandMargin[]): number {
  const result = marginIncentiveAcrossBrands(brands.filter(brand => brand.revenue > 0), INCENTIVE_BANDS);
  if (result.blockedReason) throw new Error(`Pending margin incentive: ${result.blockedReason}`);
  const tier = result.bandKey;
  return tier === "incentive_tier_2" ? MARGIN_TIER_POINTS[2] : tier === "incentive_tier_1" ? MARGIN_TIER_POINTS[1] : 0;
}
export function monthlyKpiBonus(quantity: number): number {
  return kpiThresholdPct(quantity, [{ minQty: 10, bonusPct: .2 }]) > 0 ? KPI_INCENTIVE_POINTS : 0;
}
const PEOPLE = [
  ["daniel", "Daniel Tan"], ["sarah", "Sarah Lim"], ["jia", "Jia En"], ["aisyah", "Aisyah Ahmad"],
  ["marcus", "Marcus Lee"], ["wei", "Wei Jun"], ["kumar", "Kumar Raj"], ["lily", "Lily Goh"],
  ["hakim", "Hakim Yusof"], ["chloe", "Chloe Wong"], ["adam", "Adam Lee"], ["nadia", "Nadia Rahman"],
  ["hafiz", "Hafiz Ismail"], ["amelia", "Amelia Ng"], ["ryan", "Ryan Lim"], ["priya", "Priya Nair"],
  ["farah", "Farah Aziz"], ["jason", "Jason Teoh"], ["mei", "Mei Ling"], ["arjun", "Arjun Kumar"],
  ["joanne", "Joanne Tan"], ["amir", "Amir Hassan"], ["nicole", "Nicole Yap"], ["suresh", "Suresh Raj"],
  ["kelly", "Kelly Wong"], ["azlan", "Azlan Rahman"],
] as const;
interface BrandFact { code: BrandCode; sales: number; profit: number; days: number }
interface PersonFact {
  id: string; name: string; sales: number; profit: number; margin: number; kpi: number;
  brands: Record<BrandCode, BrandFact>;
}
export interface FairEvent { id: string; label: string; venue: string; start: string; end: string; week?: number; weekId?: string; rows: Standing[] }
function makeMonth(month: number, department: string) {
  const people = department === "ir" ? PEOPLE.slice(0, 8) : PEOPLE;
  const facts: PersonFact[] = people.map(([id, name]) => ({ id, name, sales: 0, profit: 0, margin: 0, kpi: 0,
    brands: Object.fromEntries(BRANDS.map(brand => [brand.code, { code: brand.code, sales: 0, profit: 0, days: 0 }])) as Record<BrandCode, BrandFact> }));
  const sundays = scheduledSundays(month);
  const weeks = sundays.length;
  // Five concurrent venues each week. The same 26 sellers split into 6/5/5/5/5,
  // and each seller appears at exactly one venue per week.
  const events: FairEvent[] = Array.from({ length: weeks }, (_, week) => week).flatMap(week =>
    ["Mid Valley", "IOI City Mall", "Sunway Pyramid", "Setia City Mall", "Pavilion Bukit Jalil"].map((venue, venueIndex) => {
    const end = sundays[week];
    const start = new Date(Date.parse(end + "T00:00:00Z") - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const assigned = facts.map((person, index) => ({ person, index })).filter(({ index }) => (index + week) % 5 === venueIndex);
    const rows = awardRanking(assigned.map(({ person, index }) => {
      const brand = index === 0 ? BRANDS[0] : index === 2 ? BRANDS[week === weeks - 1 ? 2 : 0] : BRANDS[(index + week + month) % BRANDS.length];
      const brandIndex = BRANDS.indexOf(brand);
      const performance = Math.max(.5, 1.62 - index * .025 + ((month + index * 2 + week) % 5) * .025);
      const fictionalDailySales = [5000, 6000, 3000, 2200][brandIndex];
      let sales = person.id === "nadia" ? 0 : Math.round(fictionalDailySales * 3 * performance * (department === "ir" ? .65 : 1));
      // A historical January record remains unbeaten through September.
      if (person.id === "daniel" && month === 1 && week === 0) sales = 100000;
      // Explicit fictional tier examples: Daniel T1, Sarah T2, Jia mixed-brand block.
      const margin = person.id === "daniel" ? .38 : person.id === "sarah" ? .44
        : person.id === "jia" ? brand.code === "AKEMI" ? .45 : .35
        : [.40, .40, .32, .30][brandIndex] * (.93 + ((index * 3 + month + week) % 7) * .035);
      const fact = person.brands[brand.code];
      fact.days += 3; fact.sales += sales; fact.profit += sales * margin;
      person.sales += sales; person.profit += sales * margin;
      person.kpi += sales > 0 ? Math.max(1, 8 - Math.floor(index / 2) + ((month + week + index) % 3)) : 0;
      return { id: person.id, name: person.name, value: sales, eligible: true, active: sales > 0 };
    }));
    const shortDate = (date: string) => Number(date.slice(8)) + " " + monthNames[Number(date.slice(5, 7)) - 1].slice(0, 3);
    return { id: end + "-" + venueIndex, label: venue + " · " + shortDate(start) + "–" + shortDate(end), venue, start, end, week: week + 1, weekId: end, rows };
  }));
  for (const person of facts) person.margin = person.sales > 0 ? round(person.profit / person.sales * 100) : 0;
  return { month, facts, events, department };
}
function marginInputs(person: PersonFact, code?: BrandCode): BrandMargin[] {
  return Object.values(person.brands).filter(brand => (!code || brand.code === code) && brand.sales > 0)
    .map(brand => ({ brandCode: brand.code, revenue: brand.sales, cost: brand.sales - brand.profit, marginPct: brand.profit / brand.sales }));
}
function board(facts: PersonFact[], metric: Metric, code: BrandCode, brandWeeks?: MonthlyBrandWeeks): Standing[] {
  const isBrand = metric === "salesBrand" || metric === "marginBrand";
  const raw = awardRanking(facts.map(person => {
    const brand = person.brands[code];
    const value = metric === "salesTotal" ? person.sales : metric === "salesBrand" ? brand.sales : metric === "marginTotal" ? person.margin
      : metric === "marginBrand" ? brand.sales > 0 ? round(brand.profit / brand.sales * 100) : 0 : person.kpi;
    return { id: person.id, name: person.name, value, eligible: !isBrand || brand.days > 0, active: metric === "kpi" ? person.kpi > 0 : isBrand ? brand.sales > 0 : person.sales > 0 };
  }));
  return raw.map(row => {
    const person = facts.find(fact => fact.id === row.id)!;
    const incentivePoints = metric === "kpi" ? monthlyKpiBonus(person.kpi) : metric.startsWith("margin") ? monthlyMarginBonus(marginInputs(person, isBrand ? code : undefined)) : 0;
    const assignment = person.brands[code];
    const totalDays = Object.values(person.brands).reduce((sum, brand) => sum + brand.days, 0);
    // Declarations change only the brand contribution budget. They never invent
    // sales, qualify a seller for a brand, or alter the actual ranking.
    const reported = person.id === "jia" ? brandWeeks : undefined;
    const share = reported ? reported.counts[code] / reported.weeks : totalDays > 0 ? assignment.days / totalDays : 0;
    const contributionBase = round(row.basePoints * share);
    const contributionIncentive = round(incentivePoints * share);
    return { ...row, incentivePoints, points: round(row.basePoints + incentivePoints),
      ...(isBrand ? { brandShare: share, contributionBase, contributionIncentive, contributionPoints: round(contributionBase + contributionIncentive),
        note: (reported ? reported.counts[code] + " of " + reported.weeks + " self-reported weeks" : assignment.days + " assigned days")
          + " · " + round(share * 100) + "% of monthly brand contribution" } : {}) };
  });
}
/** Post cents across brands without rounding a shared budget up once per brand. */
function reconcileBrandContributions(rows: Standing[]): Component {
  const apportion = (field: "basePoints" | "incentivePoints") => {
    const exact = rows.map(row => row[field] * (row.brandShare ?? 0) * 100);
    const cents = exact.map(value => Math.floor(value + Number.EPSILON));
    const target = Math.round(exact.reduce((sum, value) => sum + value, 0) + Number.EPSILON);
    const remaining = target - cents.reduce((sum, value) => sum + value, 0);
    const order = exact.map((value, index) => ({ index, fraction: value - cents[index] }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (const { index } of order.slice(0, remaining)) cents[index]++;
    return cents.map(value => value / 100);
  };
  const bases = apportion("basePoints");
  const incentives = apportion("incentivePoints");
  rows.forEach((row, index) => {
    row.contributionBase = bases[index];
    row.contributionIncentive = incentives[index];
    row.contributionPoints = round(bases[index] + incentives[index]);
  });
  const base = round(bases.reduce((sum, value) => sum + value, 0));
  const incentive = round(incentives.reduce((sum, value) => sum + value, 0));
  return { base, incentive, total: round(base + incentive) };
}
function scoreMonth(month: ReturnType<typeof makeMonth>, recordHistory: FairEvent[], brandWeeks?: MonthlyBrandWeeks) {
  const totalSales = board(month.facts, "salesTotal", "AKEMI");
  const totalMargin = board(month.facts, "marginTotal", "AKEMI");
  const kpi = board(month.facts, "kpi", "AKEMI");
  // Award the all-time record ranking once at this month's closing snapshot.
  // History includes earlier years and months outside the selected view.
  const records = historicalRecords(recordHistory, periodInfo("monthly", String(month.month)).cutoff, month.facts);
  const brandSales = Object.fromEntries(BRANDS.map(brand => [brand.code, board(month.facts, "salesBrand", brand.code, brandWeeks)])) as Record<BrandCode, Standing[]>;
  const brandMargin = Object.fromEntries(BRANDS.map(brand => [brand.code, board(month.facts, "marginBrand", brand.code, brandWeeks)])) as Record<BrandCode, Standing[]>;
  const entries = month.facts.map(person => {
    const component = (rows: Standing[]): Component => {
      const row = rows.find(candidate => candidate.id === person.id)!;
      return { base: row.basePoints, incentive: row.incentivePoints, total: row.points };
    };
    const brandSlot = (boards: Record<BrandCode, Standing[]>): Component => {
      const rows = BRANDS.map(brand => boards[brand.code].find(candidate => candidate.id === person.id)!);
      // Brand order breaks equal fractional-cent ties consistently, regardless
      // of which brand the user is viewing. Posted amounts still sum exactly.
      return reconcileBrandContributions(rows);
    };
    const components: Components = {
      salesBrand: brandSlot(brandSales),
      salesVenue: fixedSlot(month.department === "ir" ? [] : month.events.flatMap(event => {
        const assigned = event.rows.find(row => row.id === person.id);
        return assigned ? [{ weight: 1, base: assigned.basePoints }] : [];
      })),
      salesTotal: component(totalSales), marginBrand: brandSlot(brandMargin), marginTotal: component(totalMargin), kpi: component(kpi),
      // Post this month's tied award at ledger precision before any Q/Y sum.
      fairRecord: { base: round(component(records).base), incentive: 0, total: round(component(records).total) },
    };
    return { id: person.id, month: month.month, components, total: round(SLOTS.reduce((sum, slot) => sum + components[slot].total, 0)) };
  });
  return { entries, boards: { salesTotal: totalSales, marginTotal: totalMargin, kpi }, brandSales, brandMargin, records };
}
/** One maximum net-sales result per person from completed fairs, ranked as of cutoff. */
export function historicalRecords(events: FairEvent[], cutoff: string, participants?: Pick<Candidate, "id" | "name">[]): Standing[] {
  const excluded = new Set<string>(EXCLUDED_DIRECTOR_IDS);
  const roster = participants?.filter(person => !excluded.has(person.id));
  const allowed = roster ? new Set(roster.map(person => person.id)) : undefined;
  const best = new Map<string, Candidate>();
  for (const event of events.filter(event => event.end <= cutoff)) {
    for (const row of event.rows.filter(row => row.eligible && Number.isFinite(row.value) && row.value > 0
      && !excluded.has(row.id) && (!allowed || allowed.has(row.id)))) {
      if (!best.has(row.id) || row.value > best.get(row.id)!.value) best.set(row.id, {
        id: row.id, name: row.name, value: row.value, eligible: true, note: event.venue + " · " + event.start + " – " + event.end,
      });
    }
  }
  const candidates = roster ? roster.map(person => best.get(person.id) ?? {
    ...person, value: 0, eligible: false, active: false, note: "No completed fair record",
  }) : [...best.values()];
  return awardRanking(candidates);
}
export function arenaExample(period: Period, selection: string, department: string, brandCode: string, brandWeeksByMonth: BrandWeeksByMonth = {}) {
  const info = periodInfo(period, selection);
  const code = BRANDS.find(brand => brand.code === brandCode || brand.label === brandCode)?.code ?? "AKEMI";
  const allMonths = Array.from({ length: info.months[info.months.length - 1] }, (_, index) => makeMonth(index + 1, department));
  const priorRecord: FairEvent = { id: "2025-12-legacy", venue: "Mid Valley", label: "Mid Valley · 5–7 Dec 2025", start: "2025-12-05", end: "2025-12-07",
    rows: awardRanking([{ id: "sarah", name: "Sarah Lim", value: 80000, eligible: true }]) };
  const recordHistory = department === "ir" ? [] : [priorRecord, ...allMonths.flatMap(month => month.events)];
  const selected = allMonths.filter(month => info.months.includes(month.month));
  const monthly = selected.map(month => {
    const declared = brandWeeksByMonth["2026-" + String(month.month).padStart(2, "0")];
    return { ...month, scores: scoreMonth(month, recordHistory, isValidBrandWeeks(declared) ? declared : undefined) };
  });
  const facts = selected[0].facts.map(person => {
    const combined: PersonFact = { ...person, sales: 0, profit: 0, margin: 0, kpi: 0,
      brands: Object.fromEntries(BRANDS.map(brand => [brand.code, { ...person.brands[brand.code], sales: 0, profit: 0, days: 0 }])) as Record<BrandCode, BrandFact> };
    for (const month of selected) {
      const row = month.facts.find(candidate => candidate.id === person.id)!;
      combined.sales += row.sales; combined.profit += row.profit; combined.kpi += row.kpi;
      for (const brand of BRANDS) {
        combined.brands[brand.code].sales += row.brands[brand.code].sales;
        combined.brands[brand.code].profit += row.brands[brand.code].profit;
        combined.brands[brand.code].days += row.brands[brand.code].days;
      }
    }
    combined.margin = combined.sales > 0 ? round(combined.profit / combined.sales * 100) : 0;
    return combined;
  });
  const metrics: Metric[] = ["salesTotal", "salesBrand", "marginTotal", "marginBrand", "kpi"];
  const boards = Object.fromEntries(metrics.map(metric => {
    const isBrand = metric === "salesBrand" || metric === "marginBrand";
    const rows = board(facts, metric, code).map(row => {
      const monthlyRows = monthly.map(month => metric === "salesBrand" ? month.scores.brandSales[code] : metric === "marginBrand" ? month.scores.brandMargin[code] : month.scores.boards[metric])
        .map(rows => rows.find(person => person.id === row.id)!);
      const basePoints = round(monthlyRows.reduce((sum, row) => sum + row.basePoints, 0));
      const incentivePoints = round(monthlyRows.reduce((sum, row) => sum + row.incentivePoints, 0));
      const contributionBase = round(monthlyRows.reduce((sum, row) => sum + (row.contributionBase ?? 0), 0));
      const contributionIncentive = round(monthlyRows.reduce((sum, row) => sum + (row.contributionIncentive ?? 0), 0));
      return { ...row, scoringPosition: period === "monthly" ? row.position : null, basePoints, incentivePoints, points: round(basePoints + incentivePoints),
        ...(isBrand ? { brandShare: period === "monthly" ? monthlyRows[0].brandShare : null, contributionBase, contributionIncentive, contributionPoints: round(contributionBase + contributionIncentive),
          note: period === "monthly" ? monthlyRows[0].note : "Sum of monthly brand contributions" } : {}) };
    });
    return [metric, rows];
  })) as Record<Metric, Standing[]>;
  const ledgers = facts.map(person => {
    const ledger = monthly.map(month => month.scores.entries.find(entry => entry.id === person.id)!);
    return { ...person, ledger, ...sumLedger(ledger) };
  });
  const overall: OverallStanding[] = awardRanking(ledgers.map(person => ({
    id: person.id, name: person.name, value: person.total, eligible: true, active: person.sales > 0,
  }))).map(row => ({ ...row, basePoints: 0, incentivePoints: 0, points: row.value, components: ledgers.find(person => person.id === row.id)!.components }));
  const self = overall.find(row => row.id === "jia")!;
  return { info, facts, boards, cohort: ARENA_COHORT, assignmentCounts: Object.fromEntries(facts.map(person => [person.id,
    department === "ir" ? 0 : selected.flatMap(month => month.events).filter(event => event.rows.some(row => row.id === person.id)).length])),
    events: department === "ir" ? [] : selected.flatMap(month => month.events),
    records: department === "ir" ? [] : monthly[monthly.length - 1].scores.records,
    overall, self, monthlyLedger: ledgers.find(person => person.id === "jia")!.ledger };
}
