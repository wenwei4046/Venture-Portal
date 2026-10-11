/**
 * The redesigned CRM's data (Claude Design handoff, 2026-10-09): everything one
 * person's CRM reads, as the screens use it. The rows come from crm-actions.ts
 * under the member's own session (row level security decides what comes back);
 * this file only reshapes them, so every rule is tested. The demo builds the
 * same shape (crm-demo-data.ts).
 */
import { CRM_LOST_REASONS, type CrmLead, type CrmLostReason, type CrmMessage, type CrmStatus } from "./crm";
import type { CrmRole } from "./crm-team";
import type { CrmContactRow, CrmMessageRow, CrmPeopleRow } from "./crm-live";

export type CrmChannel = "whatsapp" | "messenger";

export interface CrmPerson {
  id: string;
  name: string;
  role: CrmRole;
  uplineId: string | null;
  fullTime: boolean;
  /** Their title in People ("Senior Revenue Specialist"); the CRM shows it. Empty = the role's own name. */
  title?: string;
}

export interface CrmCard { kind: "Confirmed" | "Updated" | "Cancelled" | "Reminder"; start: string; room: string; addr: string }

export interface CrmChatMessage {
  id: string;
  from: "lead" | "me";
  kind: string;
  text: string;
  at: string;
  status?: "sent" | "delivered" | "read" | "failed";
  error?: string;
  /** Who of us wrote it (staff id) when the server knows — "Sent by" shows when it is not the customer's own person. */
  by?: string;
  auto?: boolean;
  replyTo?: string;
  myReaction?: string;
  card?: CrmCard;
  media?: { kind: "image" | "video" | "audio" | "file"; url: string; name?: string };
}

export interface CrmDetails { type: string; size: string; loc: string; req: string; budget: string }

export interface CrmCustomer {
  id: string;
  name: string;
  phone: string;
  channel: CrmChannel;
  adId: string | null;
  ad: string;
  status: CrmStatus;
  lost?: { reason: CrmLostReason; note?: string };
  previous?: "won" | "lost";
  wonAmount: number | null;
  assignedTo: string | null;
  /** Over the limit (rev 1011 §6.6): a By max team was full, so the customer waits, kept in that team, nobody yet. */
  held?: boolean;
  heldTeam?: string | null;
  /** When the customer was given to them, and by whom (null: the CRM dealt it) — the bell's "new enquiry for you". */
  assignedAt?: string | null;
  assignedBy?: string | null;
  teamId: string | null;
  lastCustomerAt: string | null;
  createdAt: string;
  unread: number;
  details: CrmDetails;
  /** Book visit's customer form was saved once (then a booking goes straight to the time). */
  detailsSaved: boolean;
  messages: CrmChatMessage[];
}

export type CrmVisitState = "booked" | "attended" | "no_show" | "cancelled";
export interface CrmVisit {
  id: string;
  customerId: string;
  showroomId: string;
  start: string;
  minutes: number;
  state: CrmVisitState;
  outcome: "follow_up" | "won" | "lost" | "rebooked" | null;
  remindedAt: string | null;
}

export interface CrmBlock { a: string; b: string; why: string }
export interface CrmRoom {
  id: string;
  name: string;
  active: boolean;
  address: string;
  /** "HH:MM" every day, or "HH:MM@0123456" on those weekdays (0 = Monday). */
  slots: string[];
  cap: number;
  /** Closed every week: 0 = Sunday … 6 = Saturday (Date.getDay). */
  weekly: number[];
  blocks: CrmBlock[];
}

export interface CrmPrefs { pinned: boolean; muted: boolean; hidden: boolean; blocked: boolean; pinnedMessageId: string | null }
export interface CrmLabel { id: string; name: string; color: string }
export interface CrmQuickReply { id: string; shortcut: string; message: string }

export interface CrmAutoReply { on: boolean; text: string; img?: string | null; imgName?: string }
export interface CrmAutoReplySet {
  welcome: CrmAutoReply;
  after: CrmAutoReply & { from: string; to: string };
  kws: (CrmAutoReply & { id: string; words: string })[];
}

