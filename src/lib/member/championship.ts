import { arenaIncentive, arenaRankings, type ArenaPerson, type ArenaScore, type ArenaTier } from "./arena";
import { arenaFairRecords, type ArenaFairEvent, type ArenaHistorySnapshot } from "./arena-history";

/**
 * The Championship: one points total per person per month, from seven
 * contributions (user, 2026-10-04). Every contribution is a PLACE on a board
 * turned into points by one table; a quarter or a year is the sum of its months.
 *
 *   Total sales        place on the month's sales board
 *   Sales by brand     place on the board of the brand they sold MOST (no weighting)
 *   Fair results       the SUM of the week's points, one booth a week — the booth
 *                      of their brand week (`scoring` in the booth history)
 *   Margin by brand    place on their main brand's margin board + that brand's tier
 *   Total margin       place on the margin board + the incentive tier earned
 *   KPI                place on the KPI board + the threshold award
 *   Highest Fair Record  place on the all-time record board as the month closes
 *
 * Places tie the way every board ties (1, 2, 2, 4) and a tied group shares the
 * points of the places it fills, averaged. Nobody who did nothing scores: a
 * month with no counted sales is 0 on every item. Department heads are not on
 * the boards at all (the roster leaves them out).
 */
export const CHAMP_ITEMS = ["salesByBrand", "fairResults", "totalSales", "marginByBrand", "totalMargin", "kpi", "record"] as const;
export type ChampItem = typeof CHAMP_ITEMS[number];

/** Points for places 1–10; 11–20 lose half a point each; 21st on is 6.25. */
export const CHAMP_TOP_TEN = [25, 22.5, 20.5, 18.75, 17.25, 16, 15, 14, 13.25, 12.5] as const;
export const CHAMP_TAIL = 6.25;
/** Margin tier awards (T1 / T2) and the KPI threshold award. */
export const CHAMP_TIER_BONUS: Record<string, number> = { incentive_tier_1: 5, incentive_tier_2: 12.5 };
export const CHAMP_KPI_BONUS = 5;

export function placePoints(position: number): number {
  if (!Number.isInteger(position) || position < 1) return 0;
  if (position <= 10) return CHAMP_TOP_TEN[position - 1];
  if (position <= 20) return 12.5 - 0.5 * (position - 10);
  return CHAMP_TAIL;
}

