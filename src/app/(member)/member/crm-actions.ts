"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { crmFromRows, type CrmLiveData, type CrmPeopleRow, type CrmRows } from "@/lib/member/crm-live";

/**
 * The CRM's live read: everything the signed-in person may see, read under
 * THEIR session — row level security (migs 20261002070000–100000) decides
 * what comes back, never this code. Reads only; writes arrive as functions
 * of their own.
 */
export async function fetchCrm(): Promise<{ ok: true; data: CrmLiveData } | { ok: false; error: string }> {
  try {
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    // The crm_* tables postdate database.types.ts — untyped-client convention (as the WhatsApp webhook).
    const db = (await createClient()) as unknown as SupabaseClient;
    const read = async <T,>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> => {
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as T;
    };
    // Independent reads start together.
    const [people, contacts, messages, appointments, rules, teams] = await Promise.all([
      read<CrmPeopleRow>(db.rpc("crm_people")),
      read<CrmRows["contacts"]>(db.from("crm_contacts").select("id, channel, account_id, external_id, name, phone, ad_source_id, ad_headline, status, lost_reason, lost_note, previous_status, assigned_to, team_id, unread, created_at")),
      read<CrmRows["messages"]>(db.from("crm_messages").select("id, contact_id, direction, kind, body, auto, sent_by, sent_at").order("sent_at")),
      read<CrmRows["appointments"]>(db.from("crm_appointments").select("id, contact_id, showroom, start_at, minutes, state")),
      read<CrmRows["rules"]>(db.from("crm_assign_rules").select("ad_source_id, ad_label, tl_ids")),
      read<CrmRows["teams"]>(db.from("crm_team_settings").select("tl_id, team_share, weekday, ratios, edited_by, edited_at")),
    ]);
    return { ok: true, data: crmFromRows({ people, contacts, messages, appointments, rules, teams }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The CRM could not be loaded. Please try again.";
    return {
      ok: false,
      error: /schema cache|does not exist|could not find|permission denied for/i.test(message)
        ? "The CRM is not set up for this account yet. Ask your administrator."
        : message.slice(0, 250),
    };
  }
}