export interface CrmInvite {
  id: string;
  kind: "share" | "move";
  customerId: string;
  customerName: string;
  from: string;
  to: string;
  state: "pending" | "accepted" | "declined";
  createdAt: string;
  decidedAt: string | null;
}
export interface CrmShare { customerId: string; staffId: string; invitedBy: string | null; joinedAt: string }
export interface CrmEvent {
  id: number;
  kind: "won" | "lost" | "moved" | "shared" | "share_declined" | "move_declined";
  customerId: string;
  actor: string | null;
  owner: string | null;
  data: Record<string, unknown>;
  at: string;
}

/** Ads to teams (mig 20261009180000): how one ad's enquiries are dealt. */
export interface CrmAdRule {
  adId: string; label: string; mode: "even" | "split" | "people"; split: Record<string, number>; pm: "cnt" | "pct"; pp: Record<string, number>; startedAt: string;
  /** By team, inside each team (rev 1011 §6.6): Evenly · By % (the default) · By max. Absent = By % with an even split. */
  tm?: Record<string, "even" | "pct" | "cnt">;
}
/** Full time lead allocation for one team: on these weekdays (0 = Monday) the full-time RS take their maximum or % first. */
/** rev 1011 §6.2: "turns" — vals[staff][day] = 1 where ticked; one ticked gets that day's leads, two or more take turns. */
export interface CrmFtRule { tlId: string; mode: "cnt" | "pct" | "turns"; days: number[]; vals: Record<string, Record<string, number>> }

/**
 * What the signed-in person may do in the CRM — their CRM cells in the
 * permission matrix (crm_my_can, mig 20261010030000). The database refuses
 * the rest whatever the screens draw; the screens only stop offering it.
 */
export interface CrmCan {
  /** CRM · View at All: everybody's customers — the Control panel. */
  viewAll: boolean;
  /** CRM · Edit at Own: work their own line's customers. */
  editOwn: boolean;
  /** CRM · Edit at All: act in anybody's chat. */
  editAll: boolean;
  /** CRM · Manage: assignment, ads, full time, showrooms. */
  manage: boolean;
}

/**
 * Before the database answered (a page left open across the release): what the
 * CRM role gave until 2026-10-10 — the Boss and the HOD everything, a
 * salesperson their own line.
 */
export function canFromRole(role: CrmRole | null): CrmCan {
  if (role === "boss" || role === "hod") return { viewAll: true, editOwn: true, editAll: true, manage: true };
  return { viewAll: false, editOwn: !!role, editAll: false, manage: false };
}

export function canFrom(value: unknown, role: CrmRole | null): CrmCan {
  if (!value || typeof value !== "object") return canFromRole(role);
  const v = value as Record<string, unknown>;
  return { viewAll: v.viewAll === true, editOwn: v.editOwn === true, editAll: v.editAll === true, manage: v.manage === true };
}

export interface CrmData {
  viewerId: string | null;
  /** Their CRM cells (crm_my_can). */
  can: CrmCan;
  setup: "not_linked" | "no_role" | null;
  people: CrmPerson[];
  customers: CrmCustomer[];
  visits: CrmVisit[];
  rooms: CrmRoom[];
  prefs: Record<string, CrmPrefs>;
  hiddenMessages: string[];
  labels: CrmLabel[];
  customerLabels: Record<string, string[]>;
  quickReplies: CrmQuickReply[];
  autoReplies: CrmAutoReplySet;
  invites: CrmInvite[];
  shares: CrmShare[];
  events: CrmEvent[];
  notifsSeenAt: string | null;
  /** Notifications read one by one (the Control panel). */
  notifRead: string[];
  adRules: CrmAdRule[];
  ftRules: CrmFtRule[];
}

/* ── Defaults the design starts with ───────────────────────────────────── */

export const DEFAULT_LABELS: Omit<CrmLabel, "id">[] = [
  { name: "Hot lead", color: "#BD4A19" }, { name: "VIP", color: "#A46312" },
  { name: "Price enquiry", color: "#387557" }, { name: "Follow up later", color: "#2F8FD8" },
];
export const LABEL_SWATCHES = ["#BD4A19", "#A46312", "#387557", "#2F8FD8", "#7A4FB5", "#806B60"];

