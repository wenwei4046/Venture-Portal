import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readKpiSummary, type MemberKpiSummaryOutcome } from "./kpi-summary";
import { principalReadContext } from "./read-access";
import { isPrincipalAccount } from "@/lib/view-as";
import type { MemberReadContext } from "./types";

/** Employees stay self-scoped; Principal reads require an explicit, independently authorized context. */
export async function loadMemberKpiSummary(schemeId: string, context?: MemberReadContext): Promise<MemberKpiSummaryOutcome> {
  try {
    const user = await getUser();
    if (!user?.is_active || (!isPrincipalAccount(user) && !user.permissions.includes("member_portal"))) {
      return { ok: false, error: "Member portal access is required." };
    }
    const principal = principalReadContext(user, context);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(schemeId)) {
      return { ok: false, error: "Choose an active membership." };
    }
    const client = await createClient() as unknown as SupabaseClient;
    const result = await client.rpc(principal ? "member_principal_kpi_summary" : "member_kpi_summary", {
      p_scheme: schemeId, ...(principal ? { p_staff: context!.staffId } : {}),
    });
    if (result.error) return { ok: false, error: "KPI progress is temporarily unavailable. Please try again." };
    const data = readKpiSummary(result.data, schemeId);
    return data ? { ok: true, data } : { ok: false, error: "KPI progress is temporarily unavailable. Please try again." };
  } catch {
    return { ok: false, error: "KPI progress is temporarily unavailable. Please try again." };
  }
}
