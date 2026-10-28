"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { getAccountUser, getMemberUser } from "@/lib/auth";
import { canDo } from "@/lib/permission-actions";
import { createClient } from "@/lib/supabase/server";
import { cleanText, fetchWhatsAppTemplateStatuses, fillTemplate, mediaMessage, metaTemplateBody, metaTemplateName, reactionMessage, sendWhatsApp, submitWhatsAppTemplate, templateMessage, textMessage, uploadWhatsAppMedia, windowOpen, type WaTemplate } from "@/lib/whatsapp/send";
import { messengerWindow, pageToken, sendMessengerAttachment, sendMessengerText } from "@/lib/messenger/send";
import { cardHasWay, messengerCardText, messengerVisitMessage, whatsappCardText, whatsappVisitMessage } from "@/lib/member/crm-maps";
import { chatMessage, crmDataFromRows, type CrmCard, type CrmChatMessage, type CrmData, type CrmDataRows } from "@/lib/member/crm-data";
import { mediaKindOf, mediaLimit, mediaPath } from "@/lib/member/crm-media";
import { fetchWhatsAppMedia, messengerMediaAddress } from "@/lib/whatsapp/media";
import { crmAdNumbers, crmPages, listMetaAds, metaAdBudget, metaAdDaily, metaAdInsights, metaAdThumbs, type MetaAdRow, type MetaFig } from "@/lib/member/crm-ad-names-meta";
import { fetchAllRowsParallel } from "@/lib/paginate";

/**
 * The CRM's other writes. Each is a database function that asks, under the
 * member's own session, whether they may do it (mig 20261003030000); this
 * only passes the call through, from a fixed list — never a table write.
 */
const CRM_WRITES = [
  "crm_mark_read", "crm_set_status", "crm_book", "crm_move_appointment", "crm_set_appointment_state",
  // An appointment online or elsewhere (mig 20261025020000).
  "crm_book_custom", "crm_move_custom",
  // Appointment types (mig 20261025040000).
  "crm_book_typed", "crm_move_typed", "crm_save_appt_types",
  "crm_assign_member", "crm_send_to_team", "crm_save_team_settings", "crm_save_team_shares", "crm_save_ad_rule", "crm_set_full_time", "crm_set_locked", "crm_save_showroom", "crm_give_to_hod",
  // The redesign (mig 20261009160000).
  "crm_visit_outcome", "crm_save_details", "crm_set_pref", "crm_hide_message", "crm_save_labels", "crm_set_label",
  "crm_save_quick_replies", "crm_save_auto_replies", "crm_seen_notifications", "crm_invite", "crm_answer_invite",
  "crm_save_showroom_full", "crm_slot_counts", "crm_mark_reminded",
  // The key handed over with a photo (mig 20261028130000).
  "crm_set_key_photo",
  // The Control panel (mig 20261009180000).
  "crm_send_to", "crm_save_ad_assign", "crm_save_fulltime", "crm_read_notifs",
  // Save and apply to all's window: the ads ticked, each on its own or counted together (mig 20261025134700), CRM · Manage.
  "crm_save_ads",
  // Cold lead templates (mig 20261011140000); submitting to Meta is submitCrmTemplate.
  "crm_save_template", "crm_template_on", "crm_delete_template",
  // CRM Desktop rev 1 (mig 20261013100000): reminders, deleted notifications, forms, notes.
  "crm_remind", "crm_delete_notifs", "crm_save_form", "crm_delete_form", "crm_add_note",
  // Starred messages (mig 20261014060000).
  "crm_star_message",
  // The chat composer's Recents (mig 20261014251500): one's own recent emoji.
  "crm_save_recent_emoji",
  // An ad's name (mig 20261016120000), CRM · Manage.
  "crm_name_ad", "crm_add_ad", "crm_hide_ad",
  // CRM Desktop v2 · Channels: link / unlink a Page or number, its default (mig 20261015100000).
  "crm_set_channel",
  // Settings › General (mig 20261018100000), CRM · Manage.
  "crm_save_settings",
  // v2 frame 07 · Showrooms: staff-only remarks, delete (mig 20261024150000), CRM · Manage.
  "crm_save_showroom_remarks", "crm_delete_showroom",
  // v2 frame 08: put another form in use (mig 20261024160000), CRM · Manage.
  "crm_set_active_form",
  // v2 frames 02 / 03: a customer added by hand (mig 20261024180000), CRM · Edit (own).
  "crm_add_contact",
] as const;
export type CrmWrite = (typeof CRM_WRITES)[number];

/**
 * The writes that can tell somebody's phone something (2026-10-14, mig 20261014030000): a customer given to them, a
 * visit for their customer, an invitation or its answer, a reminder. Pushed once the answer has gone back; the outbox
 * is loaded only then — this module is imported by the CRM's screens.
 */
const TELLS: ReadonlySet<string> = new Set([
  "crm_send_to", "crm_send_to_team", "crm_assign_member", "crm_give_to_hod", "crm_save_ad_assign", "crm_save_ads",
  "crm_book", "crm_move_appointment", "crm_book_custom", "crm_move_custom", "crm_book_typed", "crm_move_typed", "crm_set_appointment_state", "crm_visit_outcome",
  "crm_invite", "crm_answer_invite", "crm_remind",
]);
const pushAfter = () => import("@/lib/push/outbox").then(m => m.pushSoon(), () => undefined);

