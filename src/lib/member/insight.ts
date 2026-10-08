/**
 * Insight — the arithmetic behind the member app's third tab.
 *
 * The database hands over raw facts: deposit-cleared revenue, the
 * revenue/cost pair a margin is taken from, a streak of monthly sales, a flat
 * list of downline rows. Everything a salesperson actually reads off the
 * screen — their blended margin, their position on the board, how far 100k
 * still is, which orders sit in which margin band, what each branch of their
 * team is worth — is derived here.
 *
 * Pure, so the three screens can stay dumb and the rules that matter can be
 * tested without a database: a leaderboard that mis-ranks a tie, or a margin
 * quietly averaged over the orders that happen to have costs, is the kind of
 * bug nobody reports and everybody stops trusting the page over.
 */

import { bandFor } from "./calculator";
import type {
  MemberBand,
  MemberBoardRow,
  MemberDownlineRow,
  MemberInsightOrder,
  MemberScore,
  MemberTarget,
} from "./types";

/**
 * Blended margin across the orders that HAVE one, as a percentage.
 *
 * Null when no cleared order carried a usable margin — which is a different
 * statement from 0%, and the UI must not round the two together. `blindOrders`
 * says how many orders this figure could not see.
 */
export function blendedMargin(score: Pick<MemberScore, "marginRevenue" | "marginCost">): number | null {
  if (!(score.marginRevenue > 0)) return null;
  return ((score.marginRevenue - score.marginCost) / score.marginRevenue) * 100;
}

/** Every number in a set of scores, added up. Used for a branch and for a board. */
export function totalScore(rows: readonly MemberScore[]): MemberScore {
  return rows.reduce<MemberScore>(
    (sum, row) => ({
      staffId: "",
      sales: sum.sales + row.sales,
      held: sum.held + row.held,
      orders: sum.orders + row.orders,
      kpiQty: sum.kpiQty + row.kpiQty,
      marginRevenue: sum.marginRevenue + row.marginRevenue,
      marginCost: sum.marginCost + row.marginCost,
      blindOrders: sum.blindOrders + row.blindOrders,
      lastOrder:
        !sum.lastOrder || (row.lastOrder && row.lastOrder > sum.lastOrder)
          ? (row.lastOrder ?? sum.lastOrder)
          : sum.lastOrder,
    }),
    {
      staffId: "",
      sales: 0,
      held: 0,
      orders: 0,
      kpiQty: 0,
      marginRevenue: 0,
      marginCost: 0,
      blindOrders: 0,
      lastOrder: null,
    },
  );
}

export interface RankedRow extends MemberBoardRow {
  /** 1-based. Standard competition ranking: a tie shares a place and the next one skips. */
  position: number;
  /** Sales of the person one place above. Null at the top. */
  chasing: number | null;
}

/**
 * The board, highest sales first.
 *
 * Two people on the same revenue are equally first, and the person behind
 * them is third — the alternative, breaking the tie on something arbitrary
 * like a name, tells one of them they are losing when they are not. Ties are
 * cheap to produce here: everybody with no sales yet is on 0.
 */
export function rankBoard(rows: readonly MemberBoardRow[]): RankedRow[] {
  const sorted = [...rows].sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
  let position = 0;
  let previous: number | null = null;
  return sorted.map((row, index) => {
    if (previous === null || row.sales !== previous) position = index + 1;
    previous = row.sales;
    return { ...row, position, chasing: index === 0 ? null : sorted[index - 1].sales };
  });
}

export interface GateProgress {
  /** What has to be reached. */
  target: number;
  current: number;
  /** Still to go, never negative. 0 once the gate is cleared. */
  gap: number;
  /** Capped at 100 for a progress bar; `ratio` is the uncapped share. */
  percent: number;
  ratio: number;
  met: boolean;
}

/** Where somebody stands against one threshold. Null when the rung carries no such gate. */
export function gateProgress(current: number, target: number | null | undefined): GateProgress | null {
  if (target === null || target === undefined || !(target > 0)) return null;
  const ratio = current / target;
  return {
    target,
    current,
    gap: Math.max(0, target - current),
    percent: Math.min(100, Math.max(0, Math.round(ratio * 100))),
    ratio,
    met: current + 1e-9 >= target,
  };
}

export interface StreakSummary {
  /** How many months in a row the gate wants, this one included. */
  months: number;
  /** How many of them are already met. */
  met: number;
  /** Met months BEFORE this one — the part already banked. */
  banked: number;
  /** This month, which is still moving. */
  live: { period: string; sales: number; met: boolean } | null;
  /** Every month met, so the rung is earned once this month closes. */
  complete: boolean;
}

/**
 * The 100k gate is 100k in `months` months RUNNING (mig 20260903040000), not
 * 100k once. Somebody at 96k with an unmet month behind them is further away
 * than the single gap suggests, and the screen has to be able to say so.
 */
export function streakSummary(target: MemberTarget | null | undefined): StreakSummary | null {
  const streak = target?.streak;
  if (!target || !streak?.length) return null;
  const live = streak.find((m) => m.live) ?? null;
  return {
    months: target.months ?? streak.length,
    met: streak.filter((m) => m.met).length,
    banked: streak.filter((m) => m.met && !m.live).length,
    live: live && { period: live.period, sales: live.sales, met: live.met },
    complete: streak.every((m) => m.met),
  };
}

export interface MarginLevel {
  label: string;
  tone: "good" | "warning" | "danger" | "neutral";
  /** What a bill in this band does to commission: 1 = nothing. */
  multiplier: number;
  orders: MemberInsightOrder[];
  revenue: number;
}

