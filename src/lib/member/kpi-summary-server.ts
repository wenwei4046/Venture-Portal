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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Insight › My team › a person (2026-11-03): that person's KPI items of a month, as their own Insight reads them — for a
 * member whose My team lists them. The member's own session; the database asks again (`member_team_kpi_summary`).
 * The Principal reads a person with View as's own context instead (`loadMemberKpiSummary`).
 */
export async function loadMemberTeamKpiSummary(schemeId: string, staffId: string, period?: string): Promise<MemberKpiSummaryOutcome> {
  try {
    const user = await getMemberUser();
    if (!user?.is_active || isPrincipalAccount(user) || !user.permissions.includes("member_insight")) {
      return { ok: false, error: "Insight is not enabled for this account." };
    }
    if (!UUID.test(schemeId) || !UUID.test(staffId)) return { ok: false, error: "Choose a member of your team." };
    if (period !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return { ok: false, error: "Choose a valid month." };
    }
    const client = await createClient() as unknown as SupabaseClient;
    const result = await client.rpc("member_team_kpi_summary", { p_staff: staffId, p_scheme: schemeId, p_period: period ?? null });
    if (result.error) return { ok: false, error: "KPI progress is temporarily unavailable. Please try again." };
    const data = readKpiSummary(result.data, schemeId);
    return data ? { ok: true, data } : { ok: false, error: "KPI progress is temporarily unavailable. Please try again." };
  } catch {
    return { ok: false, error: "KPI progress is temporarily unavailable. Please try again." };
  }
}