export async function crmWrite(name: CrmWrite, args: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    if (!CRM_WRITES.includes(name)) throw new Error("Unknown action.");
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    await requireCrm(MANAGE_WRITES.has(name) ? "manage" : EDIT_WRITES.has(name) ? "edit" : "view");
    const db = (await createClient()) as unknown as SupabaseClient;
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(error.message);
    if (TELLS.has(name)) await pushAfter();
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
  "crm_send_to", "crm_send_to_team", "crm_give_to_hod", "crm_save_ad_assign", "crm_save_ads", "crm_save_ad_rule", "crm_save_fulltime",
  "crm_save_team_shares", "crm_set_full_time", "crm_set_locked", "crm_save_showroom", "crm_save_showroom_full",
  "crm_save_template", "crm_template_on", "crm_delete_template",
  "crm_remind", "crm_save_form", "crm_delete_form", "crm_name_ad", "crm_add_ad", "crm_hide_ad", "crm_save_appt_types",
  "crm_set_channel", "crm_save_settings", "crm_save_showroom_remarks", "crm_delete_showroom", "crm_set_active_form",
]);
const EDIT_WRITES: ReadonlySet<string> = new Set([
  "crm_set_status", "crm_book", "crm_move_appointment", "crm_book_custom", "crm_move_custom", "crm_book_typed", "crm_move_typed", "crm_set_appointment_state", "crm_assign_member", "crm_save_team_settings",
  "crm_visit_outcome", "crm_save_details", "crm_invite", "crm_answer_invite", "crm_mark_reminded", "crm_set_key_photo",
  "crm_add_note", "crm_add_contact",
]);
const friendly = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  return /permission denied|42501/i.test(message) ? "You may not do that." : message.slice(0, 250);
};

/**
 * Everything one person's CRM reads, under their own session. Contacts and
 * messages are paged (PostgREST stops at 1,000 rows without a word).
 */
/** What the phone lists of crm_events; the desktop also reads a customer's journey (CRM Desktop rev 1, B1). */
const LISTED_EVENTS = ["won", "lost", "moved", "shared", "share_declined", "move_declined", "reminded"];
const JOURNEY_EVENTS = ["assigned", "first_reply", "appt_booked", "appt_changed", "appt_cancelled", "visit", "status"];

