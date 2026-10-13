"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireActionOn } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readFoodClaimAdmin, validFoodClaimToSave, type FoodClaimAdmin, type FoodClaimToSave } from "@/lib/member/food-claim-admin";

/**
 * People › Member services › Food claim's Save (2026-10-13): Fair's food claim — the rate a day and
 * the titles that may claim it. Member services · Edit (member.manage) and the back office's own door
 * (member_requests_manage), as Sales Groups' "+"; `member_admin_save_food_claim` asks both again.
 *
 * Refusals come back as `{ ok: false, error }`: a thrown message never reaches the browser in production.
 */
export async function saveFoodClaimAdmin(input: FoodClaimToSave): Promise<{ ok: true; data: FoodClaimAdmin } | { ok: false; error: string }> {
  const user = await requireActionOn('/member-admin', 'member', 'manage');
  if (!user.permissions.includes("member_requests_manage")) return { ok: false, error: "The food claim needs HR request management access." };
  if (!validFoodClaimToSave(input)) return { ok: false, error: "Check the rate a day and the titles ticked." };
  try {
    const db = (await createClient()) as unknown as SupabaseClient;
    const { data, error } = await db.rpc("member_admin_save_food_claim", { p_per_day: input.perDay, p_titles: input.titleIds });
    if (error) throw new Error(error.message);
    const saved = readFoodClaimAdmin(data);
    if (!saved) throw new Error("The food claim was saved; reload to see it.");
    return { ok: true, data: saved };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      ok: false,
      error: !message || /schema cache|does not exist|could not find|JWT/i.test(message)
        ? "The food claim could not be saved. Please try again."
        : message.slice(0, 250),
    };
  }
}
