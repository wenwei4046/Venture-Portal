"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { getAccountUser, getMemberUser } from "@/lib/auth";
import { canDo } from "@/lib/permission-actions";
import { createClient } from "@/lib/supabase/server";
import { crmFromRows, messageFromRow, type CrmLiveData, type CrmMessageRow, type CrmPeopleRow, type CrmRows } from "@/lib/member/crm-live";
import type { CrmMessage } from "@/lib/member/crm";
import { cleanText, fetchWhatsAppTemplates, fillTemplate, mediaMessage, reactionMessage, sendWhatsApp, sendWhatsAppText, templateMessage, textMessage, uploadWhatsAppMedia, windowOpen, type WaTemplate } from "@/lib/whatsapp/send";
import { messengerWindow, pageToken, sendMessengerAttachment, sendMessengerText } from "@/lib/messenger/send";
import { cardHasWay, messengerCardText, messengerVisitMessage, whatsappCardText, whatsappVisitMessage } from "@/lib/member/crm-maps";
import { chatMessage, crmDataFromRows, type CrmCard, type CrmChatMessage, type CrmData, type CrmDataRows } from "@/lib/member/crm-data";
import { fetchAllRowsParallel } from "@/lib/paginate";

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
    await requireCrm("view");
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
      read<CrmRows["rules"]>(db.from("crm_assign_rules").select("ad_source_id, ad_label, tl_ids, shares")),
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
    await requireCrm("edit");
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
  "crm_assign_member", "crm_send_to_team", "crm_save_team_settings", "crm_save_team_shares", "crm_save_ad_rule", "crm_set_full_time", "crm_save_showroom", "crm_give_to_hod",
  // The redesign (mig 20261009160000).
  "crm_visit_outcome", "crm_save_details", "crm_set_pref", "crm_hide_message", "crm_save_labels", "crm_set_label",
  "crm_save_quick_replies", "crm_save_auto_replies", "crm_seen_notifications", "crm_invite", "crm_answer_invite",
  "crm_save_showroom_full", "crm_slot_counts", "crm_mark_reminded",
  // The Control panel (mig 20261009180000).
  "crm_send_to", "crm_save_ad_assign", "crm_save_fulltime", "crm_read_notifs",
] as const;
export type CrmWrite = (typeof CRM_WRITES)[number];

export async function crmWrite(name: CrmWrite, args: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    if (!CRM_WRITES.includes(name)) throw new Error("Unknown action.");
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    await requireCrm(MANAGE_WRITES.has(name) ? "manage" : EDIT_WRITES.has(name) ? "edit" : "view");
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

/* ── The redesigned CRM (Claude Design handoff, 2026-10-09) ─────────────── */

type Db = SupabaseClient;
/** The largest photo or file a member sends from the CRM (the client checks the same). */
const CRM_MEDIA_BYTES = 4 * 1024 * 1024;
/** This site, as the request reached it: where a Messenger map button sends the customer (/nav.html). */
const siteBase = async () => {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
};
const session = async (): Promise<Db> => {
  const user = await getMemberUser();
  if (!user?.is_active) throw new Error("Sign in with an active work account.");
  return (await createClient()) as unknown as Db;
};

/**
 * The CRM's cells (2026-10-10, the permission matrix): asked of the ACCOUNT —
 * the CRM is the signed-in account's own whatever view the portal was left in,
 * and the database answers for the account too (crm_me / crm_can). The
 * database refuses whatever these let through that it would not.
 */
const NOT_IN_CRM = "The CRM is not part of your title's permissions. Ask your administrator.";
async function crmAllows(need: "view" | "edit" | "manage"): Promise<boolean> {
  const account = await getAccountUser();
  if (!account?.is_active) return false;
  if (need === "manage") return canDo(account, "crm", "manage");
  if (need === "edit") return canDo(account, "crm", "edit", "own");
  return canDo(account, "crm", "view", "own");
}
const requireCrm = async (need: "view" | "edit" | "manage") => {
  if (!(await crmAllows(need))) throw new Error(need === "view" ? NOT_IN_CRM : "You may not do that.");
};

/** Which cell each of the CRM's writes needs (the database asks the same). */
const MANAGE_WRITES: ReadonlySet<string> = new Set([
  "crm_send_to", "crm_send_to_team", "crm_give_to_hod", "crm_save_ad_assign", "crm_save_ad_rule", "crm_save_fulltime",
  "crm_save_team_shares", "crm_set_full_time", "crm_save_showroom", "crm_save_showroom_full",
]);
const EDIT_WRITES: ReadonlySet<string> = new Set([
  "crm_set_status", "crm_book", "crm_move_appointment", "crm_set_appointment_state", "crm_assign_member", "crm_save_team_settings",
  "crm_visit_outcome", "crm_save_details", "crm_invite", "crm_answer_invite", "crm_mark_reminded",
]);
const friendly = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  return /permission denied|42501/i.test(message) ? "You may not do that." : message.slice(0, 250);
};

