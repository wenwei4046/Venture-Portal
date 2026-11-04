"use server";

import { loadMemberKpiSummary, loadMemberTeamKpiSummary } from "@/lib/member/kpi-summary-server";
import type { MemberReadContext } from "@/lib/member/types";

export async function fetchMemberKpiSummary(schemeId: string, context?: MemberReadContext, period?: string) {
  return loadMemberKpiSummary(schemeId, context, period);
}

/** Insight › My team › a person (2026-11-03): their KPI items, for a member whose My team lists them. */
export async function fetchMemberTeamKpiSummary(schemeId: string, staffId: string, period?: string) {
  return loadMemberTeamKpiSummary(schemeId, staffId, period);
}
