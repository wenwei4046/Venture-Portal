import { MONTHS_SHORT } from "../format";

/**
 * Insight's Month / Quarter / Year, and which month the app opens on.
 *
 * A month is LIVE until it is closed for the member on Comm Cal (mig
 * 20261004020000): its bills still count in it while the month is being
 * closed, so on 4 October September is still moving. The app opens on the
 * month just gone while it is still open and the member has bills in it — the
 * prototype's "today is 3 Oct, September is Live" — and on the current month
 * once it is closed (or for a member with nothing in it).
 */
export type PeriodKind = "monthly" | "quarterly" | "annual";

export interface InsightPeriod {
  kind: PeriodKind;
  /** 'YYYY-MM' — the first month in it. */
  from: string;
  /** 'YYYY-MM' — the last month in it (never past the current month). */
  through: string;
  /** `Sep 2026`, `Q3 2026`, `2026` — the date chip. */
  label: string;
  /** `Sep`, `Q3`, `2026` — the option's own label. */
  short: string;
}

export interface MonthState {
  /** First month the portal pays; earlier months were settled by hand. */
  paysFrom: string | null;
  /** Months closed for this member. */
  closed: readonly string[];
}

export function addMonths(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Still moving: the current month, or one the portal pays that is not closed for them yet. */
export function isLiveMonth(month: string, current: string, state: MonthState): boolean {
  if (month === current) return true;
  if (month > current) return false;
  return !!state.paysFrom && month >= state.paysFrom && !state.closed.includes(month);
}

/**
 * The month the app opens on: the month just gone while it is still live and
 * holds the member's bills, else the current month.
 */
export function workingMonth(current: string, state: MonthState, monthsWithBills: readonly string[]): string {
  const previous = addMonths(current, -1);
  return isLiveMonth(previous, current, state) && monthsWithBills.includes(previous) ? previous : current;
}

export function monthPeriod(month: string, current: string): InsightPeriod {
  const short = MONTHS_SHORT[Number(month.slice(5, 7)) - 1];
  return { kind: "monthly", from: month, through: month <= current ? month : current, label: `${short} ${month.slice(0, 4)}`, short };
}

export function quarterPeriod(year: number, q: number, current: string): InsightPeriod {
  const from = `${year}-${String((q - 1) * 3 + 1).padStart(2, "0")}`;
  const last = addMonths(from, 2);
  return { kind: "quarterly", from, through: last <= current ? last : current, label: `Q${q} ${year}`, short: `Q${q}` };
}

export function yearPeriod(year: number, current: string): InsightPeriod {
  const last = `${year}-12`;
  return { kind: "annual", from: `${year}-01`, through: last <= current ? last : current, label: String(year), short: String(year) };
}

/** Which period of a kind holds a month. */
export function periodOf(kind: PeriodKind, month: string, current: string): InsightPeriod {
  const year = Number(month.slice(0, 4));
  if (kind === "monthly") return monthPeriod(month, current);
  if (kind === "quarterly") return quarterPeriod(year, Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1, current);
  return yearPeriod(year, current);
}

export interface PeriodOption {
  period: InsightPeriod;
  /** `Live`, the year, or nothing (a past year). */
  sub: string;
  live: boolean;
}

/**
 * The date sheet's choices: this year's months so far, this year's quarters so
 * far, and last year and this one — the prototype's grid.
 */
export function periodOptions(kind: PeriodKind, current: string, state: MonthState): PeriodOption[] {
  const year = Number(current.slice(0, 4));
  if (kind === "monthly") {
    const last = Number(current.slice(5, 7));
    return Array.from({ length: last }, (_, i) => {
      const month = `${year}-${String(i + 1).padStart(2, "0")}`;
      const live = isLiveMonth(month, current, state);
      return { period: monthPeriod(month, current), sub: live ? "Live" : String(year), live };
    });
  }
  if (kind === "quarterly") {
    const lastQ = Math.floor((Number(current.slice(5, 7)) - 1) / 3) + 1;
    return Array.from({ length: lastQ }, (_, i) => {
      const period = quarterPeriod(year, i + 1, current);
      const live = i + 1 === lastQ;
      return { period, sub: live ? "Live" : String(year), live };
    });
  }
  return [year - 1, year].map(y => ({ period: yearPeriod(y, current), sub: y === year ? "Live" : "", live: y === year }));
}