/** A tied group of `size` people at `position` shares the points of the places it fills. */
export function tiedPoints(position: number, size: number): number {
  if (size <= 1) return placePoints(position);
  let sum = 0;
  for (let p = position; p < position + size; p++) sum += placePoints(p);
  return round2(sum / size);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ChampPlace { position: number | null; of: number; points: number }

/**
 * Points for everybody placed on one board. `positions` is the board's own
 * competition ranking (null = not placed); the size of each tie is counted here.
 */
export function boardPoints(rows: readonly { id: string; position: number | null }[]): Map<string, ChampPlace> {
  const placed = rows.filter(r => r.position !== null);
  const ties = new Map<number, number>();
  for (const r of placed) ties.set(r.position!, (ties.get(r.position!) ?? 0) + 1);
  return new Map(rows.map(r => [r.id, {
    position: r.position, of: placed.length,
    points: r.position === null ? 0 : tiedPoints(r.position, ties.get(r.position) ?? 1),
  }]));
}

export interface ChampPart {
  item: ChampItem;
  /** Place points + bonus. */
  points: number;
  /** Place points alone. */
  place: number;
  bonus: number;
  position: number | null;
  of: number;
  /** Main brand, the tier, the weeks — what the number is about. */
  note: string;
  /** Fair results only: each week's place and points. */
  weeks?: { week: string; booth: string; position: number | null; of: number; points: number }[];
  /** Margin items: the margin cannot be judged while a bill has no cost. */
  pending?: boolean;
}

export interface ChampMonth {
  id: string;
  name: string;
  month: string;
  active: boolean;
  parts: Record<ChampItem, ChampPart>;
  total: number;
}

export interface ChampMonthInput {
  /** `YYYY-MM`. */
  month: string;
  /** The month's Arena (monthly window). */
  people: readonly ArenaPerson[];
  /** Brands with a board of their own (the scheme's brands). */
  brands: readonly string[];
  tiers: readonly ArenaTier[];
  /** The booth history — every completed fair, booth by booth. */
  history: ArenaHistorySnapshot | null;
  kpi: { enabled: boolean; threshold: number | null };
}

const LABEL: Record<string, string> = { AKEMI: "Akemi", ERGOTEX: "Ergotex", DUNLOP: "Dunlopillo", ZANOTTI: "Zanotti" };
const brandName = (code: string) => LABEL[code] ?? code;

function emptyPart(item: ChampItem, note = ""): ChampPart {
  return { item, points: 0, place: 0, bonus: 0, position: null, of: 0, note };
}

/** The brand a person sold most this month, among the brands that have a board. */
export function mainBrand(person: ArenaPerson, brands: readonly string[]): string | null {
  let best: { code: string; sales: number } | null = null;
  for (const code of brands) {
    const sales = person.brands[code]?.sales ?? 0;
    if (sales > 0 && (!best || sales > best.sales || (sales === best.sales && code < best.code))) best = { code, sales };
  }
  return best?.code ?? null;
}

/** The highest of a person's tiers on one brand's own ladder. */
function brandTier(score: ArenaScore | undefined, brand: string, tiers: readonly ArenaTier[]): ArenaTier | null {
  if (!score || score.blindOrders > 0 || !(score.marginRevenue > 0)) return null;
  const margin = (score.marginRevenue - score.marginCost) / score.marginRevenue;
  return tiers.filter(t => t.brand === brand && margin + 1e-9 >= t.marginPct)
    .sort((a, b) => b.marginPct - a.marginPct)[0] ?? null;
}

const tierBonus = (bandKey: string | null | undefined) => (bandKey ? CHAMP_TIER_BONUS[bandKey] ?? 0 : 0);

/** The month's Fair results: one booth a week, the place there in points, added up. */
function fairWeeks(month: string, events: readonly ArenaFairEvent[]): Map<string, NonNullable<ChampPart["weeks"]>> {
  const out = new Map<string, NonNullable<ChampPart["weeks"]>>();
  for (const event of events) {
    const week = event.week ?? event.end;
    if (week.slice(0, 7) !== month) continue;
    // Everybody on the board takes a place, scoring or not (2026-10-03).
    const ranked = [...event.people].filter(p => Number.isFinite(p.sales) && p.sales > 0)
      .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    let position = 0; let previous: number | null = null;
    const rows = ranked.map((p, i) => {
      if (previous !== p.sales) position = i + 1;
      previous = p.sales;
      return { id: p.id, position };
    });
    const points = boardPoints(rows);
    for (const person of event.people) {
      if (person.scoring === false) continue;
      const place = points.get(person.id);
      const list = out.get(person.id) ?? [];
      list.push({ week, booth: [event.brand ? brandName(event.brand) : "No brand", event.venue].join(" · "),
        position: place?.position ?? null, of: rows.length, points: place?.points ?? 0 });
      out.set(person.id, list);
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.week.localeCompare(b.week));
  return out;
}

/** Everybody's record as the month closes: completed fairs that ended by its last day. */
function recordPlaces(month: string, history: ArenaHistorySnapshot | null): Map<string, ChampPlace & { sales: number }> {
  if (!history) return new Map();
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const records = arenaFairRecords({ ...history, events: history.events.filter(e => e.end <= last) });
  const points = boardPoints(records.map(r => ({ id: r.id, position: r.position })));
  return new Map(records.map(r => [r.id, { ...points.get(r.id)!, sales: r.value ?? 0 }]));
}

/**
 * One month's Championship, person by person. The Arena's own boards decide
 * every place (`arenaRankings`), so the points can never disagree with what
 * the boards show.
 */
export function championshipMonth(input: ChampMonthInput): ChampMonth[] {
  const { month, people, brands, tiers, history, kpi } = input;
  const sales = boardPoints(arenaRankings(people, "sales"));
  const margin = boardPoints(arenaRankings(people, "margin"));
  const kpiBoard = kpi.enabled ? boardPoints(arenaRankings(people, "kpi")) : new Map<string, ChampPlace>();
  const brandSales = new Map(brands.map(code => [code, boardPoints(arenaRankings(people, "sales", code))]));
  const brandMargin = new Map(brands.map(code => [code, boardPoints(arenaRankings(people, "margin", code))]));
  const weeks = fairWeeks(month, history?.events ?? []);
  const records = recordPlaces(month, history);

  return people.map(person => {
    const active = person.sales > 0;
    const parts = Object.fromEntries(CHAMP_ITEMS.map(item => [item, emptyPart(item)])) as Record<ChampItem, ChampPart>;
    if (active) {
      const main = mainBrand(person, brands);

      const total = sales.get(person.id);
      if (total) parts.totalSales = { ...emptyPart("totalSales"), place: total.points, points: total.points, position: total.position, of: total.of };

      if (main) {
        const board = brandSales.get(main)!.get(person.id);
        if (board) parts.salesByBrand = { ...emptyPart("salesByBrand", brandName(main)), place: board.points, points: board.points, position: board.position, of: board.of };

        const mb = brandMargin.get(main)!.get(person.id);
        const score = person.brands[main];
        const pending = !!score && score.blindOrders > 0;
        const tier = brandTier(score, main, tiers);
        const bonus = tierBonus(tier?.bandKey);
        parts.marginByBrand = { ...emptyPart("marginByBrand", [brandName(main), tier?.label].filter(Boolean).join(" · ")),
          place: mb?.points ?? 0, bonus, points: round2((mb?.points ?? 0) + bonus), position: mb?.position ?? null, of: mb?.of ?? 0, pending };
      } else {
        parts.salesByBrand.note = "No brand";
        parts.marginByBrand.note = "No brand";
      }

      const tm = margin.get(person.id);
      const incentive = arenaIncentive(person, tiers);
      const earned = incentive.earned[0]?.bandKey ?? null;
      const bonus = tierBonus(earned);
      parts.totalMargin = { ...emptyPart("totalMargin", incentive.earned[0]?.label ?? ""), place: tm?.points ?? 0, bonus,
        points: round2((tm?.points ?? 0) + bonus), position: tm?.position ?? null, of: tm?.of ?? 0, pending: person.blindOrders > 0 };

      if (kpi.enabled) {
        const k = kpiBoard.get(person.id);
        const hit = kpi.threshold !== null && person.kpiQty >= kpi.threshold;
        const kBonus = hit ? CHAMP_KPI_BONUS : 0;
        parts.kpi = { ...emptyPart("kpi", hit ? "Threshold hit" : ""), place: k?.points ?? 0, bonus: kBonus,
          points: round2((k?.points ?? 0) + kBonus), position: k?.position ?? null, of: k?.of ?? 0 };
      } else {
        parts.kpi.note = "KPI not counted";
      }

      const w = weeks.get(person.id) ?? [];
      parts.fairResults = { ...emptyPart("fairResults", `${w.length} week${w.length === 1 ? "" : "s"}`),
        points: round2(w.reduce((sum, x) => sum + x.points, 0)), place: round2(w.reduce((sum, x) => sum + x.points, 0)), weeks: w };

      const rec = records.get(person.id);
      if (rec) parts.record = { ...emptyPart("record"), place: rec.points, points: rec.points, position: rec.position, of: rec.of };
    }
    const total = round2(CHAMP_ITEMS.reduce((sum, item) => sum + parts[item].points, 0));
    return { id: person.id, name: person.name, month, active, parts, total };
  });
}

export interface ChampStanding {
  id: string;
  name: string;
  total: number;
  position: number | null;
  parts: Record<ChampItem, number>;
  months: number;
}

/** A period's standings: the months added together (never averaged), then placed. */
export function championshipStandings(months: readonly ChampMonth[][]): ChampStanding[] {
  const byId = new Map<string, ChampStanding>();
  for (const month of months) {
    for (const row of month) {
      const s = byId.get(row.id) ?? { id: row.id, name: row.name, total: 0, position: null, months: 0,
        parts: Object.fromEntries(CHAMP_ITEMS.map(item => [item, 0])) as Record<ChampItem, number> };
      s.total = round2(s.total + row.total);
      if (row.active) s.months++;
      for (const item of CHAMP_ITEMS) s.parts[item] = round2(s.parts[item] + row.parts[item].points);
      byId.set(row.id, s);
    }
  }
  const rows = [...byId.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  let position = 0; let previous: number | null = null; let placed = 0;
  return rows.map(row => {
    if (row.total <= 0) return row;
    placed++;
    if (previous !== row.total) position = placed;
    previous = row.total;
    return { ...row, position };
  });
}