export const DEFAULT_QUICK_REPLIES: Omit<CrmQuickReply, "id">[] = [
  { shortcut: "Price", message: "Our prices depend on size and design. Share your measurements and we'll send a quote." },
  { shortcut: "Hours", message: "Thanks for your message! We're open 8am–8pm daily and will reply first thing tomorrow." },
];

/** Everyone starts with auto-replies empty and off (user 2026-10-09); they write and switch on their own. */
export const DEFAULT_AUTO_REPLY_SET: CrmAutoReplySet = {
  welcome: { on: false, text: "" },
  after: { on: false, text: "", from: "08:00", to: "20:00" },
  kws: [],
};

/* ── The rows, as PostgREST returns them (the new ones) ────────────────── */

export interface CrmContactRowX extends CrmContactRow {
  property_type?: string | null;
  unit_size?: string | null;
  unit_location?: string | null;
  requirement?: string | null;
  budget?: string | null;
  won_amount?: number | string | null;
  details_at?: string | null;
  assigned_at?: string | null;
  assigned_by?: string | null;
  /** rev 1011: "limit" while it waits Over the limit in its team (mig 20261011130000). */
  held_reason?: string | null;
}
export interface CrmMessageRowX extends CrmMessageRow {
  reply_to?: string | null;
  my_reaction?: string | null;
  card?: CrmCard | null;
}
export interface CrmVisitRow {
  id: string; contact_id: string; showroom: string; start_at: string; minutes: number; state: CrmVisitState;
  outcome?: CrmVisit["outcome"]; reminded_at?: string | null;
}
export interface CrmRoomRow {
  id: string; name: string; active: boolean; sort_order: number;
  address?: string | null; slots?: string[] | null; cap?: number | null; weekly?: number[] | null; blocks?: CrmBlock[] | null;
}
export interface CrmPrefRow { contact_id: string; pinned: boolean; muted: boolean; hidden: boolean; blocked: boolean; pinned_message_id: string | null }
export interface CrmInviteRow {
  id: string; kind: "share" | "move"; contact_id: string; contact_name: string; from_staff: string; to_staff: string;
  state: CrmInvite["state"]; created_at: string; decided_at: string | null;
}
export interface CrmEventRow { id: number; kind: CrmEvent["kind"]; contact_id: string; actor: string | null; owner: string | null; data: Record<string, unknown> | null; at: string }

export interface CrmDataRows {
  people: CrmPeopleRow;
  contacts: CrmContactRowX[];
  messages: CrmMessageRowX[];
  visits: CrmVisitRow[];
  rooms: CrmRoomRow[];
  prefs: CrmPrefRow[];
  hides: { message_id: string }[];
  labels: { id: string; name: string; color: string; sort_order: number }[];
  contactLabels: { label_id: string; contact_id: string }[];
  quickReplies: { id: string; shortcut: string; message: string; sort_order: number }[];
  autoReplies: { settings: Partial<CrmAutoReplySet> }[];
  invites: CrmInviteRow[];
  shares: { contact_id: string; staff_id: string; invited_by: string | null; joined_at: string }[];
  events: CrmEventRow[];
  staffPrefs: { notifs_seen_at: string | null; notif_read?: string[] | null }[];
  adRules: { ad_source_id: string; ad_label: string | null; mode: CrmAdRule["mode"]; team_split: Record<string, number> | null; people_mode: "cnt" | "pct"; people: Record<string, number> | null; started_at: string; team_modes?: Record<string, "even" | "pct" | "cnt"> | null }[];
  ftRules: { tl_id: string; mode: CrmFtRule["mode"]; days: number[] | null; vals: Record<string, Record<string, number>> | null }[];
  /** crm_my_can()'s answer; null when the database did not give one. */
  can?: unknown;
}

/* ── Rows → screens ────────────────────────────────────────────────────── */

const CHANNEL_LABEL: Record<CrmChannel, string> = { whatsapp: "WhatsApp", messenger: "Messenger" };
const MEDIA_LABEL: Record<string, string> = {
  image: "📷 Photo", video: "🎥 Video", audio: "🎤 Voice message", document: "📄 Document",
  sticker: "Sticker", location: "📍 Location", template: "Template message",
};
const MEDIA_KIND: Record<string, NonNullable<CrmChatMessage["media"]>["kind"]> = { image: "image", sticker: "image", video: "video", audio: "audio", document: "file" };
const lostReasons = new Set<string>(CRM_LOST_REASONS.map(r => r.value));

