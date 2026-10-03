"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validArenaWeekPicks, type ArenaWeekPicks } from "@/lib/member/arena";
import type { BrandWeeksAdminSnapshot } from "@/lib/member/brand-weeks-admin";

/**
 * People › Member services › Brand weeks (2026-10-03): the back office sets a
 * member's brand weeks — any week, closed ones too (user: after 一个星期后就不能
 * 再改了，除非是 ERP 那边改，或者是后台这边改). The same gate as the page's
 * Request reviews; the RPCs ask again (member_is_manager).
 *
 * Refusals come back as `{ ok: false, error }`: a thrown message never reaches
 * the browser in production.
 */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validPeriod = (period: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(period);

async function backOffice() {
  const user = await requireAuth();
  if (user.role !== "principal" && !user.permissions.includes("member_requests_manage")) {
    throw new Error("Brand weeks need HR request management access.");
  }
  return (await createClient()) as unknown as SupabaseClient;
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return {
    ok: false as const,
    error: !message || /schema cache|does not exist|could not find|JWT/i.test(message)
      ? "Brand weeks could not be loaded. Please try again."
      : message.slice(0, 250),
  };
}

export async function fetchBrandWeeksAdmin(subDepartmentId: string, period: string) {
  try {
    if (!uuid.test(subDepartmentId) || !validPeriod(period)) throw new Error("Choose a department and a month.");
    const db = await backOffice();
    const { data, error } = await db.rpc("member_admin_brand_weeks", { p_sub_department: subDepartmentId, p_period: period });
    if (error) throw new Error(error.message);
    if (!data || !Array.isArray(data.people) || !Array.isArray(data.weeks)) throw new Error("Brand weeks are temporarily unavailable.");
    return { ok: true as const, data: data as BrandWeeksAdminSnapshot };
  } catch (error) { return failure(error); }
}

/** Several members at once, each with their whole month: `{ staffId: { Friday: brand } }`. */
export async function saveBrandWeeksAdmin(subDepartmentId: string, period: string, rows: Record<string, ArenaWeekPicks>) {
  try {
    if (!uuid.test(subDepartmentId) || !validPeriod(period)) throw new Error("Choose a department and a month.");
    const entries = Object.entries(rows ?? {});
    if (!entries.length) throw new Error("Nothing to save.");
    if (entries.length > 500) throw new Error("Save at most 500 members at a time.");
    if (!entries.every(([staffId, picks]) => uuid.test(staffId) && validArenaWeekPicks(period, picks))) {
      throw new Error("Pick Akemi, Dunlopillo, Zanotti or Ergotex for the weeks of this month.");
    }
    const db = await backOffice();
    const { data, error } = await db.rpc("member_admin_save_brand_weeks", { p_sub_department: subDepartmentId, p_period: period, p_rows: rows });
    if (error) throw new Error(error.message);
    return { ok: true as const, saved: Number(data ?? entries.length) };
  } catch (error) { return failure(error); }
}
