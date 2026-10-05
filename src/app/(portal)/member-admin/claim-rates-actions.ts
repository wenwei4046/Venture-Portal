"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readClaimRatesAdmin, validClaimRatesToSave, type ClaimRatesAdmin, type ClaimRatesToSave } from "@/lib/member/claim-rates-admin";

/**
 * People › Member services › Claim rates (2026-10-05): the fair-claim rates
 * and the regions' spots that a member's claim is worked out from — and, since
 * 2026-10-06, which regions are flown to and the region of every venue the
 * ERP's fairs name. The same
 * gate as Request reviews and Brand weeks; the RPCs ask again
 * (member_is_manager).
 *
 * Refusals come back as `{ ok: false, error }`: a thrown message never reaches
 * the browser in production.
 */
async function backOffice() {
  const user = await requireAuth();
  if (user.role !== "principal" && !user.permissions.includes("member_requests_manage")) {
    throw new Error("Claim rates need HR request management access.");
  }
  return (await createClient()) as unknown as SupabaseClient;
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return {
    ok: false as const,
    error: !message || /schema cache|does not exist|could not find|JWT/i.test(message)
      ? "Claim rates could not be loaded. Please try again."
      : message.slice(0, 250),
  };
}

export async function fetchClaimRatesAdmin(): Promise<{ ok: true; data: ClaimRatesAdmin } | { ok: false; error: string }> {
  try {
    const db = await backOffice();
    const { data, error } = await db.rpc("member_admin_claim_settings");
    if (error) throw new Error(error.message);
    const settings = readClaimRatesAdmin(data);
    if (!settings) throw new Error("Claim rates are temporarily unavailable.");
    return { ok: true, data: settings };
  } catch (error) { return failure(error); }
}

export async function saveClaimRatesAdmin(input: ClaimRatesToSave): Promise<{ ok: true; data: ClaimRatesAdmin } | { ok: false; error: string }> {
  try {
    if (!validClaimRatesToSave(input)) throw new Error("Check the rates, every region's name and spots, and the venues' regions.");
    const db = await backOffice();
    const { data, error } = await db.rpc("member_admin_save_claim_settings", {
      p_base: input.base, p_per_spot: input.perSpot, p_per_pax_night: input.perPaxNight,
      p_regions: input.regions.map(g => ({ id: g.id, name: g.name, spots: g.spots, planeTicket: g.planeTicket })),
      p_three_pax_night: input.perThreePaxNight,
      p_venues: input.venues,
    });
    if (error) throw new Error(error.message);
    const settings = readClaimRatesAdmin(data);
    if (!settings) throw new Error("The rates were saved; reload to see them.");
    return { ok: true, data: settings };
  } catch (error) { return failure(error); }
}
