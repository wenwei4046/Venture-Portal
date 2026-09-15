import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readKpiSummary, type MemberKpiSummaryOutcome } from "./kpi-summary";

/** The authenticated RPC resolves staff identity; no staff ID crosses this boundary. */
export async function loadMemberKpiSummary(schemeId: string): Promise<MemberKpiSummaryOutcome> {
  try {
    const user = await getUser();
    if (!user?.is_active || !user.permissions.includes("member_portal")) {
      return { ok: false, error: "Member portal access is required." };
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(schemeId)) {
      return { ok: false, error: "Choose an active membership." };
    }
    const client = await createClient() as unknown as SupabaseClient;
    const result = await client.rpc("member_kpi_summary", { p_scheme: schemeId });
    if (result.error) return { ok: false, error: "KPI progress is temporarily unavailable. Please try again." };
    const data = readKpiSummary(result.data, schemeId);
    return data ? { ok: true, data } : { ok: false, error: "KPI progress is temporarily unavailable. Please try again." };
  } catch {
    return { ok: false, error: "KPI progress is temporarily unavailable. Please try again." };
  }
}