export async function fetchCrmData(opts: { journey?: boolean } = {}): Promise<{ ok: true; data: CrmData } | { ok: false; error: string }> {
  try {
    const db = await session();
    await requireCrm("view");
    const read = async <T,>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> => {
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as T;
    };
    const [people, can, contacts, messages, visits, rooms, prefs, hides, labels, contactLabels, quickReplies, autoReplies, invites, shares, events, staffPrefs, adRules, ftRules, templates] = await Promise.all([
      read<CrmDataRows["people"]>(db.rpc("crm_people")),
      // What they may do (mig 20261010030000) — the screens follow it; a database without it yet answers by role.
      Promise.resolve(db.rpc("crm_my_can")).then(r => (r.error ? null : r.data), () => null),
      fetchAllRowsParallel<CrmDataRows["contacts"][number]>((from, to, withCount) => db.from("crm_contacts")
        .select("id, channel, account_id, external_id, name, phone, ad_source_id, ad_headline, ad_source_url, ad_media, status, lost_reason, lost_note, previous_status, assigned_to, team_id, last_customer_at, unread, created_at, property_type, unit_size, unit_location, requirement, budget, won_amount, details_at, assigned_at, assigned_by, held_reason", withCount ? { count: "exact" } : undefined)
        .order("created_at").order("id").range(from, to), "crm contacts"),
      fetchAllRowsParallel<CrmDataRows["messages"][number]>((from, to, withCount) => db.from("crm_messages")
        .select("id, contact_id, direction, kind, body, media_id, media_path, media_url, media_mime, auto, sent_by, sent_at, status, error, reply_to, my_reaction, their_reaction, media_name, card", withCount ? { count: "exact" } : undefined)
        .order("sent_at").order("id").range(from, to), "crm messages"),
      read<CrmDataRows["visits"]>(db.from("crm_appointments").select("id, contact_id, showroom, start_at, minutes, state, outcome, reminded_at, kind, meeting_link, place, remarks, type_id, answers, key_out_path, key_out_at, key_back_path, key_back_at")),
      read<CrmDataRows["rooms"]>(db.from("crm_showrooms").select("id, name, active, sort_order, address, slots, cap, weekly, blocks")),
      read<CrmDataRows["prefs"]>(db.from("crm_contact_prefs").select("contact_id, pinned, muted, hidden, blocked, pinned_message_id, marked_unread")),
      read<CrmDataRows["hides"]>(db.from("crm_message_hides").select("message_id")),
      read<CrmDataRows["labels"]>(db.from("crm_labels").select("id, name, color, sort_order")),
      read<CrmDataRows["contactLabels"]>(db.from("crm_contact_labels").select("label_id, contact_id")),
      read<CrmDataRows["quickReplies"]>(db.from("crm_quick_replies").select("id, shortcut, message, sort_order")),
      read<CrmDataRows["autoReplies"]>(db.from("crm_auto_replies").select("staff_id, settings")),
      read<CrmDataRows["invites"]>(db.from("crm_invites").select("id, kind, contact_id, contact_name, from_staff, to_staff, state, created_at, decided_at").order("created_at", { ascending: false }).limit(200)),
      read<CrmDataRows["shares"]>(db.from("crm_contact_shares").select("contact_id, staff_id, invited_by, joined_at")),
      read<CrmDataRows["events"]>(db.from("crm_events").select("id, kind, contact_id, actor, owner, data, at").in("kind", LISTED_EVENTS).order("at", { ascending: false }).limit(500)),
      read<CrmDataRows["staffPrefs"]>(db.from("crm_staff_prefs").select("notifs_seen_at, notif_read")),
      read<CrmDataRows["adRules"]>(db.from("crm_ad_assign").select("ad_source_id, ad_label, mode, team_split, people_mode, people, started_at, team_modes, together")),
      read<CrmDataRows["ftRules"]>(db.from("crm_fulltime_rules").select("tl_id, mode, days, vals")),
      // Every template for the Control panel; Approved + On for everybody else (the row policy decides).
      read<NonNullable<CrmDataRows["templates"]>>(db.from("crm_templates").select("id, name, channel, body, status, is_on, meta_name, language, reject_reason").order("created_at")),
    ]);
    const more = await desktopRows(db, !!opts.journey);
    const extra = new Map(more.extras.map(x => [x.id, x.extra]));
    const roomX = new Map(more.rooms.map(r => [r.id, r]));
    return { ok: true, data: crmDataFromRows({
      people, can, messages, visits, prefs, hides, labels, contactLabels, quickReplies, autoReplies, invites, shares, adRules, ftRules, templates,
      contacts: extra.size ? contacts.map(c => (extra.has(c.id) ? { ...c, extra: extra.get(c.id) } : c)) : contacts,
      rooms: rooms.map(r => {
        const x = roomX.get(r.id);
        const y = more.roomMore.find(m => m.id === r.id);
        const r2 = y ? { ...r, remarks: y.remarks ?? "", deleted: !!y.deleted_at } : r;
        return x ? { ...r2, photo_url: x.photo_path ? `/member/crm-room-photo/${encodeURIComponent(r.id)}?v=${encodeURIComponent(x.photo_path)}` : null, map_google: x.map_google, map_waze: x.map_waze } : r2;
      }),
      events: more.journey.length ? [...events, ...more.journey] : events,
      staffPrefs: staffPrefs.length ? [{ ...staffPrefs[0], notif_deleted: more.deleted, recent_emoji: more.recent }] : staffPrefs,
      forms: more.forms, notes: more.notes, stars: more.stars, adNames: more.adNames, settings: more.settings, locked: more.locked, apptTypes: more.apptTypes,
    }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The CRM could not be loaded. Please try again.";
    return { ok: false, error: /schema cache|does not exist|could not find|permission denied for/i.test(message)
      ? "The CRM is not set up for this account yet. Ask your administrator." : message.slice(0, 250) };
  }
}

/**
 * CRM Desktop rev 1's columns and tables (mig 20261013100000): forms, notes, the form's own answers, a showroom's
 * photo and map links, deleted notifications, and — for the desktop — every customer's journey. Each read on its own
 * and empty when the database has none yet, so the CRM keeps opening before the migration and after it.
 */
async function desktopRows(db: Db, journey: boolean) {
  const soft = async <T,>(query: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | []> => {
    try { const { data, error } = await query; return error || !data ? [] : data; } catch { return []; }
  };
  const [forms, notes, extras, rooms, prefs, events, stars, recent, adNames, settings, locked, roomMore, apptTypes] = await Promise.all([
    soft<NonNullable<CrmDataRows["forms"]>>(db.from("crm_forms").select("id, name, sections, sort_order")),
    soft<NonNullable<CrmDataRows["notes"]>>(db.from("crm_notes").select("id, contact_id, body, author, created_at").order("created_at", { ascending: false }).limit(2000)),
    soft<{ id: string; extra: Record<string, string> }[]>(db.from("crm_contacts").select("id, extra").neq("extra", "{}").limit(5000)),
    soft<{ id: string; photo_path: string | null; map_google: string | null; map_waze: string | null }[]>(db.from("crm_showrooms").select("id, photo_path, map_google, map_waze")),
    soft<{ notif_deleted: string[] | null }[]>(db.from("crm_staff_prefs").select("notif_deleted")),
    journey ? soft<CrmDataRows["events"]>(db.from("crm_events").select("id, kind, contact_id, actor, owner, data, at").in("kind", JOURNEY_EVENTS).order("at", { ascending: false }).limit(5000)) : Promise.resolve([] as CrmDataRows["events"]),
    // One's own starred messages (mig 20261014060000).
    soft<{ message_id: string }[]>(db.from("crm_message_stars").select("message_id")),
    // One's own recent emoji, the chat composer's Recents (mig 20261014251500).
    soft<{ recent_emoji: string[] | null }[]>(db.from("crm_staff_prefs").select("recent_emoji")),
    // Ads' names (mig 20261016120000).
    soft<NonNullable<CrmDataRows["adNames"]>>(db.from("crm_ad_names").select("ad_source_id, name, source, meta_status, status_at, added_at, starts_at, ends_at, page_id, page_name, hidden_at")),
    // Settings › General (mig 20261018100000): null before it, so the CRM keeps today's values.
    (async () => { try { const { data, error } = await db.rpc("crm_settings_read"); return error ? null : (data as unknown); } catch { return null; } })(),
    // Members locked out of the dealing for now (mig 20261022130000).
    soft<{ staff_id: string }[]>(db.from("crm_staff").select("staff_id").eq("locked", true)),
    // Showrooms' staff-only remarks and the deleted ones (mig 20261024150000).
    soft<{ id: string; remarks: string | null; deleted_at: string | null }[]>(db.from("crm_showrooms").select("id, remarks, deleted_at")),
    // Appointment types (mig 20261025040000): null before it, so the two built in stay.
    (async () => { try { const { data, error } = await db.rpc("crm_appt_types_read"); return error ? null : (data as unknown); } catch { return null; } })(),
  ]);
  return { roomMore, forms, notes, extras, rooms, deleted: prefs[0]?.notif_deleted ?? [], journey: events, stars, recent: recent[0]?.recent_emoji ?? [], adNames, settings, locked: locked.map(l => l.staff_id), apptTypes };
}

/** The showroom's own map links (B4), read by the server — never the browser's; none before the migration. */
async function roomMapLinks(db: Db, room: string): Promise<{ google?: string | null; waze?: string | null }> {
  try {
    const { data } = await db.from("crm_showrooms").select("map_google, map_waze").eq("name", room).eq("active", true).limit(1).maybeSingle();
    const r = data as { map_google: string | null; map_waze: string | null } | null;
    const ok = (u: string | null | undefined) => (u && /^https:\/\//i.test(u) ? u : null);
    return r ? { google: ok(r.map_google), waze: ok(r.map_waze) } : {};
  } catch { return {}; }
}

interface Reachable { id: string; channel: "whatsapp" | "messenger"; account_id: string; external_id: string; assigned_to: string | null; last_customer_at: string | null }

/** The customer as the sender needs them — read under RLS, then asked may-you-reply, then Meta's window. */
async function reachable(db: Db, contactId: string, freeText: boolean): Promise<{ contact: Reachable; token: string; window: "open" | "human_agent" | "shut" }> {
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) throw new Error("Choose a customer first.");
  // The customer and may-I-reply are asked side by side: each send waited for one, then the other.
  const [{ data: contact, error }, { data: allowed, error: checkError }] = await Promise.all([
    db.from("crm_contacts").select("id, channel, account_id, external_id, assigned_to, last_customer_at").eq("id", contactId).maybeSingle(),
    db.rpc("crm_can_reply", { p_contact: contactId }),
  ]);
  if (error) throw new Error(error.message);
  if (!contact) throw new Error("That customer is not in your CRM.");
  const c = contact as Reachable;
  const window = c.channel === "messenger" ? messengerWindow(c.last_customer_at) : windowOpen(c.last_customer_at) ? "open" : "shut";
  if (freeText && window === "shut") {
    throw new Error(c.channel === "messenger"
      ? "More than 7 days since the customer's last message — Messenger no longer allows a reply."
      : "More than 24 hours since the customer's last message — WhatsApp only allows an approved template now.");
  }
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
    const [, { contact, token, window }] = await Promise.all([requireCrm("edit"), reachable(db, contactId, true)]);
    let quote: string | null = null;
    if (opts.replyTo) {
      const { data: q } = await db.from("crm_messages").select("id, external_id, contact_id").eq("id", opts.replyTo).maybeSingle();
      if (!q || q.contact_id !== contactId) throw new Error("That message is not in this chat.");
      quote = (q.external_id as string | null) ?? null;
    }
    let externalId: string;
    const own = cardHasWay(opts.card) ? await roomMapLinks(db, opts.card.room) : {};
    if (contact.channel === "messenger") {
      const pageAccess = await pageToken(contact.account_id, token);
      if (!pageAccess) throw new Error("This Facebook Page is not connected to the CRM. Ask your administrator.");
      // A visit card: WhatsApp's layout without bold, and Google Maps · Waze as buttons (through our /nav.html) when there is an address.
      const message = cardHasWay(opts.card) ? messengerVisitMessage(opts.card, await siteBase(), own)
        : opts.card ? { text: messengerCardText(opts.card) } : undefined;
      const sent = await sendMessengerText({ pageId: contact.account_id, psid: contact.external_id, body: clean.text, token: pageAccess, window: window as "open" | "human_agent", message });
      if (!sent.ok) throw new Error(sent.error);
      externalId = sent.mid;
    } else {
      // A visit card: WhatsApp's own layout (bold labels), and Google Maps as the one button it allows when there is an address.
      const message = cardHasWay(opts.card) ? whatsappVisitMessage(contact.external_id, opts.card, own)
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
    const db = await session();
    await requireCrm("edit");
    // rev 1011: only the CRM's own templates the Control panel switched on (Approved + On) — the row policy holds the rest back.
    const { data, error } = await db.from("crm_templates").select("name, body, meta_name, language, category")
      .eq("channel", "whatsapp").eq("status", "approved").eq("is_on", true).not("meta_name", "is", null).order("created_at");
    if (error) throw new Error(error.message);
    return { ok: true, templates: (data ?? []).map(t => {
      const text = metaTemplateBody(t.body as string);
      return { name: t.meta_name as string, label: t.name as string, language: t.language as string, category: t.category as string, text, params: text.includes("{{1}}") ? 1 : 0 };
    }) };
  } catch (error) {
    return { ok: false, error: friendly(error, "The templates could not be loaded.") };
  }
}

const whatsappAccount = () => {
  const token = process.env.META_SYSTEM_USER_TOKEN?.trim(), wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  if (!token || !wabaId) throw new Error("WhatsApp is not connected on this server yet. Ask your administrator.");
  return { token, wabaId };
};

/** Submit a WhatsApp template for Meta's review (CRM · Manage). Answers its new status. */
export async function submitCrmTemplate(id: string): Promise<{ ok: true; status: "review" | "approved" | "rejected"; metaName: string } | { ok: false; error: string }> {
  try {
    const db = await session();
    await requireCrm("manage");
    const { data: t, error } = await db.from("crm_templates").select("id, name, channel, body, status, language, category").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!t) throw new Error("That template is gone. Reload.");
    if (t.channel !== "whatsapp") throw new Error("Messenger templates are not connected yet — only WhatsApp templates go to review.");
    if (t.status !== "draft" && t.status !== "rejected") throw new Error("This template is already with Meta.");
    const { token, wabaId } = whatsappAccount();
    const metaName = metaTemplateName(t.name as string, `${(t.id as string).slice(0, 4)}${Date.now().toString(36).slice(-4)}`);
    const sent = await submitWhatsAppTemplate({ wabaId, token, name: metaName, language: t.language as string, category: t.category as string, body: t.body as string });
    if (!sent.ok) throw new Error(sent.error);
    const { error: saveError } = await db.rpc("crm_template_submitted", { p_id: id, p_meta_name: metaName, p_meta_id: sent.id, p_status: sent.status });
    if (saveError) throw new Error(`Sent to Meta for review, but it could not be saved here (${saveError.message}). Reload before submitting again.`);
    return { ok: true, status: sent.status, metaName };
  } catch (error) {
    return { ok: false, error: friendly(error, "The template could not be submitted.") };
  }
}

/** Meta's review of every submitted template, brought into the CRM (CRM · Manage) — on opening the templates page. */
export async function refreshCrmTemplates(): Promise<{ ok: true; changed: number } | { ok: false; error: string }> {
  try {
    const db = await session();
    await requireCrm("manage");
    const { token, wabaId } = whatsappAccount();
    const meta = await fetchWhatsAppTemplateStatuses({ wabaId, token });
    if (!meta.ok) throw new Error(meta.error);
    const { data, error } = await db.rpc("crm_template_statuses", { p_rows: meta.rows });
    if (error) throw new Error(error.message);
    return { ok: true, changed: Number(data ?? 0) };
  } catch (error) {
    return { ok: false, error: friendly(error, "Meta's review could not be read.") };
  }
}

/**
 * The ads Meta has in the ad accounts the system user sees (2026-10-22, the desktop's Ads to teams "+" and its sync of
 * what is running or about to run): read by the server with the system user's token, for CRM · Manage only.
 */
export async function fetchMetaAds(): Promise<{ ok: true; ads: MetaAdRow[] } | { ok: false; error: string }> {
  try {
    await session();
    await requireCrm("manage");
    const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
    if (!token) throw new Error("Meta is not connected on this server.");
    // Only the ads that send people to the CRM's ad number(s) — 018-358 0219 (crmAdNumbers), or to Messenger on the CRM's Pages (crmPages) — not every ad the system user sees.
    return { ok: true, ads: await listMetaAds(token, fetch, { numbers: crmAdNumbers(), pages: crmPages() }) };
  } catch (error) {
    return { ok: false, error: friendly(error, "Meta's ads could not be read.") };
  }
}

/**
 * Ads Manager's figures for the ads on Ads Performance over a range (2026-10-22, the owner: "做花费和每个名单成本"): spend,
 * impressions, reach, clicks and messaging conversations, ad by ad (null = one the token cannot see). CRM · Manage; the
 * token stays on the server. At most 40 ads, four asked at a time.
 */
export async function fetchAdInsights(ids: string[], since: string, until: string): Promise<{ ok: true; figs: Record<string, MetaFig | null> } | { ok: false; error: string }> {
  try {
    await session();
    await requireCrm("manage");
    const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
    if (!token) throw new Error("Meta is not connected on this server.");
    const ads = [...new Set(ids)].filter(id => /^\d{5,32}$/.test(id)).slice(0, 40), figs: Record<string, MetaFig | null> = {};
    for (let i = 0; i < ads.length; i += 4) {
      const part = ads.slice(i, i + 4);
      // Each ad's figures for the range and its budget as it stands today (2026-10-27: the daily budget).
      const got = await Promise.all(part.map(id => Promise.all([metaAdInsights(id, token, since, until), metaAdBudget(id, token)])));
      part.forEach((id, k) => { const [fig, budget] = got[k]; figs[id] = fig ? { ...fig, budget } : null; });
    }
    return { ok: true, figs };
  } catch (error) {
    return { ok: false, error: friendly(error, "Meta's figures could not be read.") };
  }
}

/** Each ad's picture for Workspace's report (2026-10-27): Meta's image of its creative. CRM · Manage; the token stays here. */
export async function fetchAdThumbs(ids: string[]): Promise<{ ok: true; thumbs: Record<string, string> } | { ok: false; error: string }> {
  try {
    await session();
    await requireCrm("manage");
    const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
    if (!token) throw new Error("Meta is not connected on this server.");
    return { ok: true, thumbs: await metaAdThumbs(ids, token) };
  } catch (error) {
    return { ok: false, error: friendly(error, "The ads' pictures could not be read.") };
  }
}

/**
 * The same figures DAY BY DAY, for Ads Performance's chart (2026-10-23, the owner: "加一个数据图（参考谷歌广告的成效显示）"):
 * ad by ad, keyed by the day (null = one the token cannot see). CRM · Manage; the token stays on the server. At most 40
 * ads, four asked at a time.
 */
export async function fetchAdDaily(ids: string[], since: string, until: string): Promise<{ ok: true; days: Record<string, Record<string, MetaFig> | null> } | { ok: false; error: string }> {
  try {
    await session();
    await requireCrm("manage");
    const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
    if (!token) throw new Error("Meta is not connected on this server.");
    const ads = [...new Set(ids)].filter(id => /^\d{5,32}$/.test(id)).slice(0, 40), days: Record<string, Record<string, MetaFig> | null> = {};
    for (let i = 0; i < ads.length; i += 4) {
      const part = ads.slice(i, i + 4);
      const got = await Promise.all(part.map(id => metaAdDaily(id, token, since, until)));
      part.forEach((id, k) => { days[id] = got[k]; });
    }
    return { ok: true, days };
  } catch (error) {
    return { ok: false, error: friendly(error, "Meta's figures could not be read.") };
  }
}

/** Send an approved template — the only way to write after WhatsApp's 24 hours (it does not reopen the window). */
export async function sendCrmTemplate(contactId: string, template: { name: string; language: string; text: string }, params: string[]): Promise<{ ok: true; message: CrmChatMessage } | { ok: false; error: string }> {
  try {
    const db = await session();
    await requireCrm("edit");
    const { contact, token } = await reachable(db, contactId, false);
    if (contact.channel !== "whatsapp") throw new Error("Messenger has no templates. Call the customer instead.");
    // Only a template the Control panel switched on (rev 1011), in its own words — never what the browser says it is.
    const { data: own } = await db.from("crm_templates").select("body, language").eq("meta_name", template.name).eq("status", "approved").eq("is_on", true).maybeSingle();
    if (!own) throw new Error("That template is not switched on any more. Close and open the templates again.");
    const text = metaTemplateBody(own.body as string), language = own.language as string;
    const sent = await sendWhatsApp({ phoneNumberId: contact.account_id, token, message: templateMessage(contact.external_id, template.name, language, params) });
    if (!sent.ok) throw new Error(sent.error);
    const message = await recorded(db, { contact: contactId, externalId: sent.wamid, kind: "template", body: fillTemplate(text, params) || template.name });
    if (!message) return { ok: false, error: "Sent to the customer on WhatsApp, but it could not be saved here. Reload before sending again." };
    return { ok: true, message };
  } catch (error) {
    return { ok: false, error: friendly(error, "The template could not be sent.") };
  }
}

/** A photo or document from the chat's + sheet. */
/**
 * Send a photo, video, voice note or document (2026-10-13). The browser has put the file in the private bucket crm-media
 * under the member's own session (its policy: only into a customer they may reply to), so a file is no longer held to
 * the 4 MB a Server Action carries. Here: read it back under the same session, send it to the customer — WhatsApp by an
 * uploaded media id, Messenger as an attachment — record the message and give it its file (crm_set_out_media), so both
 * sides see the picture. An iPhone video (QuickTime) goes to WhatsApp as MP4, which is what it holds; if WhatsApp still
 * refuses a video or a voice note, it goes as a document so the customer gets it either way.
 */
export async function sendCrmMedia(input: { contact: string; path: string; name: string; mime: string; caption?: string }): Promise<{ ok: true; message: CrmChatMessage } | { ok: false; error: string }> {
  try {
    const contactId = input.contact, caption = (input.caption ?? "").trim(), mime = input.mime.split(";")[0].trim().toLowerCase();
    if (!new RegExp(`^${contactId.replace(/[^0-9a-f-]/gi, "")}/[A-Za-z0-9._-]{1,120}$`).test(input.path)) throw new Error("Choose the file again.");
    const filename = (input.name || "file").replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
    const db = await session();
    const [, { contact, token, window }, got] = await Promise.all([requireCrm("edit"), reachable(db, contactId, true), db.storage.from("crm-media").download(input.path)]);
    if (got.error || !got.data) throw new Error("The file did not arrive. Try again.");
    const file = got.data;
    let kind = mediaKindOf(mime);
    // An HD photo past WhatsApp's 5 MB for images goes as a document — the customer gets it at its full size.
    if (contact.channel === "whatsapp" && kind === "image" && file.size > mediaLimit("whatsapp", "image")) kind = "document";
    if (file.size > mediaLimit(contact.channel, kind)) {
      throw new Error(`${kind === "image" ? "A photo" : kind === "video" ? "A video" : kind === "audio" ? "A voice note" : "A file"} can be up to ${Math.round(mediaLimit(contact.channel, kind) / 1048576)} MB on ${contact.channel === "messenger" ? "Messenger" : "WhatsApp"}.`);
    }
    let externalId: string;
    if (contact.channel === "messenger") {
      const pageAccess = await pageToken(contact.account_id, token);
      if (!pageAccess) throw new Error("This Facebook Page is not connected to the CRM. Ask your administrator.");
      const typed = new Blob([file], { type: mime });
      const sent = await sendMessengerAttachment({ pageId: contact.account_id, psid: contact.external_id, token: pageAccess, window: window as "open" | "human_agent", kind: kind === "document" ? "file" : kind, file: typed, filename });
      if (!sent.ok) throw new Error(sent.error);
      externalId = sent.mid;
    } else {
      // A voice note (Ogg Opus, shared/video-fit.ts › fitVoice) is uploaded as WhatsApp names its own — "audio/ogg; codecs=opus"
      // — and sent as a voice message; the customer got the bare "audio/ogg" as a silent audio file (2026-10-14).
      const opus = kind === "audio" && mime === "audio/ogg";
      const sendAs = async (k: typeof kind, voice = false) => {
        const type = k === "video" && mime === "video/quicktime" ? "video/mp4" : k === "document" ? (mime || "application/octet-stream") : k === "audio" && opus ? "audio/ogg; codecs=opus" : mime;
        const name = k === "video" && mime === "video/quicktime" ? filename.replace(/\.mov$/i, "") + ".mp4" : filename;
        const up = await uploadWhatsAppMedia({ phoneNumberId: contact.account_id, token, file: new Blob([file], { type }), filename: name });
        if (!up.ok) return up;
        return sendWhatsApp({ phoneNumberId: contact.account_id, token, message: mediaMessage(contact.external_id, k, up.id, caption, name, voice) });
      };
      let sent = await sendAs(kind, opus);
      if (!sent.ok && opus) sent = await sendAs(kind);
      if (!sent.ok && (kind === "video" || kind === "audio")) { kind = "document"; sent = await sendAs("document"); }
      if (!sent.ok) throw new Error(sent.error);
      externalId = (sent as { wamid: string }).wamid;
    }
    // crm_record_out knows image and document; crm_set_out_media then names the kind from the file and keeps the caption.
    const message = await recorded(db, { contact: contactId, externalId, kind: kind === "image" ? "image" : "document", body: caption || filename });
    if (!message) return { ok: false, error: "Sent to the customer, but it could not be saved here. Reload before sending again." };
    const { error: mediaError } = await db.rpc("crm_set_out_media", { p_message: message.id, p_path: input.path, p_mime: mime || "application/octet-stream", p_caption: caption });
    if (mediaError) return { ok: true, message };
    // A document keeps its own name beside its caption (2026-10-27, mig 20261027110000) — a failure only leaves it named as before.
    const shownName = (input.name || filename).trim().slice(0, 240) || filename;
    if (kind === "document") await db.rpc("crm_name_out_file", { p_message: message.id, p_name: shownName });
    const shown = kind === "document" ? "file" : kind;
    return { ok: true, message: { ...message, kind, text: caption, media: { kind: shown, url: `/member/crm-media/${message.id}`, ...(shown === "file" ? { name: shownName } : {}) } } };
  } catch (error) {
    return { ok: false, error: friendly(error, "The file could not be sent.") };
  }
}

/* ── CRM Desktop rev 1 (2026-10-13) ─────────────────────────────────────── */

const ROOM_PHOTO_BYTES = 4 * 1024 * 1024;
const ROOM_PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * A showroom's photo and map links (B4): the photo into the private bucket crm-showrooms under the member's own
 * session (its policy asks CRM · Manage), then crm_save_showroom_extras, which asks again. The old photo goes once
 * the new one is saved.
 */
export async function saveCrmShowroomExtras(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const roomId = String(form.get("room") ?? ""), remove = form.get("removePhoto") === "1";
    const gmap = String(form.get("gmap") ?? "").trim(), waze = String(form.get("waze") ?? "").trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(roomId)) throw new Error("Choose a showroom first.");
    const db = await session();
    await requireCrm("manage");
    const { data: room, error: readError } = await db.from("crm_showrooms").select("photo_path").eq("id", roomId).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!room) throw new Error("That showroom is not on the list.");
    const old = (room as { photo_path: string | null }).photo_path;
    let path: string | null = remove ? null : old;
    const file = form.get("photo");
    if (file instanceof Blob && file.size > 0) {
      const ext = ROOM_PHOTO_TYPES[file.type];
      if (!ext) throw new Error("A showroom photo is a JPG, PNG or WebP.");
      if (file.size > ROOM_PHOTO_BYTES) throw new Error("A showroom photo can be up to 4 MB.");
      path = `${roomId}/${Date.now()}.${ext}`;
      const { error } = await db.storage.from("crm-showrooms").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
    }
    const { error } = await db.rpc("crm_save_showroom_extras", { p_id: roomId, p_photo_path: path, p_map_google: gmap, p_map_waze: waze });
    if (error) {
      if (path && path !== old) await db.storage.from("crm-showrooms").remove([path]);
      throw new Error(error.message);
    }
    if (old && old !== path) await db.storage.from("crm-showrooms").remove([old]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendly(error, "The showroom could not be saved. Please try again.") };
  }
}

