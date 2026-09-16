"use server";

import { loadMemberKpiSummary } from "@/lib/member/kpi-summary-server";
import type { MemberReadContext } from "@/lib/member/types";

export async function fetchMemberKpiSummary(schemeId: string, context?: MemberReadContext) {
  return loadMemberKpiSummary(schemeId, context);
}
