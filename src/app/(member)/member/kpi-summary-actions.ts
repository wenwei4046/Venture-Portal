"use server";

import { loadMemberKpiSummary } from "@/lib/member/kpi-summary-server";

export async function fetchMemberKpiSummary(schemeId: string) {
  return loadMemberKpiSummary(schemeId);
}