export function chatMessage(row: CrmMessageRowX): CrmChatMessage {
  const label = MEDIA_LABEL[row.kind];
  const shown = row.media_id ? MEDIA_KIND[row.kind] : undefined;
  // A template we sent is its text; media with a file is its caption; media without one is named.
  const text = row.kind === "template" || row.kind === "text" ? row.body ?? ""
    : shown ? row.body ?? "" : label ? (row.body ? `${label} · ${row.body}` : label) : row.body ?? "";
  return {
    id: row.id,
    from: row.direction === "in" ? "lead" : "me",
    kind: row.kind,
    text,
    at: row.sent_at,
    ...(shown ? { media: { kind: shown, url: `/member/crm-media/${row.id}`, ...(shown === "file" ? { name: row.body || "Document" } : {}) } } : {}),
    ...(row.direction === "out" && row.status && row.status !== "received" ? { status: row.status } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.auto ? { auto: true } : {}),
    ...(row.direction === "out" && row.sent_by ? { by: row.sent_by } : {}),
    ...(row.reply_to ? { replyTo: row.reply_to } : {}),
    ...(row.my_reaction ? { myReaction: row.my_reaction } : {}),
    ...(row.card ? { card: row.card } : {}),
  };
}

export function customerFromRow(row: CrmContactRowX, messages: CrmMessageRowX[]): CrmCustomer {
  const reason = row.lost_reason && lostReasons.has(row.lost_reason) ? (row.lost_reason as CrmLostReason) : row.lost_reason ? "other" : null;
  return {
    id: row.id,
    name: row.name?.trim() || row.phone || "Customer",
    phone: row.phone ?? "",
    channel: row.channel,
    adId: row.ad_source_id,
    ad: row.ad_headline?.trim() || (row.ad_source_id ? `Ad ${row.ad_source_id}` : `${CHANNEL_LABEL[row.channel]} · no ad`),
    status: row.status,
    ...(row.status === "lost" && reason ? { lost: { reason, ...(row.lost_note ? { note: row.lost_note } : {}) } } : {}),
    ...(row.previous_status ? { previous: row.previous_status } : {}),
    wonAmount: row.won_amount == null ? null : Number(row.won_amount),
    assignedTo: row.assigned_to,
    assignedAt: row.assigned_at ?? null,
    assignedBy: row.assigned_by ?? null,
    ...(row.held_reason === "limit" ? { held: true, heldTeam: row.team_id } : {}),
    teamId: row.team_id,
    lastCustomerAt: row.last_customer_at ?? null,
    createdAt: row.created_at,
    unread: row.unread,
    details: {
      type: row.property_type ?? "", size: row.unit_size ?? "", loc: row.unit_location ?? "",
      req: row.requirement ?? "", budget: row.budget ?? "",
    },
    detailsSaved: !!row.details_at,
    messages: messages.filter(m => m.contact_id === row.id).sort((a, b) => a.sent_at.localeCompare(b.sent_at)).map(chatMessage),
  };
}

export const roomFromRow = (r: CrmRoomRow): CrmRoom => ({
  id: r.id, name: r.name, active: r.active, address: r.address ?? "",
  slots: r.slots ?? [], cap: r.cap ?? 2, weekly: r.weekly ?? [], blocks: Array.isArray(r.blocks) ? r.blocks : [],
});

export const visitFromRow = (a: CrmVisitRow): CrmVisit => ({
  id: a.id, customerId: a.contact_id, showroomId: a.showroom, start: a.start_at, minutes: a.minutes, state: a.state,
  outcome: a.outcome ?? null, remindedAt: a.reminded_at ?? null,
});

/** Saved auto-replies over the defaults, so a half-saved set still has every part. */
export function autoReplySet(saved: Partial<CrmAutoReplySet> | undefined): CrmAutoReplySet {
  const d = DEFAULT_AUTO_REPLY_SET;
  if (!saved) return d;
  return {
    welcome: { ...d.welcome, ...(saved.welcome ?? {}) },
    after: { ...d.after, ...(saved.after ?? {}) },
    kws: Array.isArray(saved.kws) ? saved.kws : d.kws,
  };
}

