import { arenaMonthFridays, type ArenaWeekLock } from "./arena";
import type { ArenaFairEvent } from "./arena-history";

/**
 * People › Member services › Brand weeks: a department's month, one cell per
 * member-week. Since 2026-10-12 it only READS — a brand week comes from the
 * Houzs ERP (user: "1 layer is use track by erp houzs, if fail, then go with
 * auto detect, same engine with previous one"): the booth its Sales Attending
 * lists the member at for that weekend, else the booth they wrote the most
 * bills at. Nobody picks one, here or in the app; a wrong one is fixed in the
 * ERP. `member_admin_brand_weeks` hands over the month's weeks, the members,
 * where the ERP lists each, and the Fair results' booth boards of those weeks.
 */
export interface BrandWeeksAdminPerson {
  id: string;
  name: string;
  title: string | null;
  /** An active member login. */
  hasLogin: boolean;
}

/** The booth the ERP's Sales Attending lists a member at for one weekend. */
export interface BrandWeekErp {
  brand: string | null;
  venue: string | null;
  organizer: string | null;
  start: string | null;
  end: string | null;
  /** Listed at this many booths that weekend; the one with the most of their bills counts. */
  booths: number | null;
  /** The portal's fair for the booth; null until a bill is written there. */
  fairId: string | null;
}

export interface BrandWeeksAdminSnapshot {
  period: string;
  subDepartmentId: string;
  asOf: string;
  /** When the ERP last sent its Sales Attending; null if it never has. */
  erpReceivedAt?: string | null;
  weeks: ArenaWeekLock[];
  people: BrandWeeksAdminPerson[];
  /** By staff id, then Friday: where the ERP lists them. */
  erp?: Record<string, Record<string, BrandWeekErp>>;
  /** Names the ERP lists at a booth of the month that the portal cannot match to a member. */
  unlisted?: string[];
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
 * erp — the ERP's Sales Attending lists them at a booth that weekend (the first layer);
 * auto — it lists them nowhere, so the booth they wrote the most bills at counts (the second);
 * none — neither: no bills at a fair that weekend.
 */
export type BrandWeekState = "erp" | "auto" | "none";

export interface BrandWeekCell {
  week: string;
  state: BrandWeekState;
  /** The brand of the booth that counts this weekend. Null: none does. */
  brand: string | null;
  /** Where the ERP lists them, when it does. */
  erp: BrandWeekErp | null;
  /** The ERP lists them, but none of their bills is at that booth: no place of theirs scores. */
  soldElsewhere: boolean;
  /** Most bills first. */
  booths: BrandWeekBooth[];
}

export interface BrandWeeksAdminRow {
  person: BrandWeeksAdminPerson;
  cells: BrandWeekCell[];
}

/** One row per member, one cell per week of the month. */
export function brandWeeksAdminRows(snapshot: BrandWeeksAdminSnapshot): BrandWeeksAdminRow[] {
  const weeks = snapshot.weeks.length ? snapshot.weeks.map(lock => lock.week) : arenaMonthFridays(snapshot.period);
  return snapshot.people.map(person => ({
    person,
    cells: weeks.map((week): BrandWeekCell => {
      const booths: BrandWeekBooth[] = snapshot.events
        .filter(event => event.week === week)
        .flatMap(event => event.people
          .filter(row => row.id === person.id)
          .map(row => ({ brand: event.brand ?? null, venue: event.venue, orders: row.orders, sales: row.sales, held: row.held, scoring: row.scoring === true })))
        .sort((a, b) => b.orders - a.orders || b.sales - a.sales || (a.brand ?? "~").localeCompare(b.brand ?? "~"));
      const erp = snapshot.erp?.[person.id]?.[week] ?? null;
      const scoring = booths.find(booth => booth.scoring) ?? null;
      if (erp) {
        return { week, state: "erp", brand: erp.brand, erp, soldElsewhere: booths.length > 0 && !scoring, booths };
      }
      return { week, state: scoring ? "auto" : "none", brand: scoring?.brand ?? null, erp: null, soldElsewhere: false, booths };
    }),
  }));
}
