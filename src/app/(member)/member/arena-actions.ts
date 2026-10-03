"use server";

import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrincipalAccount } from "@/lib/view-as";
import { principalReadContext } from "@/lib/member/read-access";
import type { MemberReadContext } from "@/lib/member/types";
import { arenaWeekPicksToSave, validArenaWeekPicks, type ArenaWindow, type ArenaWeekPicks, type MemberArenaSnapshot } from "@/lib/member/arena";
import type { ArenaHistorySnapshot } from "@/lib/member/arena-history";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validPeriod(period: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(period); }
async function client(context?: MemberReadContext, write = false) {
  const user = await getMemberUser();
  if (!user?.is_active || (!isPrincipalAccount(user) && !user.permissions.includes("member_insight"))) throw new Error("Arena is not enabled for this account.");
  if (write && isPrincipalAccount(user)) throw new Error("Brand weeks can only be saved by the member from their own account.");
  const principal = principalReadContext(user, context);
  return { db: (await createClient()) as unknown as SupabaseClient, principal };
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Arena could not be loaded. Please try again.";
  return { ok: false as const, error: /schema cache|does not exist|could not find|SUPABASE_|JWT|permission denied for/i.test(message)
    ? "Arena setup is not complete. Your administrator needs to enable the live ranking service." : message.slice(0, 250) };
}
export async function fetchMemberArena(membershipId: string, period: string, window: ArenaWindow, context?: MemberReadContext) {
  try {
    if (!uuid.test(membershipId) || !validPeriod(period) || !["monthly", "quarterly", "annual"].includes(window)) throw new Error("Choose a valid department and period.");
    if (context && context.subDepartmentId !== membershipId) throw new Error("Choose a member in the selected department.");
    const { db, principal } = await client(context);
    const { data, error } = await db.rpc(principal ? "member_principal_arena_snapshot" : "member_arena_snapshot", {
      p_sub_department: membershipId, p_period: period, p_window: window,
      ...(principal ? { p_staff: context!.staffId } : {}),
    });
    if (error) throw new Error(error.message);
    if (!data || !Array.isArray(data.people)) throw new Error("Arena information is temporarily unavailable.");
    const snapshot = data as MemberArenaSnapshot;
    // A history rollout cannot take away the existing sales/margin/KPI boards.
    // Both reads retain the same explicitly authorized employee/Principal scope.
    // Booth by booth since 2026-10-03: one board per brand's booth at a fair,
    // each seller at the booth of the brand they picked for that week.
    const history = await db.rpc(principal ? "member_principal_arena_booth_history" : "member_arena_booth_history", {
      p_sub_department: membershipId,
      ...(principal ? { p_staff: context!.staffId } : {}),
    });
    if (!history.error && history.data && Array.isArray(history.data.events)) {
      snapshot.history = history.data as ArenaHistorySnapshot;
    } else {
      snapshot.historyError = "Fair results are not available yet. Your sales, margin and KPI rankings are up to date.";
    }
    return { ok: true as const, data: snapshot };
  } catch (error) { return failure(error); }
}
/**
 * The back office sets a member's brand weeks (2026-10-03, user: after 一个星期
 * 后就不能再改了，除非是 ERP 那边改，或者是后台这边改): any week, closed ones
 * too. An actual Principal account, checked again by the RPC.
 */
export async function savePrincipalArenaBrandWeeks(membershipId: string, period: string, picks: ArenaWeekPicks, context: MemberReadContext) {
  try {
    if (!uuid.test(membershipId) || !validPeriod(period) || !validArenaWeekPicks(period, picks)) throw new Error("Pick Akemi, Dunlopillo, Zanotti or Ergotex for the weeks of this month.");
    if (context.subDepartmentId !== membershipId) throw new Error("Choose a member in the selected department.");
    const { db, principal } = await client(context);
    if (!principal) throw new Error("Only the back office can change another member's brand weeks.");
    const { error } = await db.rpc("member_principal_save_brand_week_picks", {
      p_staff: context.staffId, p_sub_department: membershipId, p_period: period, p_picks: arenaWeekPicksToSave(period, picks),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  } catch (error) { return failure(error); }
}

/** The brand the member worked each week of the month (2026-10-03): their own row only, closed weeks as they are. */
export async function saveMemberArenaBrandWeeks(membershipId: string, period: string, picks: ArenaWeekPicks) {
  try {
    if (!uuid.test(membershipId) || !validPeriod(period) || !validArenaWeekPicks(period, picks)) throw new Error("Pick Akemi, Dunlopillo, Zanotti or Ergotex for the weeks of this month.");
    const { db } = await client(undefined, true);
    const { error } = await db.rpc("member_arena_save_brand_week_picks", { p_sub_department: membershipId, p_period: period, p_picks: arenaWeekPicksToSave(period, picks) });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  } catch (error) { return failure(error); }
}
