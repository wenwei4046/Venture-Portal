import type { MemberData, MemberInsight, MemberOrgMap, MemberReadContext, MemberRequest, QuoteInput, QuoteResult } from "@/lib/member/types";
import type { RequestEvent } from "./profile/profile-model";
import { readClaimRates, type ClaimRates } from "@/lib/member/claim-rules";
import type { MemberIncome } from "@/lib/member/income";
import type { MemberHonours } from "@/lib/member/server";
import type { MemberKpiSummary } from "@/lib/member/kpi-summary";
import type { ArenaWindow, MemberArenaSnapshot } from "@/lib/member/arena";
import type { MemberInsightRange, MemberOrderBook } from "@/lib/member/order-book";
import { acknowledgeMemberMemo, calculateMemberQuote, cancelMemberRequest, fetchMemberClaimRates, fetchMemberHonours, fetchMemberIncome, fetchMemberInsight, fetchMemberInsightRange, fetchMemberOrderBook, fetchMemberOrgMap, fetchMemberRequestHistory, fetchPrincipalMemoReceipts, refreshMemberData, submitMemberRequest } from "@/app/(member)/member/actions";
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
  /** Mark a memo read (`ack` false) or acknowledge it — the member's own receipt. */
  memo(id: string, ack: boolean): Promise<Outcome<{ acknowledgedAt: string | null }>>;
  /** Who moved a request, when, and why. */
  requestHistory(id: string): Promise<Outcome<RequestEvent[]>>;
  submitRequest(form: FormData): Promise<Outcome<MemberRequest>>;
  /** Withdraw a request HR has not acted on yet. */
  cancelRequest(id: string): Promise<Outcome<MemberRequest>>;
  /** HR's fair-claim rates and regions. */
  claimRates(): Promise<Outcome<ClaimRates>>;
  /** My income: one month as Comm Cal works it out (live until the close), and the months paid. */
  income(subDepartmentId: string, period: string, context?: MemberReadContext): Promise<Outcome<MemberIncome>>;
  /** My honours: the member's finishes over a window of months, and which months are final. */
  honours(subDepartmentId: string, from: string, until: string, context?: MemberReadContext): Promise<Outcome<MemberHonours>>;
  /** View as: the viewed person's memo receipts. */
  memoReceipts(staffId: string): Promise<Outcome<{ memoId: string; readAt: string | null; acknowledgedAt: string | null }[]>>;
}

/** The design preview: reads nothing — its screens come from fixtures. */
const nothing = async () => ({ ok: false as const, error: "Preview data only." });
export const demoSource: RevenueSource = {
  refresh: nothing, insight: nothing, kpi: nothing, arena: nothing, orgMap: nothing, orderBook: nothing, insightRange: nothing, quote: nothing,
  memo: nothing, requestHistory: nothing, submitRequest: nothing, cancelRequest: nothing, claimRates: nothing, memoReceipts: nothing, income: nothing, honours: nothing,
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
  async memo(id, ack) {
    const result = await acknowledgeMemberMemo(id, ack);
    return result.ok ? { ok: true, data: { acknowledgedAt: result.data.acknowledgedAt } } : result;
  },
  requestHistory: id => fetchMemberRequestHistory(id),
  submitRequest: form => submitMemberRequest(form),
  cancelRequest: id => cancelMemberRequest(id),
  async claimRates() {
    const result = await fetchMemberClaimRates();
    return result.ok ? { ok: true, data: readClaimRates(result.data) } : result;
  },
  memoReceipts: staffId => fetchPrincipalMemoReceipts(staffId),
  income: (subDepartmentId, period, context) => fetchMemberIncome(subDepartmentId, period, context),
  honours: (subDepartmentId, from, until, context) => fetchMemberHonours(subDepartmentId, from, until, context),
};
