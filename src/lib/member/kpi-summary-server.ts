import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readKpiSummary, type MemberKpiSummaryOutcome } from "./kpi-summary";
import { principalReadContext } from "./read-access";
import { isPrincipalAccount } from "@/lib/view-as";
import type { MemberReadContext } from "./types";

/**
 * Employees stay self-scoped; Principal reads require an explicit, independently authorized context.
 * `period` ('YYYY-MM') reads that month; absent = the current month.
 */
export async function loadMemberKpiSummary(schemeId: string, context?: MemberReadContext, period?: string): Promise<MemberKpiSummaryOutcome> {
  try {
    const user = await getMemberUser();
    if (!user?.is_active || (!isPrincipalAccount(user) && !user.permissions.includes("member_portal"))) {
      return { ok: false, error: "Member portal access is required." };
    }
    const principal = principalReadContext(user, context);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(schemeId)) {
      return { ok: false, error: "Choose an active membership." };
    }
    if (period !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return { ok: false, error: "Choose a valid month." };
    }
    const client = await createClient() as unknown as SupabaseClient;
    const result = await client.rpc(principal ? "member_principal_kpi_summary" : "member_kpi_summary", {
      p_scheme: schemeId, ...(principal ? { p_staff: context!.staffId } : {}), ...(period ? { p_period: period } : {}),
    });
    if (result.error) return { ok: false, error: "KPI progress is temporarily unavailable. Please try again." };
    const data = readKpiSummary(result.data, schemeId);
    return data ? { ok: true, data } : { ok: false, error: "KPI progress is temporarily unavailable. Please try again." };
  } catch {
    return { ok: false, error: "KPI progress is temporarily unavailable. Please try again." };
  }
}