/**
 * Everything one person's CRM reads, under their own session. Contacts and
 * messages are paged (PostgREST stops at 1,000 rows without a word).
 */
export async function fetchCrmData(): Promise<{ ok: true; data: CrmData } | { ok: false; error: string }> {
  try {
    const db = await session();
    await requireCrm("view");
    const read = async <T,>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> => {
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as T;
    };
    const [people, can, contacts, messages, visits, rooms, prefs, hides, labels, contactLabels, quickReplies, autoReplies, invites, shares, events, staffPrefs, adRules, ftRules] = await Promise.all([
      read<CrmDataRows["people"]>(db.rpc("crm_people")),
      // What they may do (mig 20261010030000) — the screens follow it; a database without it yet answers by role.
      Promise.resolve(db.rpc("crm_my_can")).then(r => (r.error ? null : r.data), () => null),
      fetchAllRowsParallel<CrmDataRows["contacts"][number]>((from, to, withCount) => db.from("crm_contacts")
        .select("id, channel, account_id, external_id, name, phone, ad_source_id, ad_headline, status, lost_reason, lost_note, previous_status, assigned_to, team_id, last_customer_at, unread, created_at, property_type, unit_size, unit_location, requirement, budget, won_amount, details_at, assigned_at, assigned_by, held_reason", withCount ? { count: "exact" } : undefined)
        .order("created_at").order("id").range(from, to), "crm contacts"),
      fetchAllRowsParallel<CrmDataRows["messages"][number]>((from, to, withCount) => db.from("crm_messages")
        .select("id, contact_id, direction, kind, body, media_id, auto, sent_by, sent_at, status, error, reply_to, my_reaction, card", withCount ? { count: "exact" } : undefined)
        .order("sent_at").order("id").range(from, to), "crm messages"),
      read<CrmDataRows["visits"]>(db.from("crm_appointments").select("id, contact_id, showroom, start_at, minutes, state, outcome, reminded_at")),
      read<CrmDataRows["rooms"]>(db.from("crm_showrooms").select("id, name, active, sort_order, address, slots, cap, weekly, blocks")),
      read<CrmDataRows["prefs"]>(db.from("crm_contact_prefs").select("contact_id, pinned, muted, hidden, blocked, pinned_message_id")),
      read<CrmDataRows["hides"]>(db.from("crm_message_hides").select("message_id")),
      read<CrmDataRows["labels"]>(db.from("crm_labels").select("id, name, color, sort_order")),
      read<CrmDataRows["contactLabels"]>(db.from("crm_contact_labels").select("label_id, contact_id")),
      read<CrmDataRows["quickReplies"]>(db.from("crm_quick_replies").select("id, shortcut, message, sort_order")),
      read<CrmDataRows["autoReplies"]>(db.from("crm_auto_replies").select("settings")),
      read<CrmDataRows["invites"]>(db.from("crm_invites").select("id, kind, contact_id, contact_name, from_staff, to_staff, state, created_at, decided_at").order("created_at", { ascending: false }).limit(200)),
      read<CrmDataRows["shares"]>(db.from("crm_contact_shares").select("contact_id, staff_id, invited_by, joined_at")),
      read<CrmDataRows["events"]>(db.from("crm_events").select("id, kind, contact_id, actor, owner, data, at").order("at", { ascending: false }).limit(500)),
      read<CrmDataRows["staffPrefs"]>(db.from("crm_staff_prefs").select("notifs_seen_at, notif_read")),
      read<CrmDataRows["adRules"]>(db.from("crm_ad_assign").select("ad_source_id, ad_label, mode, team_split, people_mode, people, started_at, team_modes")),
      read<CrmDataRows["ftRules"]>(db.from("crm_fulltime_rules").select("tl_id, mode, days, vals")),
    ]);
    return { ok: true, data: crmDataFromRows({ people, can, contacts, messages, visits, rooms, prefs, hides, labels, contactLabels, quickReplies, autoReplies, invites, shares, events, staffPrefs, adRules, ftRules }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The CRM could not be loaded. Please try again.";
    return { ok: false, error: /schema cache|does not exist|could not find|permission denied for/i.test(message)
      ? "The CRM is not set up for this account yet. Ask your administrator." : message.slice(0, 250) };
  }
}

interface Reachable { id: string; channel: "whatsapp" | "messenger"; account_id: string; external_id: string; assigned_to: string | null; last_customer_at: string | null }

/** The customer as the sender needs them — read under RLS, then asked may-you-reply, then Meta's window. */
async function reachable(db: Db, contactId: string, freeText: boolean): Promise<{ contact: Reachable; token: string; window: "open" | "human_agent" | "shut" }> {
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) throw new Error("Choose a customer first.");
  const { data: contact, error } = await db.from("crm_contacts").select("id, channel, account_id, external_id, assigned_to, last_customer_at").eq("id", contactId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!contact) throw new Error("That customer is not in your CRM.");
  const c = contact as Reachable;
  const window = c.channel === "messenger" ? messengerWindow(c.last_customer_at) : windowOpen(c.last_customer_at) ? "open" : "shut";
  if (freeText && window === "shut") {
    throw new Error(c.channel === "messenger"
      ? "More than 7 days since the customer's last message — Messenger no longer allows a reply."
      : "More than 24 hours since the customer's last message — WhatsApp only allows an approved template now.");
  }
  const { data: allowed, error: checkError } = await db.rpc("crm_can_reply", { p_contact: contactId });
  if (checkError) throw new Error(checkError.message);
  if (allowed !== true) throw new Error("You may not reply to this customer.");
  const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
  if (!token) throw new Error(`${c.channel === "messenger" ? "Messenger" : "WhatsApp"} is not connected on this server yet. Ask your administrator.`);
  return { contact: c, token, window };
}

const recorded = async (db: Db, args: { contact: string; externalId: string; kind: string; body: string; replyTo?: string | null; card?: CrmCard | null }) => {
  const { data, error } = await db.rpc("crm_record_out", { p_contact: args.contact, p_external_id: args.externalId, p_kind: args.kind, p_body: args.body, p_reply_to: args.replyTo ?? null, p_card: args.card ?? null });
  return error || !data ? null : chatMessage(data as Parameters<typeof chatMessage>[0]);
};

/**
 * Send a text — a reply (optionally quoting one of the customer's messages),
 * a quick reply, or a visit card's words (Confirmed / Updated / Cancelled /
 * Reminder, drawn as a card in the chat). It shows only once it went AND was
 * kept; a failed send keeps the draft.
 */
export async function sendCrmMessage(contactId: string, text: string, opts: { replyTo?: string | null; card?: CrmCard | null } = {}): Promise<{ ok: true; message: CrmChatMessage } | { ok: false; error: string }> {
  try {
    const clean = cleanText(text);
    if (!clean.ok) throw new Error(clean.error);
    const db = await session();
    await requireCrm("edit");
    const { contact, token, window } = await reachable(db, contactId, true);
    let quote: string | null = null;
    if (opts.replyTo) {
      const { data: q } = await db.from("crm_messages").select("id, external_id, contact_id").eq("id", opts.replyTo).maybeSingle();
      if (!q || q.contact_id !== contactId) throw new Error("That message is not in this chat.");
      quote = (q.external_id as string | null) ?? null;
    }
    let externalId: string;
    if (contact.channel === "messenger") {
      const pageAccess = await pageToken(contact.account_id, token);
      if (!pageAccess) throw new Error("This Facebook Page is not connected to the CRM. Ask your administrator.");
      // A visit card: WhatsApp's layout without bold, and Google Maps · Waze as buttons (through our /nav.html) when there is an address.
      const message = cardHasWay(opts.card) ? messengerVisitMessage(opts.card, await siteBase())
        : opts.card ? { text: messengerCardText(opts.card) } : undefined;
      const sent = await sendMessengerText({ pageId: contact.account_id, psid: contact.external_id, body: clean.text, token: pageAccess, window: window as "open" | "human_agent", message });
      if (!sent.ok) throw new Error(sent.error);
      externalId = sent.mid;
    } else {
      // A visit card: WhatsApp's own layout (bold labels), and Google Maps as the one button it allows when there is an address.
      const message = cardHasWay(opts.card) ? whatsappVisitMessage(contact.external_id, opts.card)
        : textMessage(contact.external_id, opts.card ? whatsappCardText(opts.card) : clean.text, quote);
      const sent = await sendWhatsApp({ phoneNumberId: contact.account_id, token, message });
      if (!sent.ok) throw new Error(sent.error);
      externalId = sent.wamid;
    }
    const message = await recorded(db, { contact: contactId, externalId, kind: "text", body: clean.text, replyTo: opts.replyTo, card: opts.card });
    if (!message) return { ok: false, error: `Sent to the customer on ${contact.channel === "messenger" ? "Messenger" : "WhatsApp"}, but it could not be saved here. Reload before sending again.` };
    return { ok: true, message };
  } catch (error) {
    return { ok: false, error: friendly(error, "The message could not be sent. Please try again.") };
  }
}

/** React to a message. WhatsApp shows it to the customer; Messenger keeps it in the CRM only (Meta offers Pages no reactions). */
export async function reactToMessage(messageId: string, emoji: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const db = await session();
    await requireCrm("edit");
    const { data: m, error } = await db.from("crm_messages").select("id, contact_id, external_id, direction").eq("id", messageId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!m) throw new Error("That message is not in your CRM.");
    const { contact, token } = await reachable(db, m.contact_id as string, false);
    if (contact.channel === "whatsapp" && m.external_id) {
      const sent = await sendWhatsApp({ phoneNumberId: contact.account_id, token, message: reactionMessage(contact.external_id, m.external_id as string, emoji) });
      if (!sent.ok) throw new Error(sent.error);
    }
    const { error: saveError } = await db.rpc("crm_set_reaction", { p_message: messageId, p_emoji: emoji });
    if (saveError) throw new Error(saveError.message);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendly(error, "The reaction could not be sent.") };
  }
}

