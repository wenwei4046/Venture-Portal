"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireActionOn } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readTransportClaimAdmin, validTransportChanges, type TransportChange, type TransportClaimAdmin } from "@/lib/member/transport-claim-admin";

/**
 * People › Member services › Transport claim's ⋯ › Save (2026-10-20): the titles whose holders may send a transport
 * claim — since 2026-10-31 two ticks a title, the transport claim (by road, an Airbnb stay) and the air ticket claim,
 * and only the boxes HR changed are sent (`transportChanges`): a title's tick on or off, over the lists as they stand.
 * Member services · Edit (member.manage) and the back office's own door (member_requests_manage), as the food
 * claim's Save; `member_admin_save_transport_claim` asks both again.
 *
 * Refusals come back as `{ ok: false, error }`: a thrown message never reaches the browser in production.
 */
export async function saveTransportClaimAdmin(changes: TransportChange[]): Promise<{ ok: true; data: TransportClaimAdmin } | { ok: false; error: string }> {
  const user = await requireActionOn('/member-admin', 'member', 'manage');
  if (!user.permissions.includes("member_requests_manage")) return { ok: false, error: "The transport claim needs HR request management access." };
  if (!validTransportChanges(changes)) return { ok: false, error: "Check the titles ticked." };
  try {
    const db = (await createClient()) as unknown as SupabaseClient;
    const { data, error } = await db.rpc("member_admin_save_transport_claim", { p_changes: changes });
    if (error) throw new Error(error.message);
    const saved = readTransportClaimAdmin(data);
    if (!saved) throw new Error("Who can claim was saved; reload to see it.");
    return { ok: true, data: saved };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      ok: false,
      error: !message || /schema cache|does not exist|could not find|JWT/i.test(message)
        ? "Who can claim could not be saved. Please try again."
        : message.slice(0, 250),
    };
  }
}