export function crmDataFromRows(rows: CrmDataRows): CrmData {
  const customerLabels: Record<string, string[]> = {};
  for (const cl of rows.contactLabels) (customerLabels[cl.contact_id] ??= []).push(cl.label_id);
  return {
    viewerId: rows.people.role ? rows.people.me : null,
    can: canFrom(rows.can, rows.people.role),
    setup: !rows.people.me ? "not_linked" : !rows.people.role ? "no_role" : null,
    people: rows.people.people.map(p => ({ id: p.id, name: p.name, role: p.role, uplineId: p.uplineId, fullTime: p.fullTime, title: p.title ?? "" })),
    customers: rows.contacts.map(c => customerFromRow(c, rows.messages)),
    visits: rows.visits.map(visitFromRow),
    rooms: [...rows.rooms].sort((a, b) => a.sort_order - b.sort_order).map(roomFromRow),
    prefs: Object.fromEntries(rows.prefs.map(p => [p.contact_id, { pinned: p.pinned, muted: p.muted, hidden: p.hidden, blocked: p.blocked, pinnedMessageId: p.pinned_message_id }])),
    hiddenMessages: rows.hides.map(h => h.message_id),
    labels: [...rows.labels].sort((a, b) => a.sort_order - b.sort_order).map(l => ({ id: l.id, name: l.name, color: l.color })),
    customerLabels,
    quickReplies: [...rows.quickReplies].sort((a, b) => a.sort_order - b.sort_order).map(q => ({ id: q.id, shortcut: q.shortcut, message: q.message })),
    autoReplies: autoReplySet(rows.autoReplies[0]?.settings),
    invites: rows.invites.map(i => ({ id: i.id, kind: i.kind, customerId: i.contact_id, customerName: i.contact_name, from: i.from_staff, to: i.to_staff, state: i.state, createdAt: i.created_at, decidedAt: i.decided_at })),
    shares: rows.shares.map(s => ({ customerId: s.contact_id, staffId: s.staff_id, invitedBy: s.invited_by, joinedAt: s.joined_at })),
    events: rows.events.map(e => ({ id: e.id, kind: e.kind, customerId: e.contact_id, actor: e.actor, owner: e.owner, data: e.data ?? {}, at: e.at })),
    notifsSeenAt: rows.staffPrefs[0]?.notifs_seen_at ?? null,
    notifRead: rows.staffPrefs[0]?.notif_read ?? [],
    adRules: rows.adRules.map(r => ({ adId: r.ad_source_id, label: r.ad_label ?? "", mode: r.mode, split: r.team_split ?? {}, pm: r.people_mode, pp: r.people ?? {}, startedAt: r.started_at, ...(r.team_modes ? { tm: r.team_modes } : {}) })),
    ftRules: rows.ftRules.map(r => ({ tlId: r.tl_id, mode: r.mode, days: r.days ?? [], vals: r.vals ?? {} })),
  };
}

/**
 * The CRM's rules (crm.ts) were written for CrmLead; a customer is one. The
 * reply clock, Follow up after Overdue, show-up rate — one set of rules for
 * every screen.
 */
export function asLead(c: CrmCustomer): CrmLead {
  return {
    id: c.id, name: c.name, phone: c.phone, adName: c.ad, pageName: CHANNEL_LABEL[c.channel], channel: c.channel,
    campaign: c.adId ?? "", status: c.status, ...(c.lost ? { lost: c.lost } : {}),
    ...(c.previous ? { previous: { status: c.previous } } : {}),
    ...(c.assignedTo ? { assignedTo: c.assignedTo } : {}), ...(c.teamId ? { teamId: c.teamId } : {}),
    ...(c.lastCustomerAt ? { lastCustomerAt: c.lastCustomerAt } : {}),
    createdAt: c.createdAt, unread: c.unread,
    messages: c.messages.map((m): CrmMessage => ({ id: m.id, from: m.from, text: m.text, at: m.at, ...(m.auto ? { auto: true } : {}) })),
  };
}

export { CHANNEL_LABEL };
