import { arenaMonthFridays, arenaWeekPicksToSave, type ArenaWeekBrand, type ArenaWeekLock, type ArenaWeekPicks } from "./arena";
import type { ArenaFairEvent } from "./arena-history";

/**
 * People › Member services › Brand weeks (2026-10-03): the back office's grid
 * of a department's month. A week closes seven days after its fair, and after
 * that only the ERP or the back office changes it (user: 除非是 ERP 那边改，或者
 * 是后台这边改) — and with no Revenue seller holding a member login yet, every
 * week is the back office's to set. `member_admin_brand_weeks` hands over the
 * month's weeks, the department's members, what is stored and the Fair results'
 * booth boards of those weeks; this reads them into one cell per member-week.
 */
export interface BrandWeeksAdminPerson {
  id: string;
  name: string;
  title: string | null;
  /** An active member login: without one only the back office can pick. */
  hasLogin: boolean;
  savedAt: string | null;
  /** Who last saved the month's picks (the account's name). */
  savedBy: string | null;
  /** The member saved them from their own account. */
  savedBySelf: boolean;
}

export interface BrandWeeksAdminSnapshot {
  period: string;
  subDepartmentId: string;
  asOf: string;
  weeks: ArenaWeekLock[];
  people: BrandWeeksAdminPerson[];
  /** By staff id: the stored picks, Friday → brand. */
  picks: Record<string, ArenaWeekPicks>;
  /** The booth boards of the month's weeks, as the member app ranks them. */
  events: ArenaFairEvent[];
}

/** One board a member wrote at in the week. */
export interface BrandWeekBooth {
  /** The booth's brand; null is a fair's no-brand board. */
  brand: string | null;
  venue: string;
  /** Deposit-cleared bills and their sales, as the board ranks them. */
  orders: number;
  sales: number;
  /** Sales still below the deposit: written there, not counted yet. */
  held: number;
  /** The one board this week whose place earns points. */
  scoring: boolean;
}

/**
 * picked — the member or the back office chose the brand;
 * unconfirmed — not picked, placed at the brand with the most bills while the week is open;
 * auto — not picked and the week has closed: auto-located for good;
 * none — not picked and nothing to place (no bills at a fair that week, or none with a brand).
 */
export type BrandWeekState = "picked" | "unconfirmed" | "auto" | "none";

export interface BrandWeekCell {
  week: string;
  pick: ArenaWeekBrand | null;
  state: BrandWeekState;
  /** The brand whose booth scores this week: the pick's, else the guess. Null: no booth scores. */
  scoringBrand: string | null;
  /** Picked a brand with no booth of it among the week's boards: none of their places scores. */
  pickedElsewhere: boolean;
  /** Most bills first. */
  booths: BrandWeekBooth[];
}

export interface BrandWeeksAdminRow {
  person: BrandWeeksAdminPerson;
  cells: BrandWeekCell[];
}

/** One row per member, one cell per week of the month. */
export function brandWeeksAdminRows(snapshot: BrandWeeksAdminSnapshot): BrandWeeksAdminRow[] {
  const locks = new Map(snapshot.weeks.map(lock => [lock.week, lock]));
  const weeks = snapshot.weeks.length ? snapshot.weeks.map(lock => lock.week) : arenaMonthFridays(snapshot.period);
  return snapshot.people.map(person => ({
    person,
    cells: weeks.map(week => {
      const booths: BrandWeekBooth[] = snapshot.events
        .filter(event => event.week === week)
        .flatMap(event => event.people
          .filter(row => row.id === person.id)
          .map(row => ({ brand: event.brand ?? null, venue: event.venue, orders: row.orders, sales: row.sales, held: row.held, scoring: row.scoring === true })))
        .sort((a, b) => b.orders - a.orders || b.sales - a.sales || (a.brand ?? "~").localeCompare(b.brand ?? "~"));
      const pick = snapshot.picks[person.id]?.[week] ?? null;
      const scoring = booths.find(booth => booth.scoring) ?? null;
      const locked = locks.get(week)?.locked === true;
      const state: BrandWeekState = pick ? "picked" : !scoring ? "none" : locked ? "auto" : "unconfirmed";
      return {
        week, pick, state,
        scoringBrand: scoring?.brand ?? null,
        pickedElsewhere: pick !== null && booths.length > 0 && !booths.some(booth => booth.brand === pick),
        booths,
      };
    }),
  }));
}

/**
 * What a save sends: each member whose draft differs from what is stored, with
 * their whole month as the store keeps it (picked weeks only).
 */
export function brandWeeksToSave(
  period: string,
  stored: Record<string, ArenaWeekPicks>,
  drafts: Record<string, ArenaWeekPicks>,
): Record<string, ArenaWeekPicks> {
  const weeks = arenaMonthFridays(period);
  return Object.fromEntries(Object.entries(drafts).flatMap(([staffId, draft]) => {
    const before = stored[staffId] ?? {};
    const changed = weeks.some(week => (draft[week] ?? null) !== (before[week] ?? null));
    return changed ? [[staffId, arenaWeekPicksToSave(period, draft)]] : [];
  }));
}

/** Week cells a draft changes, for the "N changes" count and the cells' marks. */
export function brandWeekChanges(
  period: string,
  stored: Record<string, ArenaWeekPicks>,
  drafts: Record<string, ArenaWeekPicks>,
): number {
  const weeks = arenaMonthFridays(period);
  return Object.entries(drafts).reduce((count, [staffId, draft]) => count
    + weeks.filter(week => (draft[week] ?? null) !== ((stored[staffId] ?? {})[week] ?? null)).length, 0);
}