/** The WhatsApp Business Account's approved templates (for a cold lead). */
export async function fetchCrmTemplates(): Promise<{ ok: true; templates: WaTemplate[] } | { ok: false; error: string }> {
  try {
    await session();
    await requireCrm("edit");
    const token = process.env.META_SYSTEM_USER_TOKEN?.trim(), wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
    if (!token || !wabaId) throw new Error("WhatsApp is not connected on this server yet. Ask your administrator.");
    return await fetchWhatsAppTemplates({ wabaId, token });
  } catch (error) {
    return { ok: false, error: friendly(error, "The templates could not be loaded.") };
  }
}

/** Send an approved template — the only way to write after WhatsApp's 24 hours (it does not reopen the window). */
export async function sendCrmTemplate(contactId: string, template: { name: string; language: string; text: string }, params: string[]): Promise<{ ok: true; message: CrmChatMessage } | { ok: false; error: string }> {
  try {
    const db = await session();
    await requireCrm("edit");
    const { contact, token } = await reachable(db, contactId, false);
    if (contact.channel !== "whatsapp") throw new Error("Messenger has no templates. Call the customer instead.");
    const sent = await sendWhatsApp({ phoneNumberId: contact.account_id, token, message: templateMessage(contact.external_id, template.name, template.language, params) });
    if (!sent.ok) throw new Error(sent.error);
    const message = await recorded(db, { contact: contactId, externalId: sent.wamid, kind: "template", body: fillTemplate(template.text, params) || template.name });
    if (!message) return { ok: false, error: "Sent to the customer on WhatsApp, but it could not be saved here. Reload before sending again." };
    return { ok: true, message };
  } catch (error) {
    return { ok: false, error: friendly(error, "The template could not be sent.") };
  }
}

