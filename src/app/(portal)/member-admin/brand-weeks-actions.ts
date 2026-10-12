"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { BrandWeeksAdminSnapshot } from "@/lib/member/brand-weeks-admin";

/**
 * People › Member services › Brand weeks: a department’s month of brand weeks,
 * read only since 2026-10-12 — the Houzs ERP’s Sales Attending says where each
 * member works a fair weekend, and the booth with the most of their bills
 * counts where it lists them nowhere (user: "1 layer is use track by erp
 * houzs, if fail, then go with auto detect"). Nothing is picked here any more.
 * The same gate as the page’s Request reviews; the RPC asks again
 * (member_is_manager).
 *
 * Refusals come back as `{ ok: false, error }`: a thrown message never reaches
 * the browser in production.
 */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validPeriod = (period: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(period);

async function backOffice() {
  const user = await requireAuth();
  if (!user.permissions.includes("member_requests_manage")) {
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