/** The CRM's settings tables History reads (B8), and what each is called there. */
const HISTORY_TABLES = ["crm_showrooms", "crm_ad_assign", "crm_fulltime_rules", "crm_staff", "crm_templates", "crm_forms", "crm_settings", "crm_channels"];
export interface CrmHistoryRow { id: number; at: string; who: string; table: string; op: string; key: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; changed: string[] }

/**
 * History (B8): who changed which CRM setting, when, before → after — the portal's own audit trail
 * (audit_changes), which shows a reader only what their permissions open: CRM · Manage reads these tables.
 */
export async function fetchCrmHistory(before?: number): Promise<{ ok: true; rows: CrmHistoryRow[] } | { ok: false; error: string }> {
  try {
    const db = await session();
    await requireCrm("manage");
    const { data, error } = await db.rpc("audit_changes", { p_tables: HISTORY_TABLES, p_before: before ?? null, p_limit: 200 });
    if (error) throw new Error(error.message);
    type Row = { id: number; occurred_at: string; actor_name: string | null; actor_source: string; table_name: string; row_key: string | null; op: string; old_row: Record<string, unknown> | null; new_row: Record<string, unknown> | null; changed: string[] | null };
    return { ok: true, rows: ((data ?? []) as Row[]).map(r => ({
      id: r.id, at: r.occurred_at, who: r.actor_name ?? (r.actor_source === "database" ? "The CRM" : "System"), table: r.table_name, op: r.op,
      key: r.row_key ?? "", before: r.old_row, after: r.new_row, changed: r.changed ?? [],
    })) };
  } catch (error) {
    return { ok: false, error: friendly(error, "History could not be read. Please try again.") };
  }
}