/**
 * Every order sorted into the margin band it falls in, for its own brand.
 *
 * Bands are per brand, so an order is always read against its own brand's
 * ladder — grouping across brands by percentage alone would put a 30% Akemi
 * bill and a 30% Zanotti bill in the same bucket when their brands disagree
 * about what 30% is worth. Worst bands first: a page about margin should open
 * on the bills that are costing money.
 */
export function marginLevels(
  orders: readonly MemberInsightOrder[],
  bands: readonly MemberBand[],
): MarginLevel[] {
  const levels = new Map<string, MarginLevel>();
  for (const order of orders) {
    const band = bandFor(
      order.margin,
      bands.filter((b) => b.brand === order.brand),
    );
    const level = levels.get(band.label) ?? {
      label: band.label,
      tone: band.tone,
      multiplier: band.multiplier,
      orders: [],
      revenue: 0,
    };
    level.orders.push(order);
    level.revenue += order.revenue;
    levels.set(band.label, level);
  }
  const rank = { danger: 0, warning: 1, neutral: 2, good: 3 } as const;
  return [...levels.values()].sort(
    (a, b) => a.multiplier - b.multiplier || rank[a.tone] - rank[b.tone] || b.revenue - a.revenue,
  );
}

export interface DownlineBranch {
  /** The direct report this branch hangs from. */
  leader: MemberDownlineRow;
  /** Everybody under them, deeper first-to-last, the leader excluded. */
  members: MemberDownlineRow[];
  /** Leader + members. What an override is actually earned on. */
  total: MemberScore;
}

/**
 * The downline as branches, one per direct report.
 *
 * A flat list answers "who sold what"; an upline's real question is "which of
 * my legs is carrying this month", and that is the leg total — the direct
 * report plus everybody under them. Anybody whose upline is missing from the
 * list (a row deeper than the walk returned, or a line edited mid-read) is
 * placed as a branch of their own rather than dropped: an incomplete team is
 * better than a silently shortened one.
 */
export function downlineBranches(rows: readonly MemberDownlineRow[]): DownlineBranch[] {
  const byId = new Map(rows.map((r) => [r.staffId, r]));
  const children = new Map<string, MemberDownlineRow[]>();
  const leaders: MemberDownlineRow[] = [];
  for (const row of [...rows].sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name))) {
    const parent = row.uplineId && byId.has(row.uplineId) ? row.uplineId : null;
    if (row.depth === 1 || !parent) leaders.push(row);
    else children.set(parent, [...(children.get(parent) ?? []), row]);
  }
  return leaders
    .map((leader) => {
      const members: MemberDownlineRow[] = [];
      const walk = (id: string, seen: Set<string>) => {
        for (const child of children.get(id) ?? []) {
          if (seen.has(child.staffId)) continue;
          seen.add(child.staffId);
          members.push(child);
          walk(child.staffId, seen);
        }
      };
      walk(leader.staffId, new Set([leader.staffId]));
      return { leader, members, total: totalScore([leader, ...members]) };
    })
    .sort((a, b) => b.total.sales - a.total.sales || a.leader.name.localeCompare(b.leader.name));
}

/**
 * A moment's calendar fields as the office reads them (UTC+8): `getUTC*` on
 * the result is the office's year, month and day. Read straight off the
 * moment they were UTC's — a day behind until 08:00, a month behind on the 1st.
 */
const officeCalendar = (at: Date) => new Date(at.getTime() + 8 * 3_600_000);

/** Days since somebody's last cleared order. Null when they have never had one. */
export function daysSince(last: string | null, today: Date = new Date()): number | null {
  if (!last) return null;
  const then = new Date(`${last}T00:00:00Z`);
  if (!Number.isFinite(then.getTime())) return null;
  const office = officeCalendar(today);
  const now = Date.UTC(office.getUTCFullYear(), office.getUTCMonth(), office.getUTCDate());
  return Math.max(0, Math.round((now - then.getTime()) / 86400000));
}

/**
 * How a downline row reads at a glance.
 *
 * `quiet` is deliberately not called "underperforming": the app is read by
 * the person's own upline, and a fortnight without a cleared order is a
 * prompt to ask, not a verdict.
 */
export type DownlineSignal = "leading" | "steady" | "quiet" | "none";
export function downlineSignal(
  row: MemberScore,
  board: { median: number },
  today?: Date,
): DownlineSignal {
  if (!row.orders) return "none";
  const idle = daysSince(row.lastOrder, today);
  if (idle !== null && idle >= 14) return "quiet";
  return row.sales >= board.median ? "leading" : "steady";
}

/** The middle of a board, for reading one person against the rest. */
export function medianSales(rows: readonly { sales: number }[]): number {
  if (!rows.length) return 0;
  const sorted = [...rows].map((r) => r.sales).sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export interface MonthPace {
  /** Days of the month already gone, this one included. Never 0. */
  elapsed: number;
  days: number;
  /** Where this month lands if the rest of it goes like the part that has passed. */
  projected: number;
}

/**
 * The month's run rate.
 *
 * A gap to a target means little on the 3rd and a great deal on the 27th, so
 * the screen says where today's pace lands rather than leaving the reader to
 * divide in their head. Only ever shown for the month still running: a closed
 * month has no pace, it has a result.
 */
export function monthPace(sales: number, period: string, now: Date = new Date()): MonthPace | null {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const office = officeCalendar(now);
  const sameMonth = office.getUTCFullYear() === year && office.getUTCMonth() + 1 === month;
  const elapsed = sameMonth ? Math.min(days, Math.max(1, office.getUTCDate())) : days;
  // A finished month has a result, not a projection — and dividing then
  // multiplying by the same number would only add float noise to it.
  return { elapsed, days, projected: elapsed >= days ? sales : (sales / elapsed) * days };
}
