import type { MemberData, MemberInsight, MemberOrgMap, MemberReadContext, QuoteInput, QuoteResult } from "@/lib/member/types";
import type { MemberKpiSummary } from "@/lib/member/kpi-summary";
import type { ArenaWindow, MemberArenaSnapshot } from "@/lib/member/arena";
import type { MemberInsightRange, MemberOrderBook } from "@/lib/member/order-book";
import { calculateMemberQuote, fetchMemberInsight, fetchMemberInsightRange, fetchMemberOrderBook, fetchMemberOrgMap, refreshMemberData } from "@/app/(member)/member/actions";
import { fetchMemberArena } from "@/app/(member)/member/arena-actions";
import { fetchMemberKpiSummary } from "@/app/(member)/member/kpi-summary-actions";

export type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Where the app's numbers come from. The live app reads the database through
 * the member server actions; the design preview hands the same shapes from
 * fixtures, so both run the very same screens and models.
 */
export interface RevenueSource {
  refresh(): Promise<Outcome<MemberData>>;
  insight(period: string | undefined, context?: MemberReadContext): Promise<Outcome<MemberInsight>>;
  /** KPI items of a month ('YYYY-MM'); absent = the current month. */
  kpi(schemeId: string, context?: MemberReadContext, period?: string): Promise<Outcome<MemberKpiSummary>>;
  /** `history: false` leaves the booth history out (the Championship's months). */
  arena(membershipId: string, period: string, window: ArenaWindow, context?: MemberReadContext, options?: { history?: boolean }): Promise<Outcome<MemberArenaSnapshot>>;
  orgMap(context?: Pick<MemberReadContext, "subDepartmentId">): Promise<Outcome<MemberOrgMap>>;
  /** One member's bills, line by line, from one month to another (inclusive). */
  orderBook(subDepartmentId: string, from: string, until: string, context?: MemberReadContext): Promise<Outcome<MemberOrderBook>>;
  /** The member and their team over a quarter or a year. */
  insightRange(subDepartmentId: string, from: string, until: string, context?: MemberReadContext): Promise<Outcome<MemberInsightRange>>;
  /** A cart's margin at a price — priced on the server; no cost ever comes back. */
  quote(input: QuoteInput): Promise<Outcome<QuoteResult>>;
}

/** The design preview: reads nothing — its screens come from fixtures. */
const nothing = async () => ({ ok: false as const, error: "Preview data only." });
export const demoSource: RevenueSource = {
  refresh: nothing, insight: nothing, kpi: nothing, arena: nothing, orgMap: nothing, orderBook: nothing, insightRange: nothing, quote: nothing,
};

export const liveSource: RevenueSource = {
  async refresh() {
    const result = await refreshMemberData();
    return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
  },
  insight: (period, context) => fetchMemberInsight(period, context),
  kpi: (schemeId, context, period) => fetchMemberKpiSummary(schemeId, context, period),
  arena: (membershipId, period, window, context, options) => fetchMemberArena(membershipId, period, window, context, options),
  orgMap: context => fetchMemberOrgMap(context),
  orderBook: (subDepartmentId, from, until, context) => fetchMemberOrderBook(subDepartmentId, from, until, context),
  insightRange: (subDepartmentId, from, until, context) => fetchMemberInsightRange(subDepartmentId, from, until, context),
  quote: input => calculateMemberQuote(input),
};