/**
 * Forward a message to another customer (the owner, 2026-10-14: WhatsApp's long-press menu — "Forward、Info、Star 也加上去").
 * The message is read under the member's own session (row level security decides whether they may see it); words go as a
 * new message (sendCrmMessage), a photo, video, voice note or file is copied into the other customer's folder of the
 * private bucket — from our bucket, from WhatsApp by its media id (with the token, on the server), or from Messenger's
 * CDN — and sent by sendCrmMedia, which asks crm_can_reply for that customer and keeps every rule a send keeps.
 */
export async function forwardCrmMessage(messageId: string, toContact: string): Promise<{ ok: true; message: CrmChatMessage } | { ok: false; error: string }> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(messageId) || !/^[0-9a-f-]{36}$/i.test(toContact)) throw new Error("Choose the message again.");
    const db = await session();
    await requireCrm("edit");
    const { data: m } = await db.from("crm_messages").select("id, kind, body, media_id, media_path, media_url, media_mime, media_name").eq("id", messageId).maybeSingle();
    if (!m) throw new Error("That message is not there any more.");
    const hasFile = !!(m.media_id || m.media_path || m.media_url);
    if (!hasFile) {
      const text = String(m.body ?? "").trim();
      if (!text) throw new Error("There is nothing in that message to forward.");
      return sendCrmMessage(toContact, text);
    }
    let blob: Blob | null = null, mime = String(m.media_mime ?? "").split(";")[0].trim() || "application/octet-stream";
    if (m.media_path) {
      const got = await db.storage.from("crm-media").download(m.media_path as string);
      blob = got.data ?? null;
    } else if (m.media_id) {
      const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
      if (!token) throw new Error("WhatsApp is not connected on this server.");
      const got = await fetchWhatsAppMedia(m.media_id as string, token);
      if (!got.ok) throw new Error(got.error);
      blob = await new Response(got.body).blob();
      mime = got.type.split(";")[0].trim() || mime;
    } else {
      const address = messengerMediaAddress(m.media_url as string);
      if (!address) throw new Error("Messenger no longer has this file.");
      const r = await fetch(address);
      if (!r.ok) throw new Error("Messenger no longer has this file.");
      blob = await r.blob();
      mime = (r.headers.get("content-type") ?? mime).split(";")[0].trim();
    }
    if (!blob) throw new Error("The file could not be read. Try again.");
    // The bucket's own limit (100 MB on R2); sendCrmMedia then holds it to the target channel's.
    if (blob.size > 100 * 1024 * 1024) throw new Error("A file can be forwarded up to 100 MB.");
    const kind = mediaKindOf(mime);
    // A document forwarded under its own name (2026-10-27), else its words as before.
    const name = kind === "document" ? (String(m.media_name ?? "").trim() || String(m.body ?? "").trim() || "file") : `${kind}`;
    const path = mediaPath(toContact, name, mime);
    const up = await db.storage.from("crm-media").upload(path, blob, { contentType: mime, upsert: false });
    if (up.error) throw new Error("You cannot send to that customer.");
    return sendCrmMedia({ contact: toContact, path, name, mime, caption: kind === "document" || kind === "audio" ? "" : String(m.body ?? "") });
  } catch (error) {
    return { ok: false, error: friendly(error, "The message could not be forwarded.") };
  }
}
