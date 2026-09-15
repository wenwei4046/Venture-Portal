"use server";

import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validArenaBrandWeeks, type ArenaWindow, type ArenaBrandWeeks, type MemberArenaSnapshot } from "@/lib/member/arena";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validPeriod(period: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(period); }
async function client() {
  const user = await getUser();
  if (!user?.is_active || !user.permissions.includes("member_insight")) throw new Error("Arena is not enabled for this account.");
  return (await createClient()) as unknown as SupabaseClient;
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Arena could not be loaded. Please try again.";
  return { ok: false as const, error: /schema cache|does not exist|could not find|SUPABASE_|JWT|permission denied for/i.test(message)
    ? "Arena setup is not complete. Your administrator needs to enable the live ranking service." : message.slice(0, 250) };
}
export async function fetchMemberArena(membershipId: string, period: string, window: ArenaWindow) {
  try {
    if (!uuid.test(membershipId) || !validPeriod(period) || !["monthly", "quarterly", "annual"].includes(window)) throw new Error("Choose a valid department and period.");
    const db = await client();
    const { data, error } = await db.rpc("member_arena_snapshot", { p_sub_department: membershipId, p_period: period, p_window: window });
    if (error) throw new Error(error.message);
    if (!data || !Array.isArray(data.people)) throw new Error("Arena information is temporarily unavailable.");
    return { ok: true as const, data: data as MemberArenaSnapshot };
  } catch (error) { return failure(error); }
}
export async function saveMemberArenaBrandWeeks(membershipId: string, period: string, value: ArenaBrandWeeks) {
  try {
    if (!uuid.test(membershipId) || !validPeriod(period) || !validArenaBrandWeeks(value)) throw new Error("Brand weeks must add up to the selected 4 or 5 weeks.");
    const db = await client();
    const { error } = await db.rpc("member_arena_save_brand_weeks", { p_sub_department: membershipId, p_period: period, p_weeks: value.weeks, p_counts: value.counts });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  } catch (error) { return failure(error); }
}
