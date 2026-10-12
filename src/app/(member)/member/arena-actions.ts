"use server";

import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrincipalAccount } from "@/lib/view-as";
import { principalReadContext } from "@/lib/member/read-access";
import type { MemberReadContext } from "@/lib/member/types";
import { arenaWeeksSoFar, type ArenaWindow, type MemberArenaSnapshot } from "@/lib/member/arena";
import type { ArenaHistorySnapshot } from "@/lib/member/arena-history";
import { officeToday } from "@/lib/office-time";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validPeriod(period: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(period); }
async function client(context?: MemberReadContext) {
  const user = await getMemberUser();
  if (!user?.is_active || (!isPrincipalAccount(user) && !user.permissions.includes("member_insight"))) throw new Error("Arena is not enabled for this account.");
  const principal = principalReadContext(user, context);
  return { db: (await createClient()) as unknown as SupabaseClient, principal };
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Arena could not be loaded. Please try again.";
  return { ok: false as const, error: /schema cache|does not exist|could not find|SUPABASE_|JWT|permission denied for/i.test(message)
    ? "Arena setup is not complete. Your administrator needs to enable the live ranking service." : message.slice(0, 250) };
}
export async function fetchMemberArena(membershipId: string, period: string, window: ArenaWindow, context?: MemberReadContext,
  options: { history?: boolean } = {}) {
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
    // The Championship reads a month at a time and needs the fairs only once.
    if (options.history === false) return { ok: true as const, data: snapshot };
    // A history rollout cannot take away the existing sales/margin/KPI boards.
    // Both reads retain the same explicitly authorized employee/Principal scope.
    // Booth by booth since 2026-10-03: one board per brand's booth at a fair,
    // each seller scoring at their brand week's booth — since 2026-10-12 the
    // one the ERP's Sales Attending lists them at, else the most bills. The
    // read carries the person's own brand weeks too (`weeks`).
    const history = await db.rpc(principal ? "member_principal_arena_booth_history" : "member_arena_booth_history", {
      p_sub_department: membershipId,
      ...(principal ? { p_staff: context!.staffId } : {}),
    });
    if (!history.error && history.data && Array.isArray(history.data.events)) {
      const read = history.data as ArenaHistorySnapshot;
      // This week's brand week and the ones before it reach the phone, never a later weekend the
      // ERP already lists them at (the user, 2026-10-12: "they only view their current and previous
      // assign, but not future"). Today's week card and My brand weeks show no more than that.
      snapshot.history = read.weeks ? { ...read, weeks: arenaWeeksSoFar(read.weeks, officeToday()) } : read;
    } else {
      snapshot.historyError = "Fair results are not available yet. Your sales, margin and KPI rankings are up to date.";
    }
    return { ok: true as const, data: snapshot };
  } catch (error) { return failure(error); }
}