/** A photo or document from the chat's + sheet. */
export async function sendCrmMedia(form: FormData): Promise<{ ok: true; message: CrmChatMessage } | { ok: false; error: string }> {
  try {
    const contactId = String(form.get("contact") ?? ""), caption = String(form.get("caption") ?? "").trim();
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) throw new Error("Choose a file first.");
    const filename = (file as File).name || "file";
    const kind: "image" | "document" = ["image/jpeg", "image/png"].includes(file.type) ? "image" : "document";
    // Vercel takes ~4.5 MB in one request (next.config.ts bodySizeLimit 4 MB): a larger file never reaches here.
    if (file.size > CRM_MEDIA_BYTES) throw new Error("A photo or file can be up to 4 MB.");
    const db = await session();
    await requireCrm("edit");
    const { contact, token, window } = await reachable(db, contactId, true);
    let externalId: string;
    if (contact.channel === "messenger") {
      const pageAccess = await pageToken(contact.account_id, token);
      if (!pageAccess) throw new Error("This Facebook Page is not connected to the CRM. Ask your administrator.");
      const sent = await sendMessengerAttachment({ pageId: contact.account_id, psid: contact.external_id, token: pageAccess, window: window as "open" | "human_agent", kind: kind === "image" ? "image" : "file", file, filename });
      if (!sent.ok) throw new Error(sent.error);
      externalId = sent.mid;
    } else {
      const up = await uploadWhatsAppMedia({ phoneNumberId: contact.account_id, token, file, filename });
      if (!up.ok) throw new Error(up.error);
      const sent = await sendWhatsApp({ phoneNumberId: contact.account_id, token, message: mediaMessage(contact.external_id, kind, up.id, caption, filename) });
      if (!sent.ok) throw new Error(sent.error);
      externalId = sent.wamid;
    }
    const message = await recorded(db, { contact: contactId, externalId, kind, body: caption || filename });
    if (!message) return { ok: false, error: "Sent to the customer, but it could not be saved here. Reload before sending again." };
    return { ok: true, message };
  } catch (error) {
    return { ok: false, error: friendly(error, "The file could not be sent.") };
  }
}
