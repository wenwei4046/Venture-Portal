"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { crmFromRows, messageFromRow, type CrmLiveData, type CrmMessageRow, type CrmPeopleRow, type CrmRows } from "@/lib/member/crm-live";
import type { CrmMessage } from "@/lib/member/crm";
import { cleanText, sendWhatsAppText, windowOpen } from "@/lib/whatsapp/send";
import { messengerWindow, pageToken, sendMessengerText } from "@/lib/messenger/send";

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
    const [people, contacts, messages, appointments, rules, teams, showrooms] = await Promise.all([
      read<CrmPeopleRow>(db.rpc("crm_people")),
      read<CrmRows["contacts"]>(db.from("crm_contacts").select("id, channel, account_id, external_id, name, phone, ad_source_id, ad_headline, status, lost_reason, lost_note, previous_status, assigned_to, team_id, last_customer_at, unread, created_at")),
      read<CrmRows["messages"]>(db.from("crm_messages").select("id, contact_id, direction, kind, body, media_id, auto, sent_by, sent_at, status, error").order("sent_at")),
      read<CrmRows["appointments"]>(db.from("crm_appointments").select("id, contact_id, showroom, start_at, minutes, state")),
      read<CrmRows["rules"]>(db.from("crm_assign_rules").select("ad_source_id, ad_label, tl_ids")),
      read<CrmRows["teams"]>(db.from("crm_team_settings").select("tl_id, team_share, percent_days, weekend_full_time, ratios, edited_by, edited_at")),
      read<CrmRows["showrooms"]>(db.from("crm_showrooms").select("id, name, active, sort_order")),
    ]);
    return { ok: true, data: crmFromRows({ people, contacts, messages, appointments, rules, teams, showrooms }) };
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

/**
 * Reply to a WhatsApp customer from the CRM. Under the member's own session:
 * the database says whether they may reply (crm_can_reply) BEFORE anything
 * leaves; the server sends it with the token (never the browser's); the
 * database records it with Meta's id (crm_record_reply), asking again.
 */
export async function sendCrmReply(contactId: string, text: string): Promise<{ ok: true; message: CrmMessage } | { ok: false; error: string }> {
  try {
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    if (!/^[0-9a-f-]{36}$/i.test(contactId)) throw new Error("Choose a customer first.");
    const clean = cleanText(text);
    if (!clean.ok) throw new Error(clean.error);

    const db = (await createClient()) as unknown as SupabaseClient;
    // Read under row level security: a customer the member cannot see is "not found", never a hint it exists.
    const { data: contact, error: readError } = await db.from("crm_contacts")
      .select("id, channel, account_id, external_id, assigned_to, last_customer_at").eq("id", contactId).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!contact) throw new Error("That customer is not in your CRM.");
    // Meta's windows: WhatsApp 24 hours; Messenger 24 hours, then 7 days as a person (Human Agent).
    const messenger = contact.channel === "messenger";
    const mWindow = messengerWindow(contact.last_customer_at);
    if (messenger ? mWindow === "shut" : !windowOpen(contact.last_customer_at)) {
      throw new Error(messenger
        ? "More than 7 days since the customer's last message — Messenger no longer allows a reply."
        : "More than 24 hours since the customer's last message — WhatsApp only allows an approved template now.");
    }

    const { data: allowed, error: checkError } = await db.rpc("crm_can_reply", { p_contact: contactId });
    if (checkError) throw new Error(checkError.message);
    if (allowed !== true) throw new Error("You may not reply to this customer.");

    const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
    if (!token) throw new Error(`${messenger ? "Messenger" : "WhatsApp"} is not connected on this server yet. Ask your administrator.`);
    let externalId: string;
    if (messenger) {
      const pageAccess = await pageToken(contact.account_id, token);
      if (!pageAccess) throw new Error("This Facebook Page is not connected to the CRM. Ask your administrator.");
      const sent = await sendMessengerText({ pageId: contact.account_id, psid: contact.external_id, body: clean.text, token: pageAccess, window: mWindow as "open" | "human_agent" });
      if (!sent.ok) throw new Error(sent.error);
      externalId = sent.mid;
    } else {
      const sent = await sendWhatsAppText({ phoneNumberId: contact.account_id, to: contact.external_id, body: clean.text, token });
      if (!sent.ok) throw new Error(sent.error);
      externalId = sent.wamid;
    }

    const { data: row, error: recordError } = await db.rpc("crm_record_reply", { p_contact: contactId, p_external_id: externalId, p_body: clean.text });
    if (recordError || !row) {
      // It DID reach the customer; say so, so nobody sends it twice.
      return { ok: false, error: `Sent to the customer on ${messenger ? "Messenger" : "WhatsApp"}, but it could not be saved here. Reload before sending again.` };
    }
    return { ok: true, message: messageFromRow(row as CrmMessageRow, contact.assigned_to) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The message could not be sent. Please try again.";
    return { ok: false, error: /permission denied|42501/i.test(message) ? "You may not reply to this customer." : message.slice(0, 250) };
  }
}

/**
 * The CRM's other writes. Each is a database function that asks, under the
 * member's own session, whether they may do it (mig 20261003030000); this
 * only passes the call through, from a fixed list — never a table write.
 */
const CRM_WRITES = [
  "crm_mark_read", "crm_set_status", "crm_book", "crm_move_appointment", "crm_set_appointment_state",
  "crm_assign_member", "crm_send_to_team", "crm_save_team_settings", "crm_save_team_shares", "crm_save_ad_rule", "crm_set_full_time", "crm_save_showroom",
] as const;
export type CrmWrite = (typeof CRM_WRITES)[number];

export async function crmWrite(name: CrmWrite, args: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    if (!CRM_WRITES.includes(name)) throw new Error("Unknown action.");
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    const db = (await createClient()) as unknown as SupabaseClient;
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(error.message);
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "That could not be saved. Please try again.";
    // The database's own words are written for the member ("You may not …", "A Lost customer needs a reason.").
    return { ok: false, error: /permission denied for/i.test(message) ? "You may not do that." : message.slice(0, 250) };
  }
}
