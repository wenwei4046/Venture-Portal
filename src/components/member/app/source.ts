import type { MemberData, MemberInsight, MemberOrgMap, MemberReadContext } from "@/lib/member/types";
import type { MemberKpiSummary } from "@/lib/member/kpi-summary";
import type { ArenaWindow, MemberArenaSnapshot } from "@/lib/member/arena";
import { fetchMemberInsight, fetchMemberOrgMap, refreshMemberData } from "@/app/(member)/member/actions";
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
  kpi(schemeId: string, context?: MemberReadContext): Promise<Outcome<MemberKpiSummary>>;
  arena(membershipId: string, period: string, window: ArenaWindow, context?: MemberReadContext): Promise<Outcome<MemberArenaSnapshot>>;
  orgMap(context?: Pick<MemberReadContext, "subDepartmentId">): Promise<Outcome<MemberOrgMap>>;
}

/** The design preview: reads nothing — its screens come from fixtures. */
const nothing = async () => ({ ok: false as const, error: "Preview data only." });
export const demoSource: RevenueSource = { refresh: nothing, insight: nothing, kpi: nothing, arena: nothing, orgMap: nothing };

export const liveSource: RevenueSource = {
  async refresh() {
    const result = await refreshMemberData();
    return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
  },
  insight: (period, context) => fetchMemberInsight(period, context),
  kpi: (schemeId, context) => fetchMemberKpiSummary(schemeId, context),
  arena: (membershipId, period, window, context) => fetchMemberArena(membershipId, period, window, context),
  orgMap: context => fetchMemberOrgMap(context),
};
